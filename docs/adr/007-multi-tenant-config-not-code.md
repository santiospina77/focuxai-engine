# ADR-007: Multi-Tenant via Configuration, Not Code Branches

**Status:** Accepted
**Date:** 2026-04-22
**Decision makers:** Santiago Ospina (CEO)

---

## Context

The Engine serves multiple construction companies (Jiménez, Urbansa, future clients). Each has its own HubSpot portal, Sinco instance, branding, pricing rules, and feature flags. Two approaches:

1. **Branch per client** — fork the codebase for each client
2. **Config per client** — single codebase, per-client configuration files

## Decision

Single codebase. Each client is identified by a `clientId` string (e.g., `jimenez_demo`, `urbansa_prod`). Client-specific behavior is driven by configuration, not code:

| What varies | Where it lives |
|-------------|---------------|
| HubSpot token | Env var: `HUBSPOT_<CLIENT>_PRIVATE_APP_TOKEN` |
| Sinco credentials | Env vars: `SINCO_<CLIENT>_USERNAME` / `_PASSWORD` |
| Custom Object IDs | `clientConfigs/<client>.ts` |
| Typology rules | `clientConfigs/<client>.ts` |
| Asset overlay (renders, planos) | `clientConfigs/<client>.ts` |
| Portal→client mapping | `quoterSession.ts: PORTAL_CLIENT_MAP` |
| Feature flags | Env vars per client |

Adding a new client = adding a config file + env vars. Zero code changes to the Engine core.

## Rationale

1. **One deploy, all clients.** A bug fix deploys to all clients simultaneously. No need to merge fixes across branches.

2. **Scalability.** Branch-per-client doesn't scale beyond 3-4 clients — merge conflicts, divergent features, and maintenance multiply linearly.

3. **Testing.** One test suite covers all clients. Per-client tests can use fixtures from `clientConfigs/`.

4. **FocuxAI is a product, not a consultancy.** The strategic direction (see roadmap) is SaaS — the Engine must support N clients without N codebases.

## Client Resolution Flow

```
Request → clientId (query param or session cookie)
  → clientRegistry.ts → base config (token env var)
  → quoter/clientConfigs/<client>.ts → quoter-specific config
  → quoterSession.ts → portal mapping (AUTH-1)
```

## Consequences

**Positive:**
- Single codebase, single deploy pipeline
- Bug fixes and features ship to all clients at once
- Clear separation: Engine code vs. client config
- Easy to onboard new clients (see `ONBOARDING_NEW_CLIENT.md`)

**Negative:**
- If a client needs truly custom logic (not just config), it requires an abstraction layer
- All clients share the same Vercel deployment — one client's traffic spike affects others
- Config files are in the repo — adding a client requires a code commit (acceptable for now)

**When to reconsider:** If we reach 10+ clients and the config commit pattern becomes a bottleneck, move configs to a database or external config service.

---

*Focux | www.focux.co | Documento confidencial*
