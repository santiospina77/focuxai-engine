/**
 * POST /api/engine/quotations/retry-pdf — Retry failed PDF syncs to HubSpot.
 *
 * Admin-only endpoint. Supports single cotización or batch retry.
 *
 * Body:
 *   { clientId: string, cotNumber?: string, all?: boolean, limit?: number, dryRun?: boolean }
 *
 * State machine for retry:
 *   generation_failed → rebuild PDF + upload + attach
 *   upload_failed     → rebuild PDF + upload + attach
 *   uploaded          → attach only
 *   attach_failed     → attach only (if fileId exists), else full rebuild
 *
 * Responses:
 *   200 → { ok, processed, succeeded, failed, results[] }
 *   400 → validation error
 *   401 → missing auth
 *   403 → invalid auth
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/engine/core/db/neon';
import { validateAdminAuth } from '@/engine/core/http/adminAuth';
import { retryQuotationPdfSync } from '@/engine/apps/quoter/pdf/pdfHubSpotSyncService';
import type { PdfSyncResult } from '@/engine/apps/quoter/pdf/pdfHubSpotSyncService';
import type { QuotationRow } from '../types';
import type { PdfAssetOptions } from '@/app/api/engine/quotations/pdf/pdfBuilder';

// ═══════════════════════════════════════════════════════════
// Client config — shared with deal/route.ts pattern
// TODO: Fase B.2 — extract to shared clientRegistry module
// ═══════════════════════════════════════════════════════════

interface ClientRetryConfig {
  readonly hubspotTokenEnvVar: string;
  readonly pdfAssets?: PdfAssetOptions;
}

const CLIENT_REGISTRY: Record<string, ClientRetryConfig> = {
  jimenez_demo: {
    hubspotTokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
    pdfAssets: {
      assetBaseUrl: 'https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez/porto-sabbia',
      allowedHosts: ['focuxai-engine.vercel.app', '51256354.fs1.hubspotusercontent-na1.net'],
    },
  },
};

// ═══════════════════════════════════════════════════════════
// Zod schema
// ═══════════════════════════════════════════════════════════

const MAX_BATCH_LIMIT = 50;
const DEFAULT_BATCH_LIMIT = 10;

const RetryBodySchema = z.object({
  clientId: z.string().min(1, 'clientId es obligatorio'),
  cotNumber: z.string().min(1).optional(),
  all: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(MAX_BATCH_LIMIT).optional().default(DEFAULT_BATCH_LIMIT),
  dryRun: z.boolean().optional().default(false),
});

type RetryBody = z.infer<typeof RetryBodySchema>;

// ═══════════════════════════════════════════════════════════
// Retryable statuses
// ═══════════════════════════════════════════════════════════

const RETRYABLE_STATUSES = [
  'generation_failed',
  'upload_failed',
  'uploaded',
  'attach_failed',
] as const;

/**
 * Determines if a quotation needs a full rebuild or just an attach.
 * - Has fileId → attach only
 * - No fileId → full rebuild regardless of status
 */
function needsFullRebuild(q: QuotationRow): boolean {
  return !q.pdf_hubspot_file_id;
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message, timestamp: new Date().toISOString() },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

interface RetryItemResult {
  readonly cotNumber: string;
  readonly previousStatus: string;
  readonly newStatus: string;
  readonly fileId: string | null;
  readonly noteId: string | null;
  readonly url: string | null;
  readonly error: string | null;
  readonly skipped: boolean;
  readonly skipReason?: string;
}

