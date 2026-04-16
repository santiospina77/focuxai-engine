/**
 * POST /api/engine/sync/inventory?clientId=...&mode=full|prices
 *   Trigger manual del sync. Requiere CRON_SECRET en Authorization.
 *
 * GET /api/engine/sync/inventory?clientId=...&mode=full|prices
 *   También aceptado para que Vercel Cron lo invoque (Cron usa GET).
 */

import { Engine } from '@/engine';
import {
  jsonOk,
  jsonError,
  requireCronAuth,
  requireQueryString,
  parseQueryNumber,
  parseQueryString,
} from '@/lib/api-helpers';
import type { SyncMode } from '@/engine/core/sync/InventorySync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutos — sync inicial puede ser largo

async function handle(req: Request): Promise<Response> {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const clientId = requireQueryString(req, 'clientId');
  if (clientId instanceof Response) return clientId;

  const modeRaw = parseQueryString(req, 'mode') ?? 'prices';
  if (modeRaw !== 'full' && modeRaw !== 'prices') {
    return new Response(
      JSON.stringify({ error: { code: 'INVALID_PARAM', message: 'mode must be full or prices' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const mode: SyncMode = modeRaw;

  const macroId = parseQueryNumber(req, 'macroproyectoId');
  const proyectoId = parseQueryNumber(req, 'proyectoId');

  const erp = Engine.getErpConnector(clientId);
  if (erp.isErr()) return jsonError(erp.error);

  const crm = Engine.getCrmAdapter(clientId);
  if (crm.isErr()) return jsonError(crm.error);

  const result = await Engine.inventorySync.run(erp.value, crm.value, {
    clientId,
    mode,
    ...(macroId != null && { macroproyectoExternalId: macroId }),
    ...(proyectoId != null && { proyectoExternalId: proyectoId }),
  });

  if (result.isErr()) return jsonError(result.error);
  return jsonOk(result.value);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
