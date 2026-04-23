/**
 * POST /api/engine/quotations/pdf — Generar PDF server-side de una cotización.
 *
 * Recibe { clientId, cotNumber } → busca en DB → genera PDF con @react-pdf/renderer → retorna binary.
 *
 * El PDF se genera al vuelo desde los datos persistidos. No se cachea (por ahora).
 *
 * Responses:
 *   200 → application/pdf binary stream
 *   400 → datos faltantes
 *   404 → cotización no encontrada
 *   500 → error generando PDF
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/engine/core/db/neon';
import { renderToBuffer } from '@react-pdf/renderer';
import { QuotationPdf } from './QuotationPdf';
import type { QuotationRow } from '../types';

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message, timestamp: new Date().toISOString() },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { clientId: string; cotNumber: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_BODY', 'Body debe ser JSON con { clientId, cotNumber }.');
  }

  const { clientId, cotNumber } = body;
  if (!clientId?.trim()) return errorResponse(400, 'MISSING_CLIENT_ID', 'clientId es obligatorio.');
  if (!cotNumber?.trim()) return errorResponse(400, 'MISSING_COT_NUMBER', 'cotNumber es obligatorio.');

  // ── Buscar cotización ──
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

    // ── Generar PDF ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(QuotationPdf({ quotation }) as any);

    // ── Actualizar pdf_generated_at ──
    await sql`
      UPDATE quotations SET pdf_generated_at = NOW() WHERE id = ${quotation.id}
    `;

    return new NextResponse(new Uint8Array(pdfBuffer), {
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
