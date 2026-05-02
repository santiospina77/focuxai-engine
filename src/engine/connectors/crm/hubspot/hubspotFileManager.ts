/**
 * HubSpot File Manager Connector
 *
 * Upload files to HubSpot File Manager and attach them to CRM records.
 * Supports PRIVATE (for PDFs with PII) and PUBLIC_NOT_INDEXABLE (for renders/planos).
 *
 * Contract:
 *   - Result<T, EngineError> always. Never throw.
 *   - Zod validation on all HubSpot API responses.
 *   - Retry with exponential backoff for 429/5xx.
 *   - FormData rebuilt on every retry attempt (no stream reuse risk).
 *   - AbortController timeout on every fetch.
 *   - Zero tenant-specific logic. Zero hardcoded client IDs.
 *   - Never log tokens, PDF buffers, or buyer PII.
 *
 * HubSpot API references:
 *   - Upload: POST /files/v3/files (multipart/form-data)
 *   - Notes:  POST /crm/v3/objects/notes (with inline associations)
 *
 * IMPORTANT — PRIVATE file URLs:
 *   Files uploaded as PRIVATE may return url: null. HubSpot requires
 *   /files/v3/files/{fileId}/signed-url for temporary access. Callers
 *   must use fileId for traceability, NOT url for persistent links.
 *   For deals, attach via Note — the PDF is visible in HubSpot UI.
 *
 * @since v3.0.0 — Fase B.0
 */

import { z } from 'zod';
import type { Result } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';
import { ok, err } from '@/engine/core/types/Result';
import { AuthError, ResourceError, SchemaError, ValidationError } from '@/engine/core/errors/EngineError';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const HUBSPOT_FILES_API = 'https://api.hubapi.com/files/v3/files';
const HUBSPOT_NOTES_API = 'https://api.hubapi.com/crm/v3/objects/notes';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

/**
 * HubSpot association type IDs for notes → record.
 * Used in the associations block of POST /crm/v3/objects/notes.
 * Source: HubSpot default association types documentation.
 */
const NOTE_ASSOCIATION_TYPE_IDS: Record<HubSpotAttachObjectType, number> = {
  deals: 214,
  contacts: 202,
};

// ═══════════════════════════════════════════════════════════
// Public Types
// ═══════════════════════════════════════════════════════════

export type HubSpotFileAccess = 'PRIVATE' | 'PUBLIC_NOT_INDEXABLE';

export interface HubSpotFileUploadOptions {
  readonly fileName: string;
  readonly folderPath: string;
  readonly contentType: string;
  readonly access: HubSpotFileAccess;
  /** Override timeout. If omitted, calculated from buffer size (5s + 5s/MB, max 60s). */
  readonly timeoutMs?: number;
  /**
   * Duplicate handling strategy for retries and re-uploads.
   * Defaults to 'NONE' (no duplicate check).
   * Use 'RETURN_EXISTING' for asset uploads (renders/planos) to avoid duplicates.
   */
  readonly duplicateValidationStrategy?: 'NONE' | 'REJECT' | 'RETURN_EXISTING';
  readonly duplicateValidationScope?: 'ENTIRE_PORTAL' | 'EXACT_FOLDER';
}

export interface HubSpotFileUploadResult {
  readonly fileId: string;
  /**
   * Public URL. May be null for PRIVATE files.
   * IMPORTANT: For PRIVATE files, do NOT use this as a persistent link.
   * Use fileId and request signed URLs via /files/v3/files/{fileId}/signed-url.
   */
  readonly url: string | null;
  readonly defaultHostingUrl: string | null;
  readonly sizeBytes: number | null;
  readonly access: HubSpotFileAccess;
}

export type HubSpotAttachObjectType = 'deals' | 'contacts';

export interface HubSpotAttachFileOptions {
  readonly objectType: HubSpotAttachObjectType;
  readonly objectId: string;
  readonly noteBody?: string;
  readonly timeoutMs?: number;
}

export interface HubSpotAttachFileResult {
  readonly noteId: string;
  readonly associatedTo: {
    readonly objectType: HubSpotAttachObjectType;
    readonly objectId: string;
  };
}

