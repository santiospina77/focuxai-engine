/**
 * POST /api/engine/quotations — Persistir una cotización en Neon Postgres.
 *
 * Recibe QuotationInput completo → inserta en tabla quotations → retorna ID + URL pública.
 *
 * GET /api/engine/quotations?clientId=xxx&cotNumber=COT-PSS-... — Buscar cotización por número.
 *
 * Responses:
 *   201 → { success: true, quotation: { id, cotNumber, url, expiresAt, createdAt } }
 *   200 → { success: true, quotation: QuotationRow }
 *   400 → datos faltantes o inválidos
 *   404 → cotización no encontrada
 *   409 → cotNumber duplicado
 *   500 → error de DB
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 * Focux Digital Group S.A.S.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/engine/core/db/neon';
import type { QuotationInput, QuotationCreated, QuotationDetail, ErrorResponse } from './types';

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function errorResponse(status: number, error: string, message: string): NextResponse<ErrorResponse> {
  return NextResponse.json(
    { error, message, timestamp: new Date().toISOString() },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://engine.focux.co';
}

// ═══════════════════════════════════════════════════════════
// POST — Crear cotización
// ═══════════════════════════════════════════════════════════

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: QuotationInput;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_BODY', 'Body debe ser JSON válido.');
  }

  // ── Validación mínima ──
  const { clientId, cotNumber, buyer, property, advisor, financial, config } = body;

  if (!clientId?.trim()) return errorResponse(400, 'MISSING_CLIENT_ID', 'clientId es obligatorio.');
  if (!cotNumber?.trim()) return errorResponse(400, 'MISSING_COT_NUMBER', 'cotNumber es obligatorio.');
  if (!buyer?.name?.trim()) return errorResponse(400, 'MISSING_BUYER_NAME', 'buyer.name es obligatorio.');
  if (!buyer?.docNumber?.trim()) return errorResponse(400, 'MISSING_BUYER_DOC', 'buyer.docNumber es obligatorio.');
  if (!buyer?.email?.trim()) return errorResponse(400, 'MISSING_BUYER_EMAIL', 'buyer.email es obligatorio.');
  if (!property?.unitNumber) return errorResponse(400, 'MISSING_UNIT', 'property.unitNumber es obligatorio.');
  if (!financial?.netValue) return errorResponse(400, 'MISSING_NET_VALUE', 'financial.netValue es obligatorio.');

  // ── Calcular expiración ──
  const vigenciaDias = config?.vigenciaDias ?? 7;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + vigenciaDias);

  // ── Insertar en DB ──
  try {
    const sql = getDb();

    const rows = await sql`
      INSERT INTO quotations (
        cot_number, client_id,
        buyer_name, buyer_lastname, buyer_doc_type, buyer_doc_number,
        buyer_email, buyer_phone, buyer_phone_cc, hubspot_contact_id,
        macro_id, macro_name, torre_id, torre_name,
        unit_number, unit_tipologia, unit_piso, unit_area,
        unit_habs, unit_banos, unit_price,
        parking, storage, includes_parking, includes_storage,
        advisor_id, advisor_name,
        sale_type, subtotal, discount_commercial, discount_financial,
        total_discounts, net_value, separation_amount,
        initial_payment_pct, initial_payment_amount,
        num_installments, installment_amount,
        financed_amount, financed_pct,
        payment_plan, bonuses, config_snapshot,
        expires_at
      ) VALUES (
        ${cotNumber}, ${clientId},
        ${buyer.name}, ${buyer.lastname}, ${buyer.docType || 'CC'}, ${buyer.docNumber},
        ${buyer.email}, ${buyer.phone}, ${buyer.phoneCc || '+57'}, ${buyer.hubspotContactId || null},
        ${property.macroId}, ${property.macroName}, ${property.torreId}, ${property.torreName},
        ${property.unitNumber}, ${property.unitTipologia || null}, ${property.unitPiso ?? null}, ${property.unitArea},
        ${property.unitHabs ?? null}, ${property.unitBanos ?? null}, ${property.unitPrice},
        ${JSON.stringify(property.parking)}, ${JSON.stringify(property.storage)},
        ${property.includesParking}, ${property.includesStorage},
        ${advisor.id}, ${advisor.name},
        ${financial.saleType}, ${financial.subtotal},
        ${financial.discountCommercial}, ${financial.discountFinancial},
        ${financial.totalDiscounts}, ${financial.netValue}, ${financial.separationAmount},
        ${financial.initialPaymentPct}, ${financial.initialPaymentAmount},
        ${financial.numInstallments}, ${financial.installmentAmount},
        ${financial.financedAmount}, ${financial.financedPct},
        ${JSON.stringify(financial.paymentPlan ?? [])}, ${JSON.stringify(financial.bonuses ?? [])},
        ${JSON.stringify(config ?? {})},
        ${expiresAt.toISOString()}
      )
      RETURNING id, cot_number, created_at, expires_at
    `;

    const row = rows[0];
    const baseUrl = getBaseUrl();

    const result: QuotationCreated = {
      success: true,
      quotation: {
        id: row.id,
        cotNumber: row.cot_number,
        url: `${baseUrl}/cotizacion/${row.cot_number}`,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      },
    };

    return NextResponse.json(result, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Duplicate cot_number
    if (message.includes('unique') || message.includes('duplicate')) {
      return errorResponse(409, 'DUPLICATE_COT_NUMBER', `Cotización ${cotNumber} ya existe.`);
    }

    console.error(`[quotations/POST] DB error: ${message}`);
    return errorResponse(500, 'DB_ERROR', 'Error guardando cotización. Revisar logs.');
  }
}

// ═══════════════════════════════════════════════════════════
// GET — Buscar cotización por cotNumber
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const cotNumber = searchParams.get('cotNumber')?.trim();
  const clientId = searchParams.get('clientId')?.trim();

  if (!cotNumber) return errorResponse(400, 'MISSING_COT_NUMBER', 'cotNumber query param es obligatorio.');
  if (!clientId) return errorResponse(400, 'MISSING_CLIENT_ID', 'clientId query param es obligatorio.');

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

    const result: QuotationDetail = {
      success: true,
      quotation: rows[0] as any,
    };

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[quotations/GET] DB error: ${message}`);
    return errorResponse(500, 'DB_ERROR', 'Error buscando cotización. Revisar logs.');
  }
}
