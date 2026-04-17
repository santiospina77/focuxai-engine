/**
 * src/engine/core/sync/InventorySync.ts
 *
 * Reads inventory (Macroproyectos, Proyectos, Unidades, Agrupaciones) from the ERP
 * and upserts them as CRM Custom Objects using the 76 internal property names
 * defined in the Adapter v3 blueprint (JSON v16).
 *
 * Architecture:
 *   - Uses ICrmAdapter.upsertRecordsByExternalId for batch performance (up to 100/call).
 *   - ERP/CRM-agnostic: no knowledge of Sinco or HubSpot at this level.
 *   - Merges data from 3 sources: ERP (Sinco), ClientConfig (Ops), computed aggregates.
 *   - All methods return Result<T, EngineError> — follows Engine's error-handling convention.
 *
 * Flow:
 *   1. Fetch all macros -> collect in memory
 *   2. Per macro: fetch proyectos -> collect
 *   3. Per proyecto: fetch unidades + agrupaciones -> collect
 *   4. Compute aggregates (project and macro level)
 *   5. Batch upsert in dependency order: macros -> proyectos -> unidades -> agrupaciones
 *
 * Ghost filtering: agrupaciones with empty names or null unidades arrays are dropped.
 */

import type {
  IErpConnector,
  Macroproyecto,
  Proyecto,
  Unidad,
  Agrupacion,
} from '../../interfaces/IErpConnector';
import type {
  ICrmAdapter,
  CrmObjectType,
  CrmRecordInput,
  BatchResult,
  CrmRecord,
} from '../../interfaces/ICrmAdapter';
import type { Result } from '../types/Result';
import type { EngineError } from '../errors/EngineError';
import type { ClientConfig } from '../../types/ClientConfig';

// ============================================================================
// PROPERTY NAMES — must match JSON v16 exactly (76 total: 11+16+23+26)
// ============================================================================

