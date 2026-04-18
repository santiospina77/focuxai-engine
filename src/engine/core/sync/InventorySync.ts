/**
 * InventorySync — Orquestador del sync de inventario ERP → CRM.
 *
 * Esta clase es la pieza central del Engine. Sabe cómo:
 *   1. Leer macroproyectos/proyectos/agrupaciones del ERP (Sinco hoy).
 *   2. Mapear cada uno a CrmRecordInput con propiedades _fx.
 *   3. Crear o actualizar masivamente en el CRM (HubSpot hoy).
 *   4. Crear las associations (macro→proyecto, proyecto→agrupación, etc.).
 *
 * Crítico: NO conoce Sinco ni HubSpot directamente. Solo usa IErpConnector
 * e ICrmAdapter. Cuando agregues SAP o Salesforce, esta clase NO cambia.
 *
 * Modos de sync:
 *   - 'full': descarga todo el inventario (sync inicial o on-demand).
 *   - 'prices': solo actualiza precio_lista_fx (cron periódico, ligero).
 *
 * Estrategia de upsert: search por id_sinco_fx → split en creates / updates
 * → createRecordsBatch + updateRecordsBatch. NO usa batch/upsert porque
 * HubSpot requiere hasUniqueValue=true que no soporta en propiedades number.
 */

import type { IErpConnector, Macroproyecto, Proyecto, Agrupacion, Unidad } from '@/engine/interfaces/IErpConnector';
import type { ICrmAdapter, CrmAssociation, CrmRecordInput, CrmRecordUpdate } from '@/engine/interfaces/ICrmAdapter';
import type { Logger } from '../logging/Logger';
import type { EngineError } from '../errors/EngineError';
import type { IEventLog } from '../eventlog/EventLog';
import { type Result, ok, err } from '../types/Result';

export type SyncMode = 'full' | 'prices';

export interface SyncOptions {
  readonly clientId: string;
  readonly mode: SyncMode;
  /** Si se especifica, solo sincroniza este macroproyecto. Sino, todos. */
  readonly macroproyectoExternalId?: number;
  /** Si se especifica, solo sincroniza este proyecto. */
  readonly proyectoExternalId?: number;
  /** transactionId para idempotencia. Si ya existe success, no se ejecuta. */
  readonly transactionId?: string;
}

export interface SyncReport {
  readonly mode: SyncMode;
  readonly clientId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly durationMs: number;
  readonly counts: {
    readonly macroproyectos: { read: number; written: number; failed: number };
    readonly proyectos: { read: number; written: number; failed: number };
    readonly agrupaciones: { read: number; written: number; failed: number };
    readonly unidades: { read: number; written: number; failed: number };
    readonly associations: { created: number; failed: number };
  };
  readonly errors: ReadonlyArray<{
    readonly stage: string;
    readonly errorCode: string;
    readonly message: string;
  }>;
}

/**
 * Property internal names — alineados 1:1 con JSON v16 (76 propiedades).
 * El Adapter v3 crea estas propiedades en HubSpot con estos exact names.
 */
