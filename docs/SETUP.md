# FocuxAI Engine™ — Local Development Setup

> **Audience:** Engineers setting up the project for the first time.
> **Last updated:** 2026-05-25
> **Prerequisite:** Read `ARCHITECTURE.md` first for system context.
> **Confidential** — Focux Digital Group S.A.S. Internal use only.

---

## 1. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | ≥ 18.x (20.x recommended) | `node -v` |
| npm | ≥ 9.x | `npm -v` |
| Git | ≥ 2.x | `git -v` |
| Vercel CLI | Latest | `npm i -g vercel` |
| HubSpot CLI | Latest (solo para App Card deploys) | `npm i -g @hubspot/cli` |

**No se necesita:** Docker, PostgreSQL local, ni herramientas nativas. La DB es Neon Postgres (serverless, HTTP-only).

---

## 2. Clone & Install

```bash
git clone git@github.com:focux-digital/focuxai-engine.git
cd focuxai-engine
npm install
```

**Nota:** El repo NO incluye los archivos de HubSpot App Card (`focux-quoter-card/`). Esos viven en SpaceCommander y se copian manualmente al momento del deploy. Ver `runbooks/deploy.md`.

---

## 3. Environment Variables

Copiar `.env.example` a `.env.local`:

```bash
cp .env.example .env.local
```

### 3.1 Variables Completas

El `.env.example` del repo está incompleto. Abajo están **todas** las variables que el Engine usa en runtime, agrupadas por función.

#### Core / Infra

| Variable | Requerida | Ejemplo | Descripción |
|----------|-----------|---------|-------------|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require` | Neon Postgres pooled connection string. Obtener desde el dashboard de Neon. |
| `CRON_SECRET` | ✅ | `a1b2c3...` (hex 64 chars) | Bearer token para endpoints de sync/audit. Vercel lo inyecta automáticamente en cron jobs. Generar: `openssl rand -hex 32` |
| `ADMIN_API_SECRET` | ✅ | `d4e5f6...` (hex 64 chars) | Bearer token para endpoints admin (pdf-status, retry-pdf, asset-health). Generar: `openssl rand -hex 32` |
| `LOG_LEVEL` | ❌ | `info` | `debug` \| `info` \| `warn` \| `error`. Default: `info` |
| `NODE_ENV` | ❌ | `development` | Inyectado por Next.js. No setear manualmente. |

#### NextAuth (Dashboard interno Focux)

| Variable | Requerida | Ejemplo | Descripción |
|----------|-----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | ✅ | `123456.apps.googleusercontent.com` | Google OAuth Client ID. Solo emails `@focux.co` y `@focuxdigital.com` pueden autenticarse. |
| `GOOGLE_CLIENT_SECRET` | ✅ | `GOCSPX-...` | Google OAuth Client Secret |
| `NEXTAUTH_SECRET` | ✅ | `random-string-32-chars` | Signing key de NextAuth. Generar: `openssl rand -hex 32` |

#### HubSpot (per-client)

| Variable | Requerida | Ejemplo | Descripción |
|----------|-----------|---------|-------------|
| `HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN` | ✅ | `pat-na1-...` | Private App token del portal **demo** (51256354). Scopes: contacts, deals, custom objects, files, owners, schemas. |

**Patrón para nuevos clientes:** `HUBSPOT_<CLIENT_ID_UPPER>_PRIVATE_APP_TOKEN`

#### Sinco ERP (per-client)

| Variable | Requerida | Ejemplo | Descripción |
|----------|-----------|---------|-------------|
| `SINCO_JIMENEZ_DEMO_USERNAME` | ✅ | `APICBR` | Username del API de Sinco (siempre `APICBR` para Jiménez) |
| `SINCO_JIMENEZ_DEMO_PASSWORD` | ✅ | `...` | Password del API de Sinco. Solicitar a contacto técnico (Leonardo Bolaños). |

**Patrón para nuevos clientes:** `SINCO_<CLIENT_ID_UPPER>_USERNAME` / `_PASSWORD`

#### AUTH-1 — Quoter Session

| Variable | Requerida | Ejemplo | Descripción |
|----------|-----------|---------|-------------|
| `QUOTER_SESSION_SECRET` | ✅ | `hex-64-chars` | HMAC-SHA256 key para firmar launch tokens, session cookies y PDF access tokens. Generar: `openssl rand -hex 32` |
| `QUOTER_REQUIRE_HUBSPOT_LAUNCH` | ✅ | `false` | `true` = solo se puede acceder al cotizador desde HubSpot App Card. `false` = acceso directo permitido (demo/dev). |
| `QUOTER_ALLOW_DIRECT_ACCESS` | ✅ | `true` | `true` = permite abrir `/quoter?clientId=X` sin cookie de sesión. `false` = requiere cookie. |
| `HUBSPOT_CARD_LAUNCH_SECRET_JIMENEZ_DEMO` | ✅ | `hex-64-chars` | Secret compartido entre App Function y Engine para validar launch requests. Generar: `openssl rand -hex 32` |

**Patrón:** `HUBSPOT_CARD_LAUNCH_SECRET_<CLIENT_ID_UPPER>`

#### Write-Back (Sinco)

| Variable | Requerida | Ejemplo | Descripción |
|----------|-----------|---------|-------------|
| `SINCO_WRITEBACK_ENABLED` | ❌ | `false` | Feature flag global. `false` = bloquea toda escritura a Sinco. |
| `SINCO_WRITEBACK_DRY_RUN` | ❌ | `true` | `true` = logea operaciones sin ejecutarlas contra Sinco. |
| `WEBHOOK_SECRET_JIMENEZ_DEMO` | ⚠️ | `hex-64-chars` | Bearer token para webhook receiver de HubSpot workflows. Requerido si write-back está activo. |

#### Misc

| Variable | Requerida | Ejemplo | Descripción |
|----------|-----------|---------|-------------|
| `NEXT_PUBLIC_BASE_URL` | ❌ | `https://engine.focux.co` | URL base para links en PDFs y cotizaciones. Fallback: `VERCEL_URL`. En local: `http://localhost:3000`. |
| `ENABLE_DEBUG_RESPONSES` | ❌ | `false` | `true` = agrega campos debug en response de deal creation. Solo para desarrollo. |

