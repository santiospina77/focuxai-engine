/**
 * SaleWriteback — Orquestador de write-backs CRM → ERP en cierre de venta.
 *
 * Se ejecuta cuando un Deal en HubSpot cambia de etapa a:
 *   - "Unidad Separada" → write-back #1: crear comprador (si no existe) +
 *     confirmar venta básica con plan de pagos preliminar.
 *   - "Negocio Legalizado" → write-back #2: actualizar plan de pagos final
 *     con todas las cuotas confirmadas.
 *
 * Crítico:
 *   - Idempotencia obligatoria: cada Deal solo puede generar UN comprador
 *     y UNA confirmación de venta. Validamos antes de escribir.
 *   - Si el comprador ya existe en Sinco (por cédula), reutilizamos su ID.
 *   - Cualquier write-back fallido se marca en el Deal con writeback_status_fx
 *     para que el equipo lo revise manualmente.
 *
 * Esta clase NO es invocada por crons. La invoca un webhook handler de
 * HubSpot cuando el Deal cambia de etapa, o una API route manual de Ops.
 */

import type {
  IErpConnector,
  CompradorInput,
  ConfirmacionVentaInput,
  PlanPagoCuota,
  TipoVenta,
  TipoIdentificacion,
} from '@/engine/interfaces/IErpConnector';
import type { ICrmAdapter } from '@/engine/interfaces/ICrmAdapter';
import type { Logger } from '../logging/Logger';
import { ErpError, BusinessError, type EngineError } from '../errors/EngineError';
import type { IEventLog } from '../eventlog/EventLog';
import { type Result, ok, err } from '../types/Result';

// ============================================================================
// HubSpot internal values para writeback_status_fx
// ============================================================================

/**
 * Maps internal writeback status to HubSpot internal values.
 * MUST match the enumeration options defined in writeback_status_fx.
 */
const WRITEBACK_STATUS_MAP = {
  pending: 'pending',
  success: 'success',
  failed: 'failed',
  dryRun: 'dry_run',
  error: 'error',
} as const;

type WritebackStatusKey = keyof typeof WRITEBACK_STATUS_MAP;

// ============================================================================
// Inputs (lo que el caller le pasa al writeback)
// ============================================================================

export interface SeparacionInput {
  readonly clientId: string;
  readonly dealId: string; // ID de HubSpot del Deal
  /**
   * Datos del comprador principal — vienen del Contact asociado al Deal.
   */
  readonly comprador: {
    readonly tipoPersona: 'NATURAL' | 'JURIDICA';
    readonly tipoIdentificacion: TipoIdentificacion;
    readonly numeroIdentificacion: string;
    readonly primerNombre?: string;
    readonly segundoNombre?: string;
    readonly primerApellido?: string;
    readonly segundoApellido?: string;
    readonly correo?: string;
    readonly celular?: string;
    readonly direccion?: string;
    readonly genero?: 'M' | 'F' | 'O';
    readonly ingresoPromedioMensual?: number;
    readonly idCiudadResidencia?: number | null;
  };
  /**
   * Datos de la venta. idVenta = idAgrupacion en Sinco.
   */
  readonly venta: {
    readonly idAgrupacionSinco: number;
    readonly idProyectoSinco: number;
    readonly fecha: Date;
    readonly tipoVenta: TipoVenta;
    readonly valorDescuento: number;
    readonly valorDescuentoFinanciero: number;
    readonly idAsesor?: number;
    readonly planPagos: readonly PlanPagoCuota[];
  };
  /** Co-compradores opcionales con % de participación. */
  readonly compradoresAlternos?: ReadonlyArray<{
    readonly numeroIdentificacion: string;
    readonly porcentajeParticipacion: number;
  }>;
}

export type LegalizacionInput = SeparacionInput;

export interface SaleWritebackResult {
  readonly dealId: string;
  /** Sinco comprador ID. undefined in dry-run or idempotent replay. */
  readonly compradorExternalId?: number;
  readonly compradorWasCreated: boolean;
  readonly ventaConfirmada: boolean;
  readonly transactionId: string;
  /** true cuando la operación ya había sido procesada (idempotencia). */
  readonly alreadyProcessed?: boolean;
}

// ============================================================================
// Property names en el Deal (HubSpot) — para escribir status del write-back
// ============================================================================

