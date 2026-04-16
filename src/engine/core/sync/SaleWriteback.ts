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
import { ErpError, type EngineError } from '../errors/EngineError';
import type { IEventLog } from '../eventlog/EventLog';
import { type Result, ok, err } from '../types/Result';

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
  readonly compradorExternalId: number;
  readonly compradorWasCreated: boolean;
  readonly ventaConfirmada: boolean;
  readonly transactionId: string;
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
   */
  async separar(
    erp: IErpConnector,
    crm: ICrmAdapter,
    input: SeparacionInput
  ): Promise<Result<SaleWritebackResult, EngineError>> {
    const transactionId = `separar_${input.clientId}_${input.dealId}`;
    const log = this.logger.child({
      clientId: input.clientId,
      dealId: input.dealId,
      operation: 'writeback.separar',
      transactionId,
    });

    // Idempotencia: si ya se ejecutó, no repetir.
    if (await this.eventLog.hasSucceeded(transactionId)) {
      log.warn({}, 'Separación ya ejecutada, no se repite');
      return err(
        new ErpError(
          'ERP_BUSINESS_RULE_VIOLATION',
          'Esta separación ya fue procesada (idempotencia)',
          { dealId: input.dealId, transactionId, retryable: false }
        )
      );
    }

    await this.eventLog.begin({
      transactionId,
      clientId: input.clientId,
      operation: 'writeback.separar',
      payload: {
        dealId: input.dealId,
        cedula: input.comprador.numeroIdentificacion,
        idAgrupacion: input.venta.idAgrupacionSinco,
      },
    });

    // Marcar Deal como pending en HubSpot.
    await this.markDealStatus(crm, input.dealId, 'pending', undefined, transactionId);

    // ---------------------------------------------------------------------
    // Paso 1: Buscar o crear comprador
    // ---------------------------------------------------------------------
    log.info({}, 'Step 1: getCompradorByIdentificacion');
    const lookupResult = await erp.getCompradorByIdentificacion(
      input.comprador.numeroIdentificacion
    );

    if (lookupResult.isErr()) {
      await this.handleFailure(crm, input.dealId, transactionId, lookupResult.error);
      return err(lookupResult.error);
    }

    let compradorExternalId: number;
    let compradorWasCreated = false;

    if (lookupResult.value) {
      compradorExternalId = lookupResult.value.externalId;
      log.info({ compradorExternalId }, 'Comprador ya existe en Sinco, reusing');
    } else {
      log.info({}, 'Step 1b: createComprador');
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
        aceptoPoliticaDatos: true,
      };
      const createResult = await erp.createComprador(createInput);
      if (createResult.isErr()) {
        await this.handleFailure(crm, input.dealId, transactionId, createResult.error);
        return err(createResult.error);
      }
      compradorExternalId = createResult.value.externalId;
      compradorWasCreated = true;
      log.info({ compradorExternalId }, 'Comprador creado en Sinco');
    }

    // ---------------------------------------------------------------------
    // Paso 2: Confirmar venta
    // ---------------------------------------------------------------------
    log.info({}, 'Step 2: confirmarVenta');
    const confirmInput: ConfirmacionVentaInput = {
      idVenta: input.venta.idAgrupacionSinco, // idVenta = idAgrupacion
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
      await this.handleFailure(crm, input.dealId, transactionId, confirmResult.error);
      return err(confirmResult.error);
    }

    // ---------------------------------------------------------------------
    // Paso 3: Actualizar Deal con éxito
    // ---------------------------------------------------------------------
    await crm.updateRecord({
      id: input.dealId,
      objectType: 'deal',
      properties: {
        [DEAL_PROPS.writebackStatus]: 'success',
        [DEAL_PROPS.writebackError]: '',
        [DEAL_PROPS.writebackAttemptedAt]: new Date().toISOString(),
        [DEAL_PROPS.writebackTransactionId]: transactionId,
        [DEAL_PROPS.compradorIdSinco]: compradorExternalId,
        [DEAL_PROPS.ventaIdSinco]: input.venta.idAgrupacionSinco,
      },
    });

    await this.eventLog.succeed(transactionId, {
      compradorExternalId,
      compradorWasCreated,
      ventaConfirmada: true,
    });

    log.info(
      { compradorExternalId, compradorWasCreated },
      'Separación completada exitosamente'
    );

    return ok({
      dealId: input.dealId,
      compradorExternalId,
      compradorWasCreated,
      ventaConfirmada: true,
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

    if (await this.eventLog.hasSucceeded(transactionId)) {
      log.warn({}, 'Legalización ya ejecutada, no se repite');
      return err(
        new ErpError(
          'ERP_BUSINESS_RULE_VIOLATION',
          'Esta legalización ya fue procesada (idempotencia)',
          { dealId: input.dealId, transactionId, retryable: false }
        )
      );
    }

    await this.eventLog.begin({
      transactionId,
      clientId: input.clientId,
      operation: 'writeback.legalizar',
      payload: { dealId: input.dealId },
    });

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
      await this.handleFailure(crm, input.dealId, transactionId, confirmResult.error);
      return err(confirmResult.error);
    }

    await crm.updateRecord({
      id: input.dealId,
      objectType: 'deal',
      properties: {
        [DEAL_PROPS.writebackStatus]: 'success',
        [DEAL_PROPS.writebackAttemptedAt]: new Date().toISOString(),
        [DEAL_PROPS.writebackTransactionId]: transactionId,
      },
    });

    await this.eventLog.succeed(transactionId, { ventaLegalizada: true });

    log.info({}, 'Legalización completada exitosamente');

    return ok({
      dealId: input.dealId,
      compradorExternalId: 0, // ya existía
      compradorWasCreated: false,
      ventaConfirmada: true,
      transactionId,
    });
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private async markDealStatus(
    crm: ICrmAdapter,
    dealId: string,
    status: 'pending' | 'success' | 'failed',
    errorMsg: string | undefined,
    transactionId: string
  ): Promise<void> {
    const properties: Record<string, unknown> = {
      [DEAL_PROPS.writebackStatus]: status,
      [DEAL_PROPS.writebackAttemptedAt]: new Date().toISOString(),
      [DEAL_PROPS.writebackTransactionId]: transactionId,
    };
    if (errorMsg !== undefined) {
      properties[DEAL_PROPS.writebackError] = errorMsg;
    }
    await crm.updateRecord({
      id: dealId,
      objectType: 'deal',
      properties,
    });
  }

  private async handleFailure(
    crm: ICrmAdapter,
    dealId: string,
    transactionId: string,
    error: EngineError
  ): Promise<void> {
    await this.markDealStatus(
      crm,
      dealId,
      'failed',
      `${error.code}: ${error.message}`,
      transactionId
    );
    await this.eventLog.fail(transactionId, {
      code: error.code,
      message: error.message,
    });
  }
}