const PROPS = {
  macro: {
    nombre: 'nombre_fx',
    idSinco: 'id_sinco_fx',
    direccion: 'direccion_fx',
    ciudad: 'ciudad_fx',
    numeroPisos: 'numero_pisos_fx',
    aptosPorPiso: 'aptos_por_piso_fx',
    idOrigenSinco: 'id_origen_sinco_fx',
    tipo: 'tipo_fx',                   // enum: VIS | NO_VIS
    precioDesde: 'precio_desde_fx',
    precioHasta: 'precio_hasta_fx',
    estado: 'estado_fx',               // enum: ACTIVO | INACTIVO
  },

  proyecto: {
    nombre: 'nombre_fx',
    idSinco: 'id_sinco_fx',
    idMacroSinco: 'id_macro_sinco_fx',
    estrato: 'estrato_fx',
    valorSeparacion: 'valor_separacion_fx',
    porcentajeCuotaInicial: 'porcentaje_cuota_inicial_fx',
    porcentajeFinanciacion: 'porcentaje_financiacion_fx',
    numeroCuotas: 'numero_cuotas_fx',
    fechaEntrega: 'fecha_entrega_fx',
    diasBloqueo: 'dias_bloqueo_fx',
    vigenciaCotizacion: 'vigencia_cotizacion_fx',
    agrupacionesPreestablecidas: 'agrupaciones_preestablecidas_fx',
    totalUnidades: 'total_unidades_fx',
    unidadesDisponibles: 'unidades_disponibles_fx',
    unidadesVendidas: 'unidades_vendidas_fx',
    estado: 'estado_fx',
  },

  unidad: {
    nombre: 'nombre_fx',
    idSinco: 'id_sinco_fx',
    idProyectoSinco: 'id_proyecto_sinco_fx',
    tipoUnidadSinco: 'tipo_unidad_sinco_fx',   // numeric code
    tipoUnidad: 'tipo_unidad_fx',              // enum string
    clasificacion: 'clasificacion_fx',         // PRINCIPAL | ACCESORIO
    esPrincipal: 'es_principal_fx',
    precioLista: 'precio_lista_fx',
    estado: 'estado_fx',
    areaConstruida: 'area_construida_fx',
    areaPrivada: 'area_privada_fx',
    areaTotal: 'area_total_fx',
    piso: 'piso_fx',
    alcobas: 'alcobas_fx',
    banos: 'banos_fx',                         // Sinco doesn't expose this
    fechaSync: 'fecha_sync_fx',
    areaTerraza: 'area_terraza_fx',
    areaBalcon: 'area_balcon_fx',
    areaPatio: 'area_patio_fx',
    tieneJardineria: 'tiene_jardineria_fx',
    estBloqSinco: 'est_bloq_sinco_fx',
    idTipoInmuebleSinco: 'id_tipo_inmueble_sinco_fx',
    nomenclaturaTorre: 'nomenclatura_torre_fx',
  },

  agrupacion: {
    nombre: 'nombre_fx',
    idSinco: 'id_sinco_fx',
    idProyectoSinco: 'id_proyecto_sinco_fx',
    valorSubtotal: 'valor_subtotal_fx',
    valorDescuento: 'valor_descuento_fx',
    valorDescuentoFinanciero: 'valor_descuento_financiero_fx',
    valorTotalNeto: 'valor_total_neto_fx',
    valorSeparacion: 'valor_separacion_fx',
    estado: 'estado_fx',
    idCompradorSinco: 'id_comprador_sinco_fx',
    idVendedorSinco: 'id_vendedor_sinco_fx',
    idHubspotDeal: 'id_hubspot_deal_fx',
    tipoVenta: 'tipo_venta_fx',
    fechaVenta: 'fecha_venta_fx',
    observaciones: 'observaciones_fx',
    numeroEncargo: 'numero_encargo_fx',
    fechaSeparacion: 'fecha_separacion_fx',
    fechaCreacionSinco: 'fecha_creacion_sinco_fx',
    idUnidadPrincipalSinco: 'id_unidad_principal_sinco_fx',
    idMedioPublicitarioSinco: 'id_medio_publicitario_sinco_fx',
    ventaExterior: 'venta_exterior_fx',
    valorAdicionales: 'valor_adicionales_fx',
    valorExclusiones: 'valor_exclusiones_fx',
    valorSobrecosto: 'valor_sobrecosto_fx',
    numeroIdentificacionComprador: 'numero_identificacion_comprador_fx',
    fechaSync: 'fecha_sync_fx',
  },
} as const;

/**
 * All 4 Custom Objects use 'id_sinco_fx' as the external ID property.
 * Centralized here so the sync code stays decoupled from specific props.
 */
const EXTERNAL_ID_PROPERTY = PROPS.macro.idSinco;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/** HubSpot date fields accept YYYY-MM-DD. Extract date portion from ISO datetime. */
const toHubSpotDate = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const datePart = v.substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return datePart;
};

/** Strip null/undefined from property map — HubSpot rejects explicit nulls for many fields. */
const stripNullish = (obj: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
};

/** Resolve city code to display name via client-config catalog. Falls back to code. */
const resolveCiudad = (
  code: number | null | undefined,
  config: ClientConfig
): string | null => {
  if (code === null || code === undefined) return null;
  const catalog = (config.catalogos?.ciudades ?? {}) as Record<string, string>;
  return catalog[String(code)] ?? String(code);
};

/** Chunk an array into batches of size n (HubSpot caps batch operations at 100). */
const chunk = <T>(arr: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size) as T[]);
  }
  return out;
};

const BATCH_SIZE = 100;

// ============================================================================
// MAPPERS — Engine domain -> CRM properties
// ============================================================================

interface MacroComputed {
  precioDesde: number | null;
  precioHasta: number | null;
}