const PROPS = {
  // ─── Comunes ───
  externalId: 'id_sinco_fx',
  nombre: 'nombre_fx',

  // ─── Macroproyecto (11 props en JSON v17) ───
  macroDireccion: 'direccion_fx',              // Sinco: direccion
  macroCiudad: 'ciudad_fx',                    // Sinco: ciudad
  macroNumeroPisos: 'numero_pisos_fx',         // Sinco: numeroPisos
  macroAptosPorPiso: 'aptos_por_piso_fx',      // Sinco: aptosPorPiso
  macroIdOrigen: 'id_origen_sinco_fx',         // Config del cliente, no Sinco
  macroTipo: 'tipo_fx',                        // Engine-managed (VIS/VIP/No VIS)
  macroPrecioDesde: 'precio_desde_fx',         // Engine-managed
  macroPrecioHasta: 'precio_hasta_fx',         // Engine-managed
  macroEstado: 'estado_fx',                    // Engine-managed

  // ─── Proyecto (16 props en JSON v17) ───
  proyectoIdMacro: 'id_macro_sinco_fx',
  proyectoEstrato: 'estrato_fx',
  proyectoValorSeparacion: 'valor_separacion_fx',
  proyectoPctCuotaInicial: 'porcentaje_cuota_inicial_fx',  // Engine-managed (Ops config)
  proyectoPctFinanciacion: 'porcentaje_financiacion_fx',
  proyectoNumeroCuotas: 'numero_cuotas_fx',                // Engine-managed (Ops config)
  proyectoFechaEntrega: 'fecha_entrega_fx',
  proyectoDiasBloqueo: 'dias_bloqueo_fx',                  // Engine-managed (Ops config)
  proyectoVigenciaCotizacion: 'vigencia_cotizacion_fx',    // Engine-managed (Ops config)
  proyectoAgrupacionesPreestablecidas: 'agrupaciones_preestablecidas_fx', // Engine-managed (Ops config)
  proyectoTotalUnidades: 'total_unidades_fx',              // Engine-managed (calculado)
  proyectoUnidadesDisponibles: 'unidades_disponibles_fx',  // Engine-managed (calculado)
  proyectoUnidadesVendidas: 'unidades_vendidas_fx',        // Engine-managed (calculado)
  proyectoEstado: 'estado_fx',                             // Engine-managed

  // ─── Unidad (23 props en JSON v17) ───
  unidadIdProyecto: 'id_proyecto_sinco_fx',
  unidadTipoSincoId: 'tipo_unidad_sinco_fx',
  unidadTipo: 'tipo_unidad_fx',
  unidadClasificacion: 'clasificacion_fx',
  unidadEsPrincipal: 'es_principal_fx',
  unidadEstado: 'estado_fx',
  unidadPrecio: 'precio_lista_fx',
  unidadAreaConstruida: 'area_construida_fx',
  unidadAreaPrivada: 'area_privada_fx',
  unidadAreaTotal: 'area_total_fx',
  unidadPiso: 'piso_fx',
  unidadAlcobas: 'alcobas_fx',
  unidadBanos: 'banos_fx',
  unidadEstBloqSinco: 'est_bloq_sinco_fx',                // Sinco: estBloq (informativo)
  unidadTipoInmuebleId: 'id_tipo_inmueble_sinco_fx',      // Sinco: idTipoInmueble
  unidadFechaSync: 'fecha_sync_fx',
  // Props que existen en HubSpot pero NO vienen de Sinco (Ops config, se llenan después):
  // area_terraza_fx, area_balcon_fx, area_patio_fx, tiene_jardineria_fx, nomenclatura_torre_fx

  // ─── Agrupación (26 props en JSON v17) ───
  agrupacionIdProyecto: 'id_proyecto_sinco_fx',
  agrupacionEstado: 'estado_fx',
  agrupacionValorSubtotal: 'valor_subtotal_fx',
  agrupacionValorDescuento: 'valor_descuento_fx',
  agrupacionValorDescuentoFinanciero: 'valor_descuento_financiero_fx',
  agrupacionValorTotal: 'valor_total_neto_fx',
  agrupacionValorSeparacion: 'valor_separacion_fx',
  agrupacionIdComprador: 'id_comprador_sinco_fx',
  agrupacionIdVendedor: 'id_vendedor_sinco_fx',
  agrupacionDealId: 'id_hubspot_deal_fx',
  agrupacionTipoVenta: 'tipo_venta_fx',
  agrupacionFechaVenta: 'fecha_venta_fx',
  agrupacionObservaciones: 'observaciones_fx',
  agrupacionNumeroEncargo: 'numero_encargo_fx',
  agrupacionFechaSeparacion: 'fecha_separacion_fx',
  agrupacionFechaCreacionSinco: 'fecha_creacion_sinco_fx', // Sinco: fechaCreacion
  agrupacionIdUnidadPrincipal: 'id_unidad_principal_sinco_fx',
  agrupacionIdMedioPublicitario: 'id_medio_publicitario_sinco_fx',
  agrupacionVentaExterior: 'venta_exterior_fx',
  agrupacionValorAdicionales: 'valor_adicionales_fx',
  agrupacionValorExclusiones: 'valor_exclusiones_fx',
  agrupacionValorSobrecosto: 'valor_sobrecosto_fx',
  agrupacionCedulaComprador: 'numero_identificacion_comprador_fx',
  agrupacionFechaSync: 'fecha_sync_fx',
} as const;

export class InventorySync {
  constructor(
    private readonly logger: Logger,
    private readonly eventLog: IEventLog
  ) {}

