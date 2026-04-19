/**
 * mapInventoryToDto — Orquestador de inventario.
 *
 * Lee los 4 Custom Objects de HubSpot (Macro, Proyecto, Unidad, Agrupación),
 * aplica los helpers puros, y arma el InventoryResponse congelado.
 *
 * FUENTES DE DATOS:
 *   - HubSpot Custom Objects = estructura canónica (macros, proyectos, joins, conteos)
 *   - ClientOverlayConfig = config operativa por sincoId:
 *       - codigo, pctSep, pctCI, tipo (por proyecto)
 *       - agrupacionesPreestablecidas (config operativa, NO dato de Sinco)
 *       - zona (por macro)
 *       - excludedUnits (cuarentena por dato maestro inválido en fuente)
 *   - canalesAtribucion = inyectados por el caller
 *
 * CUARENTENA:
 *   - excludedUnits en overlay: unidades con dato maestro inválido (ej: area=0 en Sinco)
 *   - Se excluyen ANTES del join y de selectableItems
 *   - Las agrupaciones cuyo id_unidad_principal_sinco_fx apunte a unidad excluida
 *     también se excluyen (cascada)
 *   - No se infiere ni inventa data. Corrección debe hacerse en la fuente.
 *   - Telemetría: warnings.excludedUnits + warnings.excludedGroupings
 *
 * FAIL HARD rules:
 *   - overlay.clientId !== input.clientId → fail hard
 *   - Proyecto sin overlay config → fail hard (codigo obligatorio)
 *   - Unidad sin normalizeUnitType match → fail hard
 *   - APT con area <= 0 (no cuarentenada) → fail hard
 *   - Cualquier unidad disponible con precio <= 0 → fail hard
 *   - Agrupación disponible con valor_total_neto <= 0 o nombre vacío → fail hard
 *   - unmappedArea en cualquier APT → fail hard
 *   - IDs obligatorios <= 0 → fail hard (via requiredNum)
 *   - Nombres obligatorios vacíos → fail hard (via requiredStr)
 *   - overlay.codigo vacío → fail hard
 *   - JOIN errors → propagated from joinGroupingsWithUnits
 *
 * PROPIEDADES: 23 accedidas de HubSpot, todas verificadas contra JSON v17.
 * (agrupaciones_preestablecidas_fx ya NO se lee de HubSpot — vive en overlay)
 */

import type { ICrmAdapter, CrmRecord } from '@/engine/interfaces/ICrmAdapter';
import type { Logger } from '@/engine/core/logging/Logger';

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
} from './types';

import { fetchAllPages } from './fetchAllPages';
import { joinGroupingsWithUnits } from './joinGroupingWithUnit';
import { normalizeUnitType } from './normalizeUnitType';
import { parseUnitName } from './parseUnitName';
import { resolveUnitFallbacks } from './resolveUnitFallbacks';

// ═══════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════

export interface MapInventoryInput {
  readonly adapter: ICrmAdapter;
  readonly logger: Logger;
  readonly clientId: string;
  readonly overlay: ClientOverlayConfig;
  readonly canalesAtribucion: readonly CanalOption[];
}