const mapMacroToProperties = (
  m: Macroproyecto,
  config: ClientConfig,
  computed: MacroComputed
): Record<string, unknown> => {
  const opsMacro = config.macros?.find((cm) => cm.idSinco === m.externalId);

  return stripNullish({
    [PROPS.macro.nombre]: m.nombre,
    [PROPS.macro.idSinco]: m.externalId,
    [PROPS.macro.direccion]: m.direccion,
    [PROPS.macro.ciudad]: resolveCiudad(m.ciudadCodigo, config),
    [PROPS.macro.numeroPisos]: m.numeroPisos,
    [PROPS.macro.aptosPorPiso]: m.aptosPorPiso,
    [PROPS.macro.idOrigenSinco]: config.sinco?.idOrigen,
    [PROPS.macro.tipo]: opsMacro?.tipo,
    [PROPS.macro.precioDesde]: computed.precioDesde,
    [PROPS.macro.precioHasta]: computed.precioHasta,
    [PROPS.macro.estado]: m.estado ?? 'ACTIVO',
  });
};

interface ProyectoComputed {
  totalUnidades: number;
  unidadesDisponibles: number;
  unidadesVendidas: number;
}

const mapProyectoToProperties = (
  p: Proyecto,
  config: ClientConfig,
  computed: ProyectoComputed
): Record<string, unknown> => {
  const opsProyecto = config.proyectos?.find((cp) => cp.idSinco === p.externalId);

  // Precedence: Sinco first if non-null/non-zero, else Ops fallback.
  const valorSeparacion = p.valorSeparacion ?? opsProyecto?.valorSeparacion ?? null;
  const porcentajeFinanciacion =
    p.porcentajeFinanciacion ?? opsProyecto?.porcentajeFinanciacion ?? null;
  const fechaEntrega = p.fechaEntrega ?? opsProyecto?.fechaEntrega ?? null;
  const diasBloqueo =
    p.numeroDiasReservaOpcionVenta ?? opsProyecto?.diasBloqueo ?? null;

  return stripNullish({
    [PROPS.proyecto.nombre]: p.nombre,
    [PROPS.proyecto.idSinco]: p.externalId,
    [PROPS.proyecto.idMacroSinco]: p.macroproyectoExternalId,
    [PROPS.proyecto.estrato]: p.estrato,
    [PROPS.proyecto.valorSeparacion]: valorSeparacion,
    [PROPS.proyecto.porcentajeCuotaInicial]: opsProyecto?.porcentajeCuotaInicial,
    [PROPS.proyecto.porcentajeFinanciacion]: porcentajeFinanciacion,
    [PROPS.proyecto.numeroCuotas]: opsProyecto?.numeroCuotas,
    [PROPS.proyecto.fechaEntrega]: toHubSpotDate(fechaEntrega),
    [PROPS.proyecto.diasBloqueo]: diasBloqueo,
    [PROPS.proyecto.vigenciaCotizacion]: opsProyecto?.vigenciaCotizacion,
    [PROPS.proyecto.agrupacionesPreestablecidas]:
      opsProyecto?.agrupacionesPreestablecidas ?? false,
    [PROPS.proyecto.totalUnidades]: computed.totalUnidades,
    [PROPS.proyecto.unidadesDisponibles]: computed.unidadesDisponibles,
    [PROPS.proyecto.unidadesVendidas]: computed.unidadesVendidas,
    [PROPS.proyecto.estado]: p.estado ?? 'ACTIVO',
  });
};

