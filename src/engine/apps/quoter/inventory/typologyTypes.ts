/**
 * FocuxAI Engine™ — Typology Types & Resolution (v2)
 *
 * Core types para la resolución de tipologías multi-proyecto.
 *
 * v2 changes (Architect review):
 *   - Quitar 'sinco' de TypologySource (se agrega cuando exista sincoTipologia param)
 *   - normalizeArea() para comparación segura IEEE 754
 *   - validateTypologyRules() detecta duplicados/ambigüedad
 *   - findMatchingRule() usa closest-match por distancia (no rangos inclusivos dobles)
 *   - getComparableArea() preserva precisión >2 decimales (fix midpoint 43.495)
 *   - computeSafeTolerances() retorna Result<T, EngineError> (nunca throw)
 *   - mismatch mejorado con conflictSource
 *
 * REGLA: unmappedArea → quarantine. NUNCA silent fallback.
 *
 * @since v2.0.0 — Multi-proyecto (Fase A)
 * @since v2.1.0 — Architect review fixes
 */

import type { Result } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';
import { ok, err } from '@/engine/core/types/Result';
import { SchemaError } from '@/engine/core/errors/EngineError';

// ═══════════════════════════════════════════════════════════
// TypologyRule — Entrada de tabla de tipologías
// ═══════════════════════════════════════════════════════════

/**
 * Una regla de tipología que mapea área construida a sus atributos.
 *
 * Cada proyecto define su propio array de TypologyRule[].
 * La resolución busca el match más cercano dentro de la tolerancia.
 */
export interface TypologyRule {
  /** Código de tipología: "A1", "B2", "D3", etc. */
  readonly tipologia: string;
  /** Área construida en m² — key primario para matching */
  readonly area: number;
  /** Cantidad de habitaciones */
  readonly habs: number;
  /** Cantidad de baños */
  readonly banos: number;
  /**
   * Ruta relativa al render (desde /assets/).
   * Fase A: ruta local en repo. Ej: "porto-sabbia/render-A1.png"
   * Fase B: URL de HubSpot File Manager.
   * Opcional — si no existe, el frontend muestra placeholder.
   */
  readonly renderPath?: string;
  /**
   * Ruta relativa al plano (desde /assets/).
   * Misma convención que renderPath.
   */
  readonly floorplanPath?: string;
}

// ═══════════════════════════════════════════════════════════
// TypologyResolution — Resultado con source tracking
// ═══════════════════════════════════════════════════════════

/**
 * Fuentes posibles de resolución de tipología, en orden de prioridad.
 *
 * hubspot:    HubSpot tiene el campo poblado y válido → se usa directo
 * rule_match: Ni HubSpot ni Sinco tienen → se resuelve por área via TypologyRule[]
 * unmapped:   El área no matchea ninguna regla → quarantine obligatorio
 *
 * NOTA: 'sinco' se agregará cuando implementemos sincoTipologia como parámetro.
 */
export type TypologySource = 'hubspot' | 'rule_match' | 'unmapped';

export interface TypologyResolution {
  /** Tipología resuelta. "?" si unmapped. */
  readonly tipologia: string;
  readonly habs: number;
  readonly banos: number;
  /** De dónde salió la resolución */
  readonly source: TypologySource;
  /** Confianza: 1.0 = exacto, 0.9 = dentro de tolerancia, 0.0 = unmapped */
  readonly confidence: number;
  /**
   * Mismatch entre la tipología que HubSpot reporta y lo que el área sugiere.
   * Solo presente cuando ambas fuentes dan valores diferentes.
   */
  readonly mismatch?: {
    readonly preferred: string;
    readonly conflicting: string;
    readonly conflictSource: 'rule_match';
  };
  /** true si se aplicó algún fallback (no venía de HubSpot directo) */
  readonly usedFallback: boolean;
  /** Campos que usaron fallback */
  readonly fallbackFields: readonly string[];
  /**
   * true si el área no matchea ninguna regla.
   * INDEPENDIENTE de source — si HubSpot trae tipología pero el área
   * no está en las reglas, esto es true.
   * REGLA CERRADA: unmappedArea=true → quarantine. Sin excepciones en Fase A.
   */
  readonly unmappedArea: boolean;
  /** Ruta del render si la regla la define */
  readonly renderPath?: string;
  /** Ruta del plano si la regla la define */
  readonly floorplanPath?: string;
}

// ═══════════════════════════════════════════════════════════
// Normalización de áreas (IEEE 754 safe)
// ═══════════════════════════════════════════════════════════

/** Epsilon para comparación de floats normalizados */
const AREA_EPSILON = 1e-10;

/**
 * Normaliza área a 2 decimales para comparación segura.
 * Evita edge cases de IEEE 754 floating point.
 */
