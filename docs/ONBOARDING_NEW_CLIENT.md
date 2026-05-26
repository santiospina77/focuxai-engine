# FocuxAI Engine™ — Onboarding a New Client

> **Audience:** Engineers replicating the Engine for a new construction company.
> **Last updated:** 2026-05-25
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
- [ ] Sinco ERP credentials (username + password) — solicitar al contacto técnico del cliente
- [ ] Sinco base URL (e.g. `https://api.sinco-cliente.com`) — confirmar con contacto técnico
- [ ] Inventario de macroproyectos y proyectos activos (nombres, IDs Sinco)
- [ ] Assets del cliente: renders (.png), planos (.png), logo, branding colors
- [ ] Pipeline y stages definidos en HubSpot (o definirlos en este proceso)

---

## Step 1 — Register Client in Engine

**File:** `src/engine/core/config/clientRegistry.ts`

Agregar el nuevo client al registro:

```typescript
const CLIENTS: Record<string, ClientBaseConfig> = {
  jimenez_demo: {
    clientId: 'jimenez_demo',
    hubspotTokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
  },
  // ▼ NUEVO CLIENTE
  acme: {
    clientId: 'acme',
    hubspotTokenEnvVar: 'HUBSPOT_ACME_PRIVATE_APP_TOKEN',
  },
};
```

**Convención de naming:** `<empresa>` para producción, `<empresa>_demo` para demo/staging.

---

## Step 2 — Add Portal Mapping (AUTH-1)

**File:** `src/engine/core/auth/quoterSession.ts`

Agregar el portal al `PORTAL_CLIENT_MAP`:

```typescript
const PORTAL_CLIENT_MAP: Record<string, string> = {
  '51256354': 'jimenez_demo',
  '51059324': 'jimenez_prod',
  // ▼ NUEVO
  '12345678': 'acme',
};
```

---

## Step 3 — Create Client Quoter Config

**File:** `src/engine/apps/quoter/inventory/clientConfigs/acme.ts` (nuevo)

Copiar la estructura de `jimenez_demo.ts` y adaptar:

```typescript
import type { QuoterClientConfig } from '../types';

export const ACME_CONFIG: QuoterClientConfig = {
  clientId: 'acme',
  objectTypeIds: {
    macroproyecto: '2-XXXXXXXX',   // ← Custom Object IDs del portal del cliente
    proyecto: '2-XXXXXXXX',
    unidad: '2-XXXXXXXX',
    agrupacion: '2-XXXXXXXX',
  },
  overlay: {
    // Mapeo de assets por proyecto (renders, planos, branding)
    // Se configura después de subir assets al CDN (Step 8)
  },
  canalesAtribucion: [
    'portal_web',
    'sala_de_ventas_fisica',
    'referido',
    'feria_inmobiliaria',
    // Agregar canales del cliente
  ],
  typologyRules: [],  // Reglas de matching tipología — configurar con data del cliente
};
```

**⚠️ Los `objectTypeIds` son únicos por portal.** Para obtenerlos:

```bash
# Listar Custom Object schemas del portal
curl "https://api.hubapi.com/crm/v3/schemas" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" | jq '.results[] | {name, objectTypeId}'
```

Si los Custom Objects no existen aún, crearlos primero (Step 5).

---

## Step 4 — Wire Config in Inventory Route

**File:** `src/app/api/engine/inventory/route.ts`

Agregar el case para el nuevo client en el switch/map donde se selecciona la config del quoter:

```typescript
// Buscar donde se resuelve la config del client y agregar:
case 'acme': return ACME_CONFIG;
```

**Nota:** La ubicación exacta depende de cómo esté implementado el resolver. Buscar `jimenez_demo` en el archivo para encontrar el patrón.

---

## Step 5 — Create HubSpot Custom Objects

Si el portal del cliente no tiene los Custom Objects del Engine, crearlos. Los 4 objetos requeridos:

| Object | Label | Properties key (_fx suffix) |
|--------|-------|----------------------------|
| Macroproyecto | Macroproyecto | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `ciudad_fx` |
| Proyecto | Proyecto | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `id_macroproyecto_sinco_fx` |
| Unidad | Unidad | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `area_fx`, `precio_fx`, `piso_fx`, `tipologia_fx`, `id_proyecto_sinco_fx` |
| Agrupación | Agrupación | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `valor_total_neto_fx`, `id_proyecto_sinco_fx`, `id_hubspot_deal_fx` |

**Todas las propiedades van en el grupo `focux`** (groupName: `focux`, label: `Focux Engine`).

Para crear Custom Objects programáticamente, usar el Adapter (`/adapter` en el dashboard) o curl directo:

```bash
# Crear schema de Custom Object
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

Después de crear, anotar los `objectTypeId` que retorna cada uno y ponerlos en la config (Step 3).

---

## Step 6 — Create HubSpot Properties on Contacts & Deals

El Engine usa propiedades `_fx` en Contacts y Deals para sincronizar datos. Crearlas en el grupo `focux`:

**Contact properties (_fx):**

| Property | Type | Description |
|----------|------|-------------|
| `cedula_fx` | string | Número de documento |
| `tipo_documento_fx` | enumeration | CC, CE, NIT, PP, TI |
| `tipo_persona_fx` | enumeration | NATURAL, JURIDICA |
| `canal_atribucion_fx` | enumeration | portal_web, sala_de_ventas_fisica, etc. |
| `lista_proyectos_fx` | string | Proyectos de interés |
| `proyecto_activo_fx` | string | Proyecto activo |
| `autoriza_datos_fx` | booleancheckbox | Autorización datos personales |

**Deal properties (_fx):** ~25 propiedades (cotNumber, buyer data, property data, financial data, PDF URL, Sinco IDs). Copiar del portal demo.

**⚠️ Reglas críticas:**
- `groupName` SIEMPRE `"focux"` (minúsculas)
- Enumerations usan SLUG (`sala_de_ventas_fisica`), NO display name
- `booleancheckbox` en workflows requiere `IS_EQUAL_TO` + `BOOL` + value singular

```bash
# Crear property group
curl -X POST "https://api.hubapi.com/crm/v3/properties/contacts/groups" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"focux","label":"Focux Engine"}'

# Crear property
curl -X POST "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"cedula_fx","label":"Cédula","type":"string","fieldType":"text","groupName":"focux"}'
```

---

## Step 7 — Configure Sinco Connector

**File:** `src/engine/index.ts` (o donde viva el `EnvSecretStore`)

Agregar las credenciales del nuevo client al secret store. El patrón de env vars:

```
SINCO_ACME_USERNAME=APICBR
SINCO_ACME_PASSWORD=<password_from_client>
```

**Verificar conectividad:**

```bash
curl "http://localhost:3000/api/engine/health?clientId=acme"
```

Debe retornar `erp.ok: true` y `crm.ok: true`.

---

## Step 8 — Upload Assets to HubSpot CDN

Los assets del cotizador (renders, planos, logos) se suben al File Manager de HubSpot del portal del cliente.

**Estructura esperada:**

```
hubfs/<portalId>/assets/<clientSlug>/<projectSlug>/
├── render.png          (render principal del proyecto)
├── plano-tipo-a.png    (plano por tipología)
├── plano-tipo-b.png
└── logo.png            (logo del cliente para PDF)
```

Subir via HubSpot File Manager UI o API:

```bash
curl -X POST "https://api.hubapi.com/filemanager/api/v3/files/upload" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -F "file=@render.png" \
  -F "options={\"access\":\"PUBLIC_NOT_INDEXABLE\",\"folderPath\":\"assets/acme/project-name\"}"
```

**`PUBLIC_NOT_INDEXABLE`** — accesible por URL pero no indexado por Google. Decisión de data sovereignty: los assets viven en el portal del cliente, no en el nuestro.

Después de subir, actualizar el `overlay` en la config del client (Step 3) con las URLs del CDN.

---

## Step 9 — Set Environment Variables in Vercel

**⚠️ SIEMPRE usar `printf`, NUNCA `echo`** (ver `SETUP.md` §11).

```bash
# HubSpot token
printf 'pat-na1-...' | vercel env add HUBSPOT_ACME_PRIVATE_APP_TOKEN production

# Sinco credentials
printf 'APICBR' | vercel env add SINCO_ACME_USERNAME production
printf 'sinco_password_here' | vercel env add SINCO_ACME_PASSWORD production

# AUTH-1 secrets (generar nuevos para cada cliente)
printf "$(openssl rand -hex 32)" | vercel env add HUBSPOT_CARD_LAUNCH_SECRET_ACME production