const mapUnidadToProperties = (u: Unidad): Record<string, unknown> => {
  const nowIso = new Date().toISOString();

  return stripNullish({
    [PROPS.unidad.nombre]: u.nombre,
    [PROPS.unidad.idSinco]: u.externalId,
    [PROPS.unidad.idProyectoSinco]: u.proyectoExternalId,
    [PROPS.unidad.tipoUnidadSinco]: u.tipoCodigo,
    [PROPS.unidad.tipoUnidad]: u.tipo,
    [PROPS.unidad.clasificacion]:
      u.clasificacion ?? (u.esPrincipal ? 'PRINCIPAL' : 'ACCESORIO'),
    [PROPS.unidad.esPrincipal]: u.esPrincipal,
    [PROPS.unidad.precioLista]: u.precio,
    [PROPS.unidad.estado]: u.estado,
    [PROPS.unidad.areaConstruida]: u.areaConstruida,
    [PROPS.unidad.areaPrivada]: u.areaPrivada,
    [PROPS.unidad.areaTotal]: u.areaTotal,
    [PROPS.unidad.piso]: u.piso,
    [PROPS.unidad.alcobas]: u.cantidadAlcobas,
    [PROPS.unidad.banos]: u.cantidadBanos, // null in Sinco
    [PROPS.unidad.fechaSync]: toHubSpotDate(nowIso),
    [PROPS.unidad.areaTerraza]: u.areaTerraza,
    [PROPS.unidad.areaBalcon]: u.areaBalcon,
    [PROPS.unidad.areaPatio]: u.areaPatio,
    [PROPS.unidad.tieneJardineria]: u.tieneJardineria ?? false,
    [PROPS.unidad.estBloqSinco]: u.bloqueadoEnErp ?? false,
    [PROPS.unidad.idTipoInmuebleSinco]: u.tipoInmuebleId,
    [PROPS.unidad.nomenclaturaTorre]: u.nomenclaturaTorre,
  });
};

const mapAgrupacionToProperties = (a: Agrupacion): Record<string, unknown> => {
  const nowIso = new Date().toISOString();

  return stripNullish({
    [PROPS.agrupacion.nombre]: a.nombre,
    [PROPS.agrupacion.idSinco]: a.externalId,
    [PROPS.agrupacion.idProyectoSinco]: a.proyectoExternalId,
    [PROPS.agrupacion.valorSubtotal]: a.valorSubtotal,
    [PROPS.agrupacion.valorDescuento]: a.valorDescuento,
    [PROPS.agrupacion.valorDescuentoFinanciero]: a.valorDescuentoFinanciero,
    [PROPS.agrupacion.valorTotalNeto]: a.valorTotalNeto,
    [PROPS.agrupacion.valorSeparacion]: a.valorSeparacion,
    [PROPS.agrupacion.estado]: a.estado,
    [PROPS.agrupacion.idCompradorSinco]: a.compradorExternalId,
    [PROPS.agrupacion.idVendedorSinco]: a.vendedorExternalId,
    // idHubspotDeal intentionally NOT written from sync — owned by write-back flow.
    [PROPS.agrupacion.tipoVenta]: a.tipoVentaCodigo,
    [PROPS.agrupacion.fechaVenta]: toHubSpotDate(a.fechaVenta),
    [PROPS.agrupacion.observaciones]: a.observaciones,
    [PROPS.agrupacion.numeroEncargo]: a.numeroEncargo,
    [PROPS.agrupacion.fechaSeparacion]: toHubSpotDate(a.fechaSeparacion),
    [PROPS.agrupacion.fechaCreacionSinco]: toHubSpotDate(a.fechaCreacionErp),
    [PROPS.agrupacion.idUnidadPrincipalSinco]: a.idUnidadPrincipalExternalId,
    [PROPS.agrupacion.idMedioPublicitarioSinco]: a.idMedioPublicitario,
    [PROPS.agrupacion.ventaExterior]: a.ventaExterior ?? false,
    [PROPS.agrupacion.valorAdicionales]: a.valorAdicionales,
    [PROPS.agrupacion.valorExclusiones]: a.valorExclusiones,
    [PROPS.agrupacion.valorSobrecosto]: a.valorSobrecosto,
    [PROPS.agrupacion.numeroIdentificacionComprador]:
      a.compradorNumeroIdentificacion,
    [PROPS.agrupacion.fechaSync]: toHubSpotDate(nowIso),
  });
};

// ============================================================================
// AGGREGATE COMPUTERS
// ============================================================================

const computeProyectoAggregates = (
  unidades: readonly Unidad[]
): ProyectoComputed => {
  const principales = unidades.filter((u) => u.esPrincipal);
  return {
    totalUnidades: principales.length,
    unidadesDisponibles: principales.filter((u) => u.estado === 'DISPONIBLE').length,
    unidadesVendidas: principales.filter(
      (u) => u.estado === 'VENDIDA' || u.estado === 'LEGALIZADA'
    ).length,
  };
};