  async run(
    erp: IErpConnector,
    crm: ICrmAdapter,
    options: SyncOptions
  ): Promise<Result<SyncReport, EngineError>> {
    const startedAt = new Date();
    const log = this.logger.child({
      clientId: options.clientId,
      mode: options.mode,
      operation: 'sync.inventory',
    });
    log.info({ options }, 'Starting inventory sync');

    const transactionId =
      options.transactionId ??
      `sync_${options.clientId}_${options.mode}_${Date.now()}`;

    if (await this.eventLog.hasSucceeded(transactionId)) {
      log.warn({ transactionId }, 'Sync transactionId already succeeded — skipping');
      return ok(this.emptyReport(options, startedAt));
    }

    await this.eventLog.begin({
      transactionId,
      clientId: options.clientId,
      operation: 'sync.inventory',
      payload: { mode: options.mode },
    });

    const counts = this.emptyCounts();
    const errors: Array<{ stage: string; errorCode: string; message: string }> = [];

    try {
      // ---------------------------------------------------------------------
      // 1) Leer macroproyectos
      // ---------------------------------------------------------------------
      const macrosResult = options.macroproyectoExternalId
        ? await this.fetchSingleMacro(erp, options.macroproyectoExternalId)
        : await erp.getMacroproyectos();

      if (macrosResult.isErr()) {
        const e = macrosResult.error;
        errors.push({ stage: 'getMacroproyectos', errorCode: e.code, message: e.message });
        await this.eventLog.fail(transactionId, { code: e.code, message: e.message });
        return err(e);
      }

      const macros = macrosResult.value;
      counts.macroproyectos.read = macros.length;
      log.info({ count: macros.length }, 'Macroproyectos fetched');

      // ---------------------------------------------------------------------
      // 2) Smart upsert macroproyectos (skip si modo prices)
      // ---------------------------------------------------------------------
      if (options.mode === 'full' && macros.length > 0) {
        const macroInputs = macros.map((m) => this.mapMacroToCrm(m));
        const result = await this.smartUpsert(crm, 'macroproyecto', macroInputs, log);
        counts.macroproyectos.written = result.written;
        counts.macroproyectos.failed = result.failed;
        for (const e of result.errors) {
          errors.push({ stage: 'upsert.macroproyecto', ...e });
        }
      }

      // ---------------------------------------------------------------------
      // 3) Por cada macro, leer proyectos y procesarlos
      // ---------------------------------------------------------------------
      const allProyectos: Array<{ macro: Macroproyecto; proyecto: Proyecto }> = [];
      for (const macro of macros) {
        const proyectosResult = await erp.getProyectosByMacroproyecto(macro.externalId);
        if (proyectosResult.isErr()) {
          errors.push({
            stage: `getProyectos.macro(${macro.externalId})`,
            errorCode: proyectosResult.error.code,
            message: proyectosResult.error.message,
          });
          continue;
        }
        for (const p of proyectosResult.value) {
          allProyectos.push({ macro, proyecto: p });
        }
      }
      counts.proyectos.read = allProyectos.length;

      // Filtrar por proyecto si se especificó
      const proyectosToProcess = options.proyectoExternalId
        ? allProyectos.filter((p) => p.proyecto.externalId === options.proyectoExternalId)
        : allProyectos;

      // ---------------------------------------------------------------------
      // 4) Smart upsert proyectos
      // ---------------------------------------------------------------------
      if (options.mode === 'full' && proyectosToProcess.length > 0) {
        const proyectoInputs = proyectosToProcess.map(({ proyecto }) =>
          this.mapProyectoToCrm(proyecto)
        );
        const result = await this.smartUpsert(crm, 'proyecto', proyectoInputs, log);
        counts.proyectos.written = result.written;
        counts.proyectos.failed = result.failed;
        for (const e of result.errors) {
          errors.push({ stage: 'upsert.proyecto', ...e });
        }
      }

      // ---------------------------------------------------------------------
      // 5) Por cada proyecto, leer agrupaciones (con sus unidades)
      // ---------------------------------------------------------------------
      const allAgrupaciones: Array<{
        proyecto: Proyecto;
        agrupacion: Agrupacion;
      }> = [];
      const allUnidades: Array<{ proyecto: Proyecto; unidad: Unidad }> = [];

      for (const { proyecto } of proyectosToProcess) {
        const agrupacionesResult = await erp.getAgrupacionesByProyecto(proyecto.externalId);
        if (agrupacionesResult.isErr()) {
          errors.push({
            stage: `getAgrupaciones.proyecto(${proyecto.externalId})`,
            errorCode: agrupacionesResult.error.code,
            message: agrupacionesResult.error.message,
          });
          continue;
        }

        for (const ag of agrupacionesResult.value) {
          allAgrupaciones.push({ proyecto, agrupacion: ag });
          for (const u of ag.unidades) {
            allUnidades.push({ proyecto, unidad: u });
          }
        }

        // Si Sinco no devolvió unidades dentro de las agrupaciones, intentamos
        // leerlas independientemente.
        if (agrupacionesResult.value.length > 0 &&
            !agrupacionesResult.value.some((a) => a.unidades.length > 0)) {
          const unidadesResult = await erp.getUnidadesByProyecto(proyecto.externalId);
          if (unidadesResult.isOk()) {
            for (const u of unidadesResult.value) {
              allUnidades.push({ proyecto, unidad: u });
            }
          }
        }
      }

      counts.agrupaciones.read = allAgrupaciones.length;
      counts.unidades.read = allUnidades.length;

      // ---------------------------------------------------------------------
      // 6) Smart upsert unidades
      // ---------------------------------------------------------------------
      if (allUnidades.length > 0) {
        const unidadInputs = allUnidades.map(({ unidad }) =>
          options.mode === 'prices'
            ? this.mapUnidadToCrmPricesOnly(unidad)
            : this.mapUnidadToCrm(unidad)
        );
        const result = await this.smartUpsert(crm, 'unidad', unidadInputs, log);
        counts.unidades.written = result.written;
        counts.unidades.failed = result.failed;
        for (const e of result.errors) {
          errors.push({ stage: 'upsert.unidad', ...e });
        }
      }

      // ---------------------------------------------------------------------
      // 7) Smart upsert agrupaciones
      // ---------------------------------------------------------------------
      if (allAgrupaciones.length > 0) {
        const agrupacionInputs = allAgrupaciones.map(({ agrupacion }) =>
          options.mode === 'prices'
            ? this.mapAgrupacionToCrmPricesOnly(agrupacion)
            : this.mapAgrupacionToCrm(agrupacion)
        );
        const result = await this.smartUpsert(crm, 'agrupacion', agrupacionInputs, log);
        counts.agrupaciones.written = result.written;
        counts.agrupaciones.failed = result.failed;
        for (const e of result.errors) {
          errors.push({ stage: 'upsert.agrupacion', ...e });
        }
      }

      // ---------------------------------------------------------------------
      // 8) Crear associations (solo en modo full)
      // ---------------------------------------------------------------------
      if (options.mode === 'full') {
        const assocResult = await this.createAssociations(
          crm,
          { macros, proyectos: proyectosToProcess, agrupaciones: allAgrupaciones, unidades: allUnidades }
        );
        counts.associations.created = assocResult.created;
        counts.associations.failed = assocResult.failed;
        for (const e of assocResult.errors) {
          errors.push(e);
        }
      }

      // ---------------------------------------------------------------------
      // 9) Cerrar evento
      // ---------------------------------------------------------------------
      const endedAt = new Date();
      const report: SyncReport = {
        mode: options.mode,
        clientId: options.clientId,
        startedAt,
        endedAt,
        durationMs: endedAt.getTime() - startedAt.getTime(),
        counts,
        errors,
      };

      await this.eventLog.succeed(transactionId, {
        durationMs: report.durationMs,
        counts: counts as unknown as Record<string, unknown>,
        errorCount: errors.length,
      });

      log.info({ report: { ...report, errors: errors.slice(0, 5) } }, 'Sync completed');
      return ok(report);
    } catch (caught) {
      const code = 'ERP_NETWORK_ERROR';
      const message = caught instanceof Error ? caught.message : String(caught);
      await this.eventLog.fail(transactionId, { code, message });
      log.error({ message }, 'Sync threw unexpectedly');
      throw caught;
    }
  }

