# ADR-004: No ORM — Raw SQL via Neon HTTP Driver

**Status:** Accepted
**Date:** 2026-04-22
**Decision makers:** Santiago Ospina (CEO)

---

## Context

The Engine needs a database for quotations and event logs. Standard Next.js projects often use Prisma or Drizzle for type-safe database access.

## Decision

Use `@neondatabase/serverless` directly with tagged template SQL queries. No ORM, no Drizzle, no Prisma.

```typescript
const sql = getDb();
const result = await sql`SELECT * FROM quotations WHERE cot_number = ${cotNumber}`;
```

Migrations are plain `.sql` files executed manually via `psql` or Neon Console.

## Rationale

1. **Zero native dependencies.** Prisma requires a binary engine. Drizzle is lighter but still adds a generation step. The Neon HTTP driver is a pure JS package that works on Vercel Edge and Serverless without native modules.

2. **HTTP-based, no connection pooling.** Neon's serverless driver uses HTTP (not TCP sockets). Each query is an independent HTTP request. This eliminates connection pool management, cold start connection delays, and zombie connections — all common problems with ORMs on serverless.

3. **Simple schema.** The Engine has 2 tables (`quotations`, `pg_event_log`). An ORM adds complexity proportional to schema size — for 2 tables, the overhead exceeds the benefit.

4. **SQL is the interface.** The queries are straightforward INSERTs and SELECTs. No complex joins, no nested relations, no polymorphic associations. Raw SQL is more readable than ORM method chains for this use case.

## Migration Strategy

```
src/engine/core/db/migrations/
├── 001_quotations.sql
├── 002_pdf_hubspot_columns.sql
├── 003_pdf_status_generation_failed.sql
├── 004_pdf_hubspot_url.sql
├── 005_event_log.sql
└── 006_sinco_ids.sql
```

Applied manually: `psql $DATABASE_URL -f 007_new_migration.sql`

All migrations must be **backward-compatible** — the same DB serves dev and production (no local DB).

## Consequences

**Positive:**
- Zero native deps — deploys anywhere
- No migration CLI, no codegen, no schema drift
- Full SQL control — no ORM abstraction leaks
- HTTP queries = no connection issues on serverless

**Negative:**
- No type-safe query results (mitigated by Zod validation where critical)
- No automatic migration tracking (engineer must verify which migrations are applied)
- Column renames or type changes require manual ALTER TABLE scripts

**When to reconsider:** If the schema grows beyond ~10 tables or we need complex relational queries, evaluate Drizzle (not Prisma — native binary is a hard constraint).

---

*Focux | www.focux.co | Documento confidencial*
