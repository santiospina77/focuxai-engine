/**
 * normalizeUnitType — Clasifica una unidad en APT / PARQ / DEP
 * usando la tabla congelada de types.ts.
 *
 * Intenta primero por idTipoUnidad numérico (más confiable),
 * luego por texto tipo_unidad_fx (case-insensitive, match EXACTO).
 *
 * Si no matchea con nada → retorna null (el caller decide si fail hard).
 *
 * CORRECCIÓN GPT #3: eliminado el fallback por includes() que era
 * demasiado permisivo y podía clasificar mal registros con texto libre.
 * Solo se acepta match exacto normalizado.
 *
 * Pure function. No side effects.
 */

import {
  type NormalizedUnitType,
  UNIT_TYPE_NORMALIZATION,
  UNIT_TYPE_BY_SINCO_ID,
} from './types';

export function normalizeUnitType(
  tipoUnidadTexto: string | null | undefined,
  idTipoUnidad: number | null | undefined,
): NormalizedUnitType | null {
  // 1. Try by Sinco numeric ID first (most reliable)
  if (idTipoUnidad != null && UNIT_TYPE_BY_SINCO_ID.has(idTipoUnidad)) {
    return UNIT_TYPE_BY_SINCO_ID.get(idTipoUnidad)!;
  }

  // 2. Try by text — EXACT match only (case-insensitive, trimmed)
  if (tipoUnidadTexto != null && tipoUnidadTexto.trim().length > 0) {
    const normalized = tipoUnidadTexto.trim().toLowerCase();
    if (UNIT_TYPE_NORMALIZATION.has(normalized)) {
      return UNIT_TYPE_NORMALIZATION.get(normalized)!;
    }
  }

  // 3. No match — caller must fail hard
  return null;
}
