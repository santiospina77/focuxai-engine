/**
 * InventorySync — Orquestador del sync de inventario ERP → CRM.
 *
 * Esta clase es la pieza central del Engine. Sabe cómo:
 *   1. Leer macroproyectos/proyectos/agrupaciones del ERP (Sinco hoy).
 *   2. Mapear cada uno a CrmRecordInput con propiedades _fx.
 *   3. Upsert masivo en el CRM (HubSpot hoy) usando external IDs.
 *   4. Crear las associations (macro→proyecto, proyecto→agrupación, etc.).
 *
 * Crítico: NO conoce Sinco ni HubSpot directamente. Solo usa IErpConnector
 * e ICrmAdapter. Cuando agregues SAP o Salesforce, esta clase NO cambia.
 *
 * Modos de sync:
 *   - 'full': descarga todo el inventario (sync inicial o on-demand).
 *   - 'prices': solo actualiza precio_lista_fx (cron periódico, ligero).
 *
 * Idempotencia: usa upsertRecordsByExternalId con id_sinco_fx como clave.
 * Si una unidad ya existe en HubSpot con ese external ID, se actualiza.
 * Si no existe, se crea. Sin duplicados.
 */

import type { IErpConnector, Macroproyecto, Proyecto, Agrupacion, Unidad } from '@/engine/interfaces/IErpConnector';
import type { ICrmAdapter, CrmAssociation, CrmRecordInput } from '@/engine/interfaces/ICrmAdapter';
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
 * Property internal names usados para mapear ERP → CRM.
 * El Adapter v2 debe haberlas creado en HubSpot con esos mismos nombres.
 */
