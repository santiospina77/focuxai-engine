# FocuxAI Engine™ — Onboarding a New Client

> **Audience:** Engineers replicating the Engine for a new construction company.
> **Last updated:** 2026-05-26
> **Time estimate:** ~4-6 hours (first time), ~2-3 hours (experienced)
> **Prerequisites:** `ARCHITECTURE.md` and `SETUP.md` read. Local dev running.
> **Confidential** — Focux Digital Group S.A.S. Internal use only.

---

## Overview

Adding a new client to the Engine means creating an isolated tenant: its own HubSpot portal, Sinco credentials, env vars, config files, App Card, and (optionally) custom branding. The Engine code itself does not change — you configure, not code.

This playbook uses `acme` as the example clientId. Replace with the real client slug (lowercase, underscores, e.g. `urbansa_prod`).

---

## Pre-Flight Checklist

Before starting, confirm you have:

- [ ] HubSpot portal ID (e.g. `12345678`) with admin access
- [ ] HubSpot Private App token with scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.deals.write`, `crm.objects.custom.read`, `crm.objects.custom.write`, `files`, `crm.objects.owners.read`, `crm.schemas.custom.read`
- [ ] Sinco ERP credentials (username + password) — request from client's technical contact
- [ ] Sinco base URL (e.g. `https://api.sinco-cliente.com`) — confirm with technical contact
- [ ] Inventory of active macroprojects and projects (names, Sinco IDs)
- [ ] Client assets: renders (.png), floor plans (.png), logo, branding colors
- [ ] Pipeline and stages defined in HubSpot (or define them during this process)

---

## Step 1 — Register Client in Engine

**File:** `src/engine/core/config/clientRegistry.ts`

Add the new client to the registry:

```typescript
const CLIENTS: Record<string, ClientBaseConfig> = {
  jimenez_demo: {
    clientId: 'jimenez_demo',
    hubspotTokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
  },
  // ▼ NEW CLIENT
  acme: {
    clientId: 'acme',
    hubspotTokenEnvVar: 'HUBSPOT_ACME_PRIVATE_APP_TOKEN',
  },
};
```

**Naming convention:** `<company>` for production, `<company>_demo` for demo/staging.

---

## Step 2 — Add Portal Mapping (AUTH-1)

**File:** `src/engine/core/auth/quoterSession.ts`

Add the portal to `PORTAL_CLIENT_MAP`:

```typescript
const PORTAL_CLIENT_MAP: Record<string, string> = {
  '51256354': 'jimenez_demo',
  '51059324': 'jimenez_prod',
  // ▼ NEW
  '12345678': 'acme',
};
```

---

## Step 3 — Create Client Quoter Config

**File:** `src/engine/apps/quoter/inventory/clientConfigs/acme.ts` (new)

Copy the structure from `jimenez_demo.ts` and adapt:

```typescript
import type { QuoterClientConfig } from '../types';

export const ACME_CONFIG: QuoterClientConfig = {
  clientId: 'acme',
  objectTypeIds: {
    macroproyecto: '2-XXXXXXXX',   // ← Custom Object IDs from client's portal
    proyecto: '2-XXXXXXXX',
    unidad: '2-XXXXXXXX',
    agrupacion: '2-XXXXXXXX',
  },
  overlay: {
    // Asset mapping per project (renders, floor plans, branding)
    // Configure after uploading assets to CDN (Step 8)
  },
  canalesAtribucion: [
    'portal_web',
    'sala_de_ventas_fisica',
    'referido',
    'feria_inmobiliaria',
    // Add client-specific channels
  ],
  typologyRules: [],  // Typology matching rules — configure with client data
};
```

**⚠️ `objectTypeIds` are unique per portal.** To get them:

```bash
# List Custom Object schemas from the portal
curl "https://api.hubapi.com/crm/v3/schemas" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" | jq '.results[] | {name, objectTypeId}'
```

If Custom Objects don't exist yet, create them first (Step 5).

---

## Step 4 — Wire Config in Inventory Route

**File:** `src/app/api/engine/inventory/route.ts`

Add the case for the new client in the switch/map where the quoter config is resolved:

```typescript
// Find where the client config is resolved and add:
case 'acme': return ACME_CONFIG;
```

**Note:** Exact location depends on how the resolver is implemented. Search for `jimenez_demo` in the file to find the pattern.

---

## Step 5 — Create HubSpot Custom Objects

If the client's portal doesn't have the Engine's Custom Objects, create them. The 4 required objects:

| Object | Label | Key properties (_fx suffix) |
|--------|-------|----------------------------|
| Macroproyecto | Macroproyecto | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `ciudad_fx` |
| Proyecto | Proyecto | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `id_macroproyecto_sinco_fx` |
| Unidad | Unidad | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `area_fx`, `precio_fx`, `piso_fx`, `tipologia_fx`, `id_proyecto_sinco_fx` |
| Agrupación | Agrupación | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `valor_total_neto_fx`, `id_proyecto_sinco_fx`, `id_hubspot_deal_fx` |

