# ARCHITECT REVIEW REQUEST — hubspotFileManager.ts

**Author:** SpaceCommander
**Date:** 2026-05-01
**Component:** `src/engine/connectors/crm/hubspot/hubspotFileManager.ts` (~559 lines)
**Branch:** `feature/multi-project`
**Context:** Fase B.0, Step 1 — HubSpot File Manager connector for data sovereignty

---

## What this module does

Shared connector for uploading files to HubSpot File Manager and attaching them to CRM records via Notes. Used by:

1. **PDF upload** — After generating a quotation PDF, upload it to client's HubSpot as PRIVATE, attach to deal via Note
2. **Asset migration** — Upload renders/planos as PUBLIC_NOT_INDEXABLE so quoter fetches from client's HubSpot

## Architecture context

```
Engine Core (Result, EngineError)
  └─ connectors/crm/hubspot/
       ├── hubspotAdapter.ts      ← existing CRM adapter (CRUD, search, batch)
       ├── types.ts               ← existing Zod schemas, type resolver, filter mapping
       └── hubspotFileManager.ts  ← NEW (this file) — file upload + note attach
```

The module follows the same patterns as the existing HubSpot adapter:
- `Result<T, EngineError>` always — never throw
- Zod validation on all API responses
- Retry with exponential backoff + jitter on 429/5xx
- AbortController timeout on every fetch
- Typed error codes in EngineError hierarchy

## Decisions already approved (from Architect review of REVIEW_REQUEST_Fase_B0.md)

- Q1: `assetBaseUrl` per tenant + relative paths (not full URLs in typology rules)
- Q2: Reusable `uploadFileToHubSpot()` in connector layer
- Q3: PUBLIC_NOT_INDEXABLE for renders (no PII), PRIVATE for PDFs (contain buyer PII)
- Q4: Synchronous best-effort (non-fatal) for PDF upload
- Q5: Add `pdf_hubspot_file_id` column for traceability
- Q6: Folder structure `/focux-quoter/{clientId}/cotizaciones/YYYY-MM/`
- Q8: Correct placement in `connectors/crm/hubspot/` (file operations are CRM-specific)
- Q9: Use `Result<T, EngineError>` (same error type as rest of engine)
- Q10: Rate limiting in connector with backoff

## New ErrorCodes added to EngineError.ts

```typescript
// — HubSpot File Manager (uploads, attachments)
| 'AUTH_CRM_FILE_TOKEN_INVALID'
| 'RESOURCE_CRM_FILE_UPLOAD_FAILED'
| 'RESOURCE_CRM_FILE_ATTACH_FAILED'
| 'RESOURCE_CRM_FILE_RATE_LIMITED'
| 'RESOURCE_CRM_FILE_SERVER_ERROR'
| 'RESOURCE_CRM_FILE_TIMEOUT'
| 'RESOURCE_CRM_FILE_NETWORK_ERROR'
| 'VALIDATION_CRM_FILE_RESPONSE_INVALID'
| 'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE'
```

Placed between CRM errors (`RESOURCE_CRM_*`) and Asset errors (`RESOURCE_ASSET_*`).

## Full source: hubspotFileManager.ts

