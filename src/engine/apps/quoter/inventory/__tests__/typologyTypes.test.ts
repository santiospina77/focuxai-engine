/**
 * Tests — typologyTypes.ts (v2)
 *
 * Valida:
 *   1. validateTypologyRules() detecta duplicados y campos inválidos
 *   2. computeSafeTolerances() retorna Result y genera tolerancias no-colisionantes
 *   3. findMatchingRule() usa closest-match por distancia (no rangos inclusivos dobles)
 *   4. normalizeArea() maneja IEEE 754 edge cases
 *   5. El gap C2/C3 (0.01m²) se maneja correctamente
 *   6. Edge cases: array vacío, una sola regla, áreas duplicadas, empates
 */

import {
  computeSafeTolerances,
  findMatchingRule,
  validateTypologyRules,
  normalizeArea,
  getComparableArea,
  isValidArea,
  type TypologyRule,
} from '../typologyTypes';
import { PORTO_SABBIA_SUITE_T1_RULES } from '../clientConfigs/portoSabbiaTypologyRules';

// ═══════════════════════════════════════════════════════════
// normalizeArea
// ═══════════════════════════════════════════════════════════

describe('normalizeArea', () => {
  it('normalizes to 2 decimal places', () => {
    expect(normalizeArea(34.21)).toBe(34.21);
    expect(normalizeArea(34.215)).toBe(34.22);
    expect(normalizeArea(34.214)).toBe(34.21);
  });

  it('handles IEEE 754 edge cases', () => {
    // 0.1 + 0.2 = 0.30000000000000004
    expect(normalizeArea(0.1 + 0.2)).toBe(0.3);
  });
});

describe('getComparableArea', () => {
  it('returns normalized value for 2-decimal inputs', () => {
    expect(getComparableArea(34.21)).toBe(34.21);
    expect(getComparableArea(43.50)).toBe(43.50);
    expect(getComparableArea(43.49)).toBe(43.49);
  });

  it('preserves precision for >2 decimal inputs', () => {
    // 43.495 has 3 decimals — normalizeArea would round to 43.50
    // getComparableArea must preserve 43.495
    expect(getComparableArea(43.495)).toBe(43.495);
    expect(getComparableArea(34.215)).toBe(34.215);
  });

  it('normalizes IEEE 754 noise on 2-decimal values', () => {
    // 0.1 + 0.2 = 0.30000000000000004 — should normalize
    expect(getComparableArea(0.1 + 0.2)).toBe(0.3);
  });
});