// ═══════════════════════════════════════════════════════════
// Zod Schemas — HubSpot API response validation
// ═══════════════════════════════════════════════════════════

/**
 * HubSpot file access levels. Validated as enum to ensure the API
 * actually applied the requested access level (security-critical for PRIVATE).
 */
const HubSpotFileAccessResponseSchema = z.enum([
  'PRIVATE',
  'PUBLIC_NOT_INDEXABLE',
  'PUBLIC_INDEXABLE',
  'HIDDEN_INDEXABLE',
  'HIDDEN_NOT_INDEXABLE',
  'HIDDEN_PRIVATE',
  'HIDDEN_SENSITIVE',
  'SENSITIVE',
]);

/**
 * POST /files/v3/files response.
 * HubSpot returns a rich object; we validate the fields we need.
 */
export const HubSpotFileUploadResponseSchema = z.object({
  id: z.string(),
  url: z.string().nullable().optional(),
  defaultHostingUrl: z.string().nullable().optional(),
  size: z.number().nullable().optional(),
  access: HubSpotFileAccessResponseSchema,
}).passthrough();

export type HubSpotFileUploadResponseRaw = z.infer<typeof HubSpotFileUploadResponseSchema>;

/**
 * POST /crm/v3/objects/notes response (with inline associations).
 */
export const HubSpotNoteCreateResponseSchema = z.object({
  id: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type HubSpotNoteCreateResponseRaw = z.infer<typeof HubSpotNoteCreateResponseSchema>;

/**
 * HubSpot API error response shape.
 */
export const HubSpotApiErrorSchema = z.object({
  status: z.string().optional(),
  message: z.string(),
  correlationId: z.string().optional(),
  category: z.string().optional(),
}).passthrough();

// ═══════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════

/**
 * Fetch with AbortController timeout. Never leaves open connections.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calculate delay for exponential backoff with jitter.
 * Respects Retry-After header if present.
 */
function calculateBackoffMs(attempt: number, retryAfterHeader?: string | null): number {
  // If HubSpot sends Retry-After (in seconds), honor it
  if (retryAfterHeader) {
    const retryAfterSeconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(retryAfterSeconds * 1_000, 30_000);
    }
  }
  // Exponential backoff: 1s, 2s, 4s + jitter (0-500ms)
  const exponentialMs = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitterMs = Math.random() * 500;
  return Math.min(exponentialMs + jitterMs, 15_000);
}

/**
 * Determine if an HTTP status code warrants a retry.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Parse HubSpot error body safely. Never throws.
 */
async function parseErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    // Try parsing as JSON for structured error
    try {
      const parsed = HubSpotApiErrorSchema.safeParse(JSON.parse(text));
      if (parsed.success) {
        return `${parsed.data.category ?? 'UNKNOWN'}: ${parsed.data.message}`;
      }
    } catch {
      // Not JSON — use raw text
    }
    return text.slice(0, 500);
  } catch {
    return `HTTP ${response.status} (body unreadable)`;
  }
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate upload timeout based on buffer size.
 * Base: 10s. Adds 5s per MB. Max: 60s.
 * For notes/associations (no buffer), use DEFAULT_TIMEOUT_MS directly.
 */
function resolveUploadTimeoutMs(bufferSizeBytes: number, override?: number): number {
  if (override !== undefined) return override;
  const sizeMb = Math.ceil(bufferSizeBytes / 1_000_000);
  return Math.min(60_000, Math.max(DEFAULT_TIMEOUT_MS, 5_000 + sizeMb * 5_000));
}

/**
 * Build multipart FormData for HubSpot file upload.
 * Called on EVERY retry attempt to avoid stream/blob consumption issues.
 */
function buildUploadFormData(
  buffer: Buffer,
  options: HubSpotFileUploadOptions,
): FormData {
  const formData = new FormData();

  // File blob — convert Buffer to Uint8Array for Blob compatibility
  const blob = new Blob([new Uint8Array(buffer)], { type: options.contentType });
  formData.append('file', blob, options.fileName);

  // Options JSON — access level + duplicate validation
  const fileOptions: Record<string, string> = {
    access: options.access,
  };
  if (options.duplicateValidationStrategy) {
    fileOptions.duplicateValidationStrategy = options.duplicateValidationStrategy;
  }
  if (options.duplicateValidationScope) {
    fileOptions.duplicateValidationScope = options.duplicateValidationScope;
  }
  formData.append('options', JSON.stringify(fileOptions));

  // Folder path
  formData.append('folderPath', options.folderPath);

  // File name (explicit, in case blob name gets mangled)
  formData.append('fileName', options.fileName);

  return formData;
}

