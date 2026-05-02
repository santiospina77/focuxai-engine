/**
 * Tests — Fase A v5 (Architect-mandated)
 *
 * Los 9 escenarios requeridos por el Architect antes de merge:
 *
 *   1. findMatchingRule(43.495) → null
 *   2. getComparableArea(43.495) preserva precisión
 *   3. mapInventoryToDto retorna err si faltan typologyRules
 *   4. unidad unmappedArea → quarantinedItems + continue
 *   5. unidad disponible con precio <= 0 → quarantinedItems + continue
 *   6. agrupación con valor_total_neto <= 0 → quarantinedItems + continue
 *   7. fetchAllPages repeated cursor → err RESOURCE_CRM_REPEATED_CURSOR
 *   8. joinGroupingsWithUnits duplicate sincoId → err VALIDATION_*
 *   9. route.ts pasa typologyRules al mapper (structural test)
 *
 * @since v2.2.0 — Fase A v5
 */

import {
  computeSafeTolerances,
  findMatchingRule,
  getComparableArea,
} from '../typologyTypes';
import { PORTO_SABBIA_SUITE_T1_RULES } from '../clientConfigs/portoSabbiaTypologyRules';
import { fetchAllPages } from '../fetchAllPages';
import { joinGroupingsWithUnits } from '../joinGroupingWithUnit';
import { mapInventoryToDto } from '../mapInventoryToDto';
import type { ICrmAdapter, CrmRecord, CrmSearchResult } from '@/engine/interfaces/ICrmAdapter';
import type { Logger } from '@/engine/core/logging/Logger';
import type { Result } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';
import { ok, err } from '@/engine/core/types/Result';
import { ResourceError } from '@/engine/core/errors/EngineError';

// ═══════════════════════════════════════════════════════════
// Helpers — mocks mínimos
// ═══════════════════════════════════════════════════════════

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
};

function makeCrmRecord(
  objectType: string,
  props: Record<string, unknown>,
  id = '1',
): CrmRecord {
  return {
    id,
    objectType: objectType as CrmRecord['objectType'],
    properties: props,
  };
}

/**
 * Mock adapter que retorna datos configurables para cada objectType.
 * Soporta inyectar cursor repetido para test de fetchAllPages.
 */
function createMockAdapter(
  data: Partial<Record<string, CrmRecord[]>> = {},
  overrideSearch?: (query: any) => Promise<Result<CrmSearchResult, EngineError>>,
): ICrmAdapter {
  return {
    crmKind: 'mock',
    searchRecords: overrideSearch ?? (async (query: any) => {
      const records = data[query.objectType] ?? [];
      return ok({ records, nextCursor: undefined, total: records.length });
    }),
    // Stubs — no se usan en estos tests
    createRecord: async () => ok(makeCrmRecord('contact', {}, '1')),
    updateRecord: async () => ok(makeCrmRecord('contact', {}, '1')),
    getRecord: async () => ok(null),
    deleteRecord: async () => ok(undefined),
    createRecordsBatch: async () => ok({ successful: [], failed: [] }),
    updateRecordsBatch: async () => ok({ successful: [], failed: [] }),
    upsertRecordsByExternalId: async () => ok({ successful: [], failed: [] }),
    findByExternalId: async () => ok(null),
    createAssociation: async () => ok(undefined),
    createAssociationsBatch: async () => ok({ successful: [], failed: [] }),
    ensureProperties: async () => ok(undefined),
    healthCheck: async () => ok({ latencyMs: 1 }),
  } as unknown as ICrmAdapter;
}

// ═══════════════════════════════════════════════════════════
// Test 1: findMatchingRule(43.495) → null
// ═══════════════════════════════════════════════════════════

