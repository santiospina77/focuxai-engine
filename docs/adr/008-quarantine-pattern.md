# ADR-008: Quarantine Pattern — Bad Data Isolated, Not Fatal

**Status:** Accepted
**Date:** 2026-05-12
**Decision makers:** Santiago Ospina (CEO)

---

## Context

Inventory sync pulls data from Sinco and writes it to HubSpot. Sinco data quality is inconsistent: some units have missing prices, some projects have null names, some agrupaciones reference non-existent projects.

Two approaches:
1. **Fail-fast:** If any record is bad, abort the entire sync
2. **Quarantine:** Isolate bad records, continue syncing good ones

## Decision

Quarantine pattern: bad individual records are logged and excluded from the sync result. Bad configuration (missing token, unknown client) aborts the entire operation.

```
Bad individual data → quarantine record + continue + warn
Bad config (token, client) → abort entire operation + error
```

## Rationale

Jiménez has ~3,700 units across 28 projects. If one unit in one project has a null price, failing the entire sync means 3,699 good records don't get updated. The quarantine approach maximizes data availability.

The inventory audit endpoint (`/api/engine/audit/inventory`) reports all quarantined records so they can be investigated and fixed at the source (Sinco).

## Implementation

In `InventorySync`:
- Each record is validated individually
- Records that fail validation are added to a `quarantined[]` array with the reason
- Valid records are synced normally
- The sync result includes `quarantined: { count, records[] }` for audit

In the cotizador:
- Only clean (non-quarantined) records reach the frontend
- The end user never sees incomplete or broken data

## Consequences

**Positive:**
- Maximizes data availability — one bad record doesn't block 3,699 good ones
- Audit trail — quarantined records are logged with reason codes
- Self-healing — if the source data is fixed, next sync picks up the record automatically

**Negative:**
- Quarantined records are invisible to end users — could hide real problems
- Requires regular audit review to catch systematic data quality issues
- More complex sync logic than fail-fast

---

*Focux | www.focux.co | Documento confidencial*