/**
 * Map HTTP status to appropriate EngineError for file operations.
 */
function mapHttpError(
  status: number,
  errorDetail: string,
  operation: string,
): EngineError {
  if (status === 401 || status === 403) {
    return new AuthError(
      'AUTH_CRM_FILE_TOKEN_INVALID',
      `HubSpot file ${operation} auth failed (HTTP ${status}): ${errorDetail}`,
      { httpStatus: status, operation, retryable: false },
    );
  }

  if (status === 429) {
    return new ResourceError(
      'RESOURCE_CRM_FILE_RATE_LIMITED',
      `HubSpot file ${operation} rate limited: ${errorDetail}`,
      { httpStatus: status, operation, retryable: true },
    );
  }

  if (status >= 500) {
    return new ResourceError(
      'RESOURCE_CRM_FILE_SERVER_ERROR',
      `HubSpot file ${operation} server error (HTTP ${status}): ${errorDetail}`,
      { httpStatus: status, operation, retryable: true },
    );
  }

  // 400, 422, etc. — validation / bad request
  if (operation === 'upload') {
    return new ResourceError(
      'RESOURCE_CRM_FILE_UPLOAD_FAILED',
      `HubSpot file upload failed (HTTP ${status}): ${errorDetail}`,
      { httpStatus: status, operation, retryable: false },
    );
  }

  return new ResourceError(
    'RESOURCE_CRM_FILE_ATTACH_FAILED',
    `HubSpot file attach failed (HTTP ${status}): ${errorDetail}`,
    { httpStatus: status, operation, retryable: false },
  );
}

/**
 * Validate common string inputs. Returns error message or null if valid.
 */
