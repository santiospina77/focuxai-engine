# ADR-001: Result<T, E> Pattern — Never Throw in Business Logic

**Status:** Accepted
**Date:** 2026-04-22
**Decision makers:** Santiago Ospina (CEO), GPT Architect (review)

---

## Context

The Engine integrates with two external systems (HubSpot, Sinco) that can fail in unpredictable ways — rate limits, timeouts, malformed responses, expired tokens. Traditional try/catch creates invisible error paths: a function 3 levels deep throws, and the caller 3 levels up catches it with no type information about what went wrong.

In a multi-tenant system where one client's failure shouldn't crash another, we needed a way to make errors visible, typed, and composable.

## Decision

All business logic in `src/engine/` uses `Result<T, EngineError>` as the return type. Errors are values, not exceptions.

```typescript
type Result<T, E> = { isOk(): true; value: T } | { isErr(): true; error: E };
```

`throw` is reserved exclusively for truly unexpected failures (programmer errors, invariant violations). Any error that can reasonably happen at runtime (API failures, validation errors, missing config) is returned as `Result.err()`.

API route handlers at `src/app/api/` are the only place where `Result` gets converted to HTTP responses via `jsonOk()` / `jsonError()`.

## Consequences

**Positive:**
- Every function signature tells you exactly what can fail and why
- No hidden control flow — errors propagate explicitly
- Easy to compose: chain operations, short-circuit on first error
- Type-safe: `EngineError` has a `code` enum, not arbitrary strings

**Negative:**
- More verbose than try/catch for simple cases
- Engineers unfamiliar with the pattern may find it unusual
- Need discipline: if you `throw` inside engine code, it bypasses the entire error handling chain

**Trade-off accepted:** The verbosity cost is worth it for a system that handles money (quotations, sales) and writes to external ERPs.

---

*Focux | www.focux.co | Documento confidencial*
