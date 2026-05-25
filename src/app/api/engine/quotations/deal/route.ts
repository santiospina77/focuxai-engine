/**
 * POST /api/engine/quotations/deal — Crear Deal en HubSpot desde cotización persistida.
 *
 * Pipeline completo:
 *   1. Buscar cotización en DB
 *   2. Buscar contacto por email en HubSpot → si no existe, CREARLO
 *   3. Crear Deal con propiedades _fx del v17
 *   4. Asociar Deal ↔ Contacto
 *   5. PDF Upload a HubSpot File Manager (non-fatal)
 *      5a. buildPdfBufferSafe() → Result<Buffer, EngineError>
 *      5b. uploadFileToHubSpot(PUBLIC_NOT_INDEXABLE) → client-facing URL
 *      5c. attachFileToRecord(deals) → Note con PDF adjunto
 *      5e. PATCH Deal con pdf_hubspot_url_fx (URL pública HubSpot CDN)
 *   6. Actualizar cotización en DB (hubspot_deal_id, pdf_*, status)
 *   7. Return response
 *
 * Responses:
 *   201 → { success: true, deal: { hubspotDealId, dealUrl, contactId, pdfUpload } }
 *   400 → datos faltantes
 *   404 → cotización no encontrada
 *   409 → deal ya fue creado para esta cotización
 *   502 → error de HubSpot
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/engine/core/db/neon';
import { validateQuoterSession, validateSessionClientId } from '@/engine/core/auth/quoterSession';
import type { QuotationRow, ErrorResponse } from '../types';
import type { PdfAssetOptions } from '@/app/api/engine/quotations/pdf/pdfBuilder';
import { syncQuotationPdfToHubSpot } from '@/engine/apps/quoter/pdf/pdfHubSpotSyncService';

// ═══════════════════════════════════════════════════════════
// Client asset config — single source of truth
// Descomentar después de ejecutar migrate-assets-to-hubspot.ts
// ═══════════════════════════════════════════════════════════

const JIMENEZ_PDF_ASSETS: PdfAssetOptions = {
  assetBaseUrl: 'https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez/porto-sabbia',
  allowedHosts: ['focuxai-engine.vercel.app', '51256354.fs1.hubspotusercontent-na1.net'],
};

// ═══════════════════════════════════════════════════════════
// Client config
// ═══════════════════════════════════════════════════════════

interface ClientDealConfig {
  readonly hubspotTokenEnvVar: string;
  readonly pipelineId: string;
  readonly stageIdCotizacion: string;
  readonly hubspotPortalId: string;
  /** PDF asset options — CDN base URL + allowed hosts for SSRF protection. */
  readonly pdfAssets?: PdfAssetOptions;
}