// ═══════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──
  const authErr = validateAdminAuth(request);
  if (authErr) return authErr;

  // ── Parse + validate body ──
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_BODY', 'Body debe ser JSON.');
  }

  const parseResult = RetryBodySchema.safeParse(rawBody);
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    return errorResponse(400, 'VALIDATION_ERROR', issues);
  }

  const body: RetryBody = parseResult.data;
  const { clientId, cotNumber, all, limit, dryRun } = body;

  // ── Validate client ──
  const clientConfig = CLIENT_REGISTRY[clientId];
  if (!clientConfig) {
    return errorResponse(404, 'CLIENT_NOT_FOUND', `clientId="${clientId}" no está configurado.`);
  }

  // Must specify cotNumber OR all
  if (!cotNumber && !all) {
    return errorResponse(400, 'MISSING_TARGET', 'Especificar cotNumber para una cotización, o all:true para batch.');
  }

  const token = process.env[clientConfig.hubspotTokenEnvVar];
  if (!token?.trim()) {
    return errorResponse(500, 'MISSING_TOKEN', `Env var ${clientConfig.hubspotTokenEnvVar} no configurada.`);
  }

  // ── Query retryable quotations ──
  const sql = getDb();
  let rows: QuotationRow[];

  const retryableArr = [...RETRYABLE_STATUSES];

  try {
    if (cotNumber) {
      // Single retry
      const result = await sql`
        SELECT * FROM quotations
        WHERE cot_number = ${cotNumber}
          AND client_id = ${clientId}
          AND pdf_upload_status = ANY(${retryableArr}::text[])
        LIMIT 1
      `;
      rows = result as unknown as QuotationRow[];
    } else {
      // Batch retry — ordered by updated_at ASC (oldest first)
      const result = await sql`
        SELECT * FROM quotations
        WHERE client_id = ${clientId}
          AND pdf_upload_status = ANY(${retryableArr}::text[])
          AND hubspot_deal_id IS NOT NULL
        ORDER BY updated_at ASC
        LIMIT ${limit}
      `;
      rows = result as unknown as QuotationRow[];
    }
  } catch (dbErr) {
    console.error(`[retry-pdf] DB query error: ${dbErr instanceof Error ? dbErr.message : dbErr}`);
    return errorResponse(500, 'DB_ERROR', 'Error consultando cotizaciones.');
  }

  if (rows.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        processed: 0,
        succeeded: 0,
        failed: 0,
        message: cotNumber
          ? `Cotización ${cotNumber} no encontrada o no tiene estado retryable.`
          : 'No hay cotizaciones con estado retryable.',
        results: [],
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // ── Process retries ──
  const results: RetryItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const q of rows) {
    const previousStatus = q.pdf_upload_status ?? 'null';

    // Skip if no dealId (shouldn't happen with our query, but defensive)
    if (!q.hubspot_deal_id) {
      results.push({
        cotNumber: q.cot_number,
        previousStatus,
        newStatus: previousStatus,
        fileId: null,
        noteId: null,
        url: null,
        error: 'No dealId — cannot attach PDF',
        skipped: true,
        skipReason: 'no_deal_id',
      });
      failed++;
      continue;
    }

    // ── Dry run: report what would happen ──
    if (dryRun) {
      const wouldRebuild = needsFullRebuild(q);
      results.push({
        cotNumber: q.cot_number,
        previousStatus,
        newStatus: '(dry run)',
        fileId: q.pdf_hubspot_file_id,
        noteId: null,
        url: q.pdf_hubspot_url,
        error: null,
        skipped: true,
        skipReason: wouldRebuild ? 'dry_run:full_rebuild' : 'dry_run:attach_only',
      });
      continue;
    }

    // ── Execute retry ──
    let syncResult: PdfSyncResult;
    try {
      syncResult = await retryQuotationPdfSync(q, {
        token,
        dealId: q.hubspot_deal_id,
        clientId,
        macroName: String(q.macro_name),
        pdfAssets: clientConfig.pdfAssets,
        existingFileId: q.pdf_hubspot_file_id,
        existingUrl: q.pdf_hubspot_url,
      });
    } catch (retryErr) {
      const errMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      console.error(`[retry-pdf] Unexpected error for ${q.cot_number}: ${errMsg}`);
      results.push({
        cotNumber: q.cot_number,
        previousStatus,
        newStatus: previousStatus,
        fileId: null,
        noteId: null,
        url: null,
        error: errMsg.slice(0, 500),
        skipped: false,
      });
      failed++;
      continue;
    }

    // ── Update DB ──
    try {
      await sql`
        UPDATE quotations
        SET pdf_hubspot_file_id = COALESCE(${syncResult.fileId}, pdf_hubspot_file_id),
            pdf_upload_status = ${syncResult.status},
            pdf_upload_error = ${syncResult.error},
            pdf_uploaded_at = COALESCE(${syncResult.uploadedAt}::timestamptz, pdf_uploaded_at),
            pdf_hubspot_note_id = COALESCE(${syncResult.noteId}, pdf_hubspot_note_id),
            pdf_attached_at = COALESCE(${syncResult.attachedAt}::timestamptz, pdf_attached_at),
            pdf_hubspot_url = COALESCE(${syncResult.url}, pdf_hubspot_url),
            updated_at = NOW()
        WHERE id = ${q.id}
      `;
    } catch (dbErr) {
      console.error(`[retry-pdf] DB update error for ${q.cot_number}: ${dbErr instanceof Error ? dbErr.message : dbErr}`);
    }

    const isSuccess = syncResult.status === 'attached';
    if (isSuccess) succeeded++;
    else failed++;

    results.push({
      cotNumber: q.cot_number,
      previousStatus,
      newStatus: syncResult.status,
      fileId: syncResult.fileId,
      noteId: syncResult.noteId,
      url: syncResult.url,
      error: syncResult.error,
      skipped: false,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      dryRun,
      processed: rows.length,
      succeeded,
      failed,
      results,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
