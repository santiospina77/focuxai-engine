# ADR-005: HubSpot Custom Objects as Inventory Source of Truth

**Status:** Accepted
**Date:** 2026-04-22
**Decision makers:** Santiago Ospina (CEO)

---

## Context

The cotizador needs real-time inventory data (projects, towers, units, prices, availability). This data originates in Sinco ERP. Two options:

1. **Cotizador reads Sinco directly** — real-time but creates Sinco as a runtime dependency
2. **Sync Sinco → HubSpot, cotizador reads HubSpot** — cached but decoupled

## Decision

The cotizador reads inventory exclusively from **HubSpot Custom Objects**. A scheduled sync job (`/api/engine/sync/inventory`) pushes data from Sinco into HubSpot. The cotizador never calls Sinco APIs directly.

**Custom Objects hierarchy:**

```
Macroproyecto (1) → Proyecto (N) → Unidad (N) → Agrupación (N)
```

## Rationale

1. **Sinco availability.** Sinco is a Colombian ERP with occasional downtime and variable latency (50ms to 3s). If the cotizador depended on Sinco directly, it would be down when Sinco is down.

2. **HubSpot as single source.** The sales team already works in HubSpot. Having inventory in Custom Objects means Deals can reference specific units, workflows can trigger on inventory changes, and everything is in one system.

3. **Quarantine pattern.** When sync encounters bad data from Sinco (missing fields, invalid types), it quarantines the individual record and continues. The cotizador sees only clean data. Direct Sinco access would expose all data quality issues to the end user.

4. **Audit trail.** HubSpot tracks all property changes with timestamps. When a price changes or a unit status flips, there's an automatic audit trail in HubSpot history.

## Sync Modes

| Mode | What it updates | Duration | Frequency |
|------|----------------|----------|-----------|
| `full` | All fields — names, statuses, areas, prices, Sinco IDs | ~3-5min | Manual / on-demand |
| `prices` | Only price and availability fields | ~30s | Daily 6am (Vercel Cron) |

## Consequences

**Positive:**
- Cotizador is independent of Sinco availability
- HubSpot becomes single pane of glass for sales team
- Bad data is quarantined, not shown to users
- Built-in audit trail

**Negative:**
- Data is as fresh as the last sync (max 24hrs for prices, manual for full)
- Sync can fail silently if Vercel Cron fails — needs monitoring
- HubSpot Custom Objects have API rate limits (10 requests/second per token)
- Requires 4 Custom Object schemas per portal — setup overhead

**Mitigation:** Asset health and audit endpoints provide monitoring. Sync failures are logged with full error context.

---

*Focux | www.focux.co | Documento confidencial*