const PROPS = {
  // Comunes a todos los Custom Objects
  externalId: 'id_sinco_fx',
  nombre: 'nombre_fx',
  // Macroproyecto
  macroActivo: 'activo_fx',
  // Proyecto
  proyectoIdMacro: 'id_macroproyecto_sinco_fx',
  proyectoActivo: 'activo_fx',
  // Unidad
  unidadIdProyecto: 'id_proyecto_sinco_fx',
  unidadTipo: 'tipo_unidad_fx',
  unidadEsPrincipal: 'es_principal_fx',
  unidadPrecio: 'precio_lista_fx',
  unidadEstado: 'estado_fx',
  unidadAreaConstruida: 'area_construida_fx',
  unidadAreaPrivada: 'area_privada_fx',
  unidadPiso: 'piso_fx',
  // Agrupación
  agrupacionIdProyecto: 'id_proyecto_sinco_fx',
  agrupacionEstado: 'estado_fx',
  agrupacionValorTotal: 'valor_total_neto_fx',
  agrupacionDealId: 'id_hubspot_deal_fx',
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
      // 2) Upsert macroproyectos en CRM (skip si modo prices)
      // ---------------------------------------------------------------------
      if (options.mode === 'full' && macros.length > 0) {
        const macroInputs = macros.map((m) => this.mapMacroToCrm(m));
        const upsertResult = await crm.upsertRecordsByExternalId(
          'macroproyecto',
          PROPS.externalId,
          macroInputs
        );
        if (upsertResult.isOk()) {
          counts.macroproyectos.written = upsertResult.value.successful.length;
          counts.macroproyectos.failed = upsertResult.value.failed.length;
          for (const f of upsertResult.value.failed) {
            errors.push({
              stage: 'upsert.macroproyecto',
              errorCode: f.error.code,
              message: f.error.message,
            });
          }
        } else {
          errors.push({
            stage: 'upsert.macroproyecto',
            errorCode: upsertResult.error.code,
            message: upsertResult.error.message,
          });
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
      // 4) Upsert proyectos
      // ---------------------------------------------------------------------
      if (options.mode === 'full' && proyectosToProcess.length > 0) {
        const proyectoInputs = proyectosToProcess.map(({ proyecto }) =>
          this.mapProyectoToCrm(proyecto)
        );
        const upsertResult = await crm.upsertRecordsByExternalId(
          'proyecto',
          PROPS.externalId,
          proyectoInputs
        );
        if (upsertResult.isOk()) {
          counts.proyectos.written = upsertResult.value.successful.length;
          counts.proyectos.failed = upsertResult.value.failed.length;
          for (const f of upsertResult.value.failed) {
            errors.push({
              stage: 'upsert.proyecto',
              errorCode: f.error.code,
              message: f.error.message,
            });
          }
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
      // 6) Upsert unidades
      // ---------------------------------------------------------------------
      if (allUnidades.length > 0) {
        const unidadInputs = allUnidades.map(({ unidad }) =>
          options.mode === 'prices'
            ? this.mapUnidadToCrmPricesOnly(unidad)
            : this.mapUnidadToCrm(unidad)
        );
        const upsertResult = await crm.upsertRecordsByExternalId(
          'unidad',
          PROPS.externalId,
          unidadInputs
        );
        if (upsertResult.isOk()) {
          counts.unidades.written = upsertResult.value.successful.length;
          counts.unidades.failed = upsertResult.value.failed.length;
          for (const f of upsertResult.value.failed) {
            errors.push({
              stage: 'upsert.unidad',
              errorCode: f.error.code,
              message: f.error.message,
            });
          }
        }
      }

      // ---------------------------------------------------------------------
      // 7) Upsert agrupaciones
      // ---------------------------------------------------------------------
      if (allAgrupaciones.length > 0) {
        const agrupacionInputs = allAgrupaciones.map(({ agrupacion }) =>
          options.mode === 'prices'
            ? this.mapAgrupacionToCrmPricesOnly(agrupacion)
            : this.mapAgrupacionToCrm(agrupacion)
        );
        const upsertResult = await crm.upsertRecordsByExternalId(
          'agrupacion',
          PROPS.externalId,
          agrupacionInputs
        );
        if (upsertResult.isOk()) {
          counts.agrupaciones.written = upsertResult.value.successful.length;
          counts.agrupaciones.failed = upsertResult.value.failed.length;
          for (const f of upsertResult.value.failed) {
            errors.push({
              stage: 'upsert.agrupacion',
              errorCode: f.error.code,
              message: f.error.message,
            });
          }
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
  // Mappers ERP → CRM
  // -------------------------------------------------------------------------

  private mapMacroToCrm(m: Macroproyecto): CrmRecordInput {
    return {
      objectType: 'macroproyecto',
      properties: {
        [PROPS.externalId]: m.externalId,
        [PROPS.nombre]: m.nombre,
        [PROPS.macroActivo]: m.activo,
      },
    };
  }

  private mapProyectoToCrm(p: Proyecto): CrmRecordInput {
    return {
      objectType: 'proyecto',
      properties: {
        [PROPS.externalId]: p.externalId,
        [PROPS.nombre]: p.nombre,
        [PROPS.proyectoIdMacro]: p.macroproyectoExternalId,
        [PROPS.proyectoActivo]: p.activo,
      },
    };
  }

  private mapUnidadToCrm(u: Unidad): CrmRecordInput {
    return {
      objectType: 'unidad',
      properties: {
        [PROPS.externalId]: u.externalId,
        [PROPS.nombre]: u.nombre,
        [PROPS.unidadIdProyecto]: u.proyectoExternalId,
        [PROPS.unidadTipo]: u.tipo,
        [PROPS.unidadEsPrincipal]: u.esPrincipal,
        [PROPS.unidadPrecio]: u.precio,
        [PROPS.unidadEstado]: u.estado,
        ...(u.areaConstruida != null && { [PROPS.unidadAreaConstruida]: u.areaConstruida }),
        ...(u.areaPrivada != null && { [PROPS.unidadAreaPrivada]: u.areaPrivada }),
        ...(u.piso != null && { [PROPS.unidadPiso]: u.piso }),
      },
    };
  }

  private mapUnidadToCrmPricesOnly(u: Unidad): CrmRecordInput {
    return {
      objectType: 'unidad',
      properties: {
        [PROPS.externalId]: u.externalId,
        [PROPS.unidadPrecio]: u.precio,
        [PROPS.unidadEstado]: u.estado,
      },
    };
  }

  private mapAgrupacionToCrm(a: Agrupacion): CrmRecordInput {
    return {
      objectType: 'agrupacion',
      properties: {
        [PROPS.externalId]: a.externalId,
        [PROPS.nombre]: a.nombre,
        [PROPS.agrupacionIdProyecto]: a.proyectoExternalId,
        [PROPS.agrupacionEstado]: a.estado,
        [PROPS.agrupacionValorTotal]: a.valorTotal,
        ...(a.crmDealId && { [PROPS.agrupacionDealId]: a.crmDealId }),
      },
    };
  }

  private mapAgrupacionToCrmPricesOnly(a: Agrupacion): CrmRecordInput {
    return {
      objectType: 'agrupacion',
      properties: {
        [PROPS.externalId]: a.externalId,
        [PROPS.agrupacionValorTotal]: a.valorTotal,
        [PROPS.agrupacionEstado]: a.estado,
      },
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
    // Hacemos lookup en batch usando findByExternalId (search).
    // Para sync con miles de records, este paso puede ser caro — está OK para
    // sync inicial. El sync periódico de precios lo salta.

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

    // Agrupación → Unidad (cada unidad asociada a su agrupación)
    for (const { agrupacion } of data.agrupaciones) {
      const agrId = agrupacionIdMap.get(agrupacion.externalId);
      if (!agrId) continue;
      for (const u of agrupacion.unidades) {
        const uId = unidadIdMap.get(u.externalId);
        if (uId) {
          associations.push({
            fromObjectType: 'agrupacion',
            fromId: agrId,
            toObjectType: 'unidad',
            toId: uId,
          });
        }
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

    if (associations.length === 0) {
      return { created: 0, failed: 0, errors };
    }

    const result = await crm.createAssociationsBatch(associations);
    if (result.isOk()) {
      created = result.value.successful.length;
      failed = result.value.failed.length;
      for (const f of result.value.failed) {
        errors.push({
          stage: 'createAssociations',
          errorCode: f.error.code,
          message: f.error.message,
        });
      }
    } else {
      errors.push({
        stage: 'createAssociations',
        errorCode: result.error.code,
        message: result.error.message,
      });
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

    // HubSpot search: max 100 por batch, max 100 valores en filter `in`.
    const batchSize = 100;
    for (let i = 0; i < externalIds.length; i += batchSize) {
      const chunk = externalIds.slice(i, i + batchSize);
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