const DEAL_PROPS = {
  writebackStatus: 'writeback_status_fx', // 'pending' | 'success' | 'failed'
  writebackError: 'writeback_error_fx',
  writebackAttemptedAt: 'writeback_attempted_at_fx',
  writebackTransactionId: 'writeback_transaction_id_fx',
  compradorIdSinco: 'id_comprador_sinco_fx',
  ventaIdSinco: 'id_venta_sinco_fx',
} as const;

export class SaleWriteback {
  constructor(
    private readonly logger: Logger,
    private readonly eventLog: IEventLog
  ) {}

  /**
   * Write-back #1: Cuando el Deal pasa a "Unidad Separada".
   * Crea comprador en Sinco (si no existe) y confirma la venta.
   *
   * Feature flags:
   *   SINCO_WRITEBACK_ENABLED=true  → ejecuta el flow
   *   SINCO_WRITEBACK_DRY_RUN=true  → valida todo pero no toca Sinco
   *   SINCO_WRITEBACK_DRY_RUN=false → BLOQUEADO hasta PgEventLog
   */
  async separar(
    erp: IErpConnector,
    crm: ICrmAdapter,
    input: SeparacionInput
  ): Promise<Result<SaleWritebackResult, EngineError>> {
    const writebackEnabled = process.env.SINCO_WRITEBACK_ENABLED === 'true';
    const dryRun = process.env.SINCO_WRITEBACK_DRY_RUN !== 'false';
    const mode = dryRun ? 'dry_run' : 'real';
    const transactionId = `separar_${mode}_${input.clientId}_${input.dealId}`;

    const log = this.logger.child({
      clientId: input.clientId,
      dealId: input.dealId,
      operation: 'writeback.separar',
      transactionId,
      mode,
    });

    // === Gate 1: Feature flag ===
    if (!writebackEnabled) {
      log.warn({}, 'Write-back deshabilitado (SINCO_WRITEBACK_ENABLED=false)');
      return err(
        new ErpError('ERP_FEATURE_DISABLED', 'Write-back Sinco deshabilitado por feature flag',
          { dealId: input.dealId, retryable: false })
      );
    }

    // === Gate 2: Atomic reserve (replaces hasSucceeded + begin two-step) ===
    const beginResult = await this.eventLog.begin({
      transactionId,
      clientId: input.clientId,
      operation: 'writeback.separar',
      payload: {
        dealId: input.dealId,
        cedula: input.comprador.numeroIdentificacion,
        idAgrupacion: input.venta.idAgrupacionSinco,
        mode,
      },
    });

    if (beginResult.isErr()) {
      // DB unreachable — cannot guarantee idempotency, abort
      log.error({ error: beginResult.error }, 'EventLog.begin failed — aborting');
      return err(beginResult.error);
    }

    switch (beginResult.value.kind) {
      case 'ACQUIRED':
        log.info({}, 'Transaction acquired — proceeding with write-back');
        break;

      case 'ALREADY_SUCCEEDED': {
        // Idempotent return — reconstruct result from stored output
        log.info({}, 'Transaction already succeeded — idempotent return');
        const storedOutput = beginResult.value.event.output ?? {};
        const ventaConfirmada = storedOutput.ventaConfirmada === true;

        return ok({
          dealId: input.dealId,
          compradorExternalId: ventaConfirmada && storedOutput.compradorExternalId != null
            ? Number(storedOutput.compradorExternalId)
            : undefined,
          compradorWasCreated: storedOutput.compradorWasCreated === true,
          ventaConfirmada,
          transactionId,
          alreadyProcessed: true,
        });
      }

      case 'IN_PROGRESS':
        log.warn({}, 'Transaction in progress by another request — aborting');
        return err(ErpError.operationInProgress(transactionId, {
          dealId: input.dealId,
        }));

      case 'ALREADY_FAILED':
        log.warn({}, 'Transaction previously failed — new transactionId required');
        return err(BusinessError.writebackAlreadyFailed(transactionId, input.dealId));
    }

    // === ACQUIRED — proceed with validations and Sinco calls ===

    // === Validación: participación con epsilon ===
    const PARTICIPATION_EPSILON = 0.01;
    const alternosSum = input.compradoresAlternos?.reduce(
      (s, a) => s + a.porcentajeParticipacion, 0
    ) ?? 0;
    const principalParticipacion = 100 - alternosSum;

    if (principalParticipacion <= 0 || principalParticipacion > 100) {
      await this.handleFailureBestEffort(crm, log, input.dealId, transactionId, {
        code: 'BUSINESS_INVALID_PARTICIPATION',
        message: `Participación principal inválida: ${principalParticipacion}%`,
      });
      return err(new BusinessError('BUSINESS_INVALID_PARTICIPATION',
        `Participación principal inválida: ${principalParticipacion}%. Alternos suman ${alternosSum}%.`,
        { dealId: input.dealId, principalParticipacion }));
    }

    if (Math.abs((principalParticipacion + alternosSum) - 100) > PARTICIPATION_EPSILON) {
      await this.handleFailureBestEffort(crm, log, input.dealId, transactionId, {
        code: 'BUSINESS_INVALID_PARTICIPATION',
        message: `Participación total ≠ 100%`,
      });
      return err(new BusinessError('BUSINESS_INVALID_PARTICIPATION',
        `Participación total ${principalParticipacion + alternosSum}% ≠ 100%`,
        { dealId: input.dealId }));
    }

    // === Validación: idConcepto=0 en planPagos ===
    const CONCEPTO_SEPARACION = 0;
    if (!input.venta.planPagos.some((c) => c.idConcepto === CONCEPTO_SEPARACION)) {
      await this.handleFailureBestEffort(crm, log, input.dealId, transactionId, {
        code: 'BUSINESS_MISSING_SEPARACION_CONCEPTO',
        message: 'Plan de pagos sin cuota de separación',
      });
      return err(new BusinessError('BUSINESS_MISSING_SEPARACION_CONCEPTO',
        'Plan de pagos debe incluir cuota de separación (idConcepto=0)',
        { dealId: input.dealId }));
    }

    // === Warn: idCiudadResidencia ===
    if (input.comprador.idCiudadResidencia == null) {
      log.warn({ dealId: input.dealId }, 'idCiudadResidencia no proporcionada — Sinco recibirá null');
    }

    // Marcar Deal como pending en HubSpot (non-blocking — v7 HIGH 3)
    await this.markDealStatus(crm, input.dealId, 'pending', undefined, transactionId);

    // ---------------------------------------------------------------------
    // Step 1a: Lookup comprador
    // ---------------------------------------------------------------------
    log.info({}, 'Step 1: getCompradorByIdentificacion');
    const lookupResult = await erp.getCompradorByIdentificacion(
      input.comprador.numeroIdentificacion
    );

    let compradorExternalId: number | undefined;
    let compradorWasCreated = false;

    if (lookupResult.isErr()) {
      // CRITICAL: Solo RESOURCE_NOT_FOUND permite crear. Todo otro error → fail hard.
      if (lookupResult.error.code !== 'ERP_RESOURCE_NOT_FOUND') {
        await this.handleFailureBestEffort(crm, log, input.dealId, transactionId, lookupResult.error);
        return err(lookupResult.error);
      }
      log.info({ cc: input.comprador.numeroIdentificacion }, 'Comprador no encontrado — se creará');
    } else if (lookupResult.value) {
      compradorExternalId = lookupResult.value.externalId;
      log.info({ compradorExternalId }, 'Comprador ya existe en Sinco, reusing');
    }

    // ---------------------------------------------------------------------
    // Step 1b: Crear comprador (solo si not found)
    // ---------------------------------------------------------------------
    if (compradorExternalId === undefined) {
      const createInput: CompradorInput = {
        tipoPersona: input.comprador.tipoPersona,
        tipoIdentificacion: input.comprador.tipoIdentificacion,
        numeroIdentificacion: input.comprador.numeroIdentificacion,
        primerNombre: input.comprador.primerNombre,
        segundoNombre: input.comprador.segundoNombre,
        primerApellido: input.comprador.primerApellido,
        segundoApellido: input.comprador.segundoApellido,
        correo: input.comprador.correo,
        celular: input.comprador.celular,
        direccion: input.comprador.direccion,
        genero: input.comprador.genero ?? 'O',
        ingresoPromedioMensual: input.comprador.ingresoPromedioMensual,
        idCiudadResidencia: input.comprador.idCiudadResidencia ?? null,
        aceptoPoliticaDatos: true,
      };

      if (dryRun) {
        log.info({ compradorInput: createInput }, 'DRY-RUN: createComprador skipped');
      } else {
        log.info({}, 'Step 1b: createComprador');
        const createResult = await erp.createComprador(createInput);
        if (createResult.isErr()) {
          await this.handleFailureBestEffort(crm, log, input.dealId, transactionId, createResult.error);
          return err(createResult.error);
        }
        compradorExternalId = createResult.value.externalId;
        compradorWasCreated = true;
        log.info({ compradorExternalId }, 'Comprador creado en Sinco');
      }
    }

    // ---------------------------------------------------------------------
    // Step 2: confirmarVenta
    // ---------------------------------------------------------------------
    if (dryRun) {
      log.info({
        idAgrupacion: input.venta.idAgrupacionSinco,
        idProyecto: input.venta.idProyectoSinco,
        numeroIdentificacionComprador: input.comprador.numeroIdentificacion,
        idHubspot: input.dealId,
        porcentajeParticipacion: principalParticipacion,
        planPagosCount: input.venta.planPagos.length,
        hasCompradorId: compradorExternalId !== undefined,
      }, 'DRY-RUN: confirmarVenta skipped');
    } else {
      // Real mode: compradorExternalId MUST exist
      if (compradorExternalId === undefined) {
        await this.handleFailureBestEffort(crm, log, input.dealId, transactionId, {
          code: 'BUSINESS_MISSING_COMPRADOR_ID',
          message: 'No se puede confirmar venta sin comprador',
        });
        return err(new BusinessError('BUSINESS_MISSING_COMPRADOR_ID',
          'No se puede confirmar venta sin idCompradorSinco — comprador no fue creado ni encontrado',
          { dealId: input.dealId }));
      }

      log.info({}, 'Step 2: confirmarVenta');
      const confirmInput: ConfirmacionVentaInput = {
        idVenta: input.venta.idAgrupacionSinco, // maps to idAgrupacion in Sinco body
        idProyecto: input.venta.idProyectoSinco,
        numeroIdentificacionComprador: input.comprador.numeroIdentificacion,
        fecha: input.venta.fecha,
        porcentajeParticipacion: principalParticipacion,
        valorDescuento: input.venta.valorDescuento,
        valorDescuentoFinanciero: input.venta.valorDescuentoFinanciero,
        tipoVenta: input.venta.tipoVenta,
        idAsesor: input.venta.idAsesor,
        planPagos: input.venta.planPagos,
        compradoresAlternos: input.compradoresAlternos,
        crmDealId: input.dealId, // maps to idHubspot in Sinco body
      };

      const confirmResult = await erp.confirmarVenta(confirmInput);
      if (confirmResult.isErr()) {
        await this.handleFailureBestEffort(crm, log, input.dealId, transactionId, confirmResult.error);
        return err(confirmResult.error);
      }

      // EventLog succeed IMMEDIATELY after Sinco confirms (before CRM update)
      const succeedResult = await this.eventLog.succeed(transactionId, {
        mode: 'real',
        ventaConfirmada: true,
        compradorExternalId,
        compradorWasCreated,
        idAgrupacionSinco: input.venta.idAgrupacionSinco,
        idHubspot: input.dealId,
      });

      if (succeedResult.isErr()) {
        // CRITICAL: Sinco confirmed but EventLog didn't transition to success.
        // State is inconsistent — event stays 'pending', which prevents doble-venta
        // (begin() would return IN_PROGRESS), but requires operational intervention.
        log.error(
          {
            transactionId,
            error: succeedResult.error,
            sincoAlreadyConfirmed: true,
          },
          'CRITICAL: Sinco confirmed but EventLog.succeed failed — state inconsistent',
        );

        // Best-effort: mark CRM as 'error' so ops team can investigate.
        try {
          await this.markDealStatus(
            crm,
            input.dealId,
            'error',
            `Sinco confirmado, pero EventLog falló: ${succeedResult.error.code}. Requiere intervención manual.`,
            transactionId,
          );
        } catch (crmErr) {
          log.error(
            { dealId: input.dealId, transactionId, crmErr },
            'Failed to mark CRM as error after EventLog.succeed failure (best-effort)',
          );
        }

        return err(succeedResult.error);
      }
    }

    // ---------------------------------------------------------------------
    // Step 3: Update Deal en HubSpot
    // ---------------------------------------------------------------------
    const baseProperties: Record<string, unknown> = {
      [DEAL_PROPS.writebackStatus]: dryRun ? WRITEBACK_STATUS_MAP.dryRun : WRITEBACK_STATUS_MAP.success,
      [DEAL_PROPS.writebackError]: '',
      [DEAL_PROPS.writebackAttemptedAt]: new Date().toISOString(),
      [DEAL_PROPS.writebackTransactionId]: transactionId,
    };

    if (!dryRun) {
      baseProperties[DEAL_PROPS.compradorIdSinco] = compradorExternalId;
      baseProperties[DEAL_PROPS.ventaIdSinco] = input.venta.idAgrupacionSinco;
    }

    const crmUpdateResult = await crm.updateRecord({
      id: input.dealId,
      objectType: 'deal',
      properties: baseProperties,
    });

    if (crmUpdateResult.isErr()) {
      log.error({
        dealId: input.dealId,
        transactionId,
        error: crmUpdateResult.error,
        sincoAlreadyConfirmed: !dryRun,
      }, 'CRM update failed after write-back flow');
      // In real mode, EventLog already marked success — Sinco is protected.
      // Caller knows CRM is out of sync.
      return err(crmUpdateResult.error);
    }

    // Dry-run EventLog — enriched output for idempotent replay
    if (dryRun) {
      const dryRunSucceedResult = await this.eventLog.succeed(transactionId, {
        mode: 'dry_run',
        ventaConfirmada: false,
        compradorWasCreated: false,
        dealId: input.dealId,
      });
      if (dryRunSucceedResult.isErr()) {
        log.error({ error: dryRunSucceedResult.error }, 'EventLog.succeed failed in dry-run (non-blocking)');
      }
    }

    log.info({ compradorExternalId, compradorWasCreated, mode }, 'Separación completada');

    return ok({
      dealId: input.dealId,
      compradorExternalId: compradorExternalId, // undefined in dry-run (no Sinco write)
      compradorWasCreated,
      ventaConfirmada: !dryRun,
      transactionId,
    });
  }