  // -------------------------------------------------------------------------
  // Smart Upsert — search → split → create / update
  // -------------------------------------------------------------------------

  /**
   * Reemplaza upsertRecordsByExternalId. HubSpot batch/upsert requiere
   * hasUniqueValue=true en la idProperty, pero id_sinco_fx es tipo number
   * y HubSpot no soporta unique en numbers.
   *
   * Estrategia: buscar todos los externalIds en CRM, dividir en nuevos vs
   * existentes, y usar createRecordsBatch + updateRecordsBatch.
   */
  private async smartUpsert(
    crm: ICrmAdapter,
    objectType: 'macroproyecto' | 'proyecto' | 'unidad' | 'agrupacion',
    inputs: CrmRecordInput[],
    log: Logger
  ): Promise<{ written: number; failed: number; errors: Array<{ errorCode: string; message: string }> }> {
    const errors: Array<{ errorCode: string; message: string }> = [];
    let written = 0;
    let failed = 0;

    // 1) Lookup existing records by id_sinco_fx
    const externalIds = inputs
      .map((i) => Number(i.properties[PROPS.externalId]))
      .filter((id) => !isNaN(id) && id > 0);

    const existingMap = await this.buildExternalIdMap(crm, objectType, externalIds);

    // 2) Split into creates vs updates
    const toCreate: CrmRecordInput[] = [];
    const toUpdate: CrmRecordUpdate[] = [];

    for (const input of inputs) {
      const extId = Number(input.properties[PROPS.externalId]);
      const crmId = existingMap.get(extId);

      if (crmId) {
        toUpdate.push({
          id: crmId,
          objectType: input.objectType,
          properties: input.properties,
        });
      } else {
        toCreate.push(input);
      }
    }

    log.info(
      { objectType, total: inputs.length, toCreate: toCreate.length, toUpdate: toUpdate.length },
      'Smart upsert split'
    );

    // 3) Create new records
    if (toCreate.length > 0) {
      const createResult = await crm.createRecordsBatch(toCreate);
      if (createResult.isOk()) {
        written += createResult.value.successful.length;
        failed += createResult.value.failed.length;
        for (const f of createResult.value.failed) {
          errors.push({ errorCode: f.error.code, message: f.error.message });
        }
      } else {
        failed += toCreate.length;
        errors.push({ errorCode: createResult.error.code, message: createResult.error.message });
      }
    }

    // 4) Update existing records
    if (toUpdate.length > 0) {
      const updateResult = await crm.updateRecordsBatch(toUpdate);
      if (updateResult.isOk()) {
        written += updateResult.value.successful.length;
        failed += updateResult.value.failed.length;
        for (const f of updateResult.value.failed) {
          errors.push({ errorCode: f.error.code, message: f.error.message });
        }
      } else {
        failed += toUpdate.length;
        errors.push({ errorCode: updateResult.error.code, message: updateResult.error.message });
      }
    }

    return { written, failed, errors };
  }