**All properties go in the `focux` group** (groupName: `focux`, label: `Focux Engine`).

To create Custom Objects programmatically, use the Adapter (`/adapter` in the dashboard) or direct curl:

```bash
# Create Custom Object schema
curl -X POST "https://api.hubapi.com/crm/v3/schemas" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "macroproyecto",
    "labels": { "singular": "Macroproyecto", "plural": "Macroproyectos" },
    "primaryDisplayProperty": "nombre_fx",
    "properties": [...]
  }'
```

After creation, note the `objectTypeId` returned by each one and put them in the config (Step 3).

---

## Step 6 — Create HubSpot Properties on Contacts & Deals

The Engine uses `_fx` properties on Contacts and Deals for data sync. Create them in the `focux` group:

**Contact properties (_fx):**

| Property | Type | Description |
|----------|------|-------------|
| `cedula_fx` | string | ID document number |
| `tipo_documento_fx` | enumeration | CC, CE, NIT, PP, TI |
| `tipo_persona_fx` | enumeration | NATURAL, JURIDICA |
| `canal_atribucion_fx` | enumeration | portal_web, sala_de_ventas_fisica, etc. |
| `lista_proyectos_fx` | string | Projects of interest |
| `proyecto_activo_fx` | string | Active project |
| `autoriza_datos_fx` | booleancheckbox | Personal data authorization |

**Deal properties (_fx):** ~25 properties (cotNumber, buyer data, property data, financial data, PDF URL, Sinco IDs). Copy from the demo portal.

**⚠️ Critical rules:**
- `groupName` ALWAYS `"focux"` (lowercase)
- Enumerations use SLUG (`sala_de_ventas_fisica`), NOT display name
- `booleancheckbox` in workflows requires `IS_EQUAL_TO` + `BOOL` + singular value

```bash
# Create property group
curl -X POST "https://api.hubapi.com/crm/v3/properties/contacts/groups" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"focux","label":"Focux Engine"}'

# Create property
curl -X POST "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"cedula_fx","label":"Cédula","type":"string","fieldType":"text","groupName":"focux"}'
```

---

## Step 7 — Configure Sinco Connector

**File:** `src/engine/index.ts` (or wherever `EnvSecretStore` lives)

Add the new client's credentials to the secret store. Env var pattern:

```
SINCO_ACME_USERNAME=APICBR
SINCO_ACME_PASSWORD=<password_from_client>
```

**Verify connectivity:**

```bash
curl "http://localhost:3000/api/engine/health?clientId=acme"
```

Should return `erp.ok: true` and `crm.ok: true`.

---

## Step 8 — Upload Assets to HubSpot CDN

Quoter assets (renders, floor plans, logos) are uploaded to the client's HubSpot portal File Manager.

**Expected structure:**

```
hubfs/<portalId>/assets/<clientSlug>/<projectSlug>/
├── render.png          (project main render)
├── plano-tipo-a.png    (floor plan per typology)
├── plano-tipo-b.png
└── logo.png            (client logo for PDF)
```

Upload via HubSpot File Manager UI or API:

```bash
curl -X POST "https://api.hubapi.com/filemanager/api/v3/files/upload" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -F "file=@render.png" \
  -F "options={\"access\":\"PUBLIC_NOT_INDEXABLE\",\"folderPath\":\"assets/acme/project-name\"}"
```

**`PUBLIC_NOT_INDEXABLE`** — accessible by URL but not indexed by Google. Data sovereignty decision: assets live in the client's portal, not ours.

After uploading, update the `overlay` in the client config (Step 3) with the CDN URLs.

---

## Step 9 — Set Environment Variables in Vercel

**⚠️ ALWAYS use `printf`, NEVER `echo`** (see `SETUP.md` §11).

```bash
# HubSpot token
printf 'pat-na1-...' | vercel env add HUBSPOT_ACME_PRIVATE_APP_TOKEN production

# Sinco credentials
printf 'APICBR' | vercel env add SINCO_ACME_USERNAME production
printf 'sinco_password_here' | vercel env add SINCO_ACME_PASSWORD production

# AUTH-1 secrets (generate new ones for each client)
printf "$(openssl rand -hex 32)" | vercel env add HUBSPOT_CARD_LAUNCH_SECRET_ACME production

# Webhook secret (if write-back is active)
printf "$(openssl rand -hex 32)" | vercel env add WEBHOOK_SECRET_ACME production
```

---

## Step 10 — Create & Deploy HubSpot App Card

App Card files do NOT live in the Git repo — they are created in a separate HubSpot project.