const CLIENT_REGISTRY: Record<string, ClientDealConfig> = {
  jimenez_demo: {
    hubspotTokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
    pipelineId: '889311333',
    stageIdCotizacion: '1338267783',
    hubspotPortalId: '51256354',
    // Fase B.0: PDF assets desde HubSpot CDN del cliente (activado post-migration).
    pdfAssets: JIMENEZ_PDF_ASSETS,
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
// Contact _fx — constants, types, normalizers
// ═══════════════════════════════════════════════════════════

const CONTACT_FX_PROPERTIES = [
  'lista_proyectos_fx',
  'proyecto_activo_fx',
  'canal_atribucion_fx',
  'tipo_persona_fx',
  'cedula_fx',
  'tipo_documento_fx',
] as const;

const CRITICAL_CONTACT_PROPS = [
  'cedula_fx',
  'tipo_documento_fx',
  'tipo_persona_fx',
] as const;

type ContactCriticalProp = (typeof CRITICAL_CONTACT_PROPS)[number];

interface ContactPatchAttempt {
  readonly ok: boolean;
  readonly status: number;
  readonly error?: string;
}

interface EnsureContactResult {
  readonly ok: boolean;
  readonly contactId: string;
  readonly attempted: Record<string, string>;
  readonly failed: string[];
  readonly failedCritical: string[];
  readonly bulkStatus: number;
  readonly bulkError?: string;
  readonly individual: Record<string, ContactPatchAttempt>;
  readonly dbValues: {
    readonly buyerDocNumber: string | null;
    readonly buyerDocType: string | null;
    readonly buyerTipoPersona: string | null;
  };
}

function truncateForDebug(value: string, max = 1000): string {
  return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

async function readHubSpotError(res: Response): Promise<string> {
  try {
    return truncateForDebug(await res.text());
  } catch {
    return `Unable to read HubSpot error body. status=${res.status}`;
  }
}

function normalizeTipoDocumentoForHubSpot(value: string | null | undefined): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (upper === 'CC') return 'CC';
  if (upper === 'CE') return 'CE';
  if (upper === 'NIT') return 'NIT';
  if (upper === 'PASAPORTE' || upper === 'PP') return 'pp';
  if (upper === 'TI') return 'ti';
  return null;
}

function normalizeTipoPersonaContactForHubSpot(value: string | null | undefined): string {
  const upper = (value || 'NATURAL').trim().toUpperCase();
  return upper === 'JURIDICA' ? 'JURIDICA' : 'NATURAL';
}

function normalizeTipoPersonaDealForHubSpot(value: string | null | undefined): string {
  const upper = (value || 'NATURAL').trim().toUpperCase();
  return upper === 'JURIDICA' ? 'juridica' : 'natural';
}

/**
 * Mapeo macro_name (Sinco inventario) → slug HubSpot (proyecto_activo_fx / lista_proyectos_fx).
 * Estos campos son enumeration en HubSpot — no aceptan texto libre.
 * Fuente: generate_globales.py + HubSpot portal Jiménez.
 */
const MACRO_NAME_TO_HUBSPOT_SLUG: Record<string, string> = {
  'VENECIA DE LA SIERRA': 'venecia_de_la_sierra',
  'CORALINA SUNSET': 'coralina_sunset',
  'CORALINA DEL SOL': 'coralina_del_sol',
  'MARENA': 'marena',
  'RODADERO LIVING': 'rodadero_living',
  'PORTO SABBIA SUITES': 'porto_sabbia_suites',
  'PORTO SABBIA': 'porto_sabbia_suites',
  'CORALINA SUITES': 'coralina_suites',
  'CORALINA CARIBE': 'coralina_caribe',
  'PORTO SABBIA RESIDENCES': 'porto_sabbia_residences',
};

function macroNameToHubSpotSlug(macroName: string): string {
  const upper = macroName.trim().toUpperCase();
  if (MACRO_NAME_TO_HUBSPOT_SLUG[upper]) {
    return MACRO_NAME_TO_HUBSPOT_SLUG[upper];
  }
  // Fallback: slugify (lowercase, spaces→underscores, strip non-alphanumeric)
  return upper.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

// ═══════════════════════════════════════════════════════════
// HubSpot Contact — Search or Create (resolves contactId only)
// ═══════════════════════════════════════════════════════════

async function findOrCreateContact(
  token: string,
  email: string,
  name: string,
  lastname: string,
  phone: string,
): Promise<{ contactId: string; created: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();

  const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: normalizedEmail }] }],
      properties: ['email'],
      limit: 1,
    }),
  });

  if (!searchRes.ok) {
    throw new Error(`HubSpot contact search failed: ${searchRes.status}`);
  }

  const searchData = await searchRes.json();

  if (searchData.results?.length > 0) {
    return { contactId: searchData.results[0].id, created: false };
  }

  // Contact not found → create with standard props only
  const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      properties: { email: normalizedEmail, firstname: name || '', lastname: lastname || '', phone: phone || '' },
    }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`HubSpot contact create failed: ${createRes.status} — ${errBody}`);
  }

  const createData = await createRes.json();
  return { contactId: createData.id, created: true };
}

// ═══════════════════════════════════════════════════════════
// Ensure critical _fx properties on Contact
// Runs ALWAYS — even if contactId was already known.
// Uses GET /contacts/{id} (NOT search by hs_object_id).
// Casing: Contact tipo_persona_fx = UPPERCASE (NATURAL/JURIDICA)
//         Deal tipo_persona_fx = lowercase (natural/juridica)
// ═══════════════════════════════════════════════════════════

