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
 *      5b. uploadFileToHubSpot(PRIVATE)
 *      5c. attachFileToRecord(deals) → Note con PDF adjunto
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
import type { QuotationRow, ErrorResponse } from '../types';
import { buildPdfBuffer } from '@/app/api/engine/quotations/pdf/pdfBuilder';
import type { PdfAssetOptions } from '@/app/api/engine/quotations/pdf/pdfBuilder';
import { uploadFileToHubSpot, attachFileToRecord } from '@/engine/connectors/crm/hubspot/hubspotFileManager';
import type { Result } from '@/engine/core/types/Result';
import { ok, err } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';
import { ResourceError, ValidationError } from '@/engine/core/errors/EngineError';

// ═══════════════════════════════════════════════════════════
// Client asset config — single source of truth
// Descomentar después de ejecutar migrate-assets-to-hubspot.ts
// ═══════════════════════════════════════════════════════════

// const JIMENEZ_PDF_ASSETS: PdfAssetOptions = {
//   assetBaseUrl: 'https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez/porto-sabbia',
//   allowedHosts: ['focuxai-engine.vercel.app', '51256354.fs1.hubspotusercontent-na1.net'],
// };

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
    // Fase B.0 Step 7: PDF assets desde HubSpot CDN del cliente.
    // Se activa después de ejecutar migrate-assets-to-hubspot.ts (Step 6).
    // Mientras esté undefined → fallback automático a /assets/ de Vercel.
    // pdfAssets: JIMENEZ_PDF_ASSETS,
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
// PDF Upload Helpers (Fase B.0)
// ═══════════════════════════════════════════════════════════

type PdfUploadStatus = QuotationRow['pdf_upload_status'];

/**
 * Slugify a string for use as a HubSpot folder path segment.
 * Returns fallback if result is empty (e.g., all special chars).
 */
function slugifyFolderSegment(value: string, fallback: string): string {
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
 * Format: /focux-quoter/{clientSlug}/cotizaciones/{macroSlug}/{YYYY-MM}/
 */
function buildHubSpotQuotationFolderPath(params: {
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

  return ok(`/focux-quoter/${clientSlug}/cotizaciones/${macroSlug}/${yearMonth}/`);
}

/**
 * Wrap buildPdfBuffer in Result pattern.
 * Converts throw-based pdf-lib errors into Result<Buffer, EngineError>.
 */
async function buildPdfBufferSafe(
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
function safeErrorMessage(error: EngineError): string {
  return `${error.code}: ${error.message}`.slice(0, 500);
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
  let pdfHubspotFileId: string | null = null;
  let pdfUploadStatus: PdfUploadStatus = null;
  let pdfUploadError: string | null = null;
  let pdfHubspotNoteId: string | null = null;
  let pdfUploadedAt: string | null = null;
  let pdfAttachedAt: string | null = null;

  // 5.5a — Build folder path
  const folderPathResult = buildHubSpotQuotationFolderPath({
    clientId,
    macroName: String(quotation.macro_name),
    date: new Date(),
  });

  if (folderPathResult.isErr()) {
    pdfUploadStatus = 'upload_failed';
    pdfUploadError = safeErrorMessage(folderPathResult.error);
    console.warn('[deal] PDF folder path invalid (non-fatal)', {
      code: folderPathResult.error.code,
      cotNumber,
    });
  } else {
    // 5.5b — Generate PDF buffer
    const pdfResult = await buildPdfBufferSafe(quotation, clientConfig.pdfAssets);

    if (pdfResult.isErr()) {
      pdfUploadStatus = 'generation_failed';
      pdfUploadError = safeErrorMessage(pdfResult.error);
      console.warn('[deal] PDF generation failed (non-fatal)', {
        code: pdfResult.error.code,
        cotNumber,
        operation: 'build_pdf_for_hubspot_upload',
      });
    } else {
      // 5.5c — Upload to HubSpot File Manager
      const uploadResult = await uploadFileToHubSpot(token, pdfResult.value, {
        fileName: `${cotNumber}_v1.pdf`,
        folderPath: folderPathResult.value,
        contentType: 'application/pdf',
        access: 'PRIVATE',
      });

      if (uploadResult.isOk()) {
        pdfHubspotFileId = uploadResult.value.fileId;
        pdfUploadStatus = 'uploaded';
        pdfUploadedAt = new Date().toISOString();

        // 5.5d — Attach to Deal as Note
        const attachResult = await attachFileToRecord(token, pdfHubspotFileId, {
          objectType: 'deals',
          objectId: hubspotDealId,
          noteBody: `Cotización ${cotNumber} — generada por FocuxAI Quoter`,
        });

        if (attachResult.isOk()) {
          pdfHubspotNoteId = attachResult.value.noteId;
          pdfUploadStatus = 'attached';
          pdfAttachedAt = new Date().toISOString();
        } else {
          pdfUploadStatus = 'attach_failed';
          pdfUploadError = safeErrorMessage(attachResult.error);
          console.warn('[deal] PDF attach failed (non-fatal)', {
            code: attachResult.error.code,
            cotNumber,
            operation: 'hubspot_pdf_attach',
          });
        }
      } else {
        pdfUploadStatus = 'upload_failed';
        pdfUploadError = safeErrorMessage(uploadResult.error);
        console.warn('[deal] PDF upload failed (non-fatal)', {
          code: uploadResult.error.code,
          cotNumber,
          operation: 'hubspot_pdf_upload',
        });
      }
    }
  }

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
          pdf_attached_at = ${pdfAttachedAt}::timestamptz
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
        pdfUpload: {
          status: pdfUploadStatus,
          fileId: pdfHubspotFileId,
          noteId: pdfHubspotNoteId,
          error: pdfUploadError,
        },
      },
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
