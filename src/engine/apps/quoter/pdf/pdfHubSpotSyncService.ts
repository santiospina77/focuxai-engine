/**
 * pdfHubSpotSyncService — Application-layer service for PDF ↔ HubSpot sync.
 *
 * Owns the full lifecycle:
 *   generate PDF → upload to HubSpot File Manager → attach as Note → PATCH deal URL
 *
 * Used by:
 *   - deal/route.ts (initial sync during deal creation)
 *   - retry-pdf/route.ts (manual/batch retry of failed syncs)
 *
 * All operations return Result<T, EngineError>. No throws.
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { buildPdfBuffer } from '@/app/api/engine/quotations/pdf/pdfBuilder';
import type { PdfAssetOptions } from '@/app/api/engine/quotations/pdf/pdfBuilder';
import { uploadFileToHubSpot, attachFileToRecord } from '@/engine/connectors/crm/hubspot/hubspotFileManager';
import type { Result } from '@/engine/core/types/Result';
import { ok, err } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';
import { ResourceError, ValidationError } from '@/engine/core/errors/EngineError';
import type { QuotationRow } from '@/app/api/engine/quotations/types';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export type PdfSyncStatus = NonNullable<QuotationRow['pdf_upload_status']>;

/** Immutable result of a full PDF sync attempt. */
export interface PdfSyncResult {
  readonly status: PdfSyncStatus;
  readonly fileId: string | null;
  readonly noteId: string | null;
  readonly url: string | null;
  readonly error: string | null;
  readonly uploadedAt: string | null;
  readonly attachedAt: string | null;
}

/** What the caller must provide about the HubSpot context. */
export interface PdfSyncContext {
  readonly token: string;
  readonly dealId: string;
  readonly clientId: string;
  readonly macroName: string;
  readonly pdfAssets?: PdfAssetOptions;
}

/**
 * Partial context for retry — some fields may already exist
 * from a previous (partially successful) attempt.
 */
export interface PdfRetryContext extends PdfSyncContext {
  /** If a previous upload succeeded, reuse this fileId for attach-only. */
  readonly existingFileId: string | null;
  /** If a previous upload produced a URL, carry it forward. */
  readonly existingUrl: string | null;
}

// ═══════════════════════════════════════════════════════════
// Pure helpers (no side effects)
// ═══════════════════════════════════════════════════════════

/**
 * Slugify a string for use as a HubSpot folder path segment.
 * Returns fallback if result is empty (e.g., all special chars).
 */
export function slugifyFolderSegment(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/**
 * Build a validated HubSpot folder path for quotation PDFs.
 * Format: /cotizaciones/{clientSlug}/{macroSlug}/{YYYY-MM}/
 * Clean namespace — no Focux branding in client-facing URLs.
 */
export function buildHubSpotQuotationFolderPath(params: {
  readonly clientId: string;
  readonly macroName: string;
  readonly date: Date;
}): Result<string, EngineError> {
  const clientSlug = slugifyFolderSegment(params.clientId, 'unknown-client');
  const macroSlug = slugifyFolderSegment(params.macroName, 'unknown-project');
  const yearMonth = params.date.toISOString().slice(0, 7);

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return err(new ValidationError(
      'VALIDATION_CRM_FILE_FOLDER_INVALID',
      'No se pudo construir la ruta del folder para HubSpot',
      { yearMonth },
    ));
  }

  return ok(`/cotizaciones/${clientSlug}/${macroSlug}/${yearMonth}/`);
}

/**
 * Wrap buildPdfBuffer in Result pattern.
 * Converts throw-based pdf-lib errors into Result<Buffer, EngineError>.
 */
export async function buildPdfBufferSafe(
  quotation: QuotationRow,
  assetOpts?: PdfAssetOptions,
): Promise<Result<Buffer, EngineError>> {
  try {
    const raw = await buildPdfBuffer(quotation, assetOpts);
    return ok(Buffer.from(raw));
  } catch (error: unknown) {
    return err(new ResourceError(
      'RESOURCE_PDF_GENERATION_FAILED',
      'No se pudo generar el PDF de la cotización',
      {
        operation: 'build_pdf_for_hubspot_upload',
        cotNumber: quotation.cot_number,
        retryable: true,
      },
      error,
    ));
  }
}

/**
 * Extract safe error info for logs (no PII, no tokens, no buffers).
 */
export function safeErrorMessage(error: EngineError): string {
  return `${error.code}: ${error.message}`.slice(0, 500);
}

// ═══════════════════════════════════════════════════════════
// Core service functions
// ═══════════════════════════════════════════════════════════

/**
 * Full PDF sync: generate → upload → attach → PATCH deal.
 *
 * Used by deal/route.ts during initial deal creation.
 * Non-fatal by design: returns PdfSyncResult with status indicating
 * the furthest point reached. The caller decides whether to abort.
 */
