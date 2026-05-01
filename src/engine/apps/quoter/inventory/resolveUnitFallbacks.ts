/**
 * resolveUnitFallbacks — Resolución de tipología multi-proyecto (v2)
 *
 * v2.1 (Architect review):
 *   - `rules` es OBLIGATORIO — cero fallback silencioso
 *   - unmappedArea = !areaMatched (independiente de source)
 *   - Assets corresponden a tipología final, no a área
 *   - Mismatch detection cuando HubSpot y área apuntan a tipologías distintas
 *   - Reglas de tipología viven en clientConfigs/, no aquí
 *   - computeSafeTolerances retorna Result (nunca throw)
 *
 * Prioridad de resolución:
 *   1. HubSpot trae el campo poblado y válido → usarlo (source: 'hubspot')
 *   2. Área matchea una TypologyRule (exact o dentro de tolerancia) → usarla (source: 'rule_match')
 *   3. Área no matchea → "?" / 0 / 0 con unmappedArea=true (source: 'unmapped')
 *
 * REGLA CERRADA: unmappedArea=true → quarantine. Sin excepciones en Fase A.
 *
 * Pure function. No side effects.
 *
 * @since v1.0 — Porto Sabbia hardcoded
 * @since v2.0 — Multi-proyecto con TypologyRule[]
 * @since v2.1 — Architect review fixes
 */

import type {
  TypologyRule,
  TypologyResolution,
  ComputedTolerance,
} from './typologyTypes';
import type { Result } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';
import { ok, err } from '@/engine/core/types/Result';
import { computeSafeTolerances, findMatchingRule } from './typologyTypes';

// Re-export para backward compat de imports
export type { TypologyRule, TypologyResolution, ComputedTolerance };

// ═══════════════════════════════════════════════════════════
// Legacy interface — MANTENER para backward compatibility
// ═══════════════════════════════════════════════════════════

export interface UnitFallbackResult {
  readonly tipologia: string;
  readonly habs: number;
  readonly banos: number;
  /** true si se aplicó algún fallback */
  readonly usedFallback: boolean;
  readonly fallbackFields: readonly string[];
  /**
   * true si el área NO está en las reglas de tipología.
   * REGLA CERRADA: unmappedArea=true → quarantine.
   * Sin excepciones en Fase A.
   */
  readonly unmappedArea: boolean;
}

// ═══════════════════════════════════════════════════════════
// Validators (pure)
// ═══════════════════════════════════════════════════════════

function isValidString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function isValidPositiveNumber(val: unknown): val is number {
  return typeof val === 'number' && val > 0 && !isNaN(val);
}

// ═══════════════════════════════════════════════════════════
// Cache de tolerancias (lazy, una vez por set de reglas)
// ═══════════════════════════════════════════════════════════

const toleranceCache = new WeakMap<readonly TypologyRule[], readonly ComputedTolerance[]>();

