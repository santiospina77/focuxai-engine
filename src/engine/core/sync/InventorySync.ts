/**
 * src/engine/core/sync/InventorySync.ts
 *
 * Reads inventory (Macroproyectos, Proyectos, Unidades, Agrupaciones) from the ERP
 * and upserts them as CRM Custom Objects using the 76 internal property names
 * defined in the Adapter v3 blueprint (JSON v16).
 *
 * Uses ICrmAdapter.upsertRecordsByExternalId for batch performance (up to 100/call).
 * ERP/CRM-agnostic: no knowledge of Sinco or HubSpot at this level.
 * All methods return Result<T, EngineError> — follows Engine convention.
 */

import type {
  IErpConnector,
  Macroproyecto,
  Proyecto,
  Unidad,
  Agrupacion,
} from '@/engine/interfaces/IErpConnector';
import type {
  ICrmAdapter,
  CrmObjectType,
  CrmRecordInput,
  BatchResult,
  CrmRecord,
} from '@/engine/interfaces/ICrmAdapter';
import { ok, err, type Result } from '@/engine/core/types/Result';
import { EngineError } from '@/engine/core/errors/EngineError';
import type { Logger } from '@/engine/core/logging/Logger';
import type { IEventLog } from '@/engine/core/eventlog/EventLog';
import type { ClientConfig } from '@/engine/types/ClientConfig';

// ============================================================================
// SYNC MODES
// ============================================================================

export type SyncMode = 'full' | 'prices';

export interface SyncRunOptions {
  readonly clientId: string;
  readonly mode: SyncMode;
  readonly macroproyectoExternalId?: number;
  readonly proyectoExternalId?: number;
  readonly config?: ClientConfig;
}

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
    tipo: 'tipo_fx',
    precioDesde: 'precio_desde_fx',
    precioHasta: 'precio_hasta_fx',
    estado: 'estado_fx',
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
    tipoUnidadSinco: 'tipo_unidad_sinco_fx',
    tipoUnidad: 'tipo_unidad_fx',
    clasificacion: 'clasificacion_fx',
    esPrincipal: 'es_principal_fx',
    precioLista: 'precio_lista_fx',
    estado: 'estado_fx',
    areaConstruida: 'area_construida_fx',
    areaPrivada: 'area_privada_fx',
    areaTotal: 'area_total_fx',
    piso: 'piso_fx',
    alcobas: 'alcobas_fx',
    banos: 'banos_fx',
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

const EXTERNAL_ID_PROPERTY = PROPS.macro.idSinco; // 'id_sinco_fx' for all 4 COs
const BATCH_SIZE = 100;

// ============================================================================
// UTILITIES
// ============================================================================

const toHubSpotDate = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const datePart = v.substring(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
};

const stripNullish = (obj: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
};

const resolveCiudad = (
  code: number | null | undefined,
  config: ClientConfig | undefined
): string | null => {
  if (code === null || code === undefined) return null;
  const catalog = (config?.catalogos?.ciudades ?? {}) as Record<string, string>;
  return catalog[String(code)] ?? String(code);
};

const chunk = <T>(arr: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size) as T[]);
  }
  return out;
};

// ============================================================================
// MAPPERS
// ============================================================================

interface MacroComputed {
  precioDesde: number | null;
  precioHasta: number | null;
}

interface ProyectoComputed {
  totalUnidades: number;
  unidadesDisponibles: number;
  unidadesVendidas: number;
}

const mapMacro = (
  m: Macroproyecto,
  config: ClientConfig | undefined,
  computed: MacroComputed
): Record<string, unknown> => {
  const opsMacro = config?.macros?.find((cm) => cm.idSinco === m.externalId);
  return stripNullish({
    [PROPS.macro.nombre]: m.nombre,
    [PROPS.macro.idSinco]: m.externalId,
    [PROPS.macro.direccion]: m.direccion,
    [PROPS.macro.ciudad]: resolveCiudad(m.ciudadCodigo, config),
    [PROPS.macro.numeroPisos]: m.numeroPisos,
    [PROPS.macro.aptosPorPiso]: m.aptosPorPiso,
    [PROPS.macro.idOrigenSinco]: config?.sinco?.idOrigen,
    [PROPS.macro.tipo]: opsMacro?.tipo,
    [PROPS.macro.precioDesde]: computed.precioDesde,
    [PROPS.macro.precioHasta]: computed.precioHasta,
    [PROPS.macro.estado]: m.estado ?? 'ACTIVO',
  });
};

