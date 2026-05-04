/**
 * InMemoryEventLog — Unit tests (WB-2 CR v4)
 *
 * 4 tests validando el contrato BeginEventResult + transiciones de estado.
 * Uses node:test + node:assert (project standard).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEventLog } from '../EventLog';
import type { Logger } from '../../logging/Logger';

// Minimal no-op logger for tests
const noop = () => {};
const testLogger: Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  child: () => testLogger,
} as unknown as Logger;

describe('InMemoryEventLog', () => {
  const baseInput = {
    transactionId: 'tx-test-001',
    clientId: 'jimenez_demo',
    operation: 'separar',
    payload: { dealId: 'deal-1' },
  };

  it('begin() returns ACQUIRED for new txId', async () => {
    const log = new InMemoryEventLog(testLogger);
    const result = await log.begin(baseInput);

    assert.equal(result.isErr(), false);
    const val = result.unwrap();
    assert.equal(val.kind, 'ACQUIRED');
    assert.equal(val.event.transactionId, 'tx-test-001');
    assert.equal(val.event.status, 'pending');
    assert.equal(val.event.clientId, 'jimenez_demo');
    assert.equal(val.event.operation, 'separar');
  });

  it('begin() returns IN_PROGRESS for pending txId', async () => {
    const log = new InMemoryEventLog(testLogger);
    await log.begin(baseInput);

    const result = await log.begin(baseInput);
    assert.equal(result.isErr(), false);
    const val = result.unwrap();
    assert.equal(val.kind, 'IN_PROGRESS');
    assert.equal(val.event.status, 'pending');
  });

  it('begin() returns ALREADY_SUCCEEDED after succeed()', async () => {
    const log = new InMemoryEventLog(testLogger);
    await log.begin(baseInput);
    await log.succeed(baseInput.transactionId, { ventaConfirmada: true });

    const result = await log.begin(baseInput);
    assert.equal(result.isErr(), false);
    const val = result.unwrap();
    assert.equal(val.kind, 'ALREADY_SUCCEEDED');
    assert.equal(val.event.status, 'success');
    assert.deepEqual(val.event.output, { ventaConfirmada: true });
  });

  it('begin() returns ALREADY_FAILED after fail()', async () => {
    const log = new InMemoryEventLog(testLogger);
    await log.begin(baseInput);
    await log.fail(baseInput.transactionId, {
      code: 'ERP_SINCO_ERROR',
      message: 'Sinco 500',
    });

    const result = await log.begin(baseInput);
    assert.equal(result.isErr(), false);
    const val = result.unwrap();
    assert.equal(val.kind, 'ALREADY_FAILED');
    assert.equal(val.event.status, 'failed');
    assert.equal(val.event.errorCode, 'ERP_SINCO_ERROR');
  });

  it('succeed() on non-existent txId returns BusinessError', async () => {
    const log = new InMemoryEventLog(testLogger);
    const result = await log.succeed('tx-does-not-exist');
    assert.equal(result.isErr(), true);
    assert.ok(result.isErr() && result.error.code === 'BUSINESS_EVENT_LOG_INVALID_TRANSITION');
  });

  it('fail() on already-succeeded txId returns BusinessError', async () => {
    const log = new InMemoryEventLog(testLogger);
    await log.begin(baseInput);
    await log.succeed(baseInput.transactionId);

    const result = await log.fail(baseInput.transactionId, {
      code: 'TEST',
      message: 'test',
    });
    assert.equal(result.isErr(), true);
    assert.ok(result.isErr() && result.error.code === 'BUSINESS_EVENT_LOG_INVALID_TRANSITION');
  });

  it('query() respects limit cap', async () => {
    const log = new InMemoryEventLog(testLogger);
    // Insert 5 events
    for (let i = 0; i < 5; i++) {
      await log.begin({
        transactionId: `tx-q-${i}`,
        clientId: 'jimenez_demo',
        operation: 'separar',
      });
    }

    const result = await log.query({ clientId: 'jimenez_demo', limit: 3 });
    assert.equal(result.isErr(), false);
    assert.equal(result.unwrap().length, 3);

    // limit > count → returns all
    const all = await log.query({ clientId: 'jimenez_demo', limit: 999 });
    assert.equal(all.unwrap().length, 5); // capped at 200, but only 5 exist
  });

  it('query() filters by status', async () => {
    const log = new InMemoryEventLog(testLogger);
    await log.begin({ transactionId: 'tx-s1', clientId: 'c1', operation: 'op' });
    await log.succeed('tx-s1');
    await log.begin({ transactionId: 'tx-s2', clientId: 'c1', operation: 'op' });
    // tx-s2 stays pending

    const successes = await log.query({ clientId: 'c1', status: 'success' });
    assert.equal(successes.unwrap().length, 1);
    assert.equal(successes.unwrap()[0].transactionId, 'tx-s1');

    const pendings = await log.query({ clientId: 'c1', status: 'pending' });
    assert.equal(pendings.unwrap().length, 1);
    assert.equal(pendings.unwrap()[0].transactionId, 'tx-s2');
  });
});
