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
import {
  validateQuoterSession,
  validateSessionClientId,
  verifyPdfAccessToken,
} from '@/engine/core/auth/quoterSession';
import { buildPdfBuffer } from './pdfBuilder';
import type { PdfAssetOptions } from './pdfBuilder';
import type { QuotationRow } from '../types';

// Asset options — same CDN config as deal/route.ts.
// Both endpoints must resolve assets from HubSpot File Manager.
const JIMENEZ_PDF_ASSETS: PdfAssetOptions = {
  assetBaseUrl: 'https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez/porto-sabbia',
  allowedHosts: ['focuxai-engine.vercel.app', 'engine.focux.co', '51256354.fs1.hubspotusercontent-na1.net'],
};

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
    const pdfBuffer = await buildPdfBuffer(quotation, JIMENEZ_PDF_ASSETS);

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

// ── POST (frontend — session-protected) ──
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── AUTH-1: Session validation ──
  const sessionOrError = validateQuoterSession(request);
  if (sessionOrError instanceof NextResponse) return sessionOrError;

  let body: { clientId: string; cotNumber: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_BODY', 'Body debe ser JSON con { clientId, cotNumber }.');
  }

  // ── AUTH-1: Compare session clientId vs body clientId ──
  const clientMismatch = validateSessionClientId(sessionOrError, body.clientId);
  if (clientMismatch) return clientMismatch;

  return generatePdf(body.clientId, body.cotNumber);
}

// ── GET (link directo desde HubSpot / email — protected by pdfAccessToken) ──
// HubSpot CRM card links and emails don't carry session cookies.
// Architect CRITICAL-3: PDF contains commercial + buyer data, cannot be public.
// Requires signed pdfAccessToken (HMAC, 7-day TTL) OR valid session cookie.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tokenParam = searchParams.get('token');

  // ── Path A: pdfAccessToken in query string (HubSpot/email links) ──
  if (tokenParam) {
    const tokenPayload = verifyPdfAccessToken(tokenParam);
    if (!tokenPayload) {
      return errorResponse(401, 'INVALID_PDF_TOKEN', 'Token de acceso a PDF inválido o expirado.');
    }
    return generatePdf(tokenPayload.clientId, tokenPayload.cotNumber);
  }

  // ── Path B: session cookie (frontend / authenticated user) ──
  const sessionOrError = validateQuoterSession(request);
  if (sessionOrError instanceof NextResponse) return sessionOrError;

  const clientId = searchParams.get('clientId') || '';
  const cotNumber = searchParams.get('cotNumber') || '';

  // If session exists, validate clientId match
  const clientMismatch = validateSessionClientId(sessionOrError, clientId);
  if (clientMismatch) return clientMismatch;

  return generatePdf(clientId, cotNumber);
}