export function normalizeArea(area: number): number {
  return Math.round((area + Number.EPSILON) * 100) / 100;
}

/** Valida que un área sea un número finito positivo */
export function isValidArea(area: number): boolean {
  return Number.isFinite(area) && area > 0;
}

/**
 * Área comparable para matching: normaliza a 2 decimales EXCEPTO cuando
 * el input tiene más de 2 decimales significativos (ej: 43.495).
 *
 * Preserves inputs with meaningful precision beyond 2 decimals.
 * This prevents ambiguous midpoint values like 43.495 from being
 * rounded into a valid 2-decimal rule such as 43.50.
 *
 * Regla: si la diferencia entre input y su normalización > AREA_EPSILON,
 * el input tiene precisión extra → preservar valor original para comparación.
 */
export function getComparableArea(area: number): number {
  const rounded = normalizeArea(area);
  const hasMoreThanTwoDecimals = Math.abs(area - rounded) > AREA_EPSILON;
  return hasMoreThanTwoDecimals ? area : rounded;
}

// ═══════════════════════════════════════════════════════════
// Validación de reglas de tipología — Structured Issues (v2.1)
// ═══════════════════════════════════════════════════════════

/**
 * Códigos de issue de validación de reglas.
 * Estos son INTERNOS — no aparecen en ErrorCode del EngineError.
 * SCHEMA_TYPOLOGY_RULES_INVALID encapsula todos estos issues.
 */
export type TypologyRuleValidationIssueCode =
  | 'EMPTY_TIPOLOGIA'
  | 'INVALID_AREA'
  | 'DUPLICATE_AREA'
  | 'MISSING_ASSET_PATH';

/**
 * Issue estructurado de validación de regla de tipología.
 * Reemplaza las strings planas para mejor testeo y logging.
 */
export interface TypologyRuleValidationIssue {
  readonly code: TypologyRuleValidationIssueCode;
  readonly message: string;
  readonly tipologia: string;
  readonly area: number;
  readonly context?: Record<string, unknown>;
}

export interface TypologyRulesValidation {
  readonly isValid: boolean;
  readonly issues: readonly TypologyRuleValidationIssue[];
  readonly warnings: readonly TypologyRuleValidationIssue[];
}

/**
 * Valida un array de TypologyRule[] antes de usarlas.
 * Detecta: áreas duplicadas, campos vacíos, áreas inválidas.
 *
 * DEBE ejecutarse antes de computeSafeTolerances().
 * Si !isValid → el sistema NO debe resolver tipologías con estas reglas.
 *
 * v2.1: Retorna TypologyRuleValidationIssue[] en vez de string[].
 */
export function validateTypologyRules(rules: readonly TypologyRule[]): TypologyRulesValidation {
  const issues: TypologyRuleValidationIssue[] = [];
  const warnings: TypologyRuleValidationIssue[] = [];
  const seenAreas = new Map<number, string[]>();

  for (const rule of rules) {
    // Validar campos requeridos
    if (!rule.tipologia || rule.tipologia.trim() === '') {
      issues.push({
        code: 'EMPTY_TIPOLOGIA',
        message: `Tipología vacía para area=${rule.area}`,
        tipologia: rule.tipologia ?? '',
        area: rule.area,
      });
    }
    if (!isValidArea(rule.area)) {
      issues.push({
        code: 'INVALID_AREA',
        message: `Área inválida ${rule.area} para tipología "${rule.tipologia}"`,
        tipologia: rule.tipologia ?? '',
        area: rule.area,
      });
      continue; // no podemos normalizar un área inválida
    }

    // Detectar áreas duplicadas (normalizado a 2 decimales)
    const normalizedArea = normalizeArea(rule.area);
    const existing = seenAreas.get(normalizedArea) ?? [];
    existing.push(rule.tipologia);
    seenAreas.set(normalizedArea, existing);

    // Warnings para assets faltantes
    if (!rule.renderPath) {
      warnings.push({
        code: 'MISSING_ASSET_PATH',
        message: `Render faltante para "${rule.tipologia}"`,
        tipologia: rule.tipologia,
        area: rule.area,
        context: { assetType: 'render' },
      });
    }
    if (!rule.floorplanPath) {
      warnings.push({
        code: 'MISSING_ASSET_PATH',
        message: `Floorplan faltante para "${rule.tipologia}"`,
        tipologia: rule.tipologia,
        area: rule.area,
        context: { assetType: 'floorplan' },
      });
    }
  }

  // Detectar áreas duplicadas
  for (const [area, tipologias] of seenAreas.entries()) {
    if (tipologias.length > 1) {
      issues.push({
        code: 'DUPLICATE_AREA',
        message: `Área ${area} duplicada en tipologías: ${tipologias.join(', ')}`,
        tipologia: tipologias.join(','),
        area,
        context: { duplicates: tipologias },
      });
    }
  }

  return { isValid: issues.length === 0, issues, warnings };
}

