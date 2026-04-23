/**
 * POST /api/engine/quotations/deal — Crear Deal en HubSpot desde cotización persistida.
 *
 * Recibe { clientId, cotNumber } → busca en DB → crea Deal en HubSpot → asocia contacto → actualiza DB.
 *
 * Deal se crea en etapa "Cotización Enviada" (20%), amount $0 (no infla forecast).
 * Las propiedades custom _fx se mapean desde los datos de la cotización.
 *
 * Responses:
 *   201 → { success: true, deal: { hubspotDealId, dealUrl } }
 *   400 → datos faltantes
 *   404 → cotización no encontrada
 *   409 → deal ya fue creado para esta cotización
 *   502 → error de HubSpot
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/engine/core/db/neon';
import type { QuotationRow, ErrorResponse } from '../types';

// ═══════════════════════════════════════════════════════════
// Client config — mismo patrón que contacts/search
// ═══════════════════════════════════════════════════════════

interface ClientDealConfig {
  readonly hubspotTokenEnvVar: string;
  readonly pipelineId: string;           // Pipeline de ventas
  readonly stageIdCotizacion: string;    // Etapa "Cotización Enviada"
  readonly hubspotPortalId: string;      // Para generar URL del deal
}

// IDs reales del portal 51256354 — obtenidos via GET /crm/v3/pipelines/deals (22-abril-2026)
const CLIENT_REGISTRY: Record<string, ClientDealConfig> = {
  jimenez_demo: {
    hubspotTokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
    pipelineId: '889311333',                   // "Ventas Constructora Jimenez"
    stageIdCotizacion: '1338267783',           // "Cotización Enviada" (20%)
    hubspotPortalId: '51256354',
  },
};

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
  return process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://engine.focux.co');
}

// ═══════════════════════════════════════════════════════════
// POST handler
// ══��════════════════════════════════════════════════════════

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

  // ── Client config ──
  const clientConfig = CLIENT_REGISTRY[clientId];
  if (!clientConfig) {
    return errorResponse(404, 'CLIENT_NOT_FOUND', `clientId="${clientId}" no está configurado.`);
  }

  const token = process.env[clientConfig.hubspotTokenEnvVar];
  if (!token?.trim()) {
    return errorResponse(500, 'MISSING_TOKEN', `Env var ${clientConfig.hubspotTokenEnvVar} no configurada.`);
  }

  // ── Buscar cotización ──
  const sql = getDb();
  let quotation: QuotationRow;
  try {
    const rows = await sql`
      SELECT * FROM quotations
      WHERE cot_number = ${cotNumber} AND client_id = ${clientId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      return errorResponse(404, 'QUOTATION_NOT_FOUND', `Cotización ${cotNumber} no encontrada.`);
    }
    quotation = rows[0] as QuotationRow;
  } catch (err) {
    console.error(`[quotations/deal] DB read error: ${err instanceof Error ? err.message : err}`);
    return errorResponse(500, 'DB_ERROR', 'Error leyendo cotización.');
  }

  // ── Check si ya tiene deal ──
  if (quotation.hubspot_deal_id) {
    return errorResponse(409, 'DEAL_ALREADY_EXISTS', `Cotización ${cotNumber} ya tiene deal: ${quotation.hubspot_deal_id}.`);
  }

  // ── Crear Deal en HubSpot ──
  const baseUrl = getBaseUrl();
  const cotizacionUrl = `${baseUrl}/cotizacion/${cotNumber}`;
  // v17: tipo_venta_fx es enumeration con values "0","1","3"
  const saleTypeValue = String(quotation.sale_type ?? 0);

  // ── Deal properties — nombres exactos del JSON v17 ──
  const bonuses = (quotation.bonuses as Array<{ label: string; amount: number; sincoId?: number; cuota?: number }>) || [];
  const cesantias = bonuses.find(b => b.label?.toLowerCase().includes('cesant'))?.amount ?? 0;
  const subsidio = bonuses.find(b => b.label?.toLowerCase().includes('subsid'))?.amount ?? 0;
  const ahorroProg = bonuses.find(b => b.label?.toLowerCase().includes('ahorro'))?.amount ?? 0;
  const bonoCI = bonuses.find(b => b.label?.toLowerCase().includes('bono'))?.amount ?? 0;
  const confirmacion = bonuses.find(b => b.label?.toLowerCase().includes('confirm'))?.amount ?? 0;

  const parkingArr = (quotation.parking as Array<{ numero: string; price: number }>) || [];
  const storageArr = (quotation.storage as Array<{ numero: string; price: number }>) || [];

  const dealProperties: Record<string, string | number> = {
    dealname: `${quotation.macro_name} — APT ${quotation.unit_number} — ${quotation.buyer_name} ${quotation.buyer_lastname}`,
    pipeline: clientConfig.pipelineId,
    dealstage: clientConfig.stageIdCotizacion,
    amount: 0,  // $0 hasta separación — WF-D2 copia valor_total_neto_fx → amount

    // ── Propiedad principal
    nombre_agrupacion_fx: `${quotation.torre_name} APT-${quotation.unit_number}`,

    // ── Valores
    valor_apartamento_fx: quotation.unit_price,
    valor_parqueadero_fx: parkingArr.reduce((s, p) => s + (p.price || 0), 0),
    valor_deposito_fx: storageArr.reduce((s, d) => s + (d.price || 0), 0),
    valor_subtotal_fx: quotation.subtotal,
    valor_descuento_fx: quotation.discount_commercial,
    valor_descuento_financiero_fx: quotation.discount_financial,
    valor_total_neto_fx: quotation.net_value,
    precio_cotizado_fx: quotation.net_value,  // Snapshot — no cambia

    // ── Plan de pagos
    valor_separacion_fx: quotation.separation_amount,
    porcentaje_cuota_inicial_fx: Number(quotation.initial_payment_pct),
    cuota_inicial_fx: quotation.initial_payment_amount,
    numero_cuotas_fx: quotation.num_installments,
    valor_cuota_fx: quotation.installment_amount,
    valor_credito_fx: quotation.financed_amount,
    porcentaje_financiacion_fx: Number(quotation.financed_pct),

    // ── Abonos
    valor_cesantias_fx: cesantias,
    valor_subsidio_fx: subsidio,
    valor_ahorro_programado_fx: ahorroProg,
    valor_bono_ci_fx: bonoCI,
    valor_confirmacion_fx: confirmacion,
    plan_abonos_fx: JSON.stringify(bonuses),

    // ── Meta
    tipo_venta_fx: saleTypeValue,
    numero_documento_fx: quotation.buyer_doc_number,
    origen_fx: 'cotizador',
    pdf_cotizacion_url_fx: cotizacionUrl,
    fecha_creacion_cotizacion_fx: quotation.created_at,
    vigencia_cotizacion_fx: quotation.expires_at,
    incluye_parqueadero_fx: quotation.includes_parking ? 'true' : 'false',
    incluye_deposito_fx: quotation.includes_storage ? 'true' : 'false',
    porcentaje_descuento_fx: quotation.subtotal > 0 ? Math.round((quotation.discount_commercial / quotation.subtotal) * 10000) / 100 : 0,
    porcentaje_descuento_fin_fx: quotation.subtotal > 0 ? Math.round((quotation.discount_financial / quotation.subtotal) * 10000) / 100 : 0,

    // ── Sinco write-back (se llenan después)
    // id_agrupacion_sinco_fx, id_sinco_comprador_fx, id_venta_sinco_fx → write-back #1/#2
    writeback_status_fx: 'pending',

    // ── Fase 2 (defaults en 0)
    valor_adicionales_fx: 0,
    valor_exclusiones_fx: 0,
  };

  let hubspotDealId: string;
  try {
    const hsResponse = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ properties: dealProperties }),
    });

    if (!hsResponse.ok) {
      const errBody = await hsResponse.text();
      console.error(`[quotations/deal] HubSpot create deal error: ${hsResponse.status} — ${errBody}`);
      return errorResponse(502, 'HUBSPOT_DEAL_CREATE_ERROR', `HubSpot ${hsResponse.status}: ${errBody}`);
    }

    const hsData = await hsResponse.json();
    hubspotDealId = hsData.id;
  } catch (err) {
    console.error(`[quotations/deal] HubSpot network error: ${err instanceof Error ? err.message : err}`);
    return errorResponse(502, 'HUBSPOT_NETWORK_ERROR', 'Error de red comunicándose con HubSpot.');
  }

  // ── Asociar contacto si existe ──
  if (quotation.hubspot_contact_id) {
    try {
      await fetch(
        `https://api.hubapi.com/crm/v4/objects/deals/${hubspotDealId}/associations/default/contacts/${quotation.hubspot_contact_id}`,
        {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` },
        },
      );
    } catch (err) {
      // Association failure is non-fatal — log and continue
      console.warn(`[quotations/deal] Association failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Actualizar cotización en DB con deal ID ──
  try {
    await sql`
      UPDATE quotations
      SET hubspot_deal_id = ${hubspotDealId},
          deal_created_at = NOW(),
          status = 'deal_created'
      WHERE id = ${quotation.id}
    `;
  } catch (err) {
    console.error(`[quotations/deal] DB update error: ${err instanceof Error ? err.message : err}`);
    // Deal was created — don't fail, just log
  }

  // ── Response ──
  const dealUrl = `https://app.hubspot.com/contacts/${clientConfig.hubspotPortalId}/deal/${hubspotDealId}`;

  return NextResponse.json(
    {
      success: true,
      deal: {
        hubspotDealId,
        dealUrl,
        cotNumber,
        dealName: dealProperties.dealname,
      },
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
