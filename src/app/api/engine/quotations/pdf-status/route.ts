/**
 * GET /api/engine/quotations/pdf-status — PDF sync status dashboard.
 *
 * Admin-only. Returns distribution of PDF upload statuses,
 * failure rate, and the last N failures for diagnosis.
 *
 * Query params:
 *   - clientId (required): Client identifier
 *   - failures (optional): Number of recent failures to return (default 10, max 50)
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/engine/core/db/neon';
import { validateAdminAuth } from '@/engine/core/http/adminAuth';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message, timestamp: new Date().toISOString() },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

interface StatusCount {
  readonly status: string;
  readonly count: number;
}

interface FailureEntry {
  readonly cotNumber: string;
  readonly clientId: string;
  readonly status: string;
  readonly error: string | null;
  readonly dealId: string | null;
  readonly updatedAt: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──
  const authErr = validateAdminAuth(request);
  if (authErr) return authErr;

  // ── Params ──
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim();
  const failuresLimit = Math.min(Math.max(parseInt(searchParams.get('failures') ?? '10', 10) || 10, 1), 50);

  if (!clientId) {
    return errorResponse(400, 'MISSING_CLIENT_ID', 'Query param clientId es obligatorio.');
  }

  const sql = getDb();

  try {
    // ── Distribution by status ──
    const distRows = await sql`
      SELECT
        COALESCE(pdf_upload_status, 'null') as status,
        COUNT(*)::int as count
      FROM quotations
      WHERE client_id = ${clientId}
      GROUP BY pdf_upload_status
      ORDER BY count DESC
    `;

    const distribution: StatusCount[] = distRows.map((r: Record<string, unknown>) => ({
      status: String(r.status),
      count: Number(r.count),
    }));

    // ── Aggregate metrics ──
    const total = distribution.reduce((s, d) => s + d.count, 0);
    const attached = distribution.find(d => d.status === 'attached')?.count ?? 0;
    const failureStatuses = ['generation_failed', 'upload_failed', 'attach_failed'];
    const failureCount = distribution
      .filter(d => failureStatuses.includes(d.status))
      .reduce((s, d) => s + d.count, 0);
    const uploaded = distribution.find(d => d.status === 'uploaded')?.count ?? 0;
    const nullStatus = distribution.find(d => d.status === 'null')?.count ?? 0;
    const failureRate = total > 0 ? Math.round((failureCount / total) * 10000) / 100 : 0;

    // ── Last N failures ──
    const failRows = await sql`
      SELECT
        cot_number,
        client_id,
        pdf_upload_status,
        pdf_upload_error,
        hubspot_deal_id,
        updated_at
      FROM quotations
      WHERE client_id = ${clientId}
        AND pdf_upload_status IN ('generation_failed', 'upload_failed', 'attach_failed')
      ORDER BY updated_at DESC
      LIMIT ${failuresLimit}
    `;

    const recentFailures: FailureEntry[] = failRows.map((r: Record<string, unknown>) => ({
      cotNumber: String(r.cot_number),
      clientId: String(r.client_id),
      status: String(r.pdf_upload_status),
      error: r.pdf_upload_error ? String(r.pdf_upload_error) : null,
      dealId: r.hubspot_deal_id ? String(r.hubspot_deal_id) : null,
      updatedAt: String(r.updated_at),
    }));

    // ── Last failure timestamp ──
    const lastFailureAt = recentFailures.length > 0 ? recentFailures[0].updatedAt : null;

    return NextResponse.json(
      {
        clientId,
        total,
        attached,
        uploaded,
        pending: nullStatus,
        failureCount,
        failureRate,
        lastFailureAt,
        distribution,
        recentFailures,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (dbErr) {
    console.error(`[pdf-status] DB error: ${dbErr instanceof Error ? dbErr.message : dbErr}`);
    return errorResponse(500, 'DB_ERROR', 'Error consultando estado de PDFs.');
  }
}