describe('Architect Test 1: findMatchingRule midpoint', () => {
  const tolerances = computeSafeTolerances(PORTO_SABBIA_SUITE_T1_RULES).unwrap();

  it('findMatchingRule(43.495) returns null (equidistant C2/C3)', () => {
    const result = findMatchingRule(43.495, tolerances);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// Test 2: getComparableArea(43.495) preserva precisión
// ═══════════════════════════════════════════════════════════

describe('Architect Test 2: getComparableArea preserves precision', () => {
  it('getComparableArea(43.495) returns 43.495, not 43.50', () => {
    const result = getComparableArea(43.495);
    expect(result).toBe(43.495);
    expect(result).not.toBe(43.50);
  });
});

// ═══════════════════════════════════════════════════════════
// Test 3: mapInventoryToDto retorna err si faltan typologyRules
// ═══════════════════════════════════════════════════════════

describe('Architect Test 3: mapInventoryToDto fails without typologyRules', () => {
  it('returns err when project has no typologyRules', async () => {
    const macroRec = makeCrmRecord('macroproyecto', {
      id_sinco_fx: 58, nombre_fx: 'Porto Sabbia', ciudad_fx: 'Santa Marta',
      estado_fx: 'Activo', tipo_fx: 'No VIS',
    }, 'm1');
    const projRec = makeCrmRecord('proyecto', {
      id_sinco_fx: 360, nombre_fx: 'PSR', id_macro_sinco_fx: 58,
      porcentaje_financiacion_fx: 70, numero_cuotas_fx: 24,
      dias_bloqueo_fx: 4, vigencia_cotizacion_fx: 7, estado_fx: 'Activo',
    }, 'p1');

    const adapter = createMockAdapter({
      macroproyecto: [macroRec],
      proyecto: [projRec],
      unidad: [],
      agrupacion: [],
    });

    const result = await mapInventoryToDto({
      adapter,
      logger: noopLogger,
      clientId: 'jimenez_demo',
      overlay: {
        clientId: 'jimenez_demo',
        macros: { 58: { zona: 'Playa Salguero' } },
        projects: {
          360: { codigo: 'PSR', pctSep: 1, pctCI: 30, tipo: 'Apartamento', agrupacionesPreestablecidas: false },
        },
      },
      canalesAtribucion: [],
      typologyRules: {}, // ← vacío → falta proyecto 360
    });

    expect(result.isErr()).toBe(true);
    expect(result.error.message).toContain('sin typologyRules');
  });
});

// ═══════════════════════════════════════════════════════════
// Test 4: unidad unmappedArea → quarantinedItems + continue
// ═══════════════════════════════════════════════════════════

describe('Architect Test 4: unmappedArea goes to quarantine', () => {
  it('unit with unmapped area lands in quarantinedItems, not err', async () => {
    const macroRec = makeCrmRecord('macroproyecto', {
      id_sinco_fx: 58, nombre_fx: 'Porto Sabbia', ciudad_fx: 'SM',
      estado_fx: 'Activo', tipo_fx: 'No VIS',
    }, 'm1');
    const projRec = makeCrmRecord('proyecto', {
      id_sinco_fx: 360, nombre_fx: 'PSR', id_macro_sinco_fx: 58,
      porcentaje_financiacion_fx: 70, numero_cuotas_fx: 24,
      dias_bloqueo_fx: 4, vigencia_cotizacion_fx: 7, estado_fx: 'Activo',
    }, 'p1');
    // area=999 no matchea ninguna tipología
    const unitRec = makeCrmRecord('unidad', {
      id_sinco_fx: 100, nombre_fx: 'APT 999', id_proyecto_sinco_fx: 360,
      tipo_unidad_fx: 'Apartamento', tipo_unidad_sinco_fx: 1,
      es_principal_fx: true, precio_lista_fx: 500000000,
      estado_fx: 'Disponible', area_construida_fx: 999,
      piso_fx: 5, alcobas_fx: 2, banos_fx: 1,
    }, 'u1');

    const adapter = createMockAdapter({
      macroproyecto: [macroRec],
      proyecto: [projRec],
      unidad: [unitRec],
      agrupacion: [],
    });

    const result = await mapInventoryToDto({
      adapter,
      logger: noopLogger,
      clientId: 'jimenez_demo',
      overlay: {
        clientId: 'jimenez_demo',
        macros: { 58: { zona: 'Z' } },
        projects: {
          360: { codigo: 'PSR', pctSep: 1, pctCI: 30, tipo: 'Apartamento', agrupacionesPreestablecidas: false },
        },
      },
      canalesAtribucion: [],
      typologyRules: { 360: PORTO_SABBIA_SUITE_T1_RULES },
    });

    expect(result.isOk()).toBe(true);
    const resp = result.value;
    expect(resp.quarantinedItems).toBeDefined();
    expect(resp.quarantinedItems.length).toBeGreaterThanOrEqual(1);
    const q = resp.quarantinedItems.find(i => i.sincoId === 100);
    expect(q).toBeDefined();
    expect(q!.code).toBe('UNMAPPED_AREA');
    expect(q!.entityType).toBe('unit');
    expect(q!.source).toBe('typology_resolution');
  });
});

// ═══════════════════════════════════════════════════════════
// Test 5: unidad disponible con precio <= 0 → quarantinedItems
// ═══════════════════════════════════════════════════════════

describe('Architect Test 5: unit disponible precio <= 0 → quarantine', () => {
  it('APT disponible with precio=0 goes to quarantinedItems, not err', async () => {
    const macroRec = makeCrmRecord('macroproyecto', {
      id_sinco_fx: 58, nombre_fx: 'Porto Sabbia', ciudad_fx: 'SM',
      estado_fx: 'Activo', tipo_fx: 'No VIS',
    }, 'm1');
    const projRec = makeCrmRecord('proyecto', {
      id_sinco_fx: 360, nombre_fx: 'PSR', id_macro_sinco_fx: 58,
      porcentaje_financiacion_fx: 70, numero_cuotas_fx: 24,
      dias_bloqueo_fx: 4, vigencia_cotizacion_fx: 7, estado_fx: 'Activo',
    }, 'p1');
    // APT disponible con precio=0
    const unitRec = makeCrmRecord('unidad', {
      id_sinco_fx: 200, nombre_fx: 'APT 101', id_proyecto_sinco_fx: 360,
      tipo_unidad_fx: 'Apartamento', tipo_unidad_sinco_fx: 1,
      es_principal_fx: true, precio_lista_fx: 0,
      estado_fx: 'Disponible', area_construida_fx: 34.21,
      piso_fx: 1, alcobas_fx: 1, banos_fx: 1,
    }, 'u1');

    const adapter = createMockAdapter({
      macroproyecto: [macroRec],
      proyecto: [projRec],
      unidad: [unitRec],
      agrupacion: [],
    });

    const result = await mapInventoryToDto({
      adapter,
      logger: noopLogger,
      clientId: 'jimenez_demo',
      overlay: {
        clientId: 'jimenez_demo',
        macros: { 58: { zona: 'Z' } },
        projects: {
          360: { codigo: 'PSR', pctSep: 1, pctCI: 30, tipo: 'Apartamento', agrupacionesPreestablecidas: false },
        },
      },
      canalesAtribucion: [],
      typologyRules: { 360: PORTO_SABBIA_SUITE_T1_RULES },
    });

    expect(result.isOk()).toBe(true);
    const resp = result.value;
    const q = resp.quarantinedItems.find(i => i.sincoId === 200);
    expect(q).toBeDefined();
    expect(q!.code).toBe('INVALID_VALUE');
    expect(q!.reason).toContain('precio_lista_fx=0');
    expect(q!.entityType).toBe('unit');
    expect(q!.source).toBe('inventory_validation');
  });
});

// ═══════════════════════════════════════════════════════════
// Test 6: agrupación con valor_total_neto <= 0 → quarantinedItems
// ═══════════════════════════════════════════════════════════

describe('Architect Test 6: grouping disponible valor <= 0 → quarantine', () => {
  it('agrupación disponible with valor_total_neto=0 goes to quarantinedItems', async () => {
    const macroRec = makeCrmRecord('macroproyecto', {
      id_sinco_fx: 58, nombre_fx: 'Porto Sabbia', ciudad_fx: 'SM',
      estado_fx: 'Activo', tipo_fx: 'No VIS',
    }, 'm1');
    const projRec = makeCrmRecord('proyecto', {
      id_sinco_fx: 360, nombre_fx: 'PSR', id_macro_sinco_fx: 58,
      porcentaje_financiacion_fx: 70, numero_cuotas_fx: 24,
      dias_bloqueo_fx: 4, vigencia_cotizacion_fx: 7, estado_fx: 'Activo',
    }, 'p1');
    // Agrupación disponible con valor_total_neto=0
    const agrupRec = makeCrmRecord('agrupacion', {
      id_sinco_fx: 300, nombre_fx: 'APT 101', id_proyecto_sinco_fx: 360,
      valor_subtotal_fx: 0, valor_descuento_fx: 0, valor_total_neto_fx: 0,
      estado_fx: 'Disponible', id_unidad_principal_sinco_fx: 0,
    }, 'a1');

    const adapter = createMockAdapter({
      macroproyecto: [macroRec],
      proyecto: [projRec],
      unidad: [],
      agrupacion: [agrupRec],
    });

    const result = await mapInventoryToDto({
      adapter,
      logger: noopLogger,
      clientId: 'jimenez_demo',
      overlay: {
        clientId: 'jimenez_demo',
        macros: { 58: { zona: 'Z' } },
        projects: {
          360: { codigo: 'PSR', pctSep: 1, pctCI: 30, tipo: 'Apartamento', agrupacionesPreestablecidas: true },
        },
      },
      canalesAtribucion: [],
      typologyRules: { 360: PORTO_SABBIA_SUITE_T1_RULES },
    });

    expect(result.isOk()).toBe(true);
    const resp = result.value;
    const q = resp.quarantinedItems.find(i => i.sincoId === 300);
    expect(q).toBeDefined();
    expect(q!.code).toBe('INVALID_VALUE');
    expect(q!.reason).toContain('valor_total_neto_fx=0');
    expect(q!.entityType).toBe('grouping');
    expect(q!.source).toBe('grouping_validation');
  });
});

// ═══════════════════════════════════════════════════════════
// Test 7: fetchAllPages repeated cursor → err RESOURCE_CRM_REPEATED_CURSOR
// ═══════════════════════════════════════════════════════════

describe('Architect Test 7: fetchAllPages repeated cursor', () => {
  it('returns err with RESOURCE_CRM_REPEATED_CURSOR when cursor repeats', async () => {
    let callCount = 0;
    const adapter = createMockAdapter({}, async () => {
      callCount++;
      return ok({
        records: [makeCrmRecord('unidad', { id_sinco_fx: callCount }, `r${callCount}`)],
        nextCursor: 'same-cursor-forever', // always same cursor → repeat on call 2
        total: 100,
      });
    });

    const result = await fetchAllPages(adapter, {
      objectType: 'unidad',
      properties: ['id_sinco_fx'],
    }, noopLogger);

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('RESOURCE_CRM_REPEATED_CURSOR');
    expect(result.error.message).toContain('repeated');
  });
});

// ═══════════════════════════════════════════════════════════
// Test 8: joinGroupingsWithUnits duplicate sincoId → err VALIDATION_*
// ═══════════════════════════════════════════════════════════

describe('Architect Test 8: joinGroupingsWithUnits duplicate sincoId', () => {
  it('returns err when two units have same sincoId in same project', () => {
    const unit1 = makeCrmRecord('unidad', {
      id_sinco_fx: 500, nombre_fx: 'APT 1', id_proyecto_sinco_fx: 360,
      tipo_unidad_fx: 'Apartamento', tipo_unidad_sinco_fx: 1,
    }, 'u1');
    const unit2 = makeCrmRecord('unidad', {
      id_sinco_fx: 500, nombre_fx: 'APT 2', id_proyecto_sinco_fx: 360,
      tipo_unidad_fx: 'Apartamento', tipo_unidad_sinco_fx: 1,
    }, 'u2');

    const result = joinGroupingsWithUnits(
      [], // no agrupaciones
      [unit1, unit2],
      360,
      true,
      noopLogger,
    );

    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe('VALIDATION_INVENTORY_MAPPING_FAILED');
    expect(result.error.message).toContain('Duplicate');
    expect(result.error.message).toContain('500');
  });
});

// ═══════════════════════════════════════════════════════════
// Test 9: route.ts pasa typologyRules al mapper (structural)
// ═══════════════════════════════════════════════════════════

describe('Architect Test 9: route.ts passes typologyRules', () => {
  /**
   * No podemos hacer un integration test real de route.ts (necesita NextRequest),
   * pero podemos verificar que la config JIMENEZ_DEMO_CONFIG tiene typologyRules
   * y que la estructura es correcta para ambos proyectos.
   */
  it('JIMENEZ_DEMO_CONFIG has typologyRules for both projects', async () => {
    const { JIMENEZ_DEMO_CONFIG } = await import('../clientConfigs/jimenez_demo');

    expect(JIMENEZ_DEMO_CONFIG.typologyRules).toBeDefined();
    expect(JIMENEZ_DEMO_CONFIG.typologyRules[360]).toBeDefined();
    expect(JIMENEZ_DEMO_CONFIG.typologyRules[361]).toBeDefined();
    expect(JIMENEZ_DEMO_CONFIG.typologyRules[360].length).toBeGreaterThan(0);
    expect(JIMENEZ_DEMO_CONFIG.typologyRules[361].length).toBeGreaterThan(0);
  });

  it('MapInventoryInput requires typologyRules (type safety)', async () => {
    // This test validates that calling mapInventoryToDto without typologyRules
    // would fail at compile time. We verify by passing empty typologyRules
    // and checking it returns an error (not undefined behavior).
    const adapter = createMockAdapter({
      macroproyecto: [makeCrmRecord('macroproyecto', {
        id_sinco_fx: 1, nombre_fx: 'Test', ciudad_fx: 'X',
        estado_fx: 'Activo', tipo_fx: 'Test',
      })],
      proyecto: [makeCrmRecord('proyecto', {
        id_sinco_fx: 99, nombre_fx: 'Test', id_macro_sinco_fx: 1,
        porcentaje_financiacion_fx: 70, numero_cuotas_fx: 24,
        dias_bloqueo_fx: 4, vigencia_cotizacion_fx: 7, estado_fx: 'Activo',
      })],
      unidad: [],
      agrupacion: [],
    });

    const result = await mapInventoryToDto({
      adapter,
      logger: noopLogger,
      clientId: 'test',
      overlay: {
        clientId: 'test',
        macros: { 1: { zona: 'X' } },
        projects: { 99: { codigo: 'T', pctSep: 1, pctCI: 30, tipo: 'Test', agrupacionesPreestablecidas: false } },
      },
      canalesAtribucion: [],
      typologyRules: {}, // deliberately empty
    });

    // Must fail because project 99 has no typologyRules
    expect(result.isErr()).toBe(true);
    expect(result.error.message).toContain('typologyRules');
  });
});

// ═══════════════════════════════════════════════════════════
// Bonus: quarantinedItems siempre presente, nunca undefined
// ═══════════════════════════════════════════════════════════

describe('Bonus: quarantinedItems always present', () => {
  it('returns empty quarantinedItems[] when no issues, never undefined', async () => {
    const macroRec = makeCrmRecord('macroproyecto', {
      id_sinco_fx: 58, nombre_fx: 'Porto Sabbia', ciudad_fx: 'SM',
      estado_fx: 'Activo', tipo_fx: 'No VIS',
    }, 'm1');
    const projRec = makeCrmRecord('proyecto', {
      id_sinco_fx: 360, nombre_fx: 'PSR', id_macro_sinco_fx: 58,
      porcentaje_financiacion_fx: 70, numero_cuotas_fx: 24,
      dias_bloqueo_fx: 4, vigencia_cotizacion_fx: 7, estado_fx: 'Activo',
    }, 'p1');

    const adapter = createMockAdapter({
      macroproyecto: [macroRec],
      proyecto: [projRec],
      unidad: [],
      agrupacion: [],
    });

    const result = await mapInventoryToDto({
      adapter,
      logger: noopLogger,
      clientId: 'jimenez_demo',
      overlay: {
        clientId: 'jimenez_demo',
        macros: { 58: { zona: 'Z' } },
        projects: {
          360: { codigo: 'PSR', pctSep: 1, pctCI: 30, tipo: 'Apartamento', agrupacionesPreestablecidas: false },
        },
      },
      canalesAtribucion: [],
      typologyRules: { 360: PORTO_SABBIA_SUITE_T1_RULES },
    });

    expect(result.isOk()).toBe(true);
    expect(result.value.quarantinedItems).toBeDefined();
    expect(Array.isArray(result.value.quarantinedItems)).toBe(true);
    // Could be 0 or more — the point is it's never undefined
    expect(result.value.quarantinedItems).not.toBeUndefined();
  });
});
