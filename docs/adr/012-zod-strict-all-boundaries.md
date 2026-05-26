# ADR-012: Zod Strict Validation at All System Boundaries

**Status:** Accepted
**Date:** 2026-05-25
**Decision makers:** Santiago Ospina (CEO), GPT Architect (review, severity: CRITICAL)

---

## Context

The Engine receives data from multiple untrusted sources: HubSpot webhooks, App Functions, browser clients, and Sinco API responses. Any of these can send malformed, extra, or malicious fields.

The GPT Architect review (v2) flagged two critical issues:
- **CRITICAL-1:** Launch token body had no runtime validation
- **CRITICAL-2:** HMAC-signed payloads were deserialized from base64 without type checking

## Decision

Every data crossing a system boundary goes through **Zod `.strict()` validation**. Strict mode means any extra field not in the schema causes a parse error — no silent field injection.

### Where Zod validates:

| Boundary | What | Schema |
|----------|------|--------|
| API request bodies | POST payloads from clients | `.strict()` on every POST route |
| Deserialized tokens | Launch tokens, session cookies, PDF tokens from base64 | `.strict()` after HMAC validation |
| Webhook payloads | HubSpot workflow webhook bodies | `.strict()` before processing |
| Write-back inputs | Separar/legalizar payloads | `.strict()` with detailed field errors |

### What Zod does NOT validate:

| Data source | Why not |
|-------------|---------|
| HubSpot API responses | We don't control the schema — defensive coding instead |
| Sinco API responses | Same — handle missing/extra fields gracefully |
| Database query results | Controlled schema — validated at migration time |

## Rationale

1. **Defense in depth.** Even if HMAC signature validation passes, a corrupted or tampered payload (e.g., base64-decoded but wrong field types) gets caught by Zod before it reaches business logic.

2. **No silent field injection.** `.strict()` rejects `{ clientId: "x", __proto__: {} }` or any attempt to inject unexpected fields. Without strict mode, extra fields pass through and could contaminate downstream logic.

3. **Developer-friendly errors.** Zod returns the exact path of the invalid field: `"venta.planPagos[2].valor: Expected number, received string"`. This makes debugging webhook payloads 10x faster.

## Consequences

**Positive:**
- Every untrusted input is validated before reaching business logic
- Strict mode prevents prototype pollution and field injection
- Error messages include exact path + expected vs. received types
- Consistent validation pattern across all endpoints

**Negative:**
- Schema must be kept in sync with actual payloads — a new field in HubSpot's webhook breaks the strict schema until updated
- Performance overhead is negligible (<1ms per validation) but exists
- Engineers must remember to add Zod validation to new endpoints

---

*Focux | www.focux.co | Documento confidencial*