const mapProyecto = (
  p: Proyecto,
  config: ClientConfig | undefined,
  computed: ProyectoComputed
): Record<string, unknown> => {
  const opsProyecto = config?.proyectos?.find((cp) => cp.idSinco === p.externalId);
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

const mapUnidad = (u: Unidad): Record<string, unknown> => {
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
    [PROPS.unidad.banos]: u.cantidadBanos,
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

/** Prices-only mode: minimal payload with just id + price + state. */
const mapUnidadPricesOnly = (u: Unidad): Record<string, unknown> => {
  return stripNullish({
    [PROPS.unidad.idSinco]: u.externalId,
    [PROPS.unidad.precioLista]: u.precio,
    [PROPS.unidad.estado]: u.estado,
    [PROPS.unidad.fechaSync]: toHubSpotDate(new Date().toISOString()),
  });
};

const mapAgrupacion = (a: Agrupacion): Record<string, unknown> => {
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
    [PROPS.agrupacion.numeroIdentificacionComprador]: a.compradorNumeroIdentificacion,
    [PROPS.agrupacion.fechaSync]: toHubSpotDate(nowIso),
  });
};

// ============================================================================
// AGGREGATES
// ============================================================================

const computeProyectoAggregates = (unidades: readonly Unidad[]): ProyectoComputed => {
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
  const withPrice = unidades.filter((u) => u.esPrincipal && u.precio > 0);
  if (withPrice.length === 0) return { precioDesde: null, precioHasta: null };
  const precios = withPrice.map((u) => u.precio);
  return {
    precioDesde: Math.min(...precios),
    precioHasta: Math.max(...precios),
  };
};

// ============================================================================
// SYNC STATS
// ============================================================================

export interface InventorySyncStats {
  readonly mode: SyncMode;
  readonly clientId: string;
  readonly macros: { upserted: number; failed: number };
  readonly proyectos: { upserted: number; failed: number };
  readonly unidades: { upserted: number; failed: number };
  readonly agrupaciones: { upserted: number; failed: number };
  readonly skipped: number;
  readonly errors: readonly string[];
  readonly durationMs: number;
}

// ============================================================================
// MAIN CLASS
// ============================================================================

export class InventorySync {
  constructor(
    private readonly logger: Logger,
    private readonly eventLog: IEventLog
  ) {}

