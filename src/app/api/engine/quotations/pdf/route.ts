/**
 * POST & GET /api/engine/quotations/pdf — Generar PDF server-side de una cotización.
 *
 * POST: { clientId, cotNumber } en body (usado por el frontend)
 * GET:  ?clientId=X&cotNumber=Y en query params (link directo desde HubSpot/email)
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/engine/core/db/neon';
import { buildPdfBuffer } from './pdfBuilder';
import type { QuotationRow } from '../types';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message, timestamp: new Date().toISOString() },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

async function generatePdf(clientId: string, cotNumber: string): Promise<NextResponse> {
  if (!clientId?.trim()) return errorResponse(400, 'MISSING_CLIENT_ID', 'clientId es obligatorio.');
  if (!cotNumber?.trim()) return errorResponse(400, 'MISSING_COT_NUMBER', 'cotNumber es obligatorio.');

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM quotations
      WHERE cot_number = ${cotNumber} AND client_id = ${clientId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return errorResponse(404, 'QUOTATION_NOT_FOUND', `Cotización ${cotNumber} no encontrada.`);
    }

    const quotation = rows[0] as QuotationRow;
    // Intentionally no assetOpts here. This endpoint is the fallback renderer
    // that always resolves assets from Vercel static /assets/. If HubSpot CDN
    // is down, the deal pipeline's pdf_cotizacion_url_fx still works via this route.
    const pdfBuffer = await buildPdfBuffer(quotation);

    await sql`
      UPDATE quotations SET pdf_generated_at = NOW() WHERE id = ${quotation.id}
    `;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${cotNumber}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[quotations/pdf] Error: ${message}`);
    return errorResponse(500, 'PDF_GENERATION_ERROR', 'Error generando PDF. Revisar logs.');
  }
}

// ── POST (frontend) ──
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { clientId: string; cotNumber: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_BODY', 'Body debe ser JSON con { clientId, cotNumber }.');
  }
  return generatePdf(body.clientId, body.cotNumber);
}

// ── GET (link directo desde HubSpot / email) ──
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId') || '';
  const cotNumber = searchParams.get('cotNumber') || '';
  return generatePdf(clientId, cotNumber);
}
