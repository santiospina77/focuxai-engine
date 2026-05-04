/**
 * PgEventLog — Integration tests (WB-2 CR v4)
 *
 * 10 tests contra Neon Postgres real.
 * Gated: solo corren si DATABASE_URL + RUN_PG_EVENTLOG_TESTS=true.
 *
 * IMPORTANTE: estos tests CREAN registros en event_log.
 * Usan prefijo 'pg-test-' para evitar colisión con data real.
 * La tabla se trunca al inicio de la suite.
 *
 * Uses node:test + node:assert (project standard).
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

const shouldRun =
  process.env.DATABASE_URL && process.env.RUN_PG_EVENTLOG_TESTS === 'true';

// Skip entire suite if env not configured
describe('PgEventLog (integration)', { skip: !shouldRun }, () => {
  // Lazy imports — only resolve when suite actually runs
  let PgEventLog: typeof import('../PgEventLog').PgEventLog;
  let getDb: typeof import('../../db/neon').getDb;
  let log: InstanceType<typeof import('../PgEventLog').PgEventLog>;

  const noop = () => {};
  const testLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child() { return testLogger; },
  } as any;

  /** Unique prefix per test run to avoid collisions */
  const prefix = `pg-test-${Date.now()}-`;

  before(async () => {
    const pgMod = await import('../PgEventLog');
    const dbMod = await import('../../db/neon');
    PgEventLog = pgMod.PgEventLog;
    getDb = dbMod.getDb;
    log = new PgEventLog(testLogger);

    // Cleanup: delete only rows from THIS test run's prefix
    const sql = getDb();
    await sql`DELETE FROM event_log WHERE transaction_id LIKE ${prefix + '%'}`;
  });

  // ─── 1. Full lifecycle: ACQUIRED → succeed → ALREADY_SUCCEEDED ───

  it('begin() ACQUIRED → succeed() → begin() ALREADY_SUCCEEDED', async () => {
    const txId = `${prefix}lifecycle-ok`;
    const r1 = await log.begin({
      transactionId: txId,
      clientId: 'test',
      operation: 'separar',
      payload: { dealId: 'd1' },
    });
    assert.equal(r1.isErr(), false);
    assert.equal(r1.unwrap().kind, 'ACQUIRED');

    const r2 = await log.succeed(txId, { ventaConfirmada: true, mode: 'real' });
    assert.equal(r2.isErr(), false);
    assert.equal(r2.unwrap().status, 'success');

    const r3 = await log.begin({
      transactionId: txId,
      clientId: 'test',
      operation: 'separar',
    });
    assert.equal(r3.isErr(), false);
    assert.equal(r3.unwrap().kind, 'ALREADY_SUCCEEDED');
    assert.equal(r3.unwrap().event.status, 'success');
  });

  // ─── 2. Failed terminal: ACQUIRED → fail → ALREADY_FAILED ───

  it('begin() ACQUIRED → fail() → begin() ALREADY_FAILED', async () => {
    const txId = `${prefix}lifecycle-fail`;
    await log.begin({
      transactionId: txId,
      clientId: 'test',
      operation: 'separar',
    });

    await log.fail(txId, { code: 'ERP_SINCO_ERROR', message: 'boom' });

    const r = await log.begin({
      transactionId: txId,
      clientId: 'test',
      operation: 'separar',
    });
    assert.equal(r.isErr(), false);
    assert.equal(r.unwrap().kind, 'ALREADY_FAILED');
  });

  // ─── 3. succeed() on non-existent txId → BusinessError ───

  it('succeed() on non-existent txId returns BusinessError', async () => {
    const r = await log.succeed(`${prefix}ghost`);
    assert.equal(r.isErr(), true);
    assert.ok(r.isErr() && r.error.code === 'BUSINESS_EVENT_LOG_INVALID_TRANSITION');
  });

  // ─── 4. fail() on already-succeeded txId → BusinessError ───

  it('fail() on already-succeeded txId returns BusinessError', async () => {
    const txId = `${prefix}succ-then-fail`;
    await log.begin({ transactionId: txId, clientId: 'test', operation: 'op' });
    await log.succeed(txId);

    const r = await log.fail(txId, { code: 'TEST', message: 'late fail' });
    assert.equal(r.isErr(), true);
    assert.ok(r.isErr() && r.error.code === 'BUSINESS_EVENT_LOG_INVALID_TRANSITION');
  });

  // ─── 5. query() respects limit cap (max 200) ───

  it('query() respects limit cap', async () => {
    // Insert 5 events
    for (let i = 0; i < 5; i++) {
      await log.begin({
        transactionId: `${prefix}q-${i}`,
        clientId: 'test-limit',
        operation: 'separar',
      });
    }

    const r3 = await log.query({ clientId: 'test-limit', limit: 3 });
    assert.equal(r3.isErr(), false);
    assert.equal(r3.unwrap().length, 3);

    // limit 999 → capped at 200, but only 5 exist
    const rAll = await log.query({ clientId: 'test-limit', limit: 999 });
    assert.equal(rAll.isErr(), false);
    assert.equal(rAll.unwrap().length, 5);
  });

  // ─── 6. query() filters by clientId + operation + status ───

  it('query() filters by clientId + operation + status', async () => {
    const txId = `${prefix}filter-ok`;
    await log.begin({
      transactionId: txId,
      clientId: 'filter-client',
      operation: 'legalizar',
    });
    await log.succeed(txId);

    const r = await log.query({
      clientId: 'filter-client',
      operation: 'legalizar',
      status: 'success',
    });
    assert.equal(r.isErr(), false);
    const events = r.unwrap();
    assert.ok(events.length >= 1);
    assert.equal(events[0].transactionId, txId);
    assert.equal(events[0].status, 'success');
  });

  // ─── 7. hasSucceeded() returns ok(true) after succeed ───

  it('hasSucceeded() returns ok(true) after succeed', async () => {
    const txId = `${prefix}has-succ`;
    await log.begin({ transactionId: txId, clientId: 'test', operation: 'op' });
    await log.succeed(txId);

    const r = await log.hasSucceeded(txId);
    assert.equal(r.isErr(), false);
    assert.equal(r.unwrap(), true);

    // Non-existent → false
    const r2 = await log.hasSucceeded(`${prefix}nope`);
    assert.equal(r2.unwrap(), false);
  });

  // ─── 8. ALREADY_SUCCEEDED event contains stored output ───

  it('ALREADY_SUCCEEDED event contains stored output', async () => {
    const txId = `${prefix}output-check`;
    await log.begin({ transactionId: txId, clientId: 'test', operation: 'separar' });
    await log.succeed(txId, {
      ventaConfirmada: true,
      mode: 'real',
      compradorExternalId: 'EXT-99',
    });

    const r = await log.begin({
      transactionId: txId,
      clientId: 'test',
      operation: 'separar',
    });
    const val = r.unwrap();
    assert.equal(val.kind, 'ALREADY_SUCCEEDED');
    assert.deepEqual(val.event.output, {
      ventaConfirmada: true,
      mode: 'real',
      compradorExternalId: 'EXT-99',
    });
  });

  // ─── 9. Concurrency: 10× begin() → exactly 1 ACQUIRED + 9 IN_PROGRESS ───

  it('concurrency: 10× begin() → 1 ACQUIRED + 9 IN_PROGRESS', async () => {
    const txId = `${prefix}concurrent`;
    const input = {
      transactionId: txId,
      clientId: 'test',
      operation: 'separar',
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => log.begin(input)),
    );

    let acquired = 0;
    let inProgress = 0;
    for (const r of results) {
      assert.equal(r.isErr(), false);
      const kind = r.unwrap().kind;
      if (kind === 'ACQUIRED') acquired++;
      else if (kind === 'IN_PROGRESS') inProgress++;
      else assert.fail(`Unexpected kind: ${kind}`);
    }

    assert.equal(acquired, 1, 'Exactly 1 ACQUIRED');
    assert.equal(inProgress, 9, 'Exactly 9 IN_PROGRESS');
  });

  // ─── 10. Dry-run replay: ALREADY_SUCCEEDED returns ventaConfirmada=false ───

  it('ALREADY_SUCCEEDED dry-run returns ventaConfirmada=false', async () => {
    const txId = `${prefix}dryrun-replay`;
    await log.begin({ transactionId: txId, clientId: 'test', operation: 'separar' });
    await log.succeed(txId, { ventaConfirmada: false, mode: 'dry_run' });

    const r = await log.begin({
      transactionId: txId,
      clientId: 'test',
      operation: 'separar',
    });
    const val = r.unwrap();
    assert.equal(val.kind, 'ALREADY_SUCCEEDED');
    assert.equal(val.event.output?.ventaConfirmada, false);
    assert.equal(val.event.output?.mode, 'dry_run');
  });
});
