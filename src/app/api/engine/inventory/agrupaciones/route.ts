/**
 * GET /api/engine/inventory/agrupaciones?clientId=...&proyectoId=...&estado=DISPONIBLE
 *
 * Endpoint que el Cotizador (frontend) llama para listar agrupaciones.
 * Lee de HubSpot Custom Objects, NO de Sinco directamente.
 *
 * Query params:
 *   - clientId (required)
 *   - proyectoId (required) — externalId del proyecto en Sinco
 *   - estado (optional) — DISPONIBLE | COTIZADA | BLOQUEADA | SEPARADA | VENDIDA
 *   - limit (optional, default 100)
 */

import { Engine } from '@/engine';
import {
  jsonOk,
  jsonError,
  requireQueryString,
  requireQueryNumber,
  parseQueryString,
  parseQueryNumber,
} from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

const PROPS_TO_RETURN = [
  'id_sinco_fx',
  'nombre_fx',
  'estado_fx',
  'valor_total_neto_fx',
  'id_proyecto_sinco_fx',
  'id_hubspot_deal_fx',
];

export async function GET(req: Request) {
  const clientId = requireQueryString(req, 'clientId');
  if (clientId instanceof Response) return clientId;

  const proyectoId = requireQueryNumber(req, 'proyectoId');
  if (proyectoId instanceof Response) return proyectoId;

  const estado = parseQueryString(req, 'estado') ?? 'DISPONIBLE';
  const limit = parseQueryNumber(req, 'limit') ?? 100;

  const crm = Engine.getCrmAdapter(clientId);
  if (crm.isErr()) return jsonError(crm.error);

  const result = await crm.value.searchRecords({
    objectType: 'agrupacion',
    filters: [
      { property: 'id_proyecto_sinco_fx', operator: 'eq', value: proyectoId },
      { property: 'estado_fx', operator: 'eq', value: estado },
    ],
    properties: PROPS_TO_RETURN,
    limit,
  });

  if (result.isErr()) return jsonError(result.error);

  return jsonOk({
    proyectoId,
    estado,
    total: result.value.records.length,
    records: result.value.records.map((r) => ({
      id: r.id,
      ...r.properties,
    })),
  });
}
