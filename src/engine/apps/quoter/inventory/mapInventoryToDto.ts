/**
 * mapInventoryToDto — Orquestador de inventario.
 *
 * Lee los 4 Custom Objects de HubSpot (Macro, Proyecto, Unidad, Agrupación),
 * aplica los helpers puros, y arma el InventoryResponse congelado.
 *
 * FUENTES DE DATOS:
 *   - HubSpot Custom Objects = estructura canónica (macros, proyectos, joins, conteos)
 *   - ClientOverlayConfig = config operativa por sincoId
 *   - canalesAtribucion = inyectados por el caller
 *   - typologyRules = reglas de tipología por proyecto
 *
 * CUARENTENA:
 *   Estática (overlay.excludedUnits): unidades con dato maestro inválido en fuente.
 *   Dinámica (quarantinedItems): unidades/agrupaciones cuyo área no matchea
 *     regla de tipología, tipo desconocido, o error de fallback.
 *   Ambas se excluyen de selectableItems. Ambas se reportan en el response.
 *
 * Retorna Result<InventoryResponse, EngineError> — nunca throw.
 *
 * @since v2.0.0 — Multi-proyecto (Fase A)
 * @since v2.1.0 — Architect review fixes
 * @since v2.2.0 — Migrado a Result, cero throw (Architect review #4)
 */

import type { ICrmAdapter, CrmRecord } from '@/engine/interfaces/ICrmAdapter';
import type { Logger } from '@/engine/core/logging/Logger';
import type { Result } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';
import { ok, err } from '@/engine/core/types/Result';
import { ValidationError } from '@/engine/core/errors/EngineError';

import type {
  InventoryResponse,
  MacroDto,
  ProjectDto,
  ProjectConfig,
  SelectableUnit,
  GroupingRecord,
  CanalOption,
  WarningsDto,
  ClientOverlayConfig,
  QuarantinedInventoryItem,
} from './types';

import { fetchAllPages } from './fetchAllPages';
import { joinGroupingsWithUnits } from './joinGroupingWithUnit';
import { normalizeUnitType } from './normalizeUnitType';
import { parseUnitName } from './parseUnitName';
import { resolveUnitFallbacks } from './resolveUnitFallbacks';
import type { TypologyRule } from './typologyTypes';

// ═══════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════

export interface MapInventoryInput {
  readonly adapter: ICrmAdapter;
  readonly logger: Logger;
  readonly clientId: string;
  readonly overlay: ClientOverlayConfig;
  readonly canalesAtribucion: readonly CanalOption[];
  /**
   * Reglas de tipología por proyecto, indexadas por sincoId.
   * Si un proyecto no tiene reglas → fail hard.
   * @since v2.1 — Architect review: Result propagation
   */
  readonly typologyRules: Readonly<Record<number, readonly TypologyRule[]>>;
}

// ═══════════════════════════════════════════════════════════
// Properties — ALL verified vs JSON v17
// ═══════════════════════════════════════════════════════════

const MACRO_PROPS = ['nombre_fx', 'id_sinco_fx', 'ciudad_fx', 'estado_fx', 'tipo_fx'] as const;

const PROYECTO_PROPS = [
  'nombre_fx', 'id_sinco_fx', 'id_macro_sinco_fx',
  'porcentaje_financiacion_fx', 'numero_cuotas_fx',
  'dias_bloqueo_fx', 'vigencia_cotizacion_fx', 'estado_fx',
] as const;

const UNIDAD_PROPS = [
  'nombre_fx', 'id_sinco_fx', 'id_proyecto_sinco_fx',
  'tipo_unidad_sinco_fx', 'tipo_unidad_fx',
  'es_principal_fx', 'precio_lista_fx', 'estado_fx',
  'area_construida_fx', 'piso_fx', 'alcobas_fx', 'banos_fx',
] as const;