// ═══════════════════════════════════════════════════════════
// ComputedTolerance — Resultado de tolerancia por regla
// ═══════════════════════════════════════════════════════════

/**
 * Resultado de tolerancia computada para una regla.
 * tolerance define el radio máximo alrededor del área central.
 */
export interface ComputedTolerance {
  readonly rule: TypologyRule;
  /** Tolerancia en m² (distancia máxima al centro) */
  readonly tolerance: number;
}

/** Tolerancia por defecto cuando hay una sola regla (en m²) */
const DEFAULT_SINGLE_RULE_TOLERANCE = 0.5;

// ═══════════════════════════════════════════════════════════
// computeSafeTolerances — Auto-cálculo de tolerancia
// ═══════════════════════════════════════════════════════════

/**
 * Calcula tolerancias seguras para TODAS las reglas de un proyecto.
 *
 * Algoritmo:
 *   Para cada regla, la tolerancia = mitad de la distancia al vecino más cercano.
 *   Esto GARANTIZA que ningún área cae en dos reglas simultáneamente.
 *
 * Retorna Result — nunca throw.
 * Si las reglas son inválidas, retorna err(SchemaError).
 *
 * @param rules — Array de TypologyRule del proyecto
 * @returns Result con tolerancias computadas o error de validación
 */
export function computeSafeTolerances(
  rules: readonly TypologyRule[],
): Result<readonly ComputedTolerance[], EngineError> {
  if (rules.length === 0) {
    return err(SchemaError.typologyRulesEmpty());
  }

  // Validar reglas antes de computar
  const validation = validateTypologyRules(rules);
  if (!validation.isValid) {
    return err(SchemaError.typologyRulesInvalid(validation.issues));
  }

  // Ordenar por área para encontrar vecinos
  const sorted = [...rules].sort((a, b) => a.area - b.area);

  const computed: ComputedTolerance[] = sorted.map((rule, idx) => {
    let minDistance = DEFAULT_SINGLE_RULE_TOLERANCE * 2; // default si no hay vecinos

    // Distancia al vecino izquierdo
    if (idx > 0) {
      const dist = normalizeArea(rule.area) - normalizeArea(sorted[idx - 1].area);
      if (dist > 0) minDistance = Math.min(minDistance, dist);
    }

    // Distancia al vecino derecho
    if (idx < sorted.length - 1) {
      const dist = normalizeArea(sorted[idx + 1].area) - normalizeArea(rule.area);
      if (dist > 0) minDistance = Math.min(minDistance, dist);
    }

    // Tolerancia = mitad de la distancia mínima (no colisiona con vecino)
    const tolerance = minDistance / 2;

    return { rule, tolerance };
  });

  return ok(computed);
}

// ═══════════════════════════════════════════════════════════
// findMatchingRule — Closest match por distancia
// ═══════════════════════════════════════════════════════════

/**
 * Busca la TypologyRule más cercana al área dada, dentro de su tolerancia.
 *
 * v2: Usa distancia al centro en vez de rangos inclusivos dobles.
 * Si hay empate (dos reglas equidistantes) → retorna null (ambigüedad).
 *
 * @param area — Área construida de la unidad
 * @param tolerances — Tolerancias pre-computadas (output de computeSafeTolerances)
 * @returns La regla matcheada y su confianza, o null si no hay match
 */
export function findMatchingRule(
  area: number,
  tolerances: readonly ComputedTolerance[],
): { rule: TypologyRule; confidence: number } | null {
  // Usar getComparableArea para preservar precisión >2 decimales
  // Esto evita que normalizeArea(43.495) → 43.50 haga falso match con C2
  const comparableArea = getComparableArea(area);

  let best: { ct: ComputedTolerance; distance: number } | null = null;
  let tie = false;

  for (const ct of tolerances) {
    const ruleArea = normalizeArea(ct.rule.area);
    const distance = Math.abs(comparableArea - ruleArea);

    // Fuera de tolerancia (con AREA_EPSILON de margen) → skip
    if (distance > ct.tolerance + AREA_EPSILON) continue;

    if (!best || distance < best.distance - AREA_EPSILON) {
      // Nuevo mejor candidato (estrictamente mejor)
      best = { ct, distance };
      tie = false;
    } else if (Math.abs(distance - best.distance) <= AREA_EPSILON) {
      // Empate → ambigüedad
      tie = true;
    }
  }

  // Empate o sin match → null (caller trata como unmapped)
  if (!best || tie) return null;

  return {
    rule: best.ct.rule,
    confidence: best.distance < AREA_EPSILON ? 1.0 : 0.9,
  };
}