  // -------------------------------------------------------------------------
  // Mappers ERP → CRM (completos — 76 propiedades)
  // -------------------------------------------------------------------------

  private mapMacroToCrm(m: Macroproyecto): CrmRecordInput {
    return {
      objectType: 'macroproyecto',
      properties: this.clean({
        [PROPS.externalId]: m.externalId,
        [PROPS.nombre]: m.nombre,
        [PROPS.macroDireccion]: m.direccion,
        [PROPS.macroCiudad]: m.ciudadCodigo,
        [PROPS.macroNumeroPisos]: m.numeroPisos,
        [PROPS.macroAptosPorPiso]: m.aptosPorPiso,
        // Engine-managed (no vienen de Sinco, se calculan después):
        // macroTipo, macroPrecioDesde, macroPrecioHasta, macroEstado
        // macroIdOrigen: viene de config del cliente, no del ERP
      }),
    };
  }

  private mapProyectoToCrm(p: Proyecto): CrmRecordInput {
    return {
      objectType: 'proyecto',
      properties: this.clean({
        [PROPS.externalId]: p.externalId,
        [PROPS.nombre]: p.nombre,
        [PROPS.proyectoIdMacro]: p.macroproyectoExternalId,
        [PROPS.proyectoEstrato]: p.estrato,
        [PROPS.proyectoValorSeparacion]: p.valorSeparacion,
        [PROPS.proyectoPctFinanciacion]: p.porcentajeFinanciacion,
        [PROPS.proyectoFechaEntrega]: p.fechaEntrega,
        // Engine-managed (Ops config):
        // proyectoPctCuotaInicial, proyectoNumeroCuotas, proyectoDiasBloqueo,
        // proyectoVigenciaCotizacion, proyectoAgrupacionesPreestablecidas,
        // proyectoTotalUnidades, proyectoUnidadesDisponibles, proyectoUnidadesVendidas,
        // proyectoEstado
      }),
    };
  }