### 3.2 Configuración recomendada para dev local

```env
# === Core ===
DATABASE_URL=postgresql://...@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
CRON_SECRET=local-dev-secret-any-string
ADMIN_API_SECRET=local-dev-secret-any-string
LOG_LEVEL=debug

# === NextAuth (Google OAuth) ===
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
NEXTAUTH_SECRET=local-dev-nextauth-secret

# === HubSpot ===
HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN=pat-na1-...

# === Sinco ===
SINCO_JIMENEZ_DEMO_USERNAME=APICBR
SINCO_JIMENEZ_DEMO_PASSWORD=...

# === Quoter Auth (AUTH-1) ===
QUOTER_SESSION_SECRET=local-dev-session-secret-64-hex
QUOTER_REQUIRE_HUBSPOT_LAUNCH=false
QUOTER_ALLOW_DIRECT_ACCESS=true
HUBSPOT_CARD_LAUNCH_SECRET_JIMENEZ_DEMO=local-dev-launch-secret

# === Write-Back (off by default in dev) ===
SINCO_WRITEBACK_ENABLED=false
SINCO_WRITEBACK_DRY_RUN=true

# === Misc ===
NEXT_PUBLIC_BASE_URL=http://localhost:3000
ENABLE_DEBUG_RESPONSES=true
```

### 3.3 Obtener credenciales

