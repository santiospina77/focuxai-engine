/**
 * POST /api/engine/sale/separar-webhook/[clientId]
 *
 * WB-5: Webhook receiver for HubSpot → Sinco separación.
 *
 * Receives flat { dealId } from HubSpot workflow, reads Deal+Contact from CRM,
 * builds SeparacionInput, and delegates to SaleWriteback.separar().
 *
 * Security layers:
 *   1. clientId validation (Engine.getCrmAdapter → CONFIG_CLIENT_NOT_FOUND)
 *   2. Bearer token per-client, timing-safe
 *   3. Zod strict schema (no extra fields)
 *   4. All builders return Result (zero fail-silent)
 *
 * Idempotent via PgEventLog.
 */

import { z } from 'zod';
import { Engine } from '@/engine';
import { jsonOk, jsonError } from '@/lib/api-helpers';
import { verifyWebhookAuth } from '@/engine/core/auth/verifyWebhookAuth';
import { resolveSincoIds } from '@/engine/core/sync/resolveSincoIds';
import { resolvePrimaryContact } from '@/engine/core/sync/resolvePrimaryContact';
import { buildSeparacionInputFromHubSpot } from '@/engine/core/sync/buildSeparacionInputFromHubSpot';
import { WRITEBACK_DEAL_PROPS } from '@/engine/core/sync/constants';
import { WebhookValidationError } from '@/engine/core/errors/EngineError';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ============================================================================
// Request schema (flat from HubSpot workflow)
// ============================================================================

const WebhookRequestSchema = z.object({
  dealId: z.coerce.string().min(1),
  workflowId: z.string().optional(),
  eventId: z.string().optional(),
}).strict();

// ============================================================================
// Handler
// ============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  // 1. Validate clientId exists (via CRM adapter resolution — no CRM call)
  const crmResult = Engine.getCrmAdapter(clientId);
  if (crmResult.isErr()) return jsonError(crmResult.error); // 404 CONFIG_CLIENT_NOT_FOUND

  const erpResult = Engine.getErpConnector(clientId);
  if (erpResult.isErr()) return jsonError(erpResult.error);

  const crm = crmResult.value;
  const erp = erpResult.value;

  // 2. Auth — fail fast, no CRM call
  const authResult = verifyWebhookAuth(req, clientId);
  if (authResult.isErr()) return jsonError(authResult.error); // 401

  // 3. Parse body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(WebhookValidationError.invalidValue('body', 'Malformed JSON'));
  }

  const parsed = WebhookRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError(
      WebhookValidationError.invalidValue('body', JSON.stringify(parsed.error.flatten()))
    );
  }

  const { dealId } = parsed.data;
  const log = Engine.logger.child({
    operation: 'sale.separarWebhook',
    clientId,
    dealId,
    workflowId: parsed.data.workflowId,
    eventId: parsed.data.eventId,
  });
  log.info({}, 'Webhook received');

  // 4. Load Deal — handle both isErr() AND ok(null)
  const dealResult = await crm.getRecord('deal', dealId, WRITEBACK_DEAL_PROPS);
  if (dealResult.isErr()) {
    log.warn({ error: dealResult.error }, 'Deal read failed');
    return jsonError(dealResult.error);
  }
  if (dealResult.value === null) {
    log.warn({}, `Deal ${dealId} not found`);
    return jsonError(WebhookValidationError.resourceNotFound('deal', `Deal ${dealId} not found`));
  }
  const deal = dealResult.value;

  // 5. Resolve Sinco IDs (deterministic: mirror → association → error)
  const sincoIdsResult = await resolveSincoIds(crm, deal, dealId);
  if (sincoIdsResult.isErr()) {
    log.warn({ error: sincoIdsResult.error }, 'Sinco IDs resolution failed');
    return jsonError(sincoIdsResult.error);
  }

  // 6. Resolve primary contact (deterministic: VID → association → error)
  const contactResult = await resolvePrimaryContact(crm, deal, dealId);
  if (contactResult.isErr()) {
    log.warn({ error: contactResult.error }, 'Contact resolution failed');
    return jsonError(contactResult.error);
  }

  // 7. Build SeparacionInput (pure, contract-aligned, zero fail-silent)
  const inputResult = buildSeparacionInputFromHubSpot({
    clientId,
    dealId,
    deal,
    contact: contactResult.value,
    sincoIds: sincoIdsResult.value,
    now: new Date(),
  });
  if (inputResult.isErr()) {
    log.error({ error: inputResult.error }, 'Input build failed');
    return jsonError(inputResult.error);
  }

  // 8. Delegate to SaleWriteback (idempotent via PgEventLog)
  const result = await Engine.saleWriteback.separar(erp, crm, inputResult.value);
  if (result.isErr()) {
    log.error({ error: result.error }, 'SaleWriteback.separar failed');
    return jsonError(result.error);
  }

  log.info({}, 'Webhook processed successfully');
  return jsonOk(result.value);
}