const AGRUPACION_PROPS = [
  'nombre_fx', 'id_sinco_fx', 'id_proyecto_sinco_fx',
  'valor_subtotal_fx', 'valor_descuento_fx', 'valor_total_neto_fx',
  'estado_fx', 'id_unidad_principal_sinco_fx',
] as const;

// ═══════════════════════════════════════════════════════════
// Helpers — nunca throw
// ═══════════════════════════════════════════════════════════

function str(r: CrmRecord, p: string): string {
  return String(r.properties[p] ?? '');
}

function num(r: CrmRecord, p: string): number {
  const v = Number(r.properties[p]);
  return isNaN(v) ? 0 : v;
}

function bool(r: CrmRecord, p: string): boolean | null {
  const v = r.properties[p];
  if (v === 'true' || v === true) return true;
  if (v === 'false' || v === false) return false;
  return null;
}

/** Retorna number > 0 o null. Nunca throw. */
function tryNum(r: CrmRecord, p: string): number | null {
  const v = Number(r.properties[p]);
  return (isNaN(v) || v <= 0) ? null : v;
}

/** Retorna string no vacío o null. Nunca throw. */
function tryStr(r: CrmRecord, p: string): string | null {
  const v = String(r.properties[p] ?? '').trim();
  return v.length === 0 ? null : v;
}

// ═══════════════════════════════════════════════════════════
// Defaults — QuoterClient línea 262-266
// ═══════════════════════════════════════════════════════════

const DEFAULTS = {
  separacion_pct: 5,
  cuota_inicial_pct: 30,
  cuotas_default: 24,
  financiacion_pct: 70,
  dias_bloqueo: 4,
  vigencia_cotizacion: 7,
} as const;

// ═══════════════════════════════════════════════════════════
// Main mapper — retorna Result, nunca throw
// ═══════════════════════════════════════════════════════════

