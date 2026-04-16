/**
 * GET /api/engine/health?clientId=jimenez_demo
 *
 * Smoke test: valida que las credenciales de Sinco y HubSpot del cliente
 * funcionen y mide latencia de cada uno.
 *
 * Usar este endpoint inmediatamente después de configurar env vars.
 */

import { Engine } from '@/engine';
import { jsonOk, jsonError, requireQueryString } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const clientId = requireQueryString(req, 'clientId');
  if (clientId instanceof Response) return clientId;

  const config = Engine.getClientConfig(clientId);
  if (config.isErr()) return jsonError(config.error);

  const erp = Engine.getErpConnector(clientId);
  const crm = Engine.getCrmAdapter(clientId);

  const erpHealth = erp.isOk() ? await erp.value.healthCheck() : null;
  const crmHealth = crm.isOk() ? await crm.value.healthCheck() : null;

  return jsonOk({
    clientId,
    name: config.value.name,
    active: config.value.active,
    erp: {
      kind: config.value.erp.kind,
      ok: erpHealth?.isOk() ?? false,
      latencyMs: erpHealth?.isOk() ? erpHealth.value.latencyMs : null,
      error: erpHealth?.isErr() ? erpHealth.error.toJSON() : null,
    },
    crm: {
      kind: config.value.crm.kind,
      ok: crmHealth?.isOk() ?? false,
      latencyMs: crmHealth?.isOk() ? crmHealth.value.latencyMs : null,
      error: crmHealth?.isErr() ? crmHealth.error.toJSON() : null,
    },
  });
}