```typescript
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
 *   - AbortController timeout on every fetch.
 *   - Zero tenant-specific logic. Zero hardcoded client IDs.
 *   - Never log tokens, PDF buffers, or buyer PII.
 *
 * HubSpot API references:
 *   - Upload: POST /files/v3/files (multipart/form-data)
 *   - Notes:  POST /crm/v3/objects/notes
 *   - Associations: PUT /crm/v4/objects/notes/{noteId}/associations/default/{objectType}/{objectId}
 *
 * @since v3.0.0 — Fase B.0
 */

import { z } from 'zod';
import type { Result } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';
import { ok, err } from '@/engine/core/types/Result';
import { AuthError, ResourceError, ValidationError } from '@/engine/core/errors/EngineError';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const HUBSPOT_FILES_API = 'https://api.hubapi.com/files/v3/files';
const HUBSPOT_NOTES_API = 'https://api.hubapi.com/crm/v3/objects/notes';
const HUBSPOT_ASSOCIATIONS_V4 = 'https://api.hubapi.com/crm/v4/objects/notes';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

/** HubSpot association type IDs for notes */
const NOTE_ASSOCIATION_TYPE_IDS: Record<string, number> = {
  deals: 214,
  contacts: 202,
} as const;

// ═══════════════════════════════════════════════════════════
// Public Types
// ═══════════════════════════════════════════════════════════

export type HubSpotFileAccess = 'PRIVATE' | 'PUBLIC_NOT_INDEXABLE';

export interface HubSpotFileUploadOptions {
  readonly fileName: string;
  readonly folderPath: string;
  readonly contentType: string;
  readonly access: HubSpotFileAccess;
  readonly timeoutMs?: number;
}

export interface HubSpotFileUploadResult {
  readonly fileId: string;
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
 * POST /files/v3/files response.
 * HubSpot returns a rich object; we validate the fields we need.
 */
export const HubSpotFileUploadResponseSchema = z.object({
  id: z.string(),
  url: z.string().nullable().optional(),
  defaultHostingUrl: z.string().nullable().optional(),
  size: z.number().nullable().optional(),
  access: z.string(),
}).passthrough();

export type HubSpotFileUploadResponseRaw = z.infer<typeof HubSpotFileUploadResponseSchema>;

/**
 * POST /crm/v3/objects/notes response.
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

// ═══════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════

/**
 * Upload a file buffer to HubSpot File Manager.
 *
 * Uses multipart/form-data as required by HubSpot Files v3 API.
 * Retries on 429/5xx with exponential backoff + jitter.
 * Validates response with Zod.
 *
 * @param token — HubSpot Private App token (never logged)
 * @param buffer — File content as Buffer
 * @param options — Upload configuration
 * @returns Result with file metadata or typed error
 */
export async function uploadFileToHubSpot(
  token: string,
  buffer: Buffer,
  options: HubSpotFileUploadOptions,
): Promise<Result<HubSpotFileUploadResult, EngineError>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Build multipart form data
  const formData = new FormData();

  // File blob — convert Buffer to Uint8Array for Blob compatibility
  const blob = new Blob([new Uint8Array(buffer)], { type: options.contentType });
  formData.append('file', blob, options.fileName);

  // Options JSON — access and folderPath
  const fileOptions = JSON.stringify({
    access: options.access,
  });
  formData.append('options', fileOptions);

  // Folder path
  formData.append('folderPath', options.folderPath);

  // File name (explicit, in case blob name gets mangled)
  formData.append('fileName', options.fileName);

  // ── Retry loop ──
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        return err(new ValidationError(
          'VALIDATION_CRM_FILE_RESPONSE_INVALID',
          'HubSpot file upload response is not valid JSON',
          { operation: 'upload' },
        ));
      }

      const parsed = HubSpotFileUploadResponseSchema.safeParse(body);
      if (!parsed.success) {
        return err(new ValidationError(
          'VALIDATION_CRM_FILE_RESPONSE_INVALID',
          `HubSpot file upload response schema mismatch: ${parsed.error.message}`,
          { operation: 'upload', zodErrors: parsed.error.issues },
        ));
      }

      return ok({
        fileId: parsed.data.id,
        url: parsed.data.url ?? null,
        defaultHostingUrl: parsed.data.defaultHostingUrl ?? null,
        sizeBytes: parsed.data.size ?? null,
        access: options.access,
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
 * Create a HubSpot Note with file attachment. Internal helper with retry.
 */
async function createNoteWithRetry(
  token: string,
  fileId: string,
  noteBody: string | undefined,
  timeoutMs: number,
): Promise<Result<string, EngineError>> {
  const noteProperties: Record<string, string> = {
    hs_timestamp: new Date().toISOString(),
    hs_note_body: noteBody ?? 'Cotización PDF adjunta — generada por Focux Quoter',
    hs_attachment_ids: fileId,
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
          body: JSON.stringify({ properties: noteProperties }),
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
        return err(new ValidationError(
          'VALIDATION_CRM_FILE_RESPONSE_INVALID',
          'HubSpot note creation response is not valid JSON',
          { operation: 'attach_note' },
        ));
      }

      const parsed = HubSpotNoteCreateResponseSchema.safeParse(body);
      if (!parsed.success) {
        return err(new ValidationError(
          'VALIDATION_CRM_FILE_RESPONSE_INVALID',
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
 * Steps:
 *   1. Create Note with hs_attachment_ids pointing to the file
 *   2. Associate Note to the target record (deal/contact) via v4 associations
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

  // ── Validate object type ──
  if (!(objectType in NOTE_ASSOCIATION_TYPE_IDS)) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE',
      `Unsupported object type for file attachment: "${objectType}". Supported: ${Object.keys(NOTE_ASSOCIATION_TYPE_IDS).join(', ')}`,
      { objectType, operation: 'attach' },
    ));
  }

  // ── Step 1: Create Note with attachment ──
  const noteResult = await createNoteWithRetry(token, fileId, noteBody, timeoutMs);
  if (noteResult.isErr()) return err(noteResult.error);
  const noteId = noteResult.value;

  // ── Step 2: Associate Note to Record ──
  const associationUrl =
    `${HUBSPOT_ASSOCIATIONS_V4}/${noteId}/associations/default/${objectType}/${objectId}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;

    try {
      response = await fetchWithTimeout(
        associationUrl,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
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
        `HubSpot note association ${isTimeout ? 'timed out' : 'network error'}: ${message}`,
        { operation: 'attach_association', noteId, objectType, objectId, retryable: !isTimeout },
        error,
      ));
    }

    if (response.ok) {
      return ok({
        noteId,
        associatedTo: { objectType, objectId },
      });
    }

    if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
      const retryAfter = response.headers.get('Retry-After');
      await sleep(calculateBackoffMs(attempt, retryAfter));
      continue;
    }

    const errorDetail = await parseErrorBody(response);
    return err(mapHttpError(response.status, errorDetail, 'attach_association'));
  }

  return err(new ResourceError(
    'RESOURCE_CRM_FILE_ATTACH_FAILED',
    'HubSpot note association failed: exhausted all retries',
    { operation: 'attach_association', noteId, objectType, objectId, retryable: false },
  ));
}
```

## DoD Checklist (self-verified)

| # | Check | Status |
|---|-------|--------|
| 1 | Returns `Result<T, EngineError>` always | ✅ |
| 2 | Zod on every HubSpot response | ✅ (3 schemas) |
| 3 | Multipart file upload via FormData | ✅ |
| 4 | `access` parameter (PRIVATE / PUBLIC_NOT_INDEXABLE) | ✅ |
| 5 | `folderPath` in upload | ✅ |
| 6 | Note with `hs_attachment_ids` + association | ✅ |
| 7 | AbortController timeout on every fetch | ✅ |
| 8 | Retry 429/5xx with backoff + jitter + Retry-After | ✅ |
| 9 | Typed ErrorCodes (9 new) | ✅ |
| 10 | Zero `throw` | ✅ |
| 11 | Zero `any` | ✅ |
| 12 | Zero Jiménez/tenant-specific logic | ✅ |

## Review questions for Architect

1. **API correctness**: Is the multipart/form-data construction correct for HubSpot Files v3? Specifically: `file` (Blob), `options` (JSON string with access), `folderPath` (string), `fileName` (string).

2. **Associations v4**: The default associations endpoint `PUT /crm/v4/objects/notes/{noteId}/associations/default/{objectType}/{objectId}` — is this the correct endpoint and method for creating default associations? We're NOT using the explicit `associationTypeId` (214/202) since `default` handles it.

3. **NOTE_ASSOCIATION_TYPE_IDS**: We define them but don't actually use them in the API call (since we use `/default/`). Should we remove them to avoid dead code, or keep them as documentation for when we might need explicit association types?

4. **PRIVATE file URL access**: When a file is uploaded as PRIVATE, HubSpot may return `url: null` and only `defaultHostingUrl`. Our `HubSpotFileUploadResult` handles both as nullable. Is this sufficient, or should the caller always use `defaultHostingUrl` for PRIVATE files?

5. **FormData reuse across retries**: We create `FormData` once before the retry loop and reuse it across retries. Is there any risk of the FormData or Blob being consumed (stream-like) on the first attempt, making subsequent retries send empty data?

6. **Error granularity**: We have 9 error codes. Is this too many? Too few? The split is: 1 auth, 4 resource (upload, attach, rate, server), 2 infra (timeout, network), 2 validation (response, object type).

7. **Timeout for large files**: DEFAULT_TIMEOUT_MS is 10s. For large PDF uploads (5-10MB), is this sufficient? Should we calculate timeout based on buffer size?

8. **Any missing edge cases** in the retry logic, error mapping, or response parsing?

---

**Request:** Approve with changes, approve as-is, or reject with reasons. Flag any HubSpot API gotchas.