export class InventoryMappingError extends Error {
  constructor(message: string, public readonly projectSincoId?: number) {
    super(message);
    this.name = 'InventoryMappingError';
  }
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
// Helpers
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

function requiredNum(r: CrmRecord, p: string, ctx: string, projId?: number): number {
  const raw = r.properties[p];
  const v = Number(raw);
  if (isNaN(v) || v <= 0) {
    throw new InventoryMappingError(`${ctx}: ${p} obligatorio > 0, valor="${raw}". FAIL HARD.`, projId);
  }
  return v;
}

function requiredStr(r: CrmRecord, p: string, ctx: string, projId?: number): string {
  const v = String(r.properties[p] ?? '').trim();
  if (v.length === 0) {
    throw new InventoryMappingError(`${ctx}: ${p} obligatorio, está vacío. FAIL HARD.`, projId);
  }
  return v;
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
// Main mapper
// ═══════════════════════════════════════════════════════════

export async function mapInventoryToDto(input: MapInventoryInput): Promise<InventoryResponse> {
  const { adapter, logger, clientId, overlay, canalesAtribucion } = input;

  if (overlay.clientId !== clientId) {
    throw new InventoryMappingError(
      `overlay.clientId="${overlay.clientId}" ≠ clientId="${clientId}". FAIL HARD.`,
    );
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

  // ── Step 1: Fetch all Custom Objects ──
  const [macroResult, proyectoResult, unidadResult, agrupacionResult] = await Promise.all([
    fetchAllPages(adapter, { objectType: 'macroproyecto', properties: [...MACRO_PROPS] }, logger),
    fetchAllPages(adapter, { objectType: 'proyecto', properties: [...PROYECTO_PROPS] }, logger),
    fetchAllPages(adapter, { objectType: 'unidad', properties: [...UNIDAD_PROPS] }, logger),
    fetchAllPages(adapter, { objectType: 'agrupacion', properties: [...AGRUPACION_PROPS] }, logger),
  ]);

  const macroRecords = macroResult.records;
  const proyectoRecords = proyectoResult.records;
  const unidadRecords = unidadResult.records;
  const agrupacionRecords = agrupacionResult.records;
  const totalPages = macroResult.pagesConsumed + proyectoResult.pagesConsumed
    + unidadResult.pagesConsumed + agrupacionResult.pagesConsumed;

  logger.info({
    macros: macroRecords.length, proyectos: proyectoRecords.length,
    unidades: unidadRecords.length, agrupaciones: agrupacionRecords.length, pages: totalPages,
  }, 'mapInventoryToDto: fetched');

  // ── Step 2: Index by parent IDs ──
  const projectsByMacro = new Map<number, CrmRecord[]>();
  for (const p of proyectoRecords) {
    const mid = requiredNum(p, 'id_macro_sinco_fx', `Proyecto "${str(p, 'nombre_fx')}"`);
    const list = projectsByMacro.get(mid) ?? [];
    list.push(p);
    projectsByMacro.set(mid, list);
  }

  const unitsByProject = new Map<number, CrmRecord[]>();
  for (const u of unidadRecords) {
    const pid = requiredNum(u, 'id_proyecto_sinco_fx', `Unidad "${str(u, 'nombre_fx')}"`);
    const list = unitsByProject.get(pid) ?? [];
    list.push(u);
    unitsByProject.set(pid, list);
  }

  const agrupsByProject = new Map<number, CrmRecord[]>();
  for (const a of agrupacionRecords) {
    const pid = requiredNum(a, 'id_proyecto_sinco_fx', `Agrupación "${str(a, 'nombre_fx')}"`);
    const list = agrupsByProject.get(pid) ?? [];
    list.push(a);
    agrupsByProject.set(pid, list);
  }

  // ── Step 3: Build response ──
  let wTipologia = 0, wHabs = 0, wBanos = 0, wPiso = 0, wUnmapped = 0;
  let wJoinsFK = 0, wJoinsNombre = 0;
  let wExcludedGroupings = 0;

  const allUnidades: Record<number, SelectableUnit[]> = {};
  const allParking: Record<number, SelectableUnit[]> = {};
  const allStorage: Record<number, SelectableUnit[]> = {};
  const allAgrupaciones: Record<number, GroupingRecord[]> = {};
  const macros: MacroDto[] = [];

  for (const macroRec of macroRecords) {
    const macroId = requiredNum(macroRec, 'id_sinco_fx', `Macro "${str(macroRec, 'nombre_fx')}"`);
    const macroNombre = requiredStr(macroRec, 'nombre_fx', `Macro sincoId=${macroId}`);
    const macroOverlay = overlay.macros[macroId];
    const proyectos: ProjectDto[] = [];

    for (const projRec of (projectsByMacro.get(macroId) ?? [])) {
      const projId = requiredNum(projRec, 'id_sinco_fx', `Proyecto "${str(projRec, 'nombre_fx')}"`);
      const projNombre = requiredStr(projRec, 'nombre_fx', `Proyecto sincoId=${projId}`, projId);
      const ctx = `Proyecto ${projId} ("${projNombre}")`;

      // Overlay — obligatorio
      const ov = overlay.projects[projId];
      if (!ov) {
        throw new InventoryMappingError(`${ctx}: sin overlay config. codigo obligatorio. FAIL HARD.`, projId);
      }
      if (!ov.codigo || ov.codigo.trim().length === 0) {
        throw new InventoryMappingError(`${ctx}: overlay.codigo vacío. FAIL HARD.`, projId);
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
      // If id_unidad_principal_sinco_fx points to an excluded unit, exclude the agrupación too
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
        const uId = requiredNum(uRec, 'id_sinco_fx', `Unidad "${str(uRec, 'nombre_fx')}" proj ${projId}`, projId);
        const uNombre = requiredStr(uRec, 'nombre_fx', `Unidad sincoId=${uId} proj ${projId}`, projId);
        const uEstado = str(uRec, 'estado_fx').toLowerCase();

        const tipoNorm = normalizeUnitType(
          str(uRec, 'tipo_unidad_fx') || null,
          num(uRec, 'tipo_unidad_sinco_fx') || null,
        );
        if (tipoNorm === null) {
          throw new InventoryMappingError(
            `Unidad "${uNombre}" (${uId}) proj ${projId}: tipo no matchea. FAIL HARD.`, projId,
          );
        }

        const parsed = parseUnitName(uNombre);
        let tipologia = '';
        let habs = 0;
        let banos = 0;
        let area = num(uRec, 'area_construida_fx');
        let precio = num(uRec, 'precio_lista_fx');

        if (tipoNorm === 'APT') {
          if (area <= 0) {
            throw new InventoryMappingError(
              `APT "${uNombre}" (${uId}) proj ${projId}: area=${area}. FAIL HARD.`, projId,
            );
          }
          if (uEstado === 'disponible' && precio <= 0) {
            throw new InventoryMappingError(
              `APT "${uNombre}" (${uId}) proj ${projId}: precio=${precio} en disponible. FAIL HARD.`, projId,
            );
          }
          const fb = resolveUnitFallbacks(area, undefined, num(uRec, 'alcobas_fx') || null, num(uRec, 'banos_fx') || null);
          if (fb.unmappedArea) {
            wUnmapped++;
            throw new InventoryMappingError(
              `APT "${uNombre}" (${uId}) proj ${projId}: area=${area} unmapped. FAIL HARD.`, projId,
            );
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
            throw new InventoryMappingError(
              `${tipoNorm} "${uNombre}" (${uId}) proj ${projId}: precio=${precio} en disponible. FAIL HARD.`, projId,
            );
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
      const groupingRecords: GroupingRecord[] = projAgrupsFiltered.map((a) => {
        const aC = `Agrupación "${str(a, 'nombre_fx')}" proj ${projId}`;
        const aEstado = str(a, 'estado_fx').toLowerCase();
        const aNombre = str(a, 'nombre_fx');
        const aVTN = num(a, 'valor_total_neto_fx');

        if (aEstado === 'disponible') {
          if (!aNombre || aNombre.trim().length === 0) {
            throw new InventoryMappingError(`${aC}: nombre vacío en disponible. FAIL HARD.`, projId);
          }
          if (aVTN <= 0) {
            throw new InventoryMappingError(`${aC}: valor_total_neto=${aVTN} en disponible. FAIL HARD.`, projId);
          }
        }

        return {
          hubspotId: a.id,
          sincoId: requiredNum(a, 'id_sinco_fx', aC, projId),
          nombre: aNombre,
          estado: aEstado,
          valorSubtotal: num(a, 'valor_subtotal_fx'),
          valorDescuento: num(a, 'valor_descuento_fx'),
          valorTotalNeto: aVTN,
          idUnidadPrincipal: num(a, 'id_unidad_principal_sinco_fx'),
          idProyecto: requiredNum(a, 'id_proyecto_sinco_fx', aC, projId),
        };
      });
      allAgrupaciones[projId] = groupingRecords;

      // ── selectableItems (uses filtered lists) ──
      let selectableItems: SelectableUnit[];

      if (selectionMode === 'agrupacion') {
        const jr = joinGroupingsWithUnits(projAgrupsFiltered, projUnitsFiltered, projId, agrupPreest, logger);
        wJoinsFK += jr.stats.joinedByFK;
        wJoinsNombre += jr.stats.joinedByNombre;

        selectableItems = jr.joined.map((j) => {
          const uRec = j.unidadPrincipal;
          const aRec = j.agrupacion;
          const aNombre = str(aRec, 'nombre_fx');
          const aParsed = parseUnitName(aNombre);
          const area = num(uRec, 'area_construida_fx');
          const fb = resolveUnitFallbacks(area, undefined, num(uRec, 'alcobas_fx') || null, num(uRec, 'banos_fx') || null);

          // piso físico from unit principal, not agrupación
          let piso = num(uRec, 'piso_fx');
          if (piso <= 0) {
            const uParsed = parseUnitName(str(uRec, 'nombre_fx'));
            piso = uParsed.piso;
          }

          const aEstado = str(aRec, 'estado_fx').toLowerCase();
          const aPrecio = num(aRec, 'valor_total_neto_fx');
          if (aEstado === 'disponible' && aPrecio <= 0) {
            throw new InventoryMappingError(
              `Agrupación "${aNombre}" proj ${projId}: valor_total_neto=${aPrecio} en disponible. FAIL HARD.`, projId,
            );
          }

          return {
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
          } satisfies SelectableUnit;
        });
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

  logger.info({ warnings }, 'mapInventoryToDto: completed');

  return {
    clientId,
    timestamp: new Date().toISOString(),
    macros,
    unidades: allUnidades,
    parking: allParking,
    storage: allStorage,
    agrupaciones: allAgrupaciones,
    canalesAtribucion,
    warnings,
  };
}