const computeMacroAggregates = (unidades: readonly Unidad[]): MacroComputed => {
  const principalesConPrecio = unidades.filter(
    (u) => u.esPrincipal && u.precio > 0
  );
  if (principalesConPrecio.length === 0) {
    return { precioDesde: null, precioHasta: null };
  }
  const precios = principalesConPrecio.map((u) => u.precio);
  return {
    precioDesde: Math.min(...precios),
    precioHasta: Math.max(...precios),
  };
};

// ============================================================================
// SYNC RESULT
// ============================================================================

export interface InventorySyncStats {
  readonly macros: { upserted: number; failed: number };
  readonly proyectos: { upserted: number; failed: number };
  readonly unidades: { upserted: number; failed: number };
  readonly agrupaciones: { upserted: number; failed: number };
  readonly skipped: number;
  readonly errors: readonly string[];
  readonly durationMs: number;
}

// ============================================================================
// SYNC RUNNER
// ============================================================================

export interface InventorySyncDeps {
  readonly erp: IErpConnector;
  readonly crm: ICrmAdapter;
  readonly config: ClientConfig;
  readonly logger?: {
    info: (msg: string, data?: unknown) => void;
    warn: (msg: string, data?: unknown) => void;
    error: (msg: string, data?: unknown) => void;
  };
}

/**
 * Run a full inventory sync: ERP -> CRM Custom Objects.
 * Idempotent via upsertRecordsByExternalId (keyed on id_sinco_fx).
 *
 * Returns Result<InventorySyncStats, EngineError> — follows Engine convention.
 */
