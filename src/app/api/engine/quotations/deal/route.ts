/**
 * POST /api/engine/quotations/deal — Crear Deal en HubSpot desde cotización persistida.
 *
 * Pipeline completo:
 *   1. Buscar cotización en DB
 *   2. Buscar contacto por email en HubSpot → si no existe, CREARLO
 *   3. Crear Deal con propiedades _fx del v17
 *   4. Asociar Deal ↔ Contacto
 *   5. Actualizar cotización en DB (hubspot_deal_id, hubspot_contact_id, status)
 *
 * Responses:
 *   201 → { success: true, deal: { hubspotDealId, dealUrl, contactId } }
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
// Client config
// ═══════════════════════════════════════════════════════════

interface ClientDealConfig {
  readonly hubspotTokenEnvVar: string;
  readonly pipelineId: string;
  readonly stageIdCotizacion: string;
  readonly hubspotPortalId: string;
}

const CLIENT_REGISTRY: Record<string, ClientDealConfig> = {
  jimenez_demo: {
    hubspotTokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
    pipelineId: '889311333',
    stageIdCotizacion: '1338267783',
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

function toMidnightUtc(val: string | Date | number): number {
  const d = new Date(val);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://engine.focux.co');
}

// ═══════════════════════════════════════════════════════════
// HubSpot Contact — Search or Create
// ═══════════════════════════════════════════════════════════

async function findOrCreateContact(
  token: string,
  q: QuotationRow,
  macroName: string,
): Promise<{ contactId: string; created: boolean }> {
  const email = String(q.buyer_email).trim().toLowerCase();

  // ── Step 1: Search by email ──
  const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: ['email', 'firstname', 'lastname', 'lista_proyectos_fx', 'proyecto_activo_fx', 'canal_atribucion_fx'],
      limit: 1,
    }),
  });

  if (!searchRes.ok) {
    throw new Error(`HubSpot contact search failed: ${searchRes.status}`);
  }

  const searchData = await searchRes.json();

  // ── Contact found → update proyecto_activo + append lista_proyectos ──
  if (searchData.results?.length > 0) {
    const existing = searchData.results[0];
    const contactId = existing.id;
    const props = existing.properties ?? {};

    // Append macro to lista_proyectos if not already there
    const currentList = props.lista_proyectos_fx || '';
    const projectsSet = new Set(currentList.split(';').map((s: string) => s.trim()).filter(Boolean));
    projectsSet.add(macroName);

    const updateProps: Record<string, string> = {
      proyecto_activo_fx: macroName,
      lista_proyectos_fx: [...projectsSet].join(';'),
    };

    // canal_atribucion_fx — NUNCA se pisa si ya tiene valor (regla v17)
    if (!props.canal_atribucion_fx) {
      updateProps.canal_atribucion_fx = 'Sala de Ventas Física';
    }

    // cedula_fx — llenar si vacío
    if (!props.cedula_fx && q.buyer_doc_number) {
      updateProps.cedula_fx = String(q.buyer_doc_number);
    }

    try {
      await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ properties: updateProps }),
      });
    } catch {
      console.warn(`[deal] Contact update failed (non-fatal) for ${contactId}`);
    }

    return { contactId, created: false };
  }

  // ── Contact not found → create (try full props, fallback to standard-only) ──
  const fullProps: Record<string, string> = {
    email,
    firstname: q.buyer_name || '',
    lastname: q.buyer_lastname || '',
    phone: q.buyer_phone ? `${q.buyer_phone_cc || '+57'}${q.buyer_phone}` : '',
    cedula_fx: String(q.buyer_doc_number || ''),
    tipo_documento_fx: String(q.buyer_doc_type || 'CC'),
    proyecto_activo_fx: macroName,
    lista_proyectos_fx: macroName,
    canal_atribucion_fx: 'Sala de Ventas Física',
  };

  const standardProps: Record<string, string> = {
    email,
    firstname: fullProps.firstname,
    lastname: fullProps.lastname,
    phone: fullProps.phone,
  };

  // Attempt 1: full properties (includes custom _fx fields)
  let createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ properties: fullProps }),
  });

  // Attempt 2: if 400 (likely missing custom properties), retry with standard-only
  if (createRes.status === 400) {
    console.warn(`[deal] Contact create with _fx props failed (400), retrying with standard props only`);
    createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ properties: standardProps }),
    });
  }

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`HubSpot contact create failed: ${createRes.status} — ${errBody}`);
  }

  const createData = await createRes.json();
  return { contactId: createData.id, created: true };
}

// ═══════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════

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

  const clientConfig = CLIENT_REGISTRY[clientId];
  if (!clientConfig) {
    return errorResponse(404, 'CLIENT_NOT_FOUND', `clientId="${clientId}" no está configurado.`);
  }

  const token = process.env[clientConfig.hubspotTokenEnvVar];
  if (!token?.trim()) {
    return errorResponse(500, 'MISSING_TOKEN', `Env var ${clientConfig.hubspotTokenEnvVar} no configurada.`);
  }

  // ── 1. Buscar cotización ──
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
    console.error(`[deal] DB read error: ${err instanceof Error ? err.message : err}`);
    return errorResponse(500, 'DB_ERROR', 'Error leyendo cotización.');
  }

  if (quotation.hubspot_deal_id) {
    return errorResponse(409, 'DEAL_ALREADY_EXISTS', `Cotización ${cotNumber} ya tiene deal: ${quotation.hubspot_deal_id}.`);
  }

  // ── 2. Find or create contact ──
  let contactId: string | null = quotation.hubspot_contact_id || null;
  let contactCreated = false;
  let contactError: string | null = null;

  if (!contactId && quotation.buyer_email) {
    try {
      const result = await findOrCreateContact(token, quotation, String(quotation.macro_name));
      contactId = result.contactId;
      contactCreated = result.created;

      // Persist contact ID back to quotation
      await sql`UPDATE quotations SET hubspot_contact_id = ${contactId} WHERE id = ${quotation.id}`;
    } catch (err) {
      // Contact failure is non-fatal — Deal still gets created, but we surface the error
      contactError = err instanceof Error ? err.message : String(err);
      console.warn(`[deal] Contact find/create failed (non-fatal): ${contactError}`);
    }
  }

  // ── 3. Build deal properties ──
  const baseUrl = getBaseUrl();
  const saleTypeValue = String(quotation.sale_type ?? 0);

  // Frontend stores bonuses as { label, valor, cuota } — handle both field names
  const bonuses = (quotation.bonuses as Array<{ label: string; amount?: number; valor?: number; sincoId?: number; cuota?: number }>) || [];
  const bVal = (b: { amount?: number; valor?: number }) => b.amount || b.valor || 0;
  const cesantias = bVal(bonuses.find(b => b.label?.toLowerCase().includes('cesant')) ?? {});
  const subsidio = bVal(bonuses.find(b => b.label?.toLowerCase().includes('subsid')) ?? {});
  const ahorroProg = bVal(bonuses.find(b => b.label?.toLowerCase().includes('ahorro')) ?? {});
  const bonoCI = bVal(bonuses.find(b => b.label?.toLowerCase().includes('bono')) ?? {});
  const confirmacion = bVal(bonuses.find(b => b.label?.toLowerCase().includes('confirm')) ?? {});

  const parkingArr = (quotation.parking as Array<{ numero: string; price: number }>) || [];
  const storageArr = (quotation.storage as Array<{ numero: string; price: number }>) || [];

  const dealProperties: Record<string, string | number> = {
    dealname: `${quotation.macro_name} — APT ${quotation.unit_number} — ${quotation.buyer_name} ${quotation.buyer_lastname}`,
    pipeline: clientConfig.pipelineId,
    dealstage: clientConfig.stageIdCotizacion,
    amount: 0,

    nombre_agrupacion_fx: `${quotation.torre_name} APT-${quotation.unit_number}`,

    // ── Inmueble (duplicadas de Unidad → Deal para tarjeta CRM) ──
    torre_deal_fx: quotation.torre_name,
    numero_apto_deal_fx: String(quotation.unit_number),
    tipologia_deal_fx: quotation.unit_tipologia || '',
    piso_deal_fx: quotation.unit_piso ?? 0,
    area_privada_deal_fx: quotation.unit_area ?? 0,
    habitaciones_deal_fx: quotation.unit_habs ?? 0,
    banos_deal_fx: quotation.unit_banos ?? 0,

    valor_apartamento_fx: quotation.unit_price,
    valor_parqueadero_fx: parkingArr.reduce((s, p) => s + (p.price || 0), 0),
    valor_deposito_fx: storageArr.reduce((s, d) => s + (d.price || 0), 0),
    valor_subtotal_fx: quotation.subtotal,
    valor_descuento_fx: quotation.discount_commercial,
    valor_descuento_financiero_fx: quotation.discount_financial,
    valor_total_neto_fx: quotation.net_value,
    precio_cotizado_fx: quotation.net_value,

    valor_separacion_fx: quotation.separation_amount,
    porcentaje_cuota_inicial_fx: Number(quotation.initial_payment_pct),
    cuota_inicial_fx: quotation.initial_payment_amount,
    numero_cuotas_fx: quotation.num_installments,
    valor_cuota_fx: quotation.installment_amount,
    valor_credito_fx: quotation.financed_amount,
    porcentaje_financiacion_fx: Number(quotation.financed_pct),

    valor_cesantias_fx: cesantias,
    valor_subsidio_fx: subsidio,
    valor_ahorro_programado_fx: ahorroProg,
    valor_bono_ci_fx: bonoCI,
    valor_confirmacion_fx: confirmacion,
    plan_abonos_fx: JSON.stringify(bonuses),

    tipo_venta_fx: saleTypeValue,
    numero_documento_fx: quotation.buyer_doc_number,
    origen_fx: 'cotizador',
    pdf_cotizacion_url_fx: `${baseUrl}/api/engine/quotations/pdf?clientId=${clientId}&cotNumber=${cotNumber}`,
    fecha_creacion_cotizacion_fx: toMidnightUtc(quotation.created_at),
    vigencia_cotizacion_fx: toMidnightUtc(quotation.expires_at),
    incluye_parqueadero_fx: quotation.includes_parking ? 'true' : 'false',
    incluye_deposito_fx: quotation.includes_storage ? 'true' : 'false',
    porcentaje_descuento_fx: quotation.subtotal > 0 ? Math.round((quotation.discount_commercial / quotation.subtotal) * 10000) / 100 : 0,
    porcentaje_descuento_fin_fx: quotation.subtotal > 0 ? Math.round((quotation.discount_financial / quotation.subtotal) * 10000) / 100 : 0,

    writeback_status_fx: 'pendiente',

    valor_adicionales_fx: 0,
    valor_exclusiones_fx: 0,

    ...(quotation.observaciones ? { observaciones_venta_fx: String(quotation.observaciones).slice(0, 5000) } : {}),
  };

  // ── 4. Create Deal ──
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
      console.error(`[deal] HubSpot create deal error: ${hsResponse.status} — ${errBody}`);
      return errorResponse(502, 'HUBSPOT_DEAL_CREATE_ERROR', `HubSpot ${hsResponse.status}: ${errBody}`);
    }

    const hsData = await hsResponse.json();
    hubspotDealId = hsData.id;
  } catch (err) {
    console.error(`[deal] HubSpot network error: ${err instanceof Error ? err.message : err}`);
    return errorResponse(502, 'HUBSPOT_NETWORK_ERROR', 'Error de red comunicándose con HubSpot.');
  }

  // ── 5. Associate Deal ↔ Contact ──
  if (contactId) {
    try {
      await fetch(
        `https://api.hubapi.com/crm/v4/objects/deals/${hubspotDealId}/associations/default/contacts/${contactId}`,
        { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } },
      );
    } catch (err) {
      console.warn(`[deal] Association failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── 6. Update quotation in DB ──
  try {
    await sql`
      UPDATE quotations
      SET hubspot_deal_id = ${hubspotDealId},
          hubspot_contact_id = COALESCE(hubspot_contact_id, ${contactId}),
          deal_created_at = NOW(),
          status = 'deal_created'
      WHERE id = ${quotation.id}
    `;
  } catch (err) {
    console.error(`[deal] DB update error: ${err instanceof Error ? err.message : err}`);
  }

  // ── 7. Response ──
  const dealUrl = `https://app.hubspot.com/contacts/${clientConfig.hubspotPortalId}/deal/${hubspotDealId}`;

  return NextResponse.json(
    {
      success: true,
      deal: {
        hubspotDealId,
        dealUrl,
        contactId,
        contactCreated,
        contactError,
        cotNumber,
        dealName: dealProperties.dealname,
      },
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