  async run(
    erp: IErpConnector,
    crm: ICrmAdapter,
    options: SyncRunOptions
  ): Promise<Result<InventorySyncStats, EngineError>> {
    const { clientId, mode, macroproyectoExternalId, proyectoExternalId, config } = options;
    const log = this.logger.child({ clientId, operation: 'inventorySync', mode });
    const startedAt = Date.now();

    const stats = {
      mode,
      clientId,
      macros: { upserted: 0, failed: 0 },
      proyectos: { upserted: 0, failed: 0 },
      unidades: { upserted: 0, failed: 0 },
      agrupaciones: { upserted: 0, failed: 0 },
      skipped: 0,
      errors: [] as string[],
    };

    const recordError = (context: string, e: unknown): void => {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message: unknown }).message)
          : String(e);
      const full = `${context}: ${msg}`;
      stats.errors.push(full);
      log.error({ err: e }, `[sync] ${full}`);
    };

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
        if (result.isErr()) {
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
      log.info({}, `[sync] Starting (mode=${mode})`);

      // Fetch macros — optionally scoped
      let macrosRes = await erp.getMacroproyectos();
      if (macrosRes.isErr()) {
        return err(macrosRes.error);
      }
      let macros = macrosRes.value;
      if (macroproyectoExternalId != null) {
        macros = macros.filter((m) => m.externalId === macroproyectoExternalId);
      }
      log.info({ count: macros.length }, '[sync] Macros to process');

      const allMacroInputs: CrmRecordInput[] = [];
      const allProyectoInputs: CrmRecordInput[] = [];
      const allUnidadInputs: CrmRecordInput[] = [];
      const allAgrupacionInputs: CrmRecordInput[] = [];

      for (const macro of macros) {
        const unidadesDelMacro: Unidad[] = [];

        const proyectosRes = await erp.getProyectos(macro.externalId);
        if (proyectosRes.isErr()) {
          recordError(`getProyectos macro ${macro.externalId}`, proyectosRes.error);
          continue;
        }
        let proyectos = proyectosRes.value;
        if (proyectoExternalId != null) {
          proyectos = proyectos.filter((p) => p.externalId === proyectoExternalId);
        }

        for (const proyecto of proyectos) {
          const unidadesRes = await erp.getUnidades(proyecto.externalId);
          let unidades: readonly Unidad[] = [];
          if (unidadesRes.isErr()) {
            recordError(`getUnidades proyecto ${proyecto.externalId}`, unidadesRes.error);
          } else {
            unidades = unidadesRes.value;
          }

          unidadesDelMacro.push(...unidades);

          // Queue unidades (full: all props, prices: minimal)
          for (const u of unidades) {
            allUnidadInputs.push({
              objectType: 'unidad',
              properties: mode === 'prices' ? mapUnidadPricesOnly(u) : mapUnidad(u),
            });
          }

          // Full mode only: fetch agrupaciones and queue proyecto with aggregates
          if (mode === 'full') {
            const agrupRes = await erp.getAgrupaciones(proyecto.externalId);
            let agrupaciones: readonly Agrupacion[] = [];
            if (agrupRes.isErr()) {
              recordError(`getAgrupaciones proyecto ${proyecto.externalId}`, agrupRes.error);
            } else {
              agrupaciones = agrupRes.value;
            }

            for (const a of agrupaciones) {
              // Ghost filter: empty name or no unidades
              if (!a.nombre || a.nombre.trim() === '' || a.unidades.length === 0) {
                stats.skipped++;
                continue;
              }
              allAgrupacionInputs.push({
                objectType: 'agrupacion',
                properties: mapAgrupacion(a),
              });
            }

            const proyComputed = computeProyectoAggregates(unidades);
            allProyectoInputs.push({
              objectType: 'proyecto',
              properties: mapProyecto(proyecto, config, proyComputed),
            });
          }
        }

        // Full mode only: queue macro with price aggregates
        if (mode === 'full') {
          const macroComputed = computeMacroAggregates(unidadesDelMacro);
          allMacroInputs.push({
            objectType: 'macroproyecto',
            properties: mapMacro(macro, config, macroComputed),
          });
        }
      }

      log.info(
        {
          macros: allMacroInputs.length,
          proyectos: allProyectoInputs.length,
          unidades: allUnidadInputs.length,
          agrupaciones: allAgrupacionInputs.length,
        },
        '[sync] Queued for upsert'
      );

      // Dependency order: macros -> proyectos -> unidades -> agrupaciones
      await runBatch('macroproyecto', allMacroInputs, 'macros');
      await runBatch('proyecto', allProyectoInputs, 'proyectos');
      await runBatch('unidad', allUnidadInputs, 'unidades');
      await runBatch('agrupacion', allAgrupacionInputs, 'agrupaciones');

      const durationMs = Date.now() - startedAt;
      log.info(
        { durationMs, stats },
        `[sync] Done in ${durationMs}ms`
      );

      return ok({ ...stats, durationMs });
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      const msg = e instanceof Error ? e.message : String(e);
      log.error({ err: e, durationMs }, `[sync] Fatal: ${msg}`);
      return err(
        new EngineError(
          'ERP_SERVER_ERROR',
          `Inventory sync fatal: ${msg}`,
          { clientId, mode, durationMs },
          e
        )
      );
    }
  }
}