function getOrComputeTolerances(
  rules: readonly TypologyRule[],
): Result<readonly ComputedTolerance[], EngineError> {
  const cached = toleranceCache.get(rules);
  if (cached) return ok(cached);

  const result = computeSafeTolerances(rules);
  if (result.isOk()) {
    toleranceCache.set(rules, result.value);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════
// resolveUnitFallbacks — Versión multi-proyecto (v2)
// ═══════════════════════════════════════════════════════════

/**
 * Resuelve tipología, habitaciones y baños para una unidad.
 *
 * @param area — Área construida de la unidad (m²)
 * @param hubspotTipologia — Tipología desde HubSpot (puede ser null)
 * @param hubspotAlcobas — Habitaciones desde HubSpot (puede ser null)
 * @param hubspotBanos — Baños desde HubSpot (puede ser null)
 * @param rules — TypologyRule[] del proyecto. OBLIGATORIO.
 * @returns Result con UnitFallbackResult o error de validación de reglas
 */
export function resolveUnitFallbacks(
  area: number,
  hubspotTipologia: string | null | undefined,
  hubspotAlcobas: number | null | undefined,
  hubspotBanos: number | null | undefined,
  rules: readonly TypologyRule[],
): Result<UnitFallbackResult, EngineError> {
  const tolerancesResult = getOrComputeTolerances(rules);
  if (tolerancesResult.isErr()) return tolerancesResult as Result<never, EngineError>;

  const tolerances = tolerancesResult.value;
  const fallbackFields: string[] = [];

  // Buscar regla que matchea el área
  const match = findMatchingRule(area, tolerances);
  const areaMatched = match !== null;

  // ── Tipología ──
  let tipologia: string;
  if (isValidString(hubspotTipologia)) {
    tipologia = hubspotTipologia;
  } else if (match) {
    tipologia = match.rule.tipologia;
    fallbackFields.push('tipologia');
  } else {
    tipologia = '?';
    fallbackFields.push('tipologia');
  }

  // ── Habitaciones ──
  let habs: number;
  if (isValidPositiveNumber(hubspotAlcobas)) {
    habs = hubspotAlcobas;
  } else if (match) {
    habs = match.rule.habs;
    fallbackFields.push('habs');
  } else {
    habs = 0; // 0 signals unmapped — NEVER 1 silently
    fallbackFields.push('habs');
  }

  // ── Baños ──
  let banos: number;
  if (isValidPositiveNumber(hubspotBanos)) {
    banos = hubspotBanos;
  } else if (match) {
    banos = match.rule.banos;
    fallbackFields.push('banos');
  } else {
    banos = 0; // 0 signals unmapped — NEVER 1 silently
    fallbackFields.push('banos');
  }

  return ok({
    tipologia,
    habs,
    banos,
    usedFallback: fallbackFields.length > 0,
    fallbackFields,
    unmappedArea: !areaMatched, // INDEPENDIENTE de source
  });
}

// ═══════════════════════════════════════════════════════════
// resolveTypology — Versión completa con source tracking (v2)
// ═══════════════════════════════════════════════════════════

/**
 * Resolución completa de tipología con source tracking y asset paths.
 *
 * v2.1 fixes:
 *   - Assets corresponden a la tipología final (no al match por área)
 *   - unmappedArea = !areaMatched (independiente de source)
 *   - Mismatch detection: HubSpot vs rule_match
 *
 * @param area — Área construida
 * @param hubspotTipologia — Campo de HubSpot
 * @param hubspotAlcobas — Campo de HubSpot
 * @param hubspotBanos — Campo de HubSpot
 * @param rules — TypologyRule[] del proyecto (OBLIGATORIO)
 * @returns Result con TypologyResolution o error de validación
 */
export function resolveTypology(
  area: number,
  hubspotTipologia: string | null | undefined,
  hubspotAlcobas: number | null | undefined,
  hubspotBanos: number | null | undefined,
  rules: readonly TypologyRule[],
): Result<TypologyResolution, EngineError> {
  const tolerancesResult = getOrComputeTolerances(rules);
  if (tolerancesResult.isErr()) return tolerancesResult as Result<never, EngineError>;

  const tolerances = tolerancesResult.value;
  const fallbackFields: string[] = [];
  const match = findMatchingRule(area, tolerances);
  const areaMatched = match !== null;

  // ── Buscar regla por tipología de HubSpot (para assets) ──
  const ruleByTipologia = isValidString(hubspotTipologia)
    ? rules.find(r => r.tipologia === hubspotTipologia.trim())
    : undefined;

  // ── Tipología con source tracking ──
  let tipologia: string;
  let source: TypologyResolution['source'];
  let confidence: number;

  if (isValidString(hubspotTipologia)) {
    tipologia = hubspotTipologia;
    source = 'hubspot';
    confidence = 1.0;
  } else if (match) {
    tipologia = match.rule.tipologia;
    source = 'rule_match';
    confidence = match.confidence;
    fallbackFields.push('tipologia');
  } else {
    tipologia = '?';
    source = 'unmapped';
    confidence = 0.0;
    fallbackFields.push('tipologia');
  }

  // ── Mismatch detection ──
  const mismatch: TypologyResolution['mismatch'] =
    ruleByTipologia && match && ruleByTipologia.tipologia !== match.rule.tipologia
      ? {
          preferred: ruleByTipologia.tipologia,
          conflicting: match.rule.tipologia,
          conflictSource: 'rule_match',
        }
      : undefined;

  // ── Asset rule: tipología HubSpot > match por área > undefined ──
  const assetRule = ruleByTipologia ?? match?.rule;

  // ── Habitaciones ──
  let habs: number;
  if (isValidPositiveNumber(hubspotAlcobas)) {
    habs = hubspotAlcobas;
  } else if (match) {
    habs = match.rule.habs;
    fallbackFields.push('habs');
  } else {
    habs = 0;
    fallbackFields.push('habs');
  }

  // ── Baños ──
  let banos: number;
  if (isValidPositiveNumber(hubspotBanos)) {
    banos = hubspotBanos;
  } else if (match) {
    banos = match.rule.banos;
    fallbackFields.push('banos');
  } else {
    banos = 0;
    fallbackFields.push('banos');
  }

  return ok({
    tipologia,
    habs,
    banos,
    source,
    confidence,
    mismatch,
    usedFallback: fallbackFields.length > 0,
    fallbackFields,
    unmappedArea: !areaMatched, // INDEPENDIENTE de source
    renderPath: assetRule?.renderPath,
    floorplanPath: assetRule?.floorplanPath,
  });
}