# Webhook secret (si write-back activo)
printf "$(openssl rand -hex 32)" | vercel env add WEBHOOK_SECRET_ACME production
```

---

## Step 10 — Create & Deploy HubSpot App Card

Los archivos de la App Card NO viven en el repo Git — se crean en un proyecto HubSpot separado.

**Archivos necesarios (copiar de la App Card de Jiménez y adaptar):**

```
focux-quoter-card/
├── src/app/
│   ├── app.json                          ← Permisos y scopes
│   ├── extensions/
│   │   ├── QuoterCard.tsx               ← UI del card (sidebar contacto)
│   │   └── QuoterCard.json             ← Card metadata (title, location)
│   └── app.functions/
│       ├── launchQuoter.js              ← App Function (serverless)
│       └── launchQuoter.json            ← Function metadata
└── hsproject.json                        ← Proyecto HubSpot
```

**Cambios por cliente:**
1. `hsproject.json` → `accountId` del portal del cliente
2. `launchQuoter.js` → URL del Engine (`ENGINE_URL`), secret del launch
3. `QuoterCard.tsx` → Texto del botón, branding si aplica

**Deploy:**

```bash
cd focux-quoter-card
npx hs project upload --account=<portalId>
```

---

## Step 11 — Run Initial Inventory Sync

```bash
# Sync completo (primera vez — puede tardar ~5min)
curl -X POST "https://engine.focux.co/api/engine/sync/inventory?clientId=acme&mode=full" \
  -H "Authorization: Bearer $CRON_SECRET"

# Verificar
curl "https://engine.focux.co/api/engine/inventory?clientId=acme" | jq '.macros | length'
```

**Configurar Vercel Cron** para sync automático diario:

**File:** `vercel.json` — agregar entrada:

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

### 12a. Cotizador (acceso directo — demo mode)

Con `QUOTER_ALLOW_DIRECT_ACCESS=true`:

```
https://engine.focux.co/quoter?clientId=acme
```

Verificar:
- [ ] Inventario carga (macros, proyectos, unidades)
- [ ] Renders y planos se muestran
- [ ] Formulario de cotización funciona
- [ ] PDF se genera correctamente con branding del cliente
- [ ] Deal se crea en HubSpot con todas las propiedades `_fx`
- [ ] PDF se sube y adjunta al Deal

### 12b. AUTH-1 Flow (App Card → Cotizador)

1. Abrir un contacto en HubSpot del portal del cliente
2. Verificar que el App Card aparece en el sidebar
3. Click "Abrir Cotizador"
4. Verificar que abre nueva pestaña con datos del buyer precargados
5. Verificar que el asesor es el Owner del contacto

### 12c. Audit

```bash
curl "https://engine.focux.co/api/engine/audit/inventory?clientId=acme" \
  -H "Authorization: Bearer $CRON_SECRET" | jq '.summary'
```

---

## Step 13 — Go-Live Checklist

| # | Item | Status |
|---|------|--------|
| 1 | Client registrado en `clientRegistry.ts` | ☐ |
| 2 | Portal mapping en `quoterSession.ts` | ☐ |
| 3 | Config de quoter creada (`clientConfigs/acme.ts`) | ☐ |
| 4 | Config wired en inventory route | ☐ |
| 5 | Custom Objects creados en HubSpot | ☐ |
| 6 | Properties `_fx` creadas en Contacts y Deals | ☐ |
| 7 | Sinco connector configurado y health OK | ☐ |
| 8 | Assets subidos a HubSpot CDN | ☐ |
| 9 | Env vars en Vercel (con `printf`) | ☐ |
| 10 | App Card deployada | ☐ |
| 11 | Inventory sync ejecutado y verificado | ☐ |
| 12 | E2E verified (cotizador + AUTH-1 + deal + PDF) | ☐ |
| 13 | Cron configurado en `vercel.json` | ☐ |
| 14 | `QUOTER_REQUIRE_HUBSPOT_LAUNCH=true` (flip to prod) | ☐ |
| 15 | `QUOTER_ALLOW_DIRECT_ACCESS=false` (flip to prod) | ☐ |
| 16 | Debug output removido de App Card | ☐ |
| 17 | Audit report clean (0 quarantined, 0 warnings) | ☐ |

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| `objectTypeIds` copiados del portal equivocado | Son únicos por portal. Siempre obtener con `GET /crm/v3/schemas` del portal correcto. |
| Env var con trailing `\n` | Siempre `printf`, nunca `echo`. Ver `SETUP.md` §11. |
| Properties no aparecen en HubSpot | Verificar `groupName: "focux"` (minúsculas exactas). |
| Enum values no matchean en workflows | Usar slug (`sala_de_ventas_fisica`), no display name. |
| Sync timeout en primera corrida | Usar filtro: `?macroproyectoId=X` para sincronizar un macro a la vez. |
| App Card no aparece en sidebar | Verificar que el App Card está en `contact` location, no `deal`. Verificar scopes en `app.json`. |
| Asesor vacío en cotizador | El contacto no tiene Owner asignado en HubSpot. Asignar Owner primero. |

---

*Focux | www.focux.co | Documento confidencial*