export async function syncQuotationPdfToHubSpot(
  quotation: QuotationRow,
  ctx: PdfSyncContext,
): Promise<PdfSyncResult> {
  const { token, dealId, clientId, macroName, pdfAssets } = ctx;
  const cotNumber = quotation.cot_number;

  // ── Step 1: Build folder path ──
  const folderPathResult = buildHubSpotQuotationFolderPath({
    clientId,
    macroName,
    date: new Date(),
  });

  if (folderPathResult.isErr()) {
    return {
      status: 'upload_failed',
      fileId: null,
      noteId: null,
      url: null,
      error: safeErrorMessage(folderPathResult.error),
      uploadedAt: null,
      attachedAt: null,
    };
  }

  // ── Step 2: Generate PDF ──
  const pdfResult = await buildPdfBufferSafe(quotation, pdfAssets);

  if (pdfResult.isErr()) {
    return {
      status: 'generation_failed',
      fileId: null,
      noteId: null,
      url: null,
      error: safeErrorMessage(pdfResult.error),
      uploadedAt: null,
      attachedAt: null,
    };
  }

  // ── Step 3: Upload to HubSpot File Manager ──
  const uploadResult = await uploadFileToHubSpot(token, pdfResult.value, {
    fileName: `${cotNumber}_v1.pdf`,
    folderPath: folderPathResult.value,
    contentType: 'application/pdf',
    access: 'PUBLIC_NOT_INDEXABLE',
  });

  if (uploadResult.isErr()) {
    return {
      status: 'upload_failed',
      fileId: null,
      noteId: null,
      url: null,
      error: safeErrorMessage(uploadResult.error),
      uploadedAt: null,
      attachedAt: null,
    };
  }

  const fileId = uploadResult.value.fileId;
  const url = uploadResult.value.url ?? uploadResult.value.defaultHostingUrl ?? null;
  const uploadedAt = new Date().toISOString();

  // ── Step 4: Attach to Deal as Note ──
  return attachAndPatch({ token, dealId, cotNumber, fileId, url, uploadedAt });
}

/**
 * Retry a previously failed PDF sync.
 *
 * Determines the correct recovery path based on existing state:
 *   - Has fileId → attach-only (skip PDF generation + upload)
 *   - No fileId → full rebuild (generate + upload + attach)
 *
 * Used by retry-pdf/route.ts.
 */
export async function retryQuotationPdfSync(
  quotation: QuotationRow,
  ctx: PdfRetryContext,
): Promise<PdfSyncResult> {
  const { existingFileId, existingUrl } = ctx;

  // If we already have a fileId from a previous upload, skip to attach
  if (existingFileId) {
    return attachAndPatch({
      token: ctx.token,
      dealId: ctx.dealId,
      cotNumber: quotation.cot_number,
      fileId: existingFileId,
      url: existingUrl,
      uploadedAt: null, // preserve original upload timestamp
    });
  }

  // No fileId → full rebuild
  return syncQuotationPdfToHubSpot(quotation, ctx);
}

// ═══════════════════════════════════════════════════════════
// Internal: Attach + PATCH deal
// ═══════════════════════════════════════════════════════════

async function attachAndPatch(params: {
  readonly token: string;
  readonly dealId: string;
  readonly cotNumber: string;
  readonly fileId: string;
  readonly url: string | null;
  readonly uploadedAt: string | null;
}): Promise<PdfSyncResult> {
  const { token, dealId, cotNumber, fileId, url, uploadedAt } = params;

  const attachResult = await attachFileToRecord(token, fileId, {
    objectType: 'deals',
    objectId: dealId,
    noteBody: `Cotización ${cotNumber}`,
  });

  if (attachResult.isErr()) {
    return {
      status: 'attach_failed',
      fileId,
      noteId: null,
      url,
      error: safeErrorMessage(attachResult.error),
      uploadedAt,
      attachedAt: null,
    };
  }

  const attachedAt = new Date().toISOString();

  // PATCH Deal with HubSpot PDF URL (non-fatal — if this fails, status is still 'attached')
  if (url) {
    try {
      await fetch(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            properties: { pdf_hubspot_url_fx: url },
          }),
        },
      );
    } catch (patchErr) {
      console.warn('[pdfSync] PATCH pdf_hubspot_url_fx failed (non-fatal)', {
        cotNumber,
        error: patchErr instanceof Error ? patchErr.message : String(patchErr),
      });
    }
  }

  return {
    status: 'attached',
    fileId,
    noteId: attachResult.value.noteId,
    url,
    error: null,
    uploadedAt,
    attachedAt,
  };
}