**Required files (copy from Jiménez App Card and adapt):**

```
focux-quoter-card/
├── src/app/
│   ├── app.json                          ← Permissions and scopes
│   ├── extensions/
│   │   ├── QuoterCard.tsx               ← Card UI (contact sidebar)
│   │   └── QuoterCard.json             ← Card metadata (title, location)
│   └── app.functions/
│       ├── launchQuoter.js              ← App Function (serverless)
│       └── launchQuoter.json            ← Function metadata
└── hsproject.json                        ← HubSpot project
```

**Changes per client:**
1. `hsproject.json` → client's portal `accountId`
2. `launchQuoter.js` → Engine URL (`ENGINE_URL`), launch secret
3. `QuoterCard.tsx` → Button text, branding if applicable

**Deploy:**

```bash
cd focux-quoter-card
npx hs project upload --account=<portalId>
```

---

## Step 11 — Run Initial Inventory Sync

```bash
# Full sync (first time — may take ~5min)
curl -X POST "https://engine.focux.co/api/engine/sync/inventory?clientId=acme&mode=full" \
  -H "Authorization: Bearer $CRON_SECRET"

# Verify
curl "https://engine.focux.co/api/engine/inventory?clientId=acme" | jq '.macros | length'
```

**Configure Vercel Cron** for automatic daily sync:

**File:** `vercel.json` — add entry:

```json
{
  "crons": [
    {
      "path": "/api/engine/sync/inventory?clientId=acme&mode=prices",
      "schedule": "0 6 * * *"
    }
  ]
}
```

---

## Step 12 — Verify E2E Flow

### 12a. Quoter (direct access — demo mode)

With `QUOTER_ALLOW_DIRECT_ACCESS=true`:

```
https://engine.focux.co/quoter?clientId=acme
```

Verify:
- [ ] Inventory loads (macros, projects, units)
- [ ] Renders and floor plans display
- [ ] Quotation form works
- [ ] PDF generates correctly with client branding
- [ ] Deal is created in HubSpot with all `_fx` properties
- [ ] PDF uploads and attaches to Deal

### 12b. AUTH-1 Flow (App Card → Quoter)

1. Open a contact in the client's HubSpot portal
2. Verify App Card appears in sidebar
3. Click "Abrir Cotizador"
4. Verify it opens a new tab with buyer data pre-filled
5. Verify the advisor is the contact's Owner

### 12c. Audit

```bash
curl "https://engine.focux.co/api/engine/audit/inventory?clientId=acme" \
  -H "Authorization: Bearer $CRON_SECRET" | jq '.summary'
```

---

## Step 13 — Go-Live Checklist

| # | Item | Status |
|---|------|--------|
| 1 | Client registered in `clientRegistry.ts` | ☐ |
| 2 | Portal mapping in `quoterSession.ts` | ☐ |
| 3 | Quoter config created (`clientConfigs/acme.ts`) | ☐ |
| 4 | Config wired in inventory route | ☐ |
| 5 | Custom Objects created in HubSpot | ☐ |
| 6 | `_fx` properties created on Contacts and Deals | ☐ |
| 7 | Sinco connector configured and health OK | ☐ |
| 8 | Assets uploaded to HubSpot CDN | ☐ |
| 9 | Env vars in Vercel (with `printf`) | ☐ |
| 10 | App Card deployed | ☐ |
| 11 | Inventory sync executed and verified | ☐ |
| 12 | E2E verified (quoter + AUTH-1 + deal + PDF) | ☐ |
| 13 | Cron configured in `vercel.json` | ☐ |
| 14 | `QUOTER_REQUIRE_HUBSPOT_LAUNCH=true` (flip to prod) | ☐ |
| 15 | `QUOTER_ALLOW_DIRECT_ACCESS=false` (flip to prod) | ☐ |
| 16 | Debug output removed from App Card | ☐ |
| 17 | Audit report clean (0 quarantined, 0 warnings) | ☐ |

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| `objectTypeIds` copied from wrong portal | They're unique per portal. Always get them with `GET /crm/v3/schemas` from the correct portal. |
| Env var with trailing `\n` | Always `printf`, never `echo`. See `SETUP.md` §11. |
| Properties don't appear in HubSpot | Verify `groupName: "focux"` (exact lowercase). |
| Enum values don't match in workflows | Use slug (`sala_de_ventas_fisica`), not display name. |
| Sync timeout on first run | Use filter: `?macroproyectoId=X` to sync one macro at a time. |
| App Card doesn't appear in sidebar | Verify App Card is in `contact` location, not `deal`. Verify scopes in `app.json`. |
| Empty advisor in quoter | Contact has no Owner assigned in HubSpot. Assign Owner first. |

---

*Focux | www.focux.co | Confidential*
