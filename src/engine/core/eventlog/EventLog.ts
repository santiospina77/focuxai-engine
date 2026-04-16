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
 * Hoy: implementación in-memory (suficiente para syncs idempotentes en Vercel
 * que terminan dentro de la invocación).
 *
 * Mañana: implementación contra Vercel KV o Postgres para persistir entre
 * invocaciones serverless. El contrato (IEventLog) no cambia.
 */

import type { Logger } from '../logging/Logger';

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

export interface IEventLog {
  /**
   * Verifica si un transactionId ya fue procesado exitosamente.
   * Si retorna true, la operación NO debe ejecutarse de nuevo.
   */
  hasSucceeded(transactionId: string): Promise<boolean>;

  /**
   * Marca el inicio de una operación. Retorna un handle para luego cerrarla.
   */
  begin(input: {
    transactionId: string;
    clientId: string;
    operation: string;
    payload?: Record<string, unknown>;
  }): Promise<EngineEvent>;

  /**
   * Marca el fin exitoso de una operación.
   */
  succeed(transactionId: string, output?: Record<string, unknown>): Promise<void>;

  /**
   * Marca el fin con error de una operación.
   */
  fail(transactionId: string, error: { code: string; message: string }): Promise<void>;

  /**
   * Consulta de eventos para debugging / dashboards.
   */
  query(q: EventLogQuery): Promise<readonly EngineEvent[]>;
}

/**
 * Implementación in-memory. Suficiente para idempotencia DENTRO de una
 * misma invocación de Vercel (sync orchestrator).
 *
 * IMPORTANTE: NO persiste entre invocaciones. Para idempotencia cross-request,
 * implementar VercelKvEventLog o PgEventLog en el futuro.
 */
export class InMemoryEventLog implements IEventLog {
  private readonly events = new Map<string, EngineEvent>();

  constructor(private readonly logger: Logger) {}

  async hasSucceeded(transactionId: string): Promise<boolean> {
    const event = this.events.get(transactionId);
    return event?.status === 'success';
  }

  async begin(input: {
    transactionId: string;
    clientId: string;
    operation: string;
    payload?: Record<string, unknown>;
  }): Promise<EngineEvent> {
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
      'Event begin'
    );
    return event;
  }

  async succeed(transactionId: string, output?: Record<string, unknown>): Promise<void> {
    const event = this.events.get(transactionId);
    if (!event) return;
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
      'Event succeed'
    );
  }

  async fail(
    transactionId: string,
    error: { code: string; message: string }
  ): Promise<void> {
    const event = this.events.get(transactionId);
    if (!event) return;
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
      'Event fail'
    );
  }

  async query(q: EventLogQuery): Promise<readonly EngineEvent[]> {
    let results = Array.from(this.events.values());
    if (q.transactionId) {
      results = results.filter((e) => e.transactionId === q.transactionId);
    }
    if (q.clientId) results = results.filter((e) => e.clientId === q.clientId);
    if (q.operation) results = results.filter((e) => e.operation === q.operation);
    if (q.status) results = results.filter((e) => e.status === q.status);
    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    if (q.limit) results = results.slice(0, q.limit);
    return results;
  }
}
