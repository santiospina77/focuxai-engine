# ADR-002: HMAC-SHA256 Tokens — No JWT Dependency

**Status:** Accepted
**Date:** 2026-05-25
**Decision makers:** Santiago Ospina (CEO), GPT Architect (review)

---

## Context

AUTH-1 requires signed tokens for three purposes: launch tokens (5min), session cookies (8hrs), and PDF access tokens (7 days). The standard choice would be JWT via a library like `jose` or `jsonwebtoken`.

## Decision

Use hand-rolled HMAC-SHA256 tokens using Node.js native `crypto` module. Format: `base64url(JSON payload).base64url(HMAC-SHA256 signature)`.

No JWT library. No `jose`. No `jsonwebtoken`.

## Rationale

1. **Zero dependencies.** The Engine runs on Vercel Hobby plan with a zero-native-deps constraint. Adding `jose` or `jsonwebtoken` adds a dependency for something Node.js crypto does natively in 10 lines.

2. **No need for JWT features.** We don't need: header/algorithm negotiation (we always use SHA256), key rotation (single HMAC key), standardized claims (`iss`, `aud` — our payloads are custom), interoperability (tokens are consumed only by the Engine itself).

3. **Simpler security surface.** JWT libraries have a history of algorithm confusion attacks (`alg: none`). Our tokens have no header — the algorithm is hardcoded.

4. **Zod post-parse validation.** Every deserialized payload goes through Zod `.strict()` parsing (Architect CRITICAL-2). This catches any tampering that survives signature validation.

## Token Format

```
base64url({"clientId":"x","portalId":"y","exp":1234567890})
.
base64url(HMAC-SHA256(payload, QUOTER_SESSION_SECRET))
```

Validation: decode payload → compute expected signature → `timingSafeEqual` → Zod parse → check `exp`.

## Consequences

**Positive:**
- Zero added dependencies
- No algorithm confusion risk
- Full control over token structure and validation
- Zod gives us runtime type safety on deserialized payloads

**Negative:**
- Non-standard format — can't be validated by external tools (but no external system consumes these)
- No built-in key rotation (acceptable — rotation is a manual secret update + redeploy)
- Engineers familiar with JWT will need to read the code to understand the format

---

*Focux | www.focux.co | Documento confidencial*
