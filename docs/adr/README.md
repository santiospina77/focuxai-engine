# Architecture Decision Records (ADRs)

> Each ADR documents a significant technical decision, the context that drove it, and its consequences.
> **Format:** Context → Decision → Rationale → Consequences (positive + negative).
> **Confidential** — Focux Digital Group S.A.S.

| # | Decision | Status | Date |
|---|----------|--------|------|
| [001](001-result-pattern-never-throw.md) | Result<T,E> pattern — never throw in business logic | Accepted | 2026-04-22 |
| [002](002-hmac-not-jwt.md) | HMAC-SHA256 tokens — no JWT dependency | Accepted | 2026-05-25 |
| [003](003-advisor-from-hubspot-owner.md) | Advisor = HubSpot Contact Owner — no advisor table | **Permanent** | 2026-05-25 |
| [004](004-no-orm-raw-neon.md) | No ORM — raw SQL via Neon HTTP driver | Accepted | 2026-04-22 |
| [005](005-hubspot-custom-objects-as-inventory.md) | HubSpot Custom Objects as inventory source of truth | Accepted | 2026-04-22 |
| [006](006-pdf-lib-zero-native-deps.md) | pdf-lib for PDF generation — zero native dependencies | Accepted | 2026-04-22 |
| [007](007-multi-tenant-config-not-code.md) | Multi-tenant via configuration, not code branches | Accepted | 2026-04-22 |
| [008](008-quarantine-pattern.md) | Quarantine pattern — bad data isolated, not fatal | Accepted | 2026-05-12 |
| [009](009-data-sovereignty-client-portal.md) | Data sovereignty — assets & PDFs in client's portal | Accepted | 2026-04-22 |
| [010](010-inline-auth-not-middleware.md) | Inline auth guards, not global middleware | Accepted | 2026-05-25 |
| [011](011-writeback-idempotency-event-log.md) | Write-back idempotency via PgEventLog | Accepted | 2026-05-25 |
| [012](012-zod-strict-all-boundaries.md) | Zod strict validation at all system boundaries | Accepted | 2026-05-25 |

---

## Adding a New ADR

1. Copy the template: `NNN-short-slug.md`
2. Fill: Status, Date, Decision makers, Context, Decision, Rationale, Consequences
3. Add row to this index
4. Commit with message: `docs: add ADR-NNN short description`

---

*Focux | www.focux.co | Documento confidencial*