function validateNonEmpty(value: string, fieldName: string): string | null {
  if (!value || value.trim().length === 0) {
    return `${fieldName} must not be empty`;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════

/**
 * Upload a file buffer to HubSpot File Manager.
 *
 * Uses multipart/form-data as required by HubSpot Files v3 API.
 * Retries on 429/5xx with exponential backoff + jitter.
 * Rebuilds FormData on every retry to avoid stream consumption issues.
 * Validates response with Zod, including access level verification.
 *
 * @param token — HubSpot Private App token (never logged)
 * @param buffer — File content as Buffer (must be > 0 bytes)
 * @param options — Upload configuration
 * @returns Result with file metadata or typed error
 */
export async function uploadFileToHubSpot(
  token: string,
  buffer: Buffer,
  options: HubSpotFileUploadOptions,
): Promise<Result<HubSpotFileUploadResult, EngineError>> {

  // ── Input validation ──
  const tokenErr = validateNonEmpty(token, 'token');
  if (tokenErr) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE', // reuse closest code
      `uploadFileToHubSpot input error: ${tokenErr}`,
      { operation: 'upload' },
    ));
  }

  if (buffer.length === 0) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE',
      'uploadFileToHubSpot: buffer is empty (0 bytes)',
      { operation: 'upload' },
    ));
  }

  const fileNameErr = validateNonEmpty(options.fileName, 'fileName');
  if (fileNameErr) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE',
      `uploadFileToHubSpot input error: ${fileNameErr}`,
      { operation: 'upload' },
    ));
  }

  // fileName must not contain path separators or control characters
  if (/[\/\\<>:"|?*\x00-\x1f]/.test(options.fileName)) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE',
      `uploadFileToHubSpot: fileName contains invalid characters: "${options.fileName}"`,
      { operation: 'upload', fileName: options.fileName },
    ));
  }

  if (!options.folderPath.startsWith('/')) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE',
      `uploadFileToHubSpot: folderPath must start with "/", got: "${options.folderPath}"`,
      { operation: 'upload', folderPath: options.folderPath },
    ));
  }

  const contentTypeErr = validateNonEmpty(options.contentType, 'contentType');
  if (contentTypeErr) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE',
      `uploadFileToHubSpot input error: ${contentTypeErr}`,
      { operation: 'upload' },
    ));
  }

  // ── Resolve timeout ──
  const timeoutMs = resolveUploadTimeoutMs(buffer.length, options.timeoutMs);

  // ── Retry loop ──
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Rebuild FormData on every attempt to avoid stream/blob consumption issues
    const formData = buildUploadFormData(buffer, options);

    let response: Response;

    try {
      response = await fetchWithTimeout(
        HUBSPOT_FILES_API,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            // Do NOT set Content-Type — browser/node sets it with boundary for multipart
          },
          body: formData,
        },
        timeoutMs,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('aborted') || message.includes('abort')) {
        if (attempt < MAX_RETRIES) {
          await sleep(calculateBackoffMs(attempt));
          continue;
        }
        return err(new ResourceError(
          'RESOURCE_CRM_FILE_TIMEOUT',
          `HubSpot file upload timed out after ${timeoutMs}ms (${MAX_RETRIES + 1} attempts)`,
          { timeoutMs, attempts: attempt + 1, operation: 'upload', retryable: false },
        ));
      }
      if (attempt < MAX_RETRIES) {
        await sleep(calculateBackoffMs(attempt));
        continue;
      }
      return err(new ResourceError(
        'RESOURCE_CRM_FILE_NETWORK_ERROR',
        `HubSpot file upload network error: ${message}`,
        { operation: 'upload', retryable: true },
        error,
      ));
    }

    // ── Success ──
    if (response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return err(new SchemaError(
          'SCHEMA_CRM_FILE_RESPONSE_INVALID',
          'HubSpot file upload response is not valid JSON',
          { operation: 'upload' },
        ));
      }

      const parsed = HubSpotFileUploadResponseSchema.safeParse(body);
      if (!parsed.success) {
        return err(new SchemaError(
          'SCHEMA_CRM_FILE_RESPONSE_INVALID',
          `HubSpot file upload response schema mismatch: ${parsed.error.message}`,
          { operation: 'upload', zodErrors: parsed.error.issues },
        ));
      }

      // ── Verify access level matches what was requested (security-critical) ──
      if (parsed.data.access !== options.access) {
        return err(new SchemaError(
          'SCHEMA_CRM_FILE_ACCESS_MISMATCH',
          `HubSpot returned access "${parsed.data.access}" but "${options.access}" was requested`,
          {
            operation: 'upload',
            expectedAccess: options.access,
            actualAccess: parsed.data.access,
            fileId: parsed.data.id,
          },
        ));
      }

      return ok({
        fileId: parsed.data.id,
        url: parsed.data.url ?? null,
        defaultHostingUrl: parsed.data.defaultHostingUrl ?? null,
        sizeBytes: parsed.data.size ?? null,
        access: parsed.data.access as HubSpotFileAccess,
      });
    }

    // ── Retryable error ──
    if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
      const retryAfter = response.headers.get('Retry-After');
      await sleep(calculateBackoffMs(attempt, retryAfter));
      continue;
    }

    // ── Non-retryable error or exhausted retries ──
    const errorDetail = await parseErrorBody(response);
    return err(mapHttpError(response.status, errorDetail, 'upload'));
  }

  // Should never reach here, but TypeScript needs it
  return err(new ResourceError(
    'RESOURCE_CRM_FILE_UPLOAD_FAILED',
    'HubSpot file upload failed: exhausted all retries',
    { operation: 'upload', retryable: false },
  ));
}

/**
 * Create a HubSpot Note with file attachment AND inline association.
 * Single POST — no orphan notes risk.
 *
 * Uses associations block in the same request body:
 *   associations: [{ to: { id }, types: [{ associationCategory, associationTypeId }] }]
 */
