# ADR-011: Write-Back Idempotency via PgEventLog

**Status:** Accepted
**Date:** 2026-05-25
**Decision makers:** Santiago Ospina (CEO)

---

## Context

Write-back operations (separar, legalizar) are triggered by HubSpot workflows via webhooks. HubSpot guarantees at-least-once delivery — the same webhook may fire multiple times. Sinco ERP does not have native idempotency keys.

If "separar" fires twice for the same Deal, we'd create a duplicate sale in Sinco.

## Decision

Implement idempotency via `PgEventLog` — a Postgres table that records every write-back operation with a unique `transactionId`.

```typescript
transactionId = `${operation}:${dealId}:${timestamp}`
```

Before executing a write-back:
1. Check `pg_event_log` for existing entry with same `operation + dealId`
2. If found and succeeded → return cached result (no re-execution)
3. If found and failed → allow retry (new transactionId)
4. If not found → execute and log result

## Implementation

**Table:** `pg_event_log` (migration `005_event_log.sql`)

```sql
CREATE TABLE pg_event_log (
  id SERIAL PRIMARY KEY,
  transaction_id TEXT UNIQUE NOT NULL,
  operation TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  status TEXT NOT NULL,          -- 'success' | 'failed'
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Usage in webhook handler:**

```typescript
const existing = await eventLog.findByDealAndOperation(dealId, operation);
if (existing?.status === 'success') {
  return jsonOk({ idempotent: true, result: existing.result });
}
// ... proceed with execution
await eventLog.log({ transactionId, operation, dealId, clientId, status, result });
```

## Consequences

**Positive:**
- HubSpot webhook retries are safe — no duplicate sales in Sinco
- Full audit trail of every write-back attempt with timestamp, status, and result
- Failed operations can be retried without data corruption

**Negative:**
- Extra DB round-trip per webhook (SELECT before execution) — acceptable latency (~5ms)
- Log table grows indefinitely — will need cleanup strategy eventually
- Idempotency is per-deal, not per-exact-payload — if the payload changes between retries, the second version is treated as idempotent (returns first result)

---

*Focux | www.focux.co | Documento confidencial*
