/**
 * WB-5: Resolve Sinco ERP IDs (idAgrupacion, idProyecto) from Deal.
 *
 * Deterministic resolution:
 *   PATH A — Mirror props present on Deal → use directly (no CRM call).
 *   PATH B — Mirror absent → read associations → 0=error, 1=use, >1=error.
 *
 * Never throws. Always returns Result.
 */

import { type Result, ok, err } from '../types/Result';
import { EngineError, WebhookValidationError } from '../errors/EngineError';
import type { ICrmAdapter, CrmRecord } from '@/engine/interfaces/ICrmAdapter';

// ============================================================================
// Types
// ============================================================================

export interface SincoIds {
  readonly idAgrupacionSinco: number;
  readonly idProyectoSinco: number;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolves Sinco IDs from deal mirror props or association fallback.
 *
 * Mirror props (Deal): id_agrupacion_sinco_fx, id_proyecto_sinco_fx
 * Association fallback: Deal → Agrupación custom object → id_sinco_fx prop
 */
export async function resolveSincoIds(
  crm: ICrmAdapter,
  deal: CrmRecord,
  dealId: string
): Promise<Result<SincoIds, EngineError>> {
  const dp = deal.properties;

  const mirrorAgrupacion = dp.id_agrupacion_sinco_fx;
  const mirrorProyecto = dp.id_proyecto_sinco_fx;

  // --- PATH A: Both mirrors present → no CRM call ---
  if (mirrorAgrupacion && mirrorProyecto) {
    const idAgrupacion = Number(mirrorAgrupacion);
    const idProyecto = Number(mirrorProyecto);

    if (!Number.isFinite(idAgrupacion) || !Number.isInteger(idAgrupacion) || idAgrupacion <= 0) {
      return err(WebhookValidationError.invalidValue(
        'id_agrupacion_sinco_fx',
        `must be positive integer, got: ${mirrorAgrupacion}`
      ));
    }

    if (!Number.isFinite(idProyecto) || !Number.isInteger(idProyecto) || idProyecto <= 0) {
      return err(WebhookValidationError.invalidValue(
        'id_proyecto_sinco_fx',
        `must be positive integer, got: ${mirrorProyecto}`
      ));
    }

    return ok({ idAgrupacionSinco: idAgrupacion, idProyectoSinco: idProyecto });
  }

  // --- PATH B: Association fallback ---
  const assocResult = await crm.getAssociatedObjects(
    'deal',
    dealId,
    'agrupacion',
    ['id_sinco_fx', 'id_proyecto_sinco_fx']
  );

  if (assocResult.isErr()) {
    return err(WebhookValidationError.resourceNotFound(
      'agrupacion',
      `Failed to read agrupaciones for deal ${dealId}`
    ));
  }

  const agrupaciones = assocResult.value;

  if (agrupaciones.length === 0) {
    return err(WebhookValidationError.resourceNotFound(
      'agrupacion',
      `No agrupación associated to deal ${dealId}. Set id_agrupacion_sinco_fx and id_proyecto_sinco_fx manually.`
    ));
  }

  if (agrupaciones.length > 1) {
    return err(WebhookValidationError.ambiguousResource(
      'agrupacion',
      `Deal ${dealId} has ${agrupaciones.length} agrupaciones. Set id_agrupacion_sinco_fx and id_proyecto_sinco_fx to resolve ambiguity.`
    ));
  }

  // Exactly 1 agrupación
  const agrupacion = agrupaciones[0];
  const idSincoRaw = agrupacion.properties.id_sinco_fx;
  const idProyectoRaw = agrupacion.properties.id_proyecto_sinco_fx;

  if (!idSincoRaw) {
    return err(WebhookValidationError.missingField(
      `agrupacion[${agrupacion.id}].id_sinco_fx`
    ));
  }

  if (!idProyectoRaw) {
    return err(WebhookValidationError.missingField(
      `agrupacion[${agrupacion.id}].id_proyecto_sinco_fx`
    ));
  }

  const idAgrupacion = Number(idSincoRaw);
  const idProyecto = Number(idProyectoRaw);

  if (!Number.isFinite(idAgrupacion) || !Number.isInteger(idAgrupacion) || idAgrupacion <= 0) {
    return err(WebhookValidationError.invalidValue(
      `agrupacion[${agrupacion.id}].id_sinco_fx`,
      `must be positive integer, got: ${idSincoRaw}`
    ));
  }

  if (!Number.isFinite(idProyecto) || !Number.isInteger(idProyecto) || idProyecto <= 0) {
    return err(WebhookValidationError.invalidValue(
      `agrupacion[${agrupacion.id}].id_proyecto_sinco_fx`,
      `must be positive integer, got: ${idProyectoRaw}`
    ));
  }

  return ok({ idAgrupacionSinco: idAgrupacion, idProyectoSinco: idProyecto });
}