async function ensureContactFxProps(
  token: string,
  contactId: string,
  q: QuotationRow,
  macroName: string,
): Promise<EnsureContactResult> {
  const dbValues = {
    buyerDocNumber: q.buyer_doc_number ? String(q.buyer_doc_number) : null,
    buyerDocType: q.buyer_doc_type ? String(q.buyer_doc_type) : null,
    buyerTipoPersona: q.buyer_tipo_persona ? String(q.buyer_tipo_persona) : null,
  };

  // 1. Read current contact state via GET (not search)
  const propertiesQuery = CONTACT_FX_PROPERTIES.join(',');
  const getRes = await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(contactId)}?properties=${encodeURIComponent(propertiesQuery)}`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
  );

  if (!getRes.ok) {
    const getErr = await readHubSpotError(getRes);
    return {
      ok: false,
      contactId,
      attempted: {},
      failed: [...CRITICAL_CONTACT_PROPS],
      failedCritical: [...CRITICAL_CONTACT_PROPS],
      bulkStatus: getRes.status,
      bulkError: `Contact GET failed: ${getErr}`,
      individual: {},
      dbValues,
    };
  }

  const getData = await getRes.json();
  const props: Record<string, string | null | undefined> = getData.properties ?? {};

  // 2. Build update — only fill empty fields (never overwrite)
  const macroSlug = macroNameToHubSpotSlug(macroName);

  const updateProps: Record<string, string> = {
    proyecto_activo_fx: macroSlug,
  };

  const currentList = props.lista_proyectos_fx || '';
  const projectsSet = new Set(currentList.split(';').map((s: string) => s.trim()).filter(Boolean));
  projectsSet.add(macroSlug);
  updateProps.lista_proyectos_fx = [...projectsSet].join(';');

  if (!props.canal_atribucion_fx) {
    updateProps.canal_atribucion_fx = 'sala_de_ventas_fisica';
  }

  // Critical props — normalized values
  if (!props.cedula_fx && dbValues.buyerDocNumber) {
    updateProps.cedula_fx = dbValues.buyerDocNumber;
  }

  const tipoDocumento = normalizeTipoDocumentoForHubSpot(dbValues.buyerDocType);
  if (!props.tipo_documento_fx && tipoDocumento) {
    updateProps.tipo_documento_fx = tipoDocumento;
  }

  if (!props.tipo_persona_fx) {
    updateProps.tipo_persona_fx = normalizeTipoPersonaContactForHubSpot(dbValues.buyerTipoPersona);
  }

  // 2b. Pre-flight: are critical values available?
  const missingCriticalFromDb: ContactCriticalProp[] = [];
  if (!updateProps.cedula_fx && !props.cedula_fx) missingCriticalFromDb.push('cedula_fx');
  if (!updateProps.tipo_documento_fx && !props.tipo_documento_fx) missingCriticalFromDb.push('tipo_documento_fx');
  if (!updateProps.tipo_persona_fx && !props.tipo_persona_fx) missingCriticalFromDb.push('tipo_persona_fx');

  if (missingCriticalFromDb.length > 0) {
    return {
      ok: false,
      contactId,
      attempted: updateProps,
      failed: missingCriticalFromDb,
      failedCritical: missingCriticalFromDb,
      bulkStatus: 0,
      bulkError: `Missing critical buyer DB values or invalid mapping: ${missingCriticalFromDb.join(', ')}`,
      individual: {},
      dbValues,
    };
  }

  // 3. Bulk PATCH
  const patchRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ properties: updateProps }),
  });

  if (patchRes.ok) {
    return { ok: true, contactId, attempted: updateProps, failed: [], failedCritical: [], bulkStatus: patchRes.status, individual: {}, dbValues };
  }

  // 4. Bulk failed → try one-by-one
  const bulkError = await readHubSpotError(patchRes);
  console.warn(`[deal] Contact bulk PATCH failed (${patchRes.status}): ${bulkError}`);

  const failed: string[] = [];
  const individual: Record<string, ContactPatchAttempt> = {};

  for (const [propertyName, propertyValue] of Object.entries(updateProps)) {
    const singleRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ properties: { [propertyName]: propertyValue } }),
    });

    if (singleRes.ok) {
      individual[propertyName] = { ok: true, status: singleRes.status };
    } else {
      const singleError = await readHubSpotError(singleRes);
      failed.push(propertyName);
      individual[propertyName] = { ok: false, status: singleRes.status, error: singleError };
    }
  }

  const failedCritical = failed.filter(k => (CRITICAL_CONTACT_PROPS as readonly string[]).includes(k));
  return { ok: failedCritical.length === 0, contactId, attempted: updateProps, failed, failedCritical, bulkStatus: patchRes.status, bulkError, individual, dbValues };
}

// ═══════════════════════════════════════════════════════════
// Deal debug — read back critical props after creation
// ═══════════════════════════════════════════════════════════

async function readDealDebugProps(
  token: string,
  dealId: string,
): Promise<Record<string, unknown>> {
  const props = ['numero_documento_fx', 'tipo_identificacion_fx', 'tipo_persona_fx', 'writeback_status_fx'].join(',');
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=${encodeURIComponent(props)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      return { ok: false, status: res.status, error: await readHubSpotError(res) };
    }
    const data = await res.json();
    return { ok: true, id: data.id, properties: data.properties ?? {} };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ═══════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════

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

  const { clientId, cotNumber } = body;
  if (!clientId?.trim()) return errorResponse(400, 'MISSING_CLIENT_ID', 'clientId es obligatorio.');
  if (!cotNumber?.trim()) return errorResponse(400, 'MISSING_COT_NUMBER', 'cotNumber es obligatorio.');

  // ── AUTH-1: Compare session clientId vs body clientId ──
  const clientMismatch = validateSessionClientId(sessionOrError, clientId);
  if (clientMismatch) return clientMismatch;

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
      const phone = quotation.buyer_phone ? `${quotation.buyer_phone_cc || '+57'}${quotation.buyer_phone}` : '';
      const result = await findOrCreateContact(
        token,
        String(quotation.buyer_email),
        String(quotation.buyer_name || ''),
        String(quotation.buyer_lastname || ''),
        phone,
      );
      contactId = result.contactId;
      contactCreated = result.created;

      // Persist contact ID back to quotation
      await sql`UPDATE quotations SET hubspot_contact_id = ${contactId} WHERE id = ${quotation.id}`;
    } catch (err) {
      contactError = err instanceof Error ? err.message : String(err);
      console.warn(`[deal] Contact find/create failed (non-fatal): ${contactError}`);
    }
  }

  // ── 2b. Ensure critical _fx properties on contact (ALWAYS — fail-hard) ──
  let contactFxResult: EnsureContactResult | null = null;

  if (contactId) {
    contactFxResult = await ensureContactFxProps(
      token,
      contactId,
      quotation,
      String(quotation.macro_name || ''),
    );

    if (!contactFxResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'HUBSPOT_CONTACT_CRITICAL_PROPS_FAILED',
            message: `No se pudieron escribir propiedades críticas del contacto: ${contactFxResult.failedCritical.join(', ')}. El deal NO fue creado.`,
          },
          contactFx: contactFxResult,
        },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  } else {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'HUBSPOT_CONTACT_NOT_RESOLVED',
          message: 'No se pudo resolver o crear el contacto de HubSpot. El deal NO fue creado.',
        },
        contactFx: null,
        dbValues: {
          buyerEmail: quotation.buyer_email ?? null,
          buyerDocNumber: quotation.buyer_doc_number ?? null,
          buyerDocType: quotation.buyer_doc_type ?? null,
          buyerTipoPersona: quotation.buyer_tipo_persona ?? null,
        },
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
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
    tipo_persona_fx: normalizeTipoPersonaDealForHubSpot(quotation.buyer_tipo_persona),
    tipo_identificacion_fx: String(quotation.buyer_doc_type || 'CC').toUpperCase(),
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

    // WB-3: Sinco ID mirror props — solo si existen en la cotización
    ...(quotation.sinco_agrupacion_id
      ? { id_agrupacion_sinco_fx: String(quotation.sinco_agrupacion_id) }
      : {}),
    ...(quotation.sinco_proyecto_id
      ? { id_proyecto_sinco_fx: String(quotation.sinco_proyecto_id) }
      : {}),
    // sinco_unidad_id se guarda en DB para trazabilidad pero NO se escribe al Deal
    // porque id_unidad_sinco_fx no existe aún en HubSpot
  };

  // ── Inmueble (duplicadas de Unidad → Deal para tarjeta CRM) ──
  // Opcionales: si el portal no tiene estas propiedades, se omiten automáticamente
  const inmuebleProps: Record<string, string | number> = {
    torre_deal_fx: quotation.torre_name,
    numero_apto_deal_fx: String(quotation.unit_number),
    tipologia_deal_fx: quotation.unit_tipologia || '',
    piso_deal_fx: quotation.unit_piso ?? 0,
    area_privada_deal_fx: quotation.unit_area ?? 0,
    habitaciones_deal_fx: quotation.unit_habs ?? 0,
    banos_deal_fx: quotation.unit_banos ?? 0,
  };

  // ── 4. Create Deal (con retry defensivo) ──
  let hubspotDealId: string;
  const allProps = { ...dealProperties, ...inmuebleProps };

  const createDeal = async (props: Record<string, string | number>): Promise<Response> => {
    return fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ properties: props }),
    });
  };

  try {
    let hsResponse = await createDeal(allProps);

    // Si falla por PROPERTY_DOESNT_EXIST, reintentar sin propiedades de inmueble
    if (!hsResponse.ok) {
      const errBody = await hsResponse.text();
      if (errBody.includes('PROPERTY_DOESNT_EXIST') && Object.keys(inmuebleProps).some(k => errBody.includes(k))) {
        console.warn(`[deal] Inmueble properties not found in portal — retrying without them`);
        hsResponse = await createDeal(dealProperties);
        if (!hsResponse.ok) {
          const retryErr = await hsResponse.text();
          console.error(`[deal] HubSpot create deal error (retry): ${hsResponse.status} — ${retryErr}`);
          return errorResponse(502, 'HUBSPOT_DEAL_CREATE_ERROR', `HubSpot ${hsResponse.status}: ${retryErr}`);
        }
      } else {
        console.error(`[deal] HubSpot create deal error: ${hsResponse.status} — ${errBody}`);
        return errorResponse(502, 'HUBSPOT_DEAL_CREATE_ERROR', `HubSpot ${hsResponse.status}: ${errBody}`);
      }
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

  // ── 5.5 PDF Upload to HubSpot File Manager (non-fatal) ──
  // Delegated to pdfHubSpotSyncService — application layer owns the lifecycle.
  const pdfSync = await syncQuotationPdfToHubSpot(quotation, {
    token,
    dealId: hubspotDealId,
    clientId,
    macroName: String(quotation.macro_name),
    pdfAssets: clientConfig.pdfAssets,
  });

  if (pdfSync.status !== 'attached') {
    console.warn('[deal] PDF sync incomplete (non-fatal)', {
      cotNumber,
      status: pdfSync.status,
      error: pdfSync.error,
    });
  }

  const pdfHubspotFileId = pdfSync.fileId;
  const pdfHubspotUrl = pdfSync.url;
  const pdfUploadStatus = pdfSync.status;
  const pdfUploadError = pdfSync.error;
  const pdfHubspotNoteId = pdfSync.noteId;
  const pdfUploadedAt = pdfSync.uploadedAt;
  const pdfAttachedAt = pdfSync.attachedAt;

  // ── 6. Update quotation in DB (single UPDATE with all fields) ──
  try {
    await sql`
      UPDATE quotations
      SET hubspot_deal_id = ${hubspotDealId},
          hubspot_contact_id = COALESCE(hubspot_contact_id, ${contactId}),
          deal_created_at = NOW(),
          status = 'deal_created',
          pdf_hubspot_file_id = ${pdfHubspotFileId},
          pdf_upload_status = ${pdfUploadStatus},
          pdf_upload_error = ${pdfUploadError},
          pdf_uploaded_at = ${pdfUploadedAt}::timestamptz,
          pdf_hubspot_note_id = ${pdfHubspotNoteId},
          pdf_attached_at = ${pdfAttachedAt}::timestamptz,
          pdf_hubspot_url = ${pdfHubspotUrl}
      WHERE id = ${quotation.id}
    `;
  } catch (err) {
    console.error(`[deal] DB update error: ${err instanceof Error ? err.message : err}`);
  }

  // ── 7. Debug gate (WB-3) ──
  const debugEnabled =
    request.nextUrl.searchParams.get('debug') === 'true' &&
    process.env.ENABLE_DEBUG_RESPONSES === 'true';

  // Only call HubSpot read-back in debug mode (saves 1 API call in production)
  const dealDebugProps = debugEnabled
    ? await readDealDebugProps(token, hubspotDealId)
    : null;

  // ── 8. Response ──
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
        pdfUpload: {
          status: pdfUploadStatus,
          fileId: pdfHubspotFileId,
          noteId: pdfHubspotNoteId,
          url: pdfHubspotUrl,
          error: pdfUploadError,
        },
        // Debug-only fields — never in production unless ENABLE_DEBUG_RESPONSES=true
        ...(debugEnabled ? {
          contactFx: contactFxResult,
          buyerDbValues: {
            buyerDocNumber: quotation.buyer_doc_number ?? null,
            buyerDocType: quotation.buyer_doc_type ?? null,
            buyerTipoPersona: quotation.buyer_tipo_persona ?? null,
          },
          dealDebugProps,
          quotationSincoIds: {
            sincoAgrupacionId: quotation.sinco_agrupacion_id,
            sincoUnidadId: quotation.sinco_unidad_id,
            sincoProyectoId: quotation.sinco_proyecto_id,
          },
        } : {}),
      },
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
