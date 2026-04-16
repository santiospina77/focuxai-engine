/**
 * POST /api/engine/sale/legalizar
 *
 * Body: LegalizacionInput (ver SaleWriteback.ts) — misma shape que separar.
 *
 * Llamado por:
 *   - Webhook de HubSpot cuando un Deal pasa a etapa "Negocio Legalizado"
 *   - Endpoint manual desde Ops
 *
 * Re-confirma la venta con el plan de pagos final tras firma de promesa.
 * Idempotente por dealId.
 */

import { Engine } from '@/engine';
import { jsonOk, jsonError } from '@/lib/api-helpers';
import type { LegalizacionInput } from '@/engine/core/sync/SaleWriteback';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  let input: LegalizacionInput;
  try {
    const raw = await req.json();
    input = {
      ...raw,
      venta: {
        ...raw.venta,
        fecha: new Date(raw.venta.fecha),
        planPagos: raw.venta.planPagos.map((c: { fecha: string }) => ({
          ...c,
          fecha: new Date(c.fecha),
        })),
      },
    };
  } catch {
    return new Response(
      JSON.stringify({ error: { code: 'INVALID_BODY', message: 'Body inválido o no es JSON' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!input.clientId || !input.dealId) {
    return new Response(
      JSON.stringify({ error: { code: 'INVALID_BODY', message: 'clientId y dealId son requeridos' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const erp = Engine.getErpConnector(input.clientId);
  if (erp.isErr()) return jsonError(erp.error);

  const crm = Engine.getCrmAdapter(input.clientId);
  if (crm.isErr()) return jsonError(crm.error);

  const result = await Engine.saleWriteback.legalizar(erp.value, crm.value, input);
  if (result.isErr()) return jsonError(result.error);
  return jsonOk(result.value);
}
