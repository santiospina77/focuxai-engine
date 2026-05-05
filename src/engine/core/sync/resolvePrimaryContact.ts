/**
 * WB-5: Resolve primary contact for a Deal.
 *
 * Deterministic resolution:
 *   PATH A — contacto_principal_vid_fx present on Deal:
 *     Read contact by VID. Found → use. Not found (null) → ERROR (stale VID).
 *
 *   PATH B — contacto_principal_vid_fx absent:
 *     Read associations. 0 → error. 1 → use. >1 → error (ambiguous).
 *
 * Never throws. Always returns Result.
 */

import { type Result, ok, err } from '../types/Result';
import { EngineError, WebhookValidationError } from '../errors/EngineError';
import type { ICrmAdapter, CrmRecord } from '@/engine/interfaces/ICrmAdapter';

// ============================================================================
// Contact properties to request
// ============================================================================

const CONTACT_PROPS = [
  'firstname',
  'lastname',
  'email',
  'phone',
  'cedula_fx',
  'tipo_identificacion_fx',
  'tipo_persona_fx',
  'genero_fx',
] as const;

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolves primary contact for the given deal.
 *
 * @param crm  - CRM adapter (never called directly by Engine Core)
 * @param deal - Deal record (already loaded with WRITEBACK_DEAL_PROPS)
 * @param dealId - Deal ID (for error messages)
 */
export async function resolvePrimaryContact(
  crm: ICrmAdapter,
  deal: CrmRecord,
  dealId: string
): Promise<Result<CrmRecord, EngineError>> {

  const primaryVid = deal.properties.contacto_principal_vid_fx as string | null | undefined;

  // --- PATH A: Explicit VID ---
  if (primaryVid && String(primaryVid).trim() !== '') {
    const contactResult = await crm.getRecord('contact', String(primaryVid), [...CONTACT_PROPS]);

    // Error reading → propagate as stale VID
    if (contactResult.isErr()) {
      return err(WebhookValidationError.invalidValue(
        'contacto_principal_vid_fx',
        `Contact VID ${primaryVid} read failed. Deal ${dealId} has stale contacto_principal_vid_fx.`
      ));
    }

    // ok(null) → contact doesn't exist → stale VID
    if (contactResult.value === null) {
      return err(WebhookValidationError.invalidValue(
        'contacto_principal_vid_fx',
        `Contact VID ${primaryVid} not found. Deal ${dealId} has stale contacto_principal_vid_fx.`
      ));
    }

    return ok(contactResult.value);
  }

  // --- PATH B: Association fallback ---
  const assocResult = await crm.getAssociatedObjects(
    'deal',
    dealId,
    'contact',
    [...CONTACT_PROPS]
  );

  if (assocResult.isErr()) {
    return err(WebhookValidationError.resourceNotFound(
      'contact',
      `Failed to read contacts for deal ${dealId}`
    ));
  }

  const contacts = assocResult.value;

  if (contacts.length === 0) {
    return err(WebhookValidationError.resourceNotFound(
      'contact',
      `No contact associated to deal ${dealId}`
    ));
  }

  if (contacts.length === 1) {
    return ok(contacts[0]);
  }

  // >1 contacts — ambiguous
  return err(WebhookValidationError.ambiguousResource(
    'contact',
    `Deal ${dealId} has ${contacts.length} contacts. Set contacto_principal_vid_fx to resolve ambiguity.`
  ));
}
