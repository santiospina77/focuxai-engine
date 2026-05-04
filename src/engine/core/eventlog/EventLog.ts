/**
 * EventLog — Registro de operaciones del Engine para idempotencia + auditoría.
 *
 * Cada operación crítica (sync, write-back) genera un evento con:
 *   - transactionId único (idempotencia: si se reintenta no se re-ejecuta)
 *   - clientId
 *   - operation (qué hizo)
 *   - status (pending, success, failed)
 *   - timestamps + duration
 *   - input/output payload para debugging
 *
 * IEventLog retorna Result<T, EngineError> — Engine never throws.
 *
 * Implementaciones:
 *   - InMemoryEventLog: suficiente para dry-run y tests unitarios.
 *   - PgEventLog: persistencia cross-request con Neon Postgres (real mode).
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import type { Logger } from '../logging/Logger';
import { type Result, ok, err } from '../types/Result';
import { BusinessError, type EngineError } from '../errors/EngineError';

export type EventStatus = 'pending' | 'success' | 'failed';

export interface EngineEvent {
  readonly transactionId: string;
  readonly clientId: string;
  readonly operation: string;
  readonly status: EventStatus;
  readonly startedAt: Date;
  readonly endedAt?: Date;
  readonly durationMs?: number;
  readonly input?: Readonly<Record<string, unknown>>;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface EventLogQuery {
  readonly clientId?: string;
  readonly operation?: string;
  readonly status?: EventStatus;
  readonly transactionId?: string;
  readonly limit?: number;
}

/**
 * Discriminated union para el resultado de begin().
 * El caller hace switch(result.kind) para decidir cómo proceder.
 *
 *   ACQUIRED         → esta request ganó la reserva, puede proceder
 *   IN_PROGRESS      → otra request tiene la reserva, bail
 *   ALREADY_SUCCEEDED → ya se completó con éxito, retornar idempotente
 *   ALREADY_FAILED   → ya falló, necesita nuevo transactionId con _retry_N
 */
export type BeginEventResult =
  | { readonly kind: 'ACQUIRED'; readonly event: EngineEvent }
  | { readonly kind: 'IN_PROGRESS'; readonly event: EngineEvent }
  | { readonly kind: 'ALREADY_SUCCEEDED'; readonly event: EngineEvent }
  | { readonly kind: 'ALREADY_FAILED'; readonly event: EngineEvent };

export interface IEventLog {
  /**
   * Verifica si un transactionId ya fue procesado exitosamente.
   * NOTA: NO usar como gate primario — usar begin() directamente.
   * Mantenido para queries de status en endpoints informativos.
   */
  hasSucceeded(transactionId: string): Promise<Result<boolean, EngineError>>;

  /**
   * Atomic reserve: intenta reservar un transactionId.
   * Returns discriminated union — caller MUST switch on kind:
   *   ACQUIRED → proceed with operation
   *   IN_PROGRESS → another request is executing, bail
   *   ALREADY_SUCCEEDED → idempotent return, no-op
   *   ALREADY_FAILED → terminal, new txId required
   */
  begin(input: {
    transactionId: string;
    clientId: string;
    operation: string;
    payload?: Record<string, unknown>;
  }): Promise<Result<BeginEventResult, EngineError>>;

  /**
   * Marca éxito. Solo transiciona pending → success.
   * 0 rows affected = typed BusinessError.
   */
  succeed(
    transactionId: string,
    output?: Record<string, unknown>,
  ): Promise<Result<EngineEvent, EngineError>>;

  /**
   * Marca fallo. Solo transiciona pending → failed. Failed es TERMINAL.
   * 0 rows affected = typed BusinessError.
   */
  fail(
    transactionId: string,
    error: { code: string; message: string },
  ): Promise<Result<EngineEvent, EngineError>>;

  /**
   * Query de eventos para debugging / dashboards.
   * Limit capped: min 1, max 200, default 50.
   */
  query(q: EventLogQuery): Promise<Result<readonly EngineEvent[], EngineError>>;
}

