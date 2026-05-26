# ADR-010: Inline Auth Guards, Not Global Middleware

**Status:** Accepted
**Date:** 2026-05-25
**Decision makers:** Santiago Ospina (CEO), GPT Architect (review)

---

## Context

AUTH-1 protects quotation endpoints with session cookies. The standard Next.js approach is global middleware (`middleware.ts`). The Engine already uses NextAuth middleware for the internal dashboard (`/home`, `/ops`, `/adapter`).

For the quoter endpoints, two options:
1. **Extend middleware.ts** to also handle quoter session cookies
2. **Inline guards** in each API route handler

## Decision

Quoter auth uses **inline helper functions** called explicitly in each route handler. The session cookie is validated by `requireQuoterSession()` or `optionalQuoterSession()` inside the route, not in middleware.

```typescript
// In route handler:
const session = await requireQuoterSession(req, clientId);
if (session instanceof NextResponse) return session; // 401
// session is typed QuoterSession from here
```

## Rationale

1. **Different auth patterns per endpoint.** Some endpoints compare `body.clientId` with `session.clientId`, others use query params. A middleware would need to parse the body (consuming the stream) or query differently per route — that's route-level logic, not middleware-level.

2. **Three auth mechanisms, not one.** The Engine has NextAuth (dashboard), quoter session (cotizador), and Bearer tokens (cron/admin/webhook). Middleware would need to know which mechanism applies to which route — effectively reimplementing the route table.

3. **Explicit is better.** When reading a route handler, you can see exactly what auth it requires without checking a separate middleware config. New engineers don't need to understand middleware matcher patterns.

4. **PDF endpoint has dual auth.** `GET /api/engine/quotations/pdf` accepts either a `pdfAccessToken` query param OR a session cookie. This conditional auth logic doesn't fit a middleware pattern.

## Middleware.ts Scope

`middleware.ts` handles ONLY NextAuth session for internal dashboard routes:

```typescript
export const config = {
  matcher: ["/home/:path*", "/ops/:path*", "/adapter/:path*", "/scan/:path*", "/content/:path*"],
};
```

The `/quoter` and `/api/engine/*` routes are NOT in the matcher — they handle their own auth.

## Consequences

**Positive:**
- Each route explicitly declares its auth requirement — self-documenting
- Supports mixed auth patterns (session, Bearer, token, none) without middleware complexity
- No stream consumption issues (middleware reading body before route)
- Easy to test — mock the session helper, not a middleware chain

**Negative:**
- Risk of forgetting to add auth to a new route (mitigated by code review and the Architect GPT)
- Slight duplication of auth call across routes (mitigated by shared helper functions)

---

*Focux | www.focux.co | Documento confidencial*