export async function mapInventoryToDto(
  input: MapInventoryInput,
): Promise<Result<InventoryResponse, EngineError>> {
  const { adapter, logger, clientId, overlay, canalesAtribucion, typologyRules } = input;

  if (overlay.clientId !== clientId) {
    return err(ValidationError.mappingFailed(
      `overlay.clientId="${overlay.clientId}" ≠ clientId="${clientId}"`,
      { clientId },
    ));
  }

  // ── Build exclusion set from overlay ──
  const excludedUnitSet = new Set<number>(
    (overlay.excludedUnits ?? []).map((e) => e.sincoId),
  );
  if (excludedUnitSet.size > 0) {
    logger.warn(
      { excludedUnits: [...excludedUnitSet], count: excludedUnitSet.size },
      'mapInventoryToDto: unidades en cuarentena (dato maestro inválido en fuente)',
    );
  }

  logger.info({ clientId }, 'mapInventoryToDto: starting');

  // ── Step 1: Fetch all Custom Objects (secuencial + throttled para respetar rate limit ~4 req/s) ──
  const OBJECT_TYPE_DELAY_MS = 500; // Cooldown between object types to avoid cumulative rate limiting
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const macroResult = await fetchAllPages(adapter, { objectType: 'macroproyecto', properties: [...MACRO_PROPS] }, logger);
  if (macroResult.isErr()) return err(macroResult.error);

  await sleep(OBJECT_TYPE_DELAY_MS);
  const proyectoResult = await fetchAllPages(adapter, { objectType: 'proyecto', properties: [...PROYECTO_PROPS] }, logger);
  if (proyectoResult.isErr()) return err(proyectoResult.error);

  await sleep(OBJECT_TYPE_DELAY_MS);
  const unidadResult = await fetchAllPages(adapter, { objectType: 'unidad', properties: [...UNIDAD_PROPS] }, logger);
  if (unidadResult.isErr()) return err(unidadResult.error);

  await sleep(OBJECT_TYPE_DELAY_MS);
  const agrupacionResult = await fetchAllPages(adapter, { objectType: 'agrupacion', properties: [...AGRUPACION_PROPS] }, logger);
  if (agrupacionResult.isErr()) return err(agrupacionResult.error);

  const macroRecords = macroResult.value.records;
  const proyectoRecords = proyectoResult.value.records;
  const unidadRecords = unidadResult.value.records;
  const agrupacionRecords = agrupacionResult.value.records;
  const totalPages = macroResult.value.pagesConsumed + proyectoResult.value.pagesConsumed
    + unidadResult.value.pagesConsumed + agrupacionResult.value.pagesConsumed;

  logger.info({
    macros: macroRecords.length, proyectos: proyectoRecords.length,
    unidades: unidadRecords.length, agrupaciones: agrupacionRecords.length, pages: totalPages,
  }, 'mapInventoryToDto: fetched');

  // ── Step 2: Index by parent IDs ──
  const projectsByMacro = new Map<number, CrmRecord[]>();
  for (const p of proyectoRecords) {
    const mid = tryNum(p, 'id_macro_sinco_fx');
    if (mid === null) {
      return err(ValidationError.missingField('id_macro_sinco_fx', `Proyecto "${str(p, 'nombre_fx')}"`));
    }
    const list = projectsByMacro.get(mid) ?? [];
    list.push(p);
    projectsByMacro.set(mid, list);
  }

  const unitsByProject = new Map<number, CrmRecord[]>();
  for (const u of unidadRecords) {
    const pid = tryNum(u, 'id_proyecto_sinco_fx');
    if (pid === null) {
      return err(ValidationError.missingField('id_proyecto_sinco_fx', `Unidad "${str(u, 'nombre_fx')}"`));
    }
    const list = unitsByProject.get(pid) ?? [];
    list.push(u);
    unitsByProject.set(pid, list);
  }

  const agrupsByProject = new Map<number, CrmRecord[]>();
  for (const a of agrupacionRecords) {
    const pid = tryNum(a, 'id_proyecto_sinco_fx');
    if (pid === null) {
      return err(ValidationError.missingField('id_proyecto_sinco_fx', `Agrupación "${str(a, 'nombre_fx')}"`));
    }
    const list = agrupsByProject.get(pid) ?? [];
    list.push(a);
    agrupsByProject.set(pid, list);
  }

  // ── Step 3: Build response ──
  let wTipologia = 0, wHabs = 0, wBanos = 0, wPiso = 0, wUnmapped = 0;
  let wJoinsFK = 0, wJoinsNombre = 0;
  let wExcludedGroupings = 0;

  const quarantinedItems: QuarantinedInventoryItem[] = [];
  const allUnidades: Record<number, SelectableUnit[]> = {};
  const allParking: Record<number, SelectableUnit[]> = {};
  const allStorage: Record<number, SelectableUnit[]> = {};
  const allAgrupaciones: Record<number, GroupingRecord[]> = {};
  const macros: MacroDto[] = [];

  for (const macroRec of macroRecords) {
    const macroId = tryNum(macroRec, 'id_sinco_fx');
    if (macroId === null) {
      return err(ValidationError.missingField('id_sinco_fx', `Macro "${str(macroRec, 'nombre_fx')}"`));
    }
    const macroNombre = tryStr(macroRec, 'nombre_fx');
    if (macroNombre === null) {
      return err(ValidationError.missingField('nombre_fx', `Macro sincoId=${macroId}`));
    }
    const macroOverlay = overlay.macros[macroId];
    const proyectos: ProjectDto[] = [];

    for (const projRec of (projectsByMacro.get(macroId) ?? [])) {
      const projId = tryNum(projRec, 'id_sinco_fx');
      if (projId === null) {
        return err(ValidationError.missingField('id_sinco_fx', `Proyecto "${str(projRec, 'nombre_fx')}"`));
      }
      const projNombre = tryStr(projRec, 'nombre_fx');
      if (projNombre === null) {
        return err(ValidationError.missingField('nombre_fx', `Proyecto sincoId=${projId}`, { projectId: projId }));
      }
      const ctx = `Proyecto ${projId} ("${projNombre}")`;

      // Overlay — obligatorio
      const ov = overlay.projects[projId];
      if (!ov) {
        return err(ValidationError.mappingFailed(
          `${ctx}: sin overlay config. codigo obligatorio.`,
          { projectId: projId },
        ));
      }
      if (!ov.codigo || ov.codigo.trim().length === 0) {
        return err(ValidationError.missingField('codigo', ctx, { projectId: projId }));
      }

      // Typology rules — obligatorias por proyecto
      const projRules = typologyRules[projId];
      if (!projRules || projRules.length === 0) {
        return err(ValidationError.mappingFailed(
          `${ctx}: sin typologyRules configuradas`,
          { projectId: projId },
        ));
      }

      // agrupacionesPreestablecidas — config operativa, vive en overlay
      const agrupPreest = ov.agrupacionesPreestablecidas;
      const selectionMode = agrupPreest ? 'agrupacion' as const : 'unidad' as const;

      // Config
      const cuotasRaw = num(projRec, 'numero_cuotas_fx');
      const financRaw = num(projRec, 'porcentaje_financiacion_fx');
      const diasRaw = num(projRec, 'dias_bloqueo_fx');
      const vigRaw = num(projRec, 'vigencia_cotizacion_fx');

      const config: ProjectConfig = {
        separacion_pct: ov.pctSep ?? DEFAULTS.separacion_pct,
        cuota_inicial_pct: ov.pctCI ?? DEFAULTS.cuota_inicial_pct,
        financiacion_pct: financRaw > 0 ? financRaw : DEFAULTS.financiacion_pct,
        cuotas_default: cuotasRaw > 0 ? cuotasRaw : DEFAULTS.cuotas_default,
        dias_bloqueo: diasRaw > 0 ? diasRaw : DEFAULTS.dias_bloqueo,
        vigencia_cotizacion: vigRaw > 0 ? vigRaw : DEFAULTS.vigencia_cotizacion,
        agrupaciones_preestablecidas: agrupPreest,
      };

      // ── Filter units: apply quarantine BEFORE any processing ──
      const projUnitsRaw = unitsByProject.get(projId) ?? [];
      const projUnitsFiltered: CrmRecord[] = [];
      for (const u of projUnitsRaw) {
        const uSincoId = num(u, 'id_sinco_fx');
        if (excludedUnitSet.has(uSincoId)) {
          logger.info(
            { sincoId: uSincoId, nombre: str(u, 'nombre_fx'), projId },
            'mapInventoryToDto: unidad excluida por cuarentena',
          );
          continue;
        }
        projUnitsFiltered.push(u);
      }

      // ── Filter agrupaciones: cascade quarantine to agrupaciones ──
      const projAgrupsRaw = agrupsByProject.get(projId) ?? [];
      const projAgrupsFiltered: CrmRecord[] = [];
      for (const a of projAgrupsRaw) {
        const principalId = num(a, 'id_unidad_principal_sinco_fx');
        if (principalId > 0 && excludedUnitSet.has(principalId)) {
          wExcludedGroupings++;
          logger.info(
            { agrupSincoId: num(a, 'id_sinco_fx'), nombre: str(a, 'nombre_fx'), excludedUnitId: principalId, projId },
            'mapInventoryToDto: agrupación excluida (unidad principal en cuarentena)',
          );
          continue;
        }
        projAgrupsFiltered.push(a);
      }

      // ── Process filtered units ──
      const aptUnits: SelectableUnit[] = [];
      const parkUnits: SelectableUnit[] = [];
      const storUnits: SelectableUnit[] = [];
      const allAptAreas: number[] = [];

      for (const uRec of projUnitsFiltered) {
        const uId = tryNum(uRec, 'id_sinco_fx');
        if (uId === null) {
          return err(ValidationError.missingField('id_sinco_fx', `Unidad "${str(uRec, 'nombre_fx')}" proj ${projId}`, { projectId: projId }));
        }
        const uNombre = tryStr(uRec, 'nombre_fx');
        if (uNombre === null) {
          return err(ValidationError.missingField('nombre_fx', `Unidad sincoId=${uId} proj ${projId}`, { projectId: projId }));
        }
        const uEstado = str(uRec, 'estado_fx').toLowerCase();

        const tipoNorm = normalizeUnitType(
          str(uRec, 'tipo_unidad_fx') || null,
          num(uRec, 'tipo_unidad_sinco_fx') || null,
        );
        if (tipoNorm === null) {
          // Quarantine: tipo no reconocido
          quarantinedItems.push({
            entityType: 'unit', sincoId: uId, projectId: projId, nombre: uNombre,
            code: 'INVALID_TYPE',
            reason: `tipo_unidad no matchea ninguna categoría conocida`,
            source: 'inventory_validation',
          });
          continue;
        }

        const parsed = parseUnitName(uNombre);
        let tipologia = '';
        let habs = 0;
        let banos = 0;
        let area = num(uRec, 'area_construida_fx');
        const precio = num(uRec, 'precio_lista_fx');

        if (tipoNorm === 'APT') {
          if (area <= 0) {
            // Quarantine: area inválida
            quarantinedItems.push({
              entityType: 'unit', sincoId: uId, projectId: projId, nombre: uNombre,
              code: 'INVALID_VALUE', area,
              reason: `area_construida_fx=${area} inválida`,
              source: 'inventory_validation',
            });
            continue;
          }
          if (uEstado === 'disponible' && precio <= 0) {
            quarantinedItems.push({
              entityType: 'unit', sincoId: uId, projectId: projId, nombre: uNombre,
              code: 'INVALID_VALUE', area,
              reason: `precio_lista_fx=${precio} inválido para unidad disponible`,
              source: 'inventory_validation',
            });
            continue;
          }
          const fbResult = resolveUnitFallbacks(area, undefined, num(uRec, 'alcobas_fx') || null, num(uRec, 'banos_fx') || null, projRules);
          if (fbResult.isErr()) {
            // Quarantine: error en resolución de fallbacks
            quarantinedItems.push({
              entityType: 'unit', sincoId: uId, projectId: projId, nombre: uNombre,
              code: 'FALLBACK_ERROR', area,
              reason: fbResult.error.message,
              source: 'typology_resolution',
            });
            continue;
          }
          const fb = fbResult.value;
          if (fb.unmappedArea) {
            wUnmapped++;
            // Quarantine: área no matchea regla → continue, no abort
            quarantinedItems.push({
              entityType: 'unit', sincoId: uId, projectId: projId, nombre: uNombre,
              code: 'UNMAPPED_AREA', area,
              reason: `area=${area} no matchea ninguna regla de tipología`,
              source: 'typology_resolution',
            });
            continue;
          }
          tipologia = fb.tipologia;
          habs = fb.habs;
          banos = fb.banos;
          if (fb.fallbackFields.includes('tipologia')) wTipologia++;
          if (fb.fallbackFields.includes('habs')) wHabs++;
          if (fb.fallbackFields.includes('banos')) wBanos++;
          allAptAreas.push(area);
        } else {
          // PARQ / DEP
          if (uEstado === 'disponible' && precio <= 0) {
            quarantinedItems.push({
              entityType: 'unit', sincoId: uId, projectId: projId, nombre: uNombre,
              code: 'INVALID_VALUE',
              reason: `precio_lista_fx=${precio} inválido para ${tipoNorm} disponible`,
              source: 'inventory_validation',
            });
            continue;
          }
        }

        let piso = num(uRec, 'piso_fx');
        if (piso <= 0) {
          piso = parsed.piso;
          if (tipoNorm === 'APT') wPiso++;
        }

        const su: SelectableUnit = {
          hubspotId: uRec.id, sincoId: uId, nombre: uNombre,
          numero: parsed.numero, piso, pos: parsed.pos,
          tipologia, area, habs, banos, precio,
          estado: uEstado, tipo_inmueble: tipoNorm,
          esPrincipal: bool(uRec, 'es_principal_fx') === true,
        };

        if (tipoNorm === 'APT') aptUnits.push(su);
        else if (tipoNorm === 'PARQ') parkUnits.push(su);
        else storUnits.push(su);
      }

      allUnidades[projId] = aptUnits;
      allParking[projId] = parkUnits;
      allStorage[projId] = storUnits;

      // ── Agrupaciones top-level (from filtered list) ──
      const groupingRecords: GroupingRecord[] = [];
      for (const a of projAgrupsFiltered) {
        const aC = `Agrupación "${str(a, 'nombre_fx')}" proj ${projId}`;
        const aEstado = str(a, 'estado_fx').toLowerCase();
        const aNombre = str(a, 'nombre_fx');
        const aVTN = num(a, 'valor_total_neto_fx');

        if (aEstado === 'disponible') {
          if (!aNombre || aNombre.trim().length === 0) {
            return err(ValidationError.missingField('nombre_fx', aC, { projectId: projId }));
          }
          if (aVTN <= 0) {
            const aSincoIdQ = num(a, 'id_sinco_fx');
            quarantinedItems.push({
              entityType: 'grouping', sincoId: aSincoIdQ, projectId: projId, nombre: aNombre,
              code: 'INVALID_VALUE',
              reason: `valor_total_neto_fx=${aVTN} inválido para agrupación disponible`,
              source: 'grouping_validation',
            });
            continue;
          }
        }

        const aSincoId = tryNum(a, 'id_sinco_fx');
        if (aSincoId === null) {
          return err(ValidationError.missingField('id_sinco_fx', aC, { projectId: projId }));
        }
        const aIdProyecto = tryNum(a, 'id_proyecto_sinco_fx');
        if (aIdProyecto === null) {
          return err(ValidationError.missingField('id_proyecto_sinco_fx', aC, { projectId: projId }));
        }

        groupingRecords.push({
          hubspotId: a.id,
          sincoId: aSincoId,
          nombre: aNombre,
          estado: aEstado,
          valorSubtotal: num(a, 'valor_subtotal_fx'),
          valorDescuento: num(a, 'valor_descuento_fx'),
          valorTotalNeto: aVTN,
          idUnidadPrincipal: num(a, 'id_unidad_principal_sinco_fx'),
          idProyecto: aIdProyecto,
        });
      }
      allAgrupaciones[projId] = groupingRecords;

      // ── selectableItems (uses filtered lists) ──
      let selectableItems: SelectableUnit[];

      if (selectionMode === 'agrupacion') {
        const jr = joinGroupingsWithUnits(projAgrupsFiltered, projUnitsFiltered, projId, agrupPreest, logger);
        if (jr.isErr()) return err(jr.error);

        wJoinsFK += jr.value.stats.joinedByFK;
        wJoinsNombre += jr.value.stats.joinedByNombre;

        selectableItems = [];
        for (const j of jr.value.joined) {
          const uRec = j.unidadPrincipal;
          const aRec = j.agrupacion;
          const aNombre = str(aRec, 'nombre_fx');
          const aParsed = parseUnitName(aNombre);
          const area = num(uRec, 'area_construida_fx');
          const fbResult = resolveUnitFallbacks(area, undefined, num(uRec, 'alcobas_fx') || null, num(uRec, 'banos_fx') || null, projRules);
          if (fbResult.isErr()) {
            // Quarantine: error en resolución
            quarantinedItems.push({
              entityType: 'grouping', sincoId: num(aRec, 'id_sinco_fx'), projectId: projId, nombre: aNombre,
              code: 'FALLBACK_ERROR', area,
              reason: fbResult.error.message,
              source: 'grouping_validation',
            });
            continue;
          }
          const fb = fbResult.value;
          if (fb.unmappedArea) {
            wUnmapped++;
            // Quarantine: área no matchea regla
            quarantinedItems.push({
              entityType: 'grouping', sincoId: num(aRec, 'id_sinco_fx'), projectId: projId, nombre: aNombre,
              code: 'UNMAPPED_AREA', area,
              reason: `area=${area} no matchea ninguna regla de tipología`,
              source: 'grouping_validation',
            });
            continue;
          }

          // piso físico from unit principal, not agrupación
          let piso = num(uRec, 'piso_fx');
          if (piso <= 0) {
            const uParsed = parseUnitName(str(uRec, 'nombre_fx'));
            piso = uParsed.piso;
          }

          const aEstado = str(aRec, 'estado_fx').toLowerCase();
          const aPrecio = num(aRec, 'valor_total_neto_fx');
          if (aEstado === 'disponible' && aPrecio <= 0) {
            quarantinedItems.push({
              entityType: 'grouping', sincoId: num(aRec, 'id_sinco_fx'), projectId: projId, nombre: aNombre,
              code: 'INVALID_VALUE',
              reason: `valor_total_neto_fx=${aPrecio} inválido para agrupación disponible`,
              source: 'grouping_validation',
            });
            continue;
          }

          selectableItems.push({
            hubspotId: aRec.id,
            sincoId: num(aRec, 'id_sinco_fx'),
            nombre: aNombre,
            numero: aParsed.numero,
            piso,
            pos: aParsed.pos,
            tipologia: fb.tipologia,
            area,
            habs: fb.habs,
            banos: fb.banos,
            precio: aPrecio,
            estado: aEstado,
            tipo_inmueble: 'APT' as const,
            esPrincipal: true,
          } satisfies SelectableUnit);
        }
      } else {
        selectableItems = aptUnits;
      }

      // ── Computed fields ──
      const areaDesde = allAptAreas.length > 0 ? Math.min(...allAptAreas) : 0;
      const areaHasta = allAptAreas.length > 0 ? Math.max(...allAptAreas) : 0;
      const availPrices = selectableItems.filter(s => s.estado === 'disponible').map(s => s.precio).filter(p => p > 0);
      const precioDesde = availPrices.length > 0 ? Math.min(...availPrices) : 0;

      proyectos.push({
        hubspotId: projRec.id,
        sincoId: projId,
        nombre: projNombre,
        tipo: ov.tipo ?? '',
        areaDesde,
        areaHasta,
        precioDesde,
        codigo: ov.codigo,
        selectionMode,
        selectableItems,
        config,
      });
    }

    macros.push({
      hubspotId: macroRec.id,
      sincoId: macroId,
      nombre: macroNombre,
      ciudad: str(macroRec, 'ciudad_fx'),
      zona: macroOverlay?.zona ?? '',
      estado: str(macroRec, 'estado_fx') || 'Activo',
      tipo: str(macroRec, 'tipo_fx') || 'No VIS',
      proyectos,
    });
  }

  const warnings: WarningsDto = {
    fallbackTipologia: wTipologia,
    fallbackHabs: wHabs,
    fallbackBanos: wBanos,
    fallbackPiso: wPiso,
    unmappedAreas: wUnmapped,
    totalUnidades: unidadRecords.length,
    totalAgrupaciones: agrupacionRecords.length,
    pagesConsumed: totalPages,
    joinsFK: wJoinsFK,
    joinsNombre: wJoinsNombre,
    excludedUnits: excludedUnitSet.size,
    excludedGroupings: wExcludedGroupings,
  };

  logger.info({ warnings, quarantinedCount: quarantinedItems.length }, 'mapInventoryToDto: completed');

  return ok({
    clientId,
    timestamp: new Date().toISOString(),
    macros,
    unidades: allUnidades,
    parking: allParking,
    storage: allStorage,
    agrupaciones: allAgrupaciones,
    canalesAtribucion,
    quarantinedItems,
    warnings,
  });
}