// ============================================================================
// InMemoryEventLog — para dry-run y tests unitarios (NO para real mode)
// ============================================================================

/**
 * Implementación in-memory. Suficiente para idempotencia DENTRO de una
 * misma invocación de Vercel (sync orchestrator) y para tests unitarios.
 *
 * IMPORTANTE: NO persiste entre invocaciones. Para idempotencia cross-request,
 * usar PgEventLog.
 */
export class InMemoryEventLog implements IEventLog {
  private readonly events = new Map<string, EngineEvent>();

  constructor(private readonly logger: Logger) {}

  async hasSucceeded(transactionId: string): Promise<Result<boolean, EngineError>> {
    const event = this.events.get(transactionId);
    return ok(event?.status === 'success');
  }

  async begin(input: {
    transactionId: string;
    clientId: string;
    operation: string;
    payload?: Record<string, unknown>;
  }): Promise<Result<BeginEventResult, EngineError>> {
    const existing = this.events.get(input.transactionId);

    if (existing) {
      switch (existing.status) {
        case 'pending':
          return ok({ kind: 'IN_PROGRESS', event: existing });
        case 'success':
          return ok({ kind: 'ALREADY_SUCCEEDED', event: existing });
        case 'failed':
          return ok({ kind: 'ALREADY_FAILED', event: existing });
      }
    }

    const event: EngineEvent = {
      transactionId: input.transactionId,
      clientId: input.clientId,
      operation: input.operation,
      status: 'pending',
      startedAt: new Date(),
      input: input.payload,
    };
    this.events.set(input.transactionId, event);
    this.logger.info(
      {
        transactionId: input.transactionId,
        clientId: input.clientId,
        operation: input.operation,
      },
      'Event begin',
    );
    return ok({ kind: 'ACQUIRED', event });
  }

  async succeed(
    transactionId: string,
    output?: Record<string, unknown>,
  ): Promise<Result<EngineEvent, EngineError>> {
    const event = this.events.get(transactionId);
    if (!event || event.status !== 'pending') {
      return err(BusinessError.eventLogInvalidTransition(transactionId, 'pending'));
    }
    const endedAt = new Date();
    const updated: EngineEvent = {
      ...event,
      status: 'success',
      endedAt,
      durationMs: endedAt.getTime() - event.startedAt.getTime(),
      output,
    };
    this.events.set(transactionId, updated);
    this.logger.info(
      {
        transactionId,
        operation: event.operation,
        durationMs: updated.durationMs,
      },
      'Event succeed',
    );
    return ok(updated);
  }

  async fail(
    transactionId: string,
    error: { code: string; message: string },
  ): Promise<Result<EngineEvent, EngineError>> {
    const event = this.events.get(transactionId);
    if (!event || event.status !== 'pending') {
      return err(BusinessError.eventLogInvalidTransition(transactionId, 'pending'));
    }
    const endedAt = new Date();
    const updated: EngineEvent = {
      ...event,
      status: 'failed',
      endedAt,
      durationMs: endedAt.getTime() - event.startedAt.getTime(),
      errorCode: error.code,
      errorMessage: error.message,
    };
    this.events.set(transactionId, updated);
    this.logger.error(
      {
        transactionId,
        operation: event.operation,
        durationMs: updated.durationMs,
        errorCode: error.code,
        errorMessage: error.message,
      },
      'Event fail',
    );
    return ok(updated);
  }

  async query(q: EventLogQuery): Promise<Result<readonly EngineEvent[], EngineError>> {
    const safeLimit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    let results = Array.from(this.events.values());
    if (q.transactionId) {
      results = results.filter((e) => e.transactionId === q.transactionId);
    }
    if (q.clientId) results = results.filter((e) => e.clientId === q.clientId);
    if (q.operation) results = results.filter((e) => e.operation === q.operation);
    if (q.status) results = results.filter((e) => e.status === q.status);
    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return ok(results.slice(0, safeLimit));
  }
}
