/**
 * resolveUnitFallbacks — Aplica tablas de fallback por area_construida
 * cuando HubSpot devuelve null/0 para tipología, habitaciones o baños.
 *
 * Tablas copiadas exactamente del QuoterClient actual (líneas 134-136).
 * Estas tablas son específicas de Porto Sabbia Suites T1 (Jiménez).
 * Para otros proyectos/clientes, las tablas se extenderán o reemplazarán.
 *
 * Regla:
 *   - Si HubSpot trae el campo poblado y válido → usarlo
 *   - Si viene null, undefined, "" o 0 → fallback por área
 *   - Si el área no está en la tabla → devolver "?" / 0 / 0 con unmappedArea=true
 *     El caller DEBE tratar unmappedArea=true como error en proyectos preestablecidos.
 *
 * Pure function. No side effects.
 */

export interface UnitFallbackResult {
  readonly tipologia: string;
  readonly habs: number;
  readonly banos: number;
  /** true si se aplicó algún fallback */
  readonly usedFallback: boolean;
  readonly fallbackFields: readonly string[];
  /**
   * true si el área NO está en las tablas de fallback.
   * El caller DEBE tratar esto como error para el registro:
   *   - En proyectos preestablecidos → fail hard del proyecto
   *   - En otros → log error, el registro queda con datos de baja calidad
   *
   * NUNCA devolver "?" / 1 / 1 silenciosamente para áreas no mapeadas.
   */
  readonly unmappedArea: boolean;
}

// ── Exact copy from QuoterClient lines 134-136 ──
const AREA_TIPOLOGIA: ReadonlyMap<number, string> = new Map([
  [34.21, 'A1'], [35.11, 'A2'], [39.34, 'A3'],
  [40.92, 'B1'], [41.53, 'B2'], [41.28, 'B3'], [42.53, 'B4'],
  [43.46, 'C1'], [43.5, 'C2'],  [43.49, 'C3'], [43.12, 'C4'],
  [45.04, 'D1'],
  [46.38, 'D2'], [46.01, 'D3'], [46.33, 'D4'], [46.76, 'D5'],
  [54.19, 'E1'],
]);

const AREA_HABS: ReadonlyMap<number, number> = new Map([
  [34.21, 1], [35.11, 1], [39.34, 1],
  [40.92, 1], [41.53, 1], [41.28, 1], [42.53, 1],
  [43.46, 1], [43.5, 1],  [43.49, 1], [43.12, 1],
  [45.04, 2],
  [46.38, 2], [46.01, 2], [46.33, 2], [46.76, 2],
  [54.19, 2],
]);

const AREA_BANOS: ReadonlyMap<number, number> = new Map([
  [34.21, 1], [35.11, 1], [39.34, 1],
  [40.92, 1], [41.53, 1], [41.28, 1], [42.53, 1],
  [43.46, 1], [43.5, 1],  [43.49, 1], [43.12, 1],
  [45.04, 1],
  [46.38, 2], [46.01, 2], [46.33, 2], [46.76, 2],
  [54.19, 2],
]);

function isValidString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function isValidPositiveNumber(val: unknown): val is number {
  return typeof val === 'number' && val > 0 && !isNaN(val);
}

export function resolveUnitFallbacks(
  area: number,
  hubspotTipologia: string | null | undefined,
  hubspotAlcobas: number | null | undefined,
  hubspotBanos: number | null | undefined,
): UnitFallbackResult {
  const fallbackFields: string[] = [];

  // Check if area exists in ANY fallback table
  const areaInTables = AREA_TIPOLOGIA.has(area) || AREA_HABS.has(area) || AREA_BANOS.has(area);
  let unmappedArea = false;

  // Tipología
  let tipologia: string;
  if (isValidString(hubspotTipologia)) {
    tipologia = hubspotTipologia;
  } else {
    const fallback = AREA_TIPOLOGIA.get(area);
    if (fallback !== undefined) {
      tipologia = fallback;
      fallbackFields.push('tipologia');
    } else {
      tipologia = '?';
      fallbackFields.push('tipologia');
      unmappedArea = true;
    }
  }

  // Habitaciones
  let habs: number;
  if (isValidPositiveNumber(hubspotAlcobas)) {
    habs = hubspotAlcobas;
  } else {
    const fallback = AREA_HABS.get(area);
    if (fallback !== undefined) {
      habs = fallback;
      fallbackFields.push('habs');
    } else {
      habs = 0; // NOT 1 silently — 0 signals unmapped
      fallbackFields.push('habs');
      unmappedArea = true;
    }
  }

  // Baños
  let banos: number;
  if (isValidPositiveNumber(hubspotBanos)) {
    banos = hubspotBanos;
  } else {
    const fallback = AREA_BANOS.get(area);
    if (fallback !== undefined) {
      banos = fallback;
      fallbackFields.push('banos');
    } else {
      banos = 0; // NOT 1 silently — 0 signals unmapped
      fallbackFields.push('banos');
      unmappedArea = true;
    }
  }

  return {
    tipologia,
    habs,
    banos,
    usedFallback: fallbackFields.length > 0,
    fallbackFields,
    unmappedArea,
  };
}