  /**
   * Write-back #2: Cuando el Deal pasa a "Negocio Legalizado".
   * Re-confirma la venta con el plan de pagos final (post-promesa firmada).
   *
   * En Sinco no hay un endpoint separado de "actualizar venta confirmada":
   * el patrón es ejecutar PUT /ConfirmacionVenta otra vez con los datos finales.
   * Sinco internamente actualiza el plan de pagos.
   */
  async legalizar(
    erp: IErpConnector,
    crm: ICrmAdapter,
    input: LegalizacionInput
  ): Promise<Result<SaleWritebackResult, EngineError>> {
    const transactionId = `legalizar_${input.clientId}_${input.dealId}`;
    const log = this.logger.child({
      clientId: input.clientId,
      dealId: input.dealId,
      operation: 'writeback.legalizar',
      transactionId,
    });

    // === Atomic reserve ===
    const beginResult = await this.eventLog.begin({
      transactionId,
      clientId: input.clientId,
      operation: 'writeback.legalizar',
      payload: { dealId: input.dealId },
    });

    if (beginResult.isErr()) {
      log.error({ error: beginResult.error }, 'EventLog.begin failed — aborting');
      return err(beginResult.error);
    }

    switch (beginResult.value.kind) {
      case 'ACQUIRED':
        log.info({}, 'Transaction acquired — proceeding with legalización');
        break;

      case 'ALREADY_SUCCEEDED': {
        log.info({}, 'Legalización already succeeded — idempotent return');
        const storedOutput = beginResult.value.event.output ?? {};
        return ok({
          dealId: input.dealId,
          compradorExternalId: undefined,
          compradorWasCreated: false,
          ventaConfirmada: storedOutput.ventaConfirmada === true,
          transactionId,
          alreadyProcessed: true,
        });
      }

      case 'IN_PROGRESS':
        log.warn({}, 'Legalización in progress by another request — aborting');
        return err(ErpError.operationInProgress(transactionId, {
          dealId: input.dealId,
        }));

      case 'ALREADY_FAILED':
        log.warn({}, 'Legalización previously failed — new transactionId required');
        return err(BusinessError.writebackAlreadyFailed(transactionId, input.dealId));
    }

    // Para legalizar, el comprador y la venta YA deben existir (separación previa).
    // Solo re-ejecutamos PUT /ConfirmacionVenta con datos finales.
    log.info({}, 'Step 1: confirmarVenta (final)');
    const confirmInput: ConfirmacionVentaInput = {
      idVenta: input.venta.idAgrupacionSinco,
      idProyecto: input.venta.idProyectoSinco,
      numeroIdentificacionComprador: input.comprador.numeroIdentificacion,
      fecha: input.venta.fecha,
      porcentajeParticipacion:
        input.compradoresAlternos && input.compradoresAlternos.length > 0
          ? 100 - input.compradoresAlternos.reduce((s, a) => s + a.porcentajeParticipacion, 0)
          : 100,
      valorDescuento: input.venta.valorDescuento,
      valorDescuentoFinanciero: input.venta.valorDescuentoFinanciero,
      tipoVenta: input.venta.tipoVenta,
      idAsesor: input.venta.idAsesor,
      planPagos: input.venta.planPagos,
      compradoresAlternos: input.compradoresAlternos,
      crmDealId: input.dealId,
    };

    const confirmResult = await erp.confirmarVenta(confirmInput);
    if (confirmResult.isErr()) {
      await this.handleFailureBestEffort(crm, log, input.dealId, transactionId, confirmResult.error);
      return err(confirmResult.error);
    }

    // EventLog succeed IMMEDIATELY after Sinco confirms
    const succeedResult = await this.eventLog.succeed(transactionId, {
      mode: 'real',
      ventaConfirmada: true,
      ventaLegalizada: true,
    });

    if (succeedResult.isErr()) {
      log.error(
        { transactionId, error: succeedResult.error, sincoAlreadyConfirmed: true },
        'CRITICAL: Sinco confirmed but EventLog.succeed failed — state inconsistent',
      );
      try {
        await this.markDealStatus(
          crm,
          input.dealId,
          'error',
          `Sinco legalizado, pero EventLog falló: ${succeedResult.error.code}. Requiere intervención manual.`,
          transactionId,
        );
      } catch (crmErr) {
        log.error({ dealId: input.dealId, transactionId, crmErr }, 'Failed to mark CRM as error (best-effort)');
      }
      return err(succeedResult.error);
    }

    const crmUpdateResult = await crm.updateRecord({
      id: input.dealId,
      objectType: 'deal',
      properties: {
        [DEAL_PROPS.writebackStatus]: 'success',
        [DEAL_PROPS.writebackAttemptedAt]: new Date().toISOString(),
        [DEAL_PROPS.writebackTransactionId]: transactionId,
      },
    });

    if (crmUpdateResult.isErr()) {
      log.error({ dealId: input.dealId, error: crmUpdateResult.error }, 'CRM update failed after legalización');
    }

    log.info({}, 'Legalización completada exitosamente');

    return ok({
      dealId: input.dealId,
      compradorExternalId: undefined, // legalizar no crea comprador — ID ya vive en el Deal
      compradorWasCreated: false,
      ventaConfirmada: true,
      transactionId,
    });
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /**
   * Marks the Deal status in HubSpot. Non-blocking: logs warning if CRM update fails
   * but does NOT propagate the error. (v7 HIGH 3: explicit Result handling)
   */
  private async markDealStatus(
    crm: ICrmAdapter,
    dealId: string,
    status: WritebackStatusKey,
    errorMsg: string | undefined,
    transactionId: string,
  ): Promise<void> {
    const properties: Record<string, unknown> = {
      [DEAL_PROPS.writebackStatus]: WRITEBACK_STATUS_MAP[status],
      [DEAL_PROPS.writebackAttemptedAt]: new Date().toISOString(),
      [DEAL_PROPS.writebackTransactionId]: transactionId,
    };
    if (errorMsg !== undefined) {
      properties[DEAL_PROPS.writebackError] = errorMsg;
    }
    const result = await crm.updateRecord({
      id: dealId,
      objectType: 'deal',
      properties,
    });
    if (result.isErr()) {
      this.logger.warn(
        { dealId, status, error: result.error },
        'markDealStatus failed (non-blocking)'
      );
    }
  }

  /**
   * Best-effort failure handler. Logs CRM/EventLog failures but does NOT
   * mask the original error that caused the write-back to fail.
   */
  private async handleFailureBestEffort(
    crm: ICrmAdapter,
    log: Logger,
    dealId: string,
    transactionId: string,
    error: { code: string; message: string },
  ): Promise<void> {
    try {
      await this.markDealStatus(crm, dealId, 'failed', `${error.code}: ${error.message}`, transactionId);
    } catch (crmErr) {
      log.error({ dealId, crmErr }, 'Failed to mark Deal as failed in CRM (best-effort)');
    }
    // fail() now returns Result — no try/catch needed
    const failResult = await this.eventLog.fail(transactionId, error);
    if (failResult.isErr()) {
      log.error({ dealId, error: failResult.error }, 'EventLog.fail failed (best-effort)');
    }
  }
}
