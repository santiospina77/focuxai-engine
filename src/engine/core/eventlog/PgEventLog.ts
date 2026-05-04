/**
 * PgEventLog — Persistencia de eventos en Neon Postgres.
 *
 * Garantiza idempotencia cross-request para write-backs a Sinco ERP.
 * Usa @neondatabase/serverless HTTP mode (stateless per invocation).
 *
 * Operación clave: begin() es un atomic reserve via CTE con
 * INSERT ON CONFLICT DO NOTHING + UNION ALL SELECT.
 *
 * WB-2 — CR v4 aprobado por Architect.
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { getDb } from '@/engine/core/db/neon';
import type { Logger } from '@/engine/core/logging/Logger';
import { type Result, ok, err } from '@/engine/core/types/Result';
import { BusinessError, ResourceError } from '@/engine/core/errors/EngineError';
import type { EngineError } from '@/engine/core/errors/EngineError';
import type {
  IEventLog,
  EngineEvent,
  EventLogQuery,
  EventStatus,
  BeginEventResult,
} from './EventLog';

export class PgEventLog implements IEventLog {
  constructor(private readonly logger: Logger) {}

  // ---------------------------------------------------------------------------
  // hasSucceeded — informational query, NOT primary gate
  // ---------------------------------------------------------------------------

  async hasSucceeded(transactionId: string): Promise<Result<boolean, EngineError>> {
    try {
      const sql = getDb();
      const rows = await sql`
        SELECT 1 FROM event_log
        WHERE transaction_id = ${transactionId}
          AND status = 'success'
        LIMIT 1
      `;
      return ok(rows.length > 0);
    } catch (cause) {
      return err(ResourceError.eventLogFailed(
        `hasSucceeded() failed for ${transactionId}`,
        { transactionId },
        cause,
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // begin — atomic reserve with CTE
  // ---------------------------------------------------------------------------

  async begin(input: {
    transactionId: string;
    clientId: string;
    operation: string;
    payload?: Record<string, unknown>;
  }): Promise<Result<BeginEventResult, EngineError>> {
    try {
      const sql = getDb();
      const payloadJson = input.payload ? JSON.stringify(input.payload) : null;

      let rows = await sql`
        WITH inserted AS (
          INSERT INTO event_log (
            transaction_id, client_id, operation, status, payload, started_at
          )
          VALUES (
            ${input.transactionId},
            ${input.clientId},
            ${input.operation},
            'pending',
            ${payloadJson}::jsonb,
            NOW()
          )
          ON CONFLICT (transaction_id) DO NOTHING
          RETURNING
            id, transaction_id, client_id, operation, status,
            payload, output, error_code, error_message,
            started_at, ended_at, duration_ms, updated_at,
            TRUE AS is_new
        )
        SELECT
          id, transaction_id, client_id, operation, status,
          payload, output, error_code, error_message,
          started_at, ended_at, duration_ms, updated_at,
          is_new
        FROM inserted

        UNION ALL

        SELECT
          id, transaction_id, client_id, operation, status,
          payload, output, error_code, error_message,
          started_at, ended_at, duration_ms, updated_at,
          FALSE AS is_new
        FROM event_log
        WHERE transaction_id = ${input.transactionId}
          AND NOT EXISTS (SELECT 1 FROM inserted)

        LIMIT 1
      `;

      // Fallback: visibility race — CTE conflict detected a row not yet visible
      if (rows.length === 0) {
        this.logger.warn(
          { transactionId: input.transactionId },
          'begin() CTE returned 0 rows — visibility race, retrying with direct SELECT',
        );
        rows = await sql`
          SELECT
            id, transaction_id, client_id, operation, status,
            payload, output, error_code, error_message,
            started_at, ended_at, duration_ms, updated_at,
            FALSE AS is_new
          FROM event_log
          WHERE transaction_id = ${input.transactionId}
          LIMIT 1
        `;
      }

      if (rows.length === 0) {
        return err(ResourceError.eventLogFailed(
          `begin() returned 0 rows for ${input.transactionId} after fallback — unexpected`,
          { transactionId: input.transactionId },
        ));
      }

      const row = rows[0];
      const event = this.rowToEvent(row);

      if (row.is_new) {
        this.logger.info(
          { transactionId: input.transactionId, operation: input.operation },
          'EventLog.begin ACQUIRED (Postgres)',
        );
        return ok({ kind: 'ACQUIRED', event });
      }

      // Row already existed — classify by status
      switch (row.status) {
        case 'pending':
          this.logger.warn(
            { transactionId: input.transactionId },
            'EventLog.begin IN_PROGRESS — another request holds this transaction',
          );
          return ok({ kind: 'IN_PROGRESS', event });

        case 'success':
          this.logger.info(
            { transactionId: input.transactionId },
            'EventLog.begin ALREADY_SUCCEEDED — idempotent no-op',
          );
          return ok({ kind: 'ALREADY_SUCCEEDED', event });

        case 'failed':
          this.logger.warn(
            { transactionId: input.transactionId },
            'EventLog.begin ALREADY_FAILED — new transactionId required for retry',
          );
          return ok({ kind: 'ALREADY_FAILED', event });

        default:
          return err(ResourceError.eventLogFailed(
            `Unknown status "${row.status}" for ${input.transactionId}`,
            { transactionId: input.transactionId },
          ));
      }
    } catch (cause) {
      return err(ResourceError.eventLogFailed(
        `begin() failed for ${input.transactionId}`,
        { transactionId: input.transactionId },
        cause,
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // succeed — UPDATE RETURNING, 0 rows = typed error
  // ---------------------------------------------------------------------------

  async succeed(
    transactionId: string,
    output?: Record<string, unknown>,
  ): Promise<Result<EngineEvent, EngineError>> {
    try {
      const sql = getDb();
      const rows = await sql`
        UPDATE event_log
        SET status = 'success',
            output = ${output ? JSON.stringify(output) : null}::jsonb,
            ended_at = NOW(),
            duration_ms = FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::int
        WHERE transaction_id = ${transactionId}
          AND status = 'pending'
        RETURNING
          id, transaction_id, client_id, operation, status,
          payload, output, error_code, error_message,
          started_at, ended_at, duration_ms, updated_at
      `;

      if (rows.length === 0) {
        this.logger.error(
          { transactionId },
          'succeed() — no pending event found (invalid transition or missing txId)',
        );
        return err(BusinessError.eventLogInvalidTransition(transactionId, 'pending'));
      }

      const event = this.rowToEvent(rows[0]);
      this.logger.info(
        { transactionId, durationMs: event.durationMs },
        'EventLog.succeed (Postgres)',
      );
      return ok(event);
    } catch (cause) {
      return err(ResourceError.eventLogFailed(
        `succeed() failed for ${transactionId}`,
        { transactionId },
        cause,
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // fail — UPDATE RETURNING, 0 rows = typed error
  // ---------------------------------------------------------------------------

  async fail(
    transactionId: string,
    error: { code: string; message: string },
  ): Promise<Result<EngineEvent, EngineError>> {
    try {
      const sql = getDb();
      const rows = await sql`
        UPDATE event_log
        SET status = 'failed',
            error_code = ${error.code},
            error_message = ${error.message.slice(0, 500)},
            ended_at = NOW(),
            duration_ms = FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::int
        WHERE transaction_id = ${transactionId}
          AND status = 'pending'
        RETURNING
          id, transaction_id, client_id, operation, status,
          payload, output, error_code, error_message,
          started_at, ended_at, duration_ms, updated_at
      `;

      if (rows.length === 0) {
        this.logger.error(
          { transactionId },
          'fail() — no pending event found (invalid transition or missing txId)',
        );
        return err(BusinessError.eventLogInvalidTransition(transactionId, 'pending'));
      }

      const event = this.rowToEvent(rows[0]);
      this.logger.info(
        { transactionId, errorCode: error.code, durationMs: event.durationMs },
        'EventLog.fail (Postgres)',
      );
      return ok(event);
    } catch (cause) {
      return err(ResourceError.eventLogFailed(
        `fail() failed for ${transactionId}`,
        { transactionId },
        cause,
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // query — limit capped [1, 200], default 50
  // ---------------------------------------------------------------------------

  async query(q: EventLogQuery): Promise<Result<readonly EngineEvent[], EngineError>> {
    try {
      const sql = getDb();
      const safeLimit = Math.min(Math.max(q.limit ?? 50, 1), 200);

      const rows = await sql`
        SELECT
          id, transaction_id, client_id, operation, status,
          payload, output, error_code, error_message,
          started_at, ended_at, duration_ms, updated_at
        FROM event_log
        WHERE (${q.transactionId ?? null}::text IS NULL OR transaction_id = ${q.transactionId ?? null})
          AND (${q.clientId ?? null}::text IS NULL OR client_id = ${q.clientId ?? null})
          AND (${q.operation ?? null}::text IS NULL OR operation = ${q.operation ?? null})
          AND (${q.status ?? null}::text IS NULL OR status = ${q.status ?? null})
        ORDER BY started_at DESC
        LIMIT ${safeLimit}
      `;

      return ok(rows.map((row: any) => this.rowToEvent(row)));
    } catch (cause) {
      return err(ResourceError.eventLogFailed(
        'query() failed',
        {},
        cause,
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Helper
  // ---------------------------------------------------------------------------

  private rowToEvent(row: any): EngineEvent {
    return {
      transactionId: row.transaction_id,
      clientId: row.client_id,
      operation: row.operation,
      status: row.status as EventStatus,
      startedAt: new Date(row.started_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
      durationMs: row.duration_ms ?? undefined,
      input: row.payload ?? undefined,
      output: row.output ?? undefined,
      errorCode: row.error_code ?? undefined,
      errorMessage: row.error_message ?? undefined,
    };
  }
}