| Credencial | Dónde obtenerla |
|------------|-----------------|
| `DATABASE_URL` | [Neon Dashboard](https://console.neon.tech/) → proyecto focuxai-engine → Connection Details → Pooled |
| HubSpot PAT | HubSpot → Settings → Integrations → Private Apps → `focuxai-engine` |
| Sinco password | Solicitar a Leonardo Bolaños (contacto técnico Jiménez/Sinco). Email en directorio interno. |
| Google OAuth | [Google Cloud Console](https://console.cloud.google.com/) → proyecto focux-engine → Credentials |
| Vercel env vars (producción) | `vercel env ls` o [Vercel Dashboard](https://vercel.com/) → focuxai-engine → Settings → Environment Variables |

---

## 4. Database

### 4.1 Neon Postgres (serverless)

El Engine usa **Neon** vía el driver HTTP `@neondatabase/serverless`. No hay conexiones persistentes, no hay pool, no hay ORM. Las queries se ejecutan con tagged templates:

```typescript
import { getDb } from '@/engine/core/db/neon';
const sql = getDb();
const result = await sql`SELECT * FROM quotations WHERE cot_number = ${cotNumber}`;
```

### 4.2 Tablas

**`quotations`** — Tabla principal. Almacena cotizaciones con toda la info de buyer, property, financial, advisor, PDF status y deal association.

**`pg_event_log`** — Idempotency log para write-back operations (separar/legalizar). Previene duplicados en webhook retries.

### 4.3 Migraciones

No hay ORM de migraciones (no Drizzle, no Prisma). Las migraciones se ejecutan como SQL directo en Neon Console o via `psql`. Los archivos de migración están en:

```
src/engine/core/db/migrations/
├── 001_quotations.sql
├── 002_pdf_hubspot_columns.sql
├── 003_pdf_status_generation_failed.sql
├── 004_pdf_hubspot_url.sql
├── 005_event_log.sql
└── 006_sinco_ids.sql
```

Para aplicar una migración nueva:

```bash
# Conectar a Neon
psql "postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Ejecutar migración
\i src/engine/core/db/migrations/007_nueva_migracion.sql
```

**⚠️ Importante:** En dev se usa la misma DB de Neon (no hay local). Las migraciones aplicadas en Neon afectan a todos los environments. Verificar siempre que los cambios sean backward-compatible.

---

## 5. Run Development Server

```bash
npm run dev
```

Abre `http://localhost:3000`. Rutas principales:

| Ruta | Qué es |
|------|--------|
| `/quoter?clientId=jimenez_demo` | Cotizador (acceso directo si `QUOTER_ALLOW_DIRECT_ACCESS=true`) |
| `/login` | Login con Google OAuth (dashboard interno) |
| `/home` | Dashboard interno (requiere NextAuth session) |
| `/ops` | Panel de operaciones (requiere NextAuth session) |
| `/adapter` | CRM Adapter deployer (requiere NextAuth session) |

### 5.1 Probar el cotizador sin HubSpot

Con `QUOTER_ALLOW_DIRECT_ACCESS=true` y `QUOTER_REQUIRE_HUBSPOT_LAUNCH=false`:

```
http://localhost:3000/quoter?clientId=jimenez_demo
```

El cotizador carga sin sesión. Los campos de buyer y asesor estarán vacíos (sin prefill de HubSpot).

### 5.2 Probar el flujo completo AUTH-1

1. Setear `QUOTER_REQUIRE_HUBSPOT_LAUNCH=true` y `QUOTER_ALLOW_DIRECT_ACCESS=false`
2. Simular el launch desde App Function:

```bash
# Generar launch token
curl -X POST http://localhost:3000/api/engine/quoter/launch-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(cat .env.local | grep HUBSPOT_CARD_LAUNCH_SECRET_JIMENEZ_DEMO | cut -d= -f2)" \
  -d '{"portalId":"51256354","contactId":"12345","userEmail":"test@focux.co"}'

# Response: { "token": "abc123...", "expiresIn": 300 }
# Abrir en browser dentro de 5 minutos:
# http://localhost:3000/quoter/launch?token=abc123...
```

---

## 6. Build & Lint

```bash
# Build de producción
npm run build

# Lint
npm run lint
```

**⚠️ NUNCA ejecutar `npx vercel --prod`.** Los deploys a producción se hacen vía Git push al branch conectado en Vercel. Ver `runbooks/deploy.md`.

---

## 7. Scripts Utilitarios

```bash
# Descubrir proyectos disponibles en Sinco
npm run discover:sinco

# Dump crudo de data de un proyecto Sinco
npm run dump:sinco

# Explorar business entities de Sinco
npm run explore:sinco

# Tests de integración HubSpot File Manager
npm run test:hubspot-files
```

Los scripts requieren `.env.local` configurado con las credenciales de Sinco.

---

## 8. Project Structure (key directories)

```
focuxai-engine/
├── docs/                          ← Documentación (estás aquí)
├── scripts/                       ← Scripts utilitarios (discover, dump, explore)
├── src/
│   ├── app/                       ← Next.js App Router
│   │   ├── api/                   ← API routes (backend)
│   │   │   ├── auth/              ← NextAuth (Google OAuth)
│   │   │   ├── engine/            ← Engine API routes
│   │   │   │   ├── audit/         ← Inventory audit
│   │   │   │   ├── contacts/      ← Contact search
│   │   │   │   ├── health/        ← Health check
│   │   │   │   ├── inventory/     ← Inventory + agrupaciones
│   │   │   │   ├── quotations/    ← CRUD + PDF + Deal + retry
│   │   │   │   ├── quoter/        ← AUTH-1 (launch-token, session)
│   │   │   │   ├── sale/          ← Write-back (separar, legalizar, webhook)
│   │   │   │   └── sync/          ← Inventory sync from Sinco
│   │   │   └── hubspot/           ← HubSpot API proxy
│   │   ├── quoter/                ← Frontend (QuoterClient.tsx + launch route)
│   │   ├── home/                  ← Dashboard (NextAuth protected)
│   │   ├── ops/                   ← Operations panel
│   │   └── login/                 ← Login page
│   ├── engine/                    ← Core business logic
│   │   ├── core/                  ← Shared infrastructure
│   │   │   ├── auth/              ← quoterSession.ts, adminAuth.ts
│   │   │   ├── config/            ← clientRegistry.ts, client configs
│   │   │   ├── db/                ← neon.ts, migrations/, pgEventLog.ts
│   │   │   ├── errors/            ← EngineError, Result<T,E>
│   │   │   └── logging/           ← Logger.ts
│   │   ├── connectors/            ← External system connectors
│   │   │   ├── crm/hubspot/       ← HubSpot API client + file manager
│   │   │   └── erp/sinco/         ← Sinco API client + auth
│   │   └── apps/                  ← Application modules
│   │       ├── quoter/            ← Inventory, PDF, sync logic
│   │       └── sale/              ← Write-back (separar/legalizar)
│   ├── lib/                       ← Shared utilities
│   └── types/                     ← TypeScript type definitions
├── .env.example                   ← Template (incompleto — ver SETUP.md §3)
├── next.config.js                 ← Cache headers for /quoter
├── tsconfig.json                  ← TypeScript config (strict: false)
└── package.json                   ← Dependencies & scripts
```

---

## 9. Authentication Overview

Hay **3 mecanismos de auth separados** en el Engine. No están conectados entre sí.

| Mecanismo | Protege | Cómo funciona |
|-----------|---------|---------------|
| **NextAuth (Google OAuth)** | `/home`, `/ops`, `/adapter`, `/scan`, `/content` | Middleware en `src/middleware.ts`. Solo emails `@focux.co` y `@focuxdigital.com`. |
| **AUTH-1 (Quoter Session)** | Creación de cotizaciones, PDF, deal | HMAC-signed cookie `quoter_session` (HttpOnly, 8hrs). Se obtiene via App Card → launch-token → `/quoter/launch`. |
| **Bearer tokens** | Sync, audit, admin, webhook | `CRON_SECRET` para cron/sync, `ADMIN_API_SECRET` para ops, `WEBHOOK_SECRET_<CLIENT>` para write-back. |

Ver `ARCHITECTURE.md` §7 para detalles completos.

---

## 10. Troubleshooting

### "Cannot find module" al hacer `npm run dev`

```bash
rm -rf node_modules .next
npm install
npm run dev
```

### Cotizador muestra "No se pudo cargar el inventario"

1. Verificar `HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN` en `.env.local`
2. Verificar que el token no expiró (HubSpot → Private Apps → check status)
3. Probar manualmente: `curl http://localhost:3000/api/engine/inventory?clientId=jimenez_demo`

### AUTH-1: "INVALID_LAUNCH_SECRET" (401)

1. Verificar que `HUBSPOT_CARD_LAUNCH_SECRET_JIMENEZ_DEMO` está correctamente seteado
2. **CRÍTICO:** Si seteaste la variable con `echo` en vez de `printf`, tiene un `\n` al final que rompe `timingSafeEqual`. Re-setear con `printf`:
   ```bash
   printf 'tu_secret' | vercel env add HUBSPOT_CARD_LAUNCH_SECRET_JIMENEZ_DEMO production
   ```

### PDF no se genera / sale en blanco

1. Verificar que los assets existen en HubSpot CDN:
   ```bash
   curl -I "https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez/porto-sabbia/render.png"
   ```
2. Ejecutar health check:
   ```bash
   curl http://localhost:3000/api/engine/quotations/asset-health?clientId=jimenez_demo \
     -H "Authorization: Bearer $ADMIN_API_SECRET"
   ```

### Sync de inventario falla con timeout

El endpoint tiene `maxDuration: 300s`. Si falla por timeout:
1. Usar sync parcial: `?mode=prices` (solo actualiza precios, mucho más rápido)
2. Filtrar por proyecto: `?proyectoId=123`
3. Verificar latencia de Sinco: `curl http://localhost:3000/api/engine/health?clientId=jimenez_demo`

### Write-back retorna 422

El schema de Zod es **strict** — cualquier campo extra causa error. Verificar que el body coincide exactamente con el schema esperado. Los errores de Zod incluyen el path exacto del campo inválido en el response.

---

## 11. Adding Environment Variables to Vercel

**⚠️ SIEMPRE usar `printf`, NUNCA `echo`:**

```bash
# ✅ CORRECTO
printf 'mi_valor_secreto' | vercel env add NOMBRE_VARIABLE production

# ❌ INCORRECTO (agrega \n que rompe timingSafeEqual y comparaciones exactas)
echo "mi_valor_secreto" | vercel env add NOMBRE_VARIABLE production
```

Para verificar que una variable no tiene trailing newline:

```bash
vercel env pull .env.vercel-check
cat -A .env.vercel-check | grep NOMBRE_VARIABLE
# Si ves $ al final del valor sin ^M ni espacios extra, está bien
```

---

*Focux | www.focux.co | Documento confidencial*