  private mapUnidadToCrm(u: Unidad): CrmRecordInput {
    return {
      objectType: 'unidad',
      properties: this.clean({
        [PROPS.externalId]: u.externalId,
        [PROPS.nombre]: u.nombre,
        [PROPS.unidadIdProyecto]: u.proyectoExternalId,
        [PROPS.unidadTipoSincoId]: u.tipoCodigo,
        [PROPS.unidadTipo]: u.tipo,
        [PROPS.unidadClasificacion]: u.esPrincipal ? 'principal' : 'alterna',
        [PROPS.unidadEsPrincipal]: u.esPrincipal,
        [PROPS.unidadEstado]: u.estado,
        [PROPS.unidadPrecio]: u.precio,
        [PROPS.unidadAreaConstruida]: u.areaConstruida,
        [PROPS.unidadAreaPrivada]: u.areaPrivada,
        [PROPS.unidadAreaTotal]: u.areaTotal,
        [PROPS.unidadPiso]: u.piso,
        [PROPS.unidadAlcobas]: u.cantidadAlcobas,
        [PROPS.unidadBanos]: u.cantidadBanos,
        [PROPS.unidadEstBloqSinco]: u.bloqueadoEnErp,
        [PROPS.unidadTipoInmuebleId]: u.tipoInmuebleId,
        [PROPS.unidadFechaSync]: new Date().toISOString(),
        // Props que existen en HubSpot pero NO vienen de Sinco (se llenan desde Ops):
        // area_terraza_fx, area_balcon_fx, area_patio_fx, tiene_jardineria_fx, nomenclatura_torre_fx
      }),
    };
  }

  private mapUnidadToCrmPricesOnly(u: Unidad): CrmRecordInput {
    return {
      objectType: 'unidad',
      properties: this.clean({
        [PROPS.externalId]: u.externalId,
        [PROPS.unidadPrecio]: u.precio,
        [PROPS.unidadEstado]: u.estado,
        [PROPS.unidadFechaSync]: new Date().toISOString(),
      }),
    };
  }

  private mapAgrupacionToCrm(a: Agrupacion): CrmRecordInput {
    return {
      objectType: 'agrupacion',
      properties: this.clean({
        [PROPS.externalId]: a.externalId,
        [PROPS.nombre]: a.nombre,
        [PROPS.agrupacionIdProyecto]: a.proyectoExternalId,
        [PROPS.agrupacionEstado]: a.estado,
        [PROPS.agrupacionValorSubtotal]: a.valorSubtotal,
        [PROPS.agrupacionValorDescuento]: a.valorDescuento,
        [PROPS.agrupacionValorDescuentoFinanciero]: a.valorDescuentoFinanciero,
        [PROPS.agrupacionValorTotal]: a.valorTotal,
        [PROPS.agrupacionValorSeparacion]: a.valorSeparacion,
        [PROPS.agrupacionIdComprador]: a.compradorExternalId,
        [PROPS.agrupacionIdVendedor]: a.vendedorExternalId,
        [PROPS.agrupacionDealId]: a.crmDealId,
        [PROPS.agrupacionTipoVenta]: a.tipoVentaCodigo,
        [PROPS.agrupacionFechaVenta]: a.fechaVenta,
        [PROPS.agrupacionObservaciones]: a.observaciones,
        [PROPS.agrupacionNumeroEncargo]: a.numeroEncargo,
        [PROPS.agrupacionFechaSeparacion]: a.fechaSeparacion,
        [PROPS.agrupacionFechaCreacionSinco]: a.fechaCreacionErp,
        [PROPS.agrupacionIdUnidadPrincipal]: a.idUnidadPrincipalExternalId,
        [PROPS.agrupacionIdMedioPublicitario]: a.idMedioPublicitario,
        [PROPS.agrupacionVentaExterior]: a.ventaExterior,
        [PROPS.agrupacionValorAdicionales]: a.valorAdicionales,
        [PROPS.agrupacionValorExclusiones]: a.valorExclusiones,
        [PROPS.agrupacionValorSobrecosto]: a.valorSobrecosto,
        [PROPS.agrupacionCedulaComprador]: a.compradorNumeroIdentificacion,
        [PROPS.agrupacionFechaSync]: new Date().toISOString(),
      }),
    };
  }