async function createNoteWithAssociation(
  token: string,
  fileId: string,
  objectType: HubSpotAttachObjectType,
  objectId: string,
  noteBody: string | undefined,
  timeoutMs: number,
): Promise<Result<string, EngineError>> {
  const requestBody = {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: noteBody ?? 'Cotización PDF adjunta — generada por Focux Quoter',
      hs_attachment_ids: fileId,
    },
    associations: [
      {
        to: {
          id: objectId,
        },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: NOTE_ASSOCIATION_TYPE_IDS[objectType],
          },
        ],
      },
    ],
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;

    try {
      response = await fetchWithTimeout(
        HUBSPOT_NOTES_API,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        },
        timeoutMs,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_RETRIES) {
        await sleep(calculateBackoffMs(attempt));
        continue;
      }
      const isTimeout = message.includes('abort');
      return err(new ResourceError(
        isTimeout ? 'RESOURCE_CRM_FILE_TIMEOUT' : 'RESOURCE_CRM_FILE_NETWORK_ERROR',
        `HubSpot note creation ${isTimeout ? 'timed out' : 'network error'}: ${message}`,
        { operation: 'attach_note', retryable: !isTimeout },
        error,
      ));
    }

    if (response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return err(new SchemaError(
          'SCHEMA_CRM_FILE_RESPONSE_INVALID',
          'HubSpot note creation response is not valid JSON',
          { operation: 'attach_note' },
        ));
      }

      const parsed = HubSpotNoteCreateResponseSchema.safeParse(body);
      if (!parsed.success) {
        return err(new SchemaError(
          'SCHEMA_CRM_FILE_RESPONSE_INVALID',
          `HubSpot note creation response schema mismatch: ${parsed.error.message}`,
          { operation: 'attach_note', zodErrors: parsed.error.issues },
        ));
      }

      return ok(parsed.data.id);
    }

    if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
      const retryAfter = response.headers.get('Retry-After');
      await sleep(calculateBackoffMs(attempt, retryAfter));
      continue;
    }

    const errorDetail = await parseErrorBody(response);
    return err(mapHttpError(response.status, errorDetail, 'attach_note'));
  }

  return err(new ResourceError(
    'RESOURCE_CRM_FILE_ATTACH_FAILED',
    'HubSpot note creation failed: exhausted all retries',
    { operation: 'attach_note', retryable: false },
  ));
}

/**
 * Attach a previously uploaded file to a CRM record via a Note engagement.
 *
 * Creates a Note with hs_attachment_ids AND inline association in a SINGLE
 * POST request. This eliminates the orphan note risk from a 2-step approach.
 *
 * @param token — HubSpot Private App token (never logged)
 * @param fileId — HubSpot file ID from uploadFileToHubSpot result
 * @param options — Attachment configuration
 * @returns Result with note ID and association info, or typed error
 */
export async function attachFileToRecord(
  token: string,
  fileId: string,
  options: HubSpotAttachFileOptions,
): Promise<Result<HubSpotAttachFileResult, EngineError>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { objectType, objectId, noteBody } = options;

  // ── Input validation ──
  const tokenErr = validateNonEmpty(token, 'token');
  if (tokenErr) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE',
      `attachFileToRecord input error: ${tokenErr}`,
      { operation: 'attach' },
    ));
  }

  const fileIdErr = validateNonEmpty(fileId, 'fileId');
  if (fileIdErr) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE',
      `attachFileToRecord input error: ${fileIdErr}`,
      { operation: 'attach' },
    ));
  }

  const objectIdErr = validateNonEmpty(objectId, 'objectId');
  if (objectIdErr) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE',
      `attachFileToRecord input error: ${objectIdErr}`,
      { operation: 'attach' },
    ));
  }

  // ── Validate object type ──
  if (!(objectType in NOTE_ASSOCIATION_TYPE_IDS)) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE',
      `Unsupported object type for file attachment: "${objectType}". Supported: ${Object.keys(NOTE_ASSOCIATION_TYPE_IDS).join(', ')}`,
      { objectType, operation: 'attach' },
    ));
  }

  // ── Single POST: Create Note with attachment + association ──
  const noteResult = await createNoteWithAssociation(
    token, fileId, objectType, objectId, noteBody, timeoutMs,
  );
  if (noteResult.isErr()) return err(noteResult.error);

  return ok({
    noteId: noteResult.value,
    associatedTo: { objectType, objectId },
  });
}