export const runInventorySync = async (
  deps: InventorySyncDeps
): Promise<Result<InventorySyncStats, EngineError>> => {
  const { erp, crm, config, logger } = deps;
  const log = logger ?? {
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  const startedAt = Date.now();
  const stats = {
    macros: { upserted: 0, failed: 0 },
    proyectos: { upserted: 0, failed: 0 },
    unidades: { upserted: 0, failed: 0 },
    agrupaciones: { upserted: 0, failed: 0 },
    skipped: 0,
    errors: [] as string[],
  };

  const recordError = (context: string, err: unknown): void => {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);
    const full = `${context}: ${msg}`;
    stats.errors.push(full);
    log.error(`[sync] ${full}`);
  };

  // Helper: run batch upserts and accumulate stats.
  // Uses the adapter's upsertRecordsByExternalId (idempotent, keyed on id_sinco_fx).
  const runBatch = async (
    objectType: CrmObjectType,
    inputs: CrmRecordInput[],
    counterKey: 'macros' | 'proyectos' | 'unidades' | 'agrupaciones'
  ): Promise<void> => {
    if (inputs.length === 0) return;

    for (const batch of chunk(inputs, BATCH_SIZE)) {
      const result = await crm.upsertRecordsByExternalId(
        objectType,
        EXTERNAL_ID_PROPERTY,
        batch
      );

      if (!result.ok) {
        recordError(`upsert batch ${objectType}`, result.error);
        stats[counterKey].failed += batch.length;
        continue;
      }

      const batchResult: BatchResult<CrmRecord> = result.value;
      stats[counterKey].upserted += batchResult.successful.length;
      stats[counterKey].failed += batchResult.failed.length;

      for (const f of batchResult.failed) {
        recordError(`upsert ${objectType} partial`, f.error);
      }
    }
  };

  try {
    log.info('[sync] Starting inventory sync');

    // ----- Phase 1: Fetch all macroproyectos from ERP -----
    const macros = await erp.getMacroproyectos();
    log.info(`[sync] Fetched ${macros.length} macroproyectos`);

    // Accumulators — batch-write at the end for max throughput.
    const allUnidadInputs: CrmRecordInput[] = [];
    const allAgrupacionInputs: CrmRecordInput[] = [];
    const allProyectoInputs: CrmRecordInput[] = [];
    const allMacroInputs: CrmRecordInput[] = [];

    // ----- Phase 2: Walk the tree (macros -> proyectos -> unidades/agrupaciones) -----
    for (const macro of macros) {
      const unidadesDelMacro: Unidad[] = [];

      let proyectos: readonly Proyecto[] = [];
      try {
        proyectos = await erp.getProyectos(macro.externalId);
        log.info(
          `[sync] Macro ${macro.externalId} "${macro.nombre}": ${proyectos.length} proyectos`
        );
      } catch (err) {
        recordError(`getProyectos macro ${macro.externalId}`, err);
        continue;
      }

      for (const proyecto of proyectos) {
        let unidades: readonly Unidad[] = [];
        let agrupaciones: readonly Agrupacion[] = [];

        try {
          unidades = await erp.getUnidades(proyecto.externalId);
        } catch (err) {
          recordError(`getUnidades proyecto ${proyecto.externalId}`, err);
        }

        try {
          agrupaciones = await erp.getAgrupaciones(proyecto.externalId);
        } catch (err) {
          recordError(`getAgrupaciones proyecto ${proyecto.externalId}`, err);
        }

        log.info(
          `[sync]   Proyecto ${proyecto.externalId} "${proyecto.nombre}": ` +
            `${unidades.length} unidades, ${agrupaciones.length} agrupaciones`
        );

        unidadesDelMacro.push(...unidades);

        // Queue unidades
        for (const u of unidades) {
          allUnidadInputs.push({
            objectType: 'unidad',
            properties: mapUnidadToProperties(u),
          });
        }

        // Queue agrupaciones (filter ghosts first)
        for (const a of agrupaciones) {
          if (!a.nombre || a.nombre.trim() === '' || a.unidades.length === 0) {
            stats.skipped++;
            continue;
          }
          allAgrupacionInputs.push({
            objectType: 'agrupacion',
            properties: mapAgrupacionToProperties(a),
          });
        }

        // Queue proyecto with aggregates
        const proyectoComputed = computeProyectoAggregates(unidades);
        allProyectoInputs.push({
          objectType: 'proyecto',
          properties: mapProyectoToProperties(proyecto, config, proyectoComputed),
        });
      }

      // Queue macro with price aggregates
      const macroComputed = computeMacroAggregates(unidadesDelMacro);
      allMacroInputs.push({
        objectType: 'macroproyecto',
        properties: mapMacroToProperties(macro, config, macroComputed),
      });
    }

    // ----- Phase 3: Batch upsert in dependency order -----
    log.info(
      `[sync] Queued for upsert: ${allMacroInputs.length} macros, ` +
        `${allProyectoInputs.length} proyectos, ${allUnidadInputs.length} unidades, ` +
        `${allAgrupacionInputs.length} agrupaciones`
    );

    await runBatch('macroproyecto', allMacroInputs, 'macros');
    await runBatch('proyecto', allProyectoInputs, 'proyectos');
    await runBatch('unidad', allUnidadInputs, 'unidades');
    await runBatch('agrupacion', allAgrupacionInputs, 'agrupaciones');

    const durationMs = Date.now() - startedAt;
    log.info(
      `[sync] Done in ${durationMs}ms. ` +
        `macros=${stats.macros.upserted}/${stats.macros.upserted + stats.macros.failed} ` +
        `proyectos=${stats.proyectos.upserted}/${stats.proyectos.upserted + stats.proyectos.failed} ` +
        `unidades=${stats.unidades.upserted}/${stats.unidades.upserted + stats.unidades.failed} ` +
        `agrupaciones=${stats.agrupaciones.upserted}/${stats.agrupaciones.upserted + stats.agrupaciones.failed} ` +
        `skipped=${stats.skipped} errors=${stats.errors.length}`
    );

    return { ok: true, value: { ...stats, durationMs } };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`[sync] Fatal error: ${msg}`);
    return {
      ok: false,
      error: {
        code: 'SYNC_FATAL',
        message: msg,
        cause: err,
        context: { partialStats: { ...stats, durationMs } },
      } as EngineError,
    };
  }
};