  private mapAgrupacionToCrmPricesOnly(a: Agrupacion): CrmRecordInput {
    return {
      objectType: 'agrupacion',
      properties: this.clean({
        [PROPS.externalId]: a.externalId,
        [PROPS.agrupacionValorTotal]: a.valorTotal,
        [PROPS.agrupacionEstado]: a.estado,
        [PROPS.agrupacionFechaSync]: new Date().toISOString(),
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Associations
  // -------------------------------------------------------------------------

  private async createAssociations(
    crm: ICrmAdapter,
    data: {
      macros: readonly Macroproyecto[];
      proyectos: ReadonlyArray<{ macro: Macroproyecto; proyecto: Proyecto }>;
      agrupaciones: ReadonlyArray<{ proyecto: Proyecto; agrupacion: Agrupacion }>;
      unidades: ReadonlyArray<{ proyecto: Proyecto; unidad: Unidad }>;
    }
  ): Promise<{
    created: number;
    failed: number;
    errors: Array<{ stage: string; errorCode: string; message: string }>;
  }> {
    const errors: Array<{ stage: string; errorCode: string; message: string }> = [];
    let created = 0;
    let failed = 0;

    // Para crear associations necesitamos los IDs de HubSpot, no los external IDs.
    // Hacemos lookup en batch usando search.
    const macroIdMap = await this.buildExternalIdMap(crm, 'macroproyecto', data.macros.map((m) => m.externalId));
    const proyectoIdMap = await this.buildExternalIdMap(
      crm,
      'proyecto',
      data.proyectos.map((p) => p.proyecto.externalId)
    );
    const agrupacionIdMap = await this.buildExternalIdMap(
      crm,
      'agrupacion',
      data.agrupaciones.map((a) => a.agrupacion.externalId)
    );
    const unidadIdMap = await this.buildExternalIdMap(
      crm,
      'unidad',
      data.unidades.map((u) => u.unidad.externalId)
    );

    const associations: CrmAssociation[] = [];

    // Macro → Proyecto
    for (const { macro, proyecto } of data.proyectos) {
      const fromId = macroIdMap.get(macro.externalId);
      const toId = proyectoIdMap.get(proyecto.externalId);
      if (fromId && toId) {
        associations.push({
          fromObjectType: 'macroproyecto',
          fromId,
          toObjectType: 'proyecto',
          toId,
        });
      }
    }

    // Proyecto → Agrupación
    for (const { proyecto, agrupacion } of data.agrupaciones) {
      const fromId = proyectoIdMap.get(proyecto.externalId);
      const toId = agrupacionIdMap.get(agrupacion.externalId);
      if (fromId && toId) {
        associations.push({
          fromObjectType: 'proyecto',
          fromId,
          toObjectType: 'agrupacion',
          toId,
        });
      }
    }

    // Proyecto → Unidad
    for (const { proyecto, unidad } of data.unidades) {
      const fromId = proyectoIdMap.get(proyecto.externalId);
      const toId = unidadIdMap.get(unidad.externalId);
      if (fromId && toId) {
        associations.push({
          fromObjectType: 'proyecto',
          fromId,
          toObjectType: 'unidad',
          toId,
        });
      }
    }

    // Agrupación → Unidad (match por unidades dentro de cada agrupación)
    for (const { agrupacion } of data.agrupaciones) {
      const fromId = agrupacionIdMap.get(agrupacion.externalId);
      if (!fromId) continue;
      for (const u of agrupacion.unidades) {
        const toId = unidadIdMap.get(u.externalId);
        if (toId) {
          associations.push({
            fromObjectType: 'agrupacion',
            fromId,
            toObjectType: 'unidad',
            toId,
          });
        }
      }
    }

    // Ejecutar associations
    for (const assoc of associations) {
      const result = await crm.createAssociation(assoc);
      if (result.isOk()) {
        created++;
      } else {
        failed++;
        errors.push({
          stage: `association.${assoc.fromObjectType}→${assoc.toObjectType}`,
          errorCode: result.error.code,
          message: result.error.message,
        });
      }
    }

    return { created, failed, errors };
  }

  /**
   * Construye un mapa externalId → CRM ID consultando el CRM en batch.
   * Para optimizar, hace una sola search con filter `in` sobre los externalIds.
   */
  private async buildExternalIdMap(
    crm: ICrmAdapter,
    objectType: 'macroproyecto' | 'proyecto' | 'unidad' | 'agrupacion',
    externalIds: readonly number[]
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (externalIds.length === 0) return map;

    // Dedup
    const uniqueIds = [...new Set(externalIds)];

    // HubSpot search: max 100 por batch, max 100 valores en filter `in`.
    const batchSize = 100;
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const chunk = uniqueIds.slice(i, i + batchSize);
      const result = await crm.searchRecords({
        objectType,
        filters: [
          {
            property: PROPS.externalId,
            operator: 'in',
            value: chunk,
          },
        ],
        properties: [PROPS.externalId],
        limit: batchSize,
      });

      if (result.isErr()) {
        this.logger.warn(
          { objectType, errorCode: result.error.code },
          'Failed to lookup external IDs'
        );
        continue;
      }

      for (const record of result.value.records) {
        const externalIdValue = record.properties[PROPS.externalId];
        if (externalIdValue != null) {
          map.set(Number(externalIdValue), record.id);
        }
      }
    }

    return map;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Properties that are enumerations in HubSpot — values MUST be lowercase.
   * Domain types use UPPERCASE (DISPONIBLE, VENDIDA) but HubSpot expects lowercase.
   */
  private static readonly ENUM_PROPS = new Set([
    'estado_fx',
    'clasificacion_fx',
    'tipo_fx',
    'tipo_venta_fx',
  ]);

  /**
   * Properties that are type 'date' in HubSpot — values MUST be midnight UTC.
   * HubSpot rejects dates with time components (e.g. "2026-04-18T15:00:00.000Z").
   * Must send as "YYYY-MM-DD" or epoch ms at midnight UTC.
   */
  private static readonly DATE_PROPS = new Set([
    'fecha_entrega_fx',
    'fecha_sync_fx',
    'fecha_venta_fx',
    'fecha_separacion_fx',
    'fecha_creacion_sinco_fx',
  ]);

  /**
   * Converts a date string or ISO timestamp to YYYY-MM-DD format (midnight UTC).
   */
  private static toMidnightDate(val: string): string {
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    // ISO timestamp or Sinco date — extract date part
    const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1]!;
    // Sinco DD-MM-YYYY format
    const sincoMatch = val.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (sincoMatch) return `${sincoMatch[3]}-${sincoMatch[2]}-${sincoMatch[1]}`;
    return val;
  }

  /**
   * Limpia un dict de properties: elimina nulls, undefineds, convierte
   * todo a string, lowercase para enums, midnight UTC para dates.
   */
  private clean(props: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(props)) {
      if (val === null || val === undefined || val === '') continue;
      if (typeof val === 'number' && isNaN(val)) continue;
      if (typeof val === 'boolean') {
        result[key] = val ? 'true' : 'false';
      } else {
        const str = String(val);
        if (str === 'null' || str === 'undefined' || str === 'NaN') continue;
        if (InventorySync.ENUM_PROPS.has(key)) {
          result[key] = str.toLowerCase();
        } else if (InventorySync.DATE_PROPS.has(key)) {
          result[key] = InventorySync.toMidnightDate(str);
        } else {
          result[key] = str;
        }
      }
    }
    return result;
  }

  private async fetchSingleMacro(
    erp: IErpConnector,
    externalId: number
  ): Promise<Result<readonly Macroproyecto[], EngineError>> {
    const allResult = await erp.getMacroproyectos();
    if (allResult.isErr()) return allResult;
    const found = allResult.value.find((m) => m.externalId === externalId);
    return ok(found ? [found] : []);
  }

  private emptyCounts() {
    return {
      macroproyectos: { read: 0, written: 0, failed: 0 },
      proyectos: { read: 0, written: 0, failed: 0 },
      agrupaciones: { read: 0, written: 0, failed: 0 },
      unidades: { read: 0, written: 0, failed: 0 },
      associations: { created: 0, failed: 0 },
    };
  }

  private emptyReport(options: SyncOptions, startedAt: Date): SyncReport {
    const endedAt = new Date();
    return {
      mode: options.mode,
      clientId: options.clientId,
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      counts: this.emptyCounts(),
      errors: [],
    };
  }
}