describe('isValidArea', () => {
  it('rejects zero, negative, NaN, Infinity', () => {
    expect(isValidArea(0)).toBe(false);
    expect(isValidArea(-1)).toBe(false);
    expect(isValidArea(NaN)).toBe(false);
    expect(isValidArea(Infinity)).toBe(false);
  });

  it('accepts positive finite numbers', () => {
    expect(isValidArea(34.21)).toBe(true);
    expect(isValidArea(0.01)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// validateTypologyRules
// ═══════════════════════════════════════════════════════════

describe('validateTypologyRules', () => {
  it('validates Porto Sabbia rules as valid', () => {
    const result = validateTypologyRules(PORTO_SABBIA_SUITE_T1_RULES);
    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects duplicate areas with structured issue', () => {
    const rules: TypologyRule[] = [
      { tipologia: 'X1', area: 50.0, habs: 1, banos: 1 },
      { tipologia: 'X2', area: 50.0, habs: 2, banos: 1 },
    ];
    const result = validateTypologyRules(rules);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.code === 'DUPLICATE_AREA')).toBe(true);
    const dup = result.issues.find(i => i.code === 'DUPLICATE_AREA')!;
    expect(dup.area).toBe(50.0);
    expect(dup.context?.duplicates).toEqual(['X1', 'X2']);
  });

  it('detects empty tipologia with structured issue', () => {
    const rules: TypologyRule[] = [
      { tipologia: '', area: 50.0, habs: 1, banos: 1 },
    ];
    const result = validateTypologyRules(rules);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.code === 'EMPTY_TIPOLOGIA')).toBe(true);
  });

  it('detects invalid area with structured issue', () => {
    const rules: TypologyRule[] = [
      { tipologia: 'X1', area: -5, habs: 1, banos: 1 },
    ];
    const result = validateTypologyRules(rules);
    expect(result.isValid).toBe(false);
    expect(result.issues.some(i => i.code === 'INVALID_AREA')).toBe(true);
  });

  it('warns about missing render/floorplan paths with structured issue', () => {
    const rules: TypologyRule[] = [
      { tipologia: 'X1', area: 50.0, habs: 1, banos: 1 },
    ];
    const result = validateTypologyRules(rules);
    expect(result.isValid).toBe(true); // warnings don't block
    expect(result.warnings.some(w => w.code === 'MISSING_ASSET_PATH' && w.context?.assetType === 'render')).toBe(true);
    expect(result.warnings.some(w => w.code === 'MISSING_ASSET_PATH' && w.context?.assetType === 'floorplan')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// computeSafeTolerances
// ═══════════════════════════════════════════════════════════

describe('computeSafeTolerances', () => {
  it('returns err for empty rules', () => {
    const result = computeSafeTolerances([]);
    expect(result.isErr()).toBe(true);
  });

  it('returns err for invalid rules (duplicate area)', () => {
    const rules: TypologyRule[] = [
      { tipologia: 'X1', area: 50.0, habs: 1, banos: 1 },
      { tipologia: 'X2', area: 50.0, habs: 2, banos: 1 },
    ];
    const result = computeSafeTolerances(rules);
    expect(result.isErr()).toBe(true);
  });

  it('handles single rule with default tolerance', () => {
    const rules: TypologyRule[] = [{ tipologia: 'X1', area: 50.0, habs: 2, banos: 1 }];
    const result = computeSafeTolerances(rules);
    expect(result.isOk()).toBe(true);
    const tolerances = result.unwrap();
    expect(tolerances).toHaveLength(1);
    expect(tolerances[0].tolerance).toBe(0.5); // DEFAULT_SINGLE_RULE_TOLERANCE
  });

  it('produces valid tolerances for all Porto Sabbia rules', () => {
    const result = computeSafeTolerances(PORTO_SABBIA_SUITE_T1_RULES);
    expect(result.isOk()).toBe(true);
    const tolerances = result.unwrap();
    expect(tolerances).toHaveLength(17);
  });

  it('handles C2 (43.50) and C3 (43.49) gap of 0.01m²', () => {
    const result = computeSafeTolerances(PORTO_SABBIA_SUITE_T1_RULES);
    expect(result.isOk()).toBe(true);
    const tolerances = result.unwrap();
    const c2 = tolerances.find(t => t.rule.tipologia === 'C2')!;
    const c3 = tolerances.find(t => t.rule.tipologia === 'C3')!;

    expect(c2).toBeDefined();
    expect(c3).toBeDefined();

    // Tolerance must be <= 0.005 (half of 0.01 gap)
    expect(c2.tolerance).toBeLessThanOrEqual(0.005);
    expect(c3.tolerance).toBeLessThanOrEqual(0.005);
  });

  it('all tolerances are positive', () => {
    const result = computeSafeTolerances(PORTO_SABBIA_SUITE_T1_RULES);
    const tolerances = result.unwrap();
    for (const t of tolerances) {
      expect(t.tolerance).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// findMatchingRule
// ═══════════════════════════════════════════════════════════

describe('findMatchingRule', () => {
  const tolerances = computeSafeTolerances(PORTO_SABBIA_SUITE_T1_RULES).unwrap();

  it('finds exact match with confidence 1.0', () => {
    const result = findMatchingRule(34.21, tolerances);
    expect(result).not.toBeNull();
    expect(result!.rule.tipologia).toBe('A1');
    expect(result!.confidence).toBe(1.0);
  });

  it('finds within tolerance with confidence 0.9', () => {
    const result = findMatchingRule(34.22, tolerances);
    expect(result).not.toBeNull();
    expect(result!.rule.tipologia).toBe('A1');
    expect(result!.confidence).toBe(0.9);
  });

  it('returns null for area outside all ranges', () => {
    const result = findMatchingRule(100.0, tolerances);
    expect(result).toBeNull();
  });

  it('returns null for area = 0', () => {
    const result = findMatchingRule(0, tolerances);
    expect(result).toBeNull();
  });

  it('correctly distinguishes C2 (43.50) from C3 (43.49)', () => {
    const c2 = findMatchingRule(43.50, tolerances);
    const c3 = findMatchingRule(43.49, tolerances);

    expect(c2).not.toBeNull();
    expect(c3).not.toBeNull();
    expect(c2!.rule.tipologia).toBe('C2');
    expect(c3!.rule.tipologia).toBe('C3');
  });

  it('returns null for exact midpoint between C2 and C3 (ambiguity)', () => {
    // Midpoint: (43.49 + 43.50) / 2 = 43.495
    const result = findMatchingRule(43.495, tolerances);
    // Should be null: equidistant to both C2 and C3
    expect(result).toBeNull();
  });

  it('matches all 17 Porto Sabbia areas exactly', () => {
    for (const rule of PORTO_SABBIA_SUITE_T1_RULES) {
      const result = findMatchingRule(rule.area, tolerances);
      expect(result).not.toBeNull();
      expect(result!.rule.tipologia).toBe(rule.tipologia);
      expect(result!.confidence).toBe(1.0);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// backward compatibility
// ═══════════════════════════════════════════════════════════

describe('backward compatibility', () => {
  it('PORTO_SABBIA_SUITE_T1_RULES has exactly 17 entries', () => {
    expect(PORTO_SABBIA_SUITE_T1_RULES).toHaveLength(17);
  });

  it('all rules have required fields', () => {
    for (const rule of PORTO_SABBIA_SUITE_T1_RULES) {
      expect(rule.tipologia).toBeTruthy();
      expect(rule.area).toBeGreaterThan(0);
      expect(rule.habs).toBeGreaterThanOrEqual(0);
      expect(rule.banos).toBeGreaterThanOrEqual(0);
    }
  });

  it('all rules have render and floorplan paths', () => {
    for (const rule of PORTO_SABBIA_SUITE_T1_RULES) {
      expect(rule.renderPath).toBeTruthy();
      expect(rule.floorplanPath).toBeTruthy();
    }
  });

  it('rules are frozen (immutable)', () => {
    expect(Object.isFrozen(PORTO_SABBIA_SUITE_T1_RULES)).toBe(true);
    for (const rule of PORTO_SABBIA_SUITE_T1_RULES) {
      expect(Object.isFrozen(rule)).toBe(true);
    }
  });

  it('legacy areas match original AREA_TIPOLOGIA map keys', () => {
    const originalAreas = [
      34.21, 35.11, 39.34,
      40.92, 41.53, 41.28, 42.53,
      43.46, 43.50, 43.49, 43.12,
      45.04,
      46.38, 46.01, 46.33, 46.76,
      54.19,
    ];

    const legacyAreas = PORTO_SABBIA_SUITE_T1_RULES.map(r => r.area).sort((a, b) => a - b);
    const sortedOriginal = [...originalAreas].sort((a, b) => a - b);

    expect(legacyAreas).toEqual(sortedOriginal);
  });
});
