# FocuxAI Engine™ — Architecture Guide

> **Audience:** Engineers maintaining or evolving the Quoter module.
> **Last updated:** 2026-05-25
> **Confidential** — Focux Digital Group S.A.S. Internal use only.

---

## 1. What Is This?

FocuxAI Engine is a **multi-tenant platform** that connects real estate CRMs (HubSpot) with ERPs (Sinco) through intelligent automation. The first (and currently only) production app is the **Cotizador** — a real-time quotation tool for construction companies.

The Engine is deployed as a **Next.js 16 application on Vercel** at `engine.focux.co`. It serves both the frontend (React quoter UI) and the backend (API routes). There is no separate backend service.

### Key Properties

- **Multi-tenant by design.** Each client (e.g., `jimenez_demo`, `jimenez_prod`) has its own config, HubSpot portal, Sinco credentials, and feature flags. Adding a client = adding a config file, not modifying code.
- **Zero native dependencies.** Runs on Vercel Hobby plan. No headless browsers, no native modules, no Docker.
- **Result pattern, never throw.** Business logic uses `Result<T, EngineError>` — errors are values, not exceptions. `throw` is reserved for truly unexpected failures.
- **Secrets never in frontend bundles.** All sensitive operations happen server-side in API routes or HubSpot App Functions.

---

## 2. System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HubSpot CRM Portal                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Contacts │  │  Deals   │  │Custom Objects │  │  Workflows    │  │
│  │  (_fx)   │  │  (_fx)   │  │Macro/Proy/   │  │  14 active    │  │
│  │          │  │          │  │Unidad/Agrup  │  │  (calific,    │  │
│  │          │  │          │  │              │  │   writeback)  │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  └───────┬───────┘  │
│       │              │               │                  │          │
│  ┌────┴──────────────┴───────────────┴──────────────────┴───────┐  │
│  │                    App Card (sidebar)                        │  │
│  │  QuoterCard.tsx → App Function → launch-token                │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────┼──────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FocuxAI Engine (Vercel)                          │
│                    engine.focux.co                                  │
│                                                                     │
│  ┌─── Frontend (React) ──────────────────────────────────────────┐ │
│  │  /quoter         → QuoterClient.tsx (cotizador UI)            │ │
│  │  /quoter/launch   → Token → Cookie → Redirect                │ │
│  │  /adapter         → AdapterClient.tsx (CRM deployer)          │ │
│  │  /ops             → OpsClient.tsx (operations dashboard)      │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─── API Routes (/api/engine/*) ────────────────────────────────┐ │
│  │                                                                │ │
│  │  QUOTER AUTH                                                   │ │
│  │  ├─ POST /quoter/launch-token    ← App Function calls this    │ │
│  │  └─ GET  /quoter/session         ← Frontend reads session     │ │
│  │                                                                │ │
│  │  QUOTATION LIFECYCLE                                           │ │
│  │  ├─ POST /quotations             ← Persist quotation to DB    │ │
│  │  ├─ GET  /quotations             ← Lookup by cotNumber        │ │
│  │  ├─ POST /quotations/pdf         ← Generate PDF (POST body)   │ │
│  │  ├─ GET  /quotations/pdf         ← Direct PDF link (signed)   │ │
│  │  └─ POST /quotations/deal        ← Create Deal + Contact +    │ │
│  │                                     Upload PDF to HubSpot     │ │
│  │                                                                │ │
│  │  INVENTORY                                                     │ │
│  │  ├─ GET  /inventory              ← Sinco → HubSpot → DTO     │ │
│  │  ├─ GET  /inventory/agrupaciones ← Groupings for a project    │ │
│  │  └─ POST /contacts/search        ← HubSpot contact lookup     │ │
│  │                                                                │ │
│  │  WRITE-BACK (Sinco ERP)                                       │ │
│  │  ├─ POST /sale/separar           ← Direct separation call     │ │
│  │  ├─ POST /sale/legalizar         ← Direct legalization call   │ │
│  │  └─ POST /sale/separar-webhook/:clientId ← HubSpot WF calls  │ │
│  │                                                                │ │
│  │  SYNC                                                          │ │
│  │  └─ POST /sync/inventory         ← Sinco → HubSpot COs sync  │ │
│  │                                                                │ │
│  │  OPS (admin-only)                                              │ │
│  │  ├─ POST /quotations/retry-pdf   ← Retry failed PDF uploads   │ │
│  │  ├─ GET  /quotations/pdf-status  ← PDF pipeline dashboard     │ │
│  │  ├─ GET  /quotations/asset-health← CDN asset healthcheck      │ │
│  │  └─ GET  /audit/inventory        ← Quarantine report          │ │
│  │                                                                │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─── Engine Core (src/engine/) ─────────────────────────────────┐ │
│  │  See Section 4 for detailed breakdown                         │ │
│  └───────────────────────────────────────────────────────────────┘ │
└──────────┬──────────────────────────┬──────────────────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────┐    ┌──────────────────────────────────────┐
│  Neon Postgres   │    │        Sinco ERP (Jiménez)           │
│                  │    │                                      │
│  quotations      │    │  Auth: APICBR user, 24h tokens       │
│  event_log       │    │  Read: Macros, Proyectos,            │
│                  │    │        Agrupaciones, Unidades         │
│                  │    │  Write: Compradores,                  │
│                  │    │         ConfirmacionVenta              │
└──────────────────┘    └──────────────────────────────────────┘
```

---

## 3. Data Flows

### 3.1 Cotización E2E (happy path)

```
Asesor clicks "Abrir Cotizador" in HubSpot Contact
  │
  ├─1─→ App Card → App Function → POST /quoter/launch-token
  │      (Bearer HUBSPOT_CARD_LAUNCH_SECRET_<CLIENT>)
  │      Engine validates secret, returns signed HMAC token (5min TTL)
  │
  ├─2─→ App Card opens /quoter/launch?token=... in new tab
  │      Engine validates token → sets HttpOnly cookie (8hrs) → redirect /quoter?clientId=X
  │
  ├─3─→ QuoterClient mounts → GET /quoter/session
  │      Engine reads cookie → fetches Contact props + Owner from HubSpot
  │      Returns: buyer data + asesor (Owner name + email)
  │
  ├─4─→ QuoterClient loads inventory → GET /inventory?clientId=X
  │      Engine reads HubSpot Custom Objects (Macros, Projects, Units, Groupings)
  │      Returns: InventoryResponse with towers, units, typologies
  │
  ├─5─→ Asesor fills quotation → clicks "Enviar y crear Deal"
  │
  ├─6─→ POST /quotations (persist to Neon DB)
  │      Returns: id, cotNumber, pdfUrl (signed 7-day token)
  │
  ├─7─→ POST /quotations/deal (create HubSpot Deal)
  │      Step 1: Find or create Contact in HubSpot
  │      Step 2: Create Deal with 34 _fx properties
  │      Step 3: Associate Deal ↔ Contact
  │      Step 4: Associate Deal ↔ Agrupación (Custom Object)
  │      Step 5: Generate PDF → Upload to HubSpot File Manager → Attach as Note
  │      Step 6: PATCH Deal with pdf_hubspot_url_fx
  │      Returns: dealId, contactId, pdfUpload status
  │
  └─8─→ Success screen with PDF download link
```

### 3.2 Inventory Sync (Sinco → HubSpot)

```
Admin triggers POST /sync/inventory?clientId=X
  │
  ├─→ InventorySync reads Sinco ERP (4 layers: Macros → Projects → Groupings → Units)
  ├─→ Maps to HubSpot Custom Object DTOs
  ├─→ Upserts to HubSpot via batch API (create/update with dedup)
  ├─→ Creates USER_DEFINED associations (Project→Unit, Project→Grouping, etc.)
  └─→ Returns: counts per object type + errors
```

### 3.3 Write-Back (HubSpot → Sinco)

```
Asesor moves Deal to "Unidad Separada" stage in HubSpot
  │
  ├─→ HubSpot Workflow checks: writeback_ready_fx=true AND writeback_status_fx≠registrado
  ├─→ Workflow POSTs to /sale/separar-webhook/jimenez_demo
  │    (Bearer WEBHOOK_SECRET_<CLIENT>)
  │
  ├─→ Engine validates auth, fetches Deal + Contact + Sinco IDs from HubSpot
  ├─→ Looks up or creates Comprador in Sinco (POST /Compradores)
  ├─→ Confirms sale in Sinco (PUT /Ventas/ConfirmacionVenta)
  ├─→ Updates Deal: writeback_status_fx=registrado + transaction ID
  └─→ Logs event in PgEventLog (idempotency guard)
```

---

## 4. Engine Architecture (src/engine/)

The `src/engine/` directory is the domain layer — zero Next.js dependencies, pure TypeScript. It can be extracted to a standalone package if needed.

### 4.1 Directory Map

```
src/engine/
├── core/                          # Shared infrastructure
│   ├── auth/
│   │   ├── quoterSession.ts       # HMAC tokens, session cookies, portal→client map
│   │   └── verifyWebhookAuth.ts   # Bearer auth for write-back webhooks
│   ├── config/
│   │   └── clientRegistry.ts      # resolveHubSpotToken(), client PAT lookup
│   ├── db/
│   │   ├── neon.ts                # Neon Postgres connection (serverless driver)
│   │   └── migrations/            # SQL migration files (001-006)
│   ├── errors/
│   │   └── EngineError.ts         # Error taxonomy: Auth, Validation, Resource, Business
│   ├── eventlog/
│   │   ├── EventLog.ts            # Interface
│   │   └── PgEventLog.ts          # Postgres implementation (idempotency)
│   ├── http/
│   │   ├── HttpClient.ts          # Rate-limited HTTP with retry + backoff
│   │   └── adminAuth.ts           # Bearer ADMIN_API_SECRET for ops endpoints
│   ├── logging/
│   │   └── Logger.ts              # Structured logging
│   ├── sync/
│   │   ├── InventorySync.ts       # Sinco → HubSpot CO sync orchestrator
│   │   ├── SaleWriteback.ts       # separar() + legalizar() orchestrators
│   │   ├── resolveSincoIds.ts     # Deal → Sinco IDs (mirror props or CO association)
│   │   ├── resolvePrimaryContact.ts # Deal → primary Contact VID
│   │   ├── buildSeparacionInputFromHubSpot.ts  # Deal+Contact → Sinco payload
│   │   ├── buildPlanPagosFromDealProps.ts       # Deal props → payment plan
│   │   └── constants.ts           # Sinco concept IDs, stage maps
│   └── types/
│       └── Result.ts              # Result<T, E> monad (ok/err)
│
├── connectors/                    # External system adapters
│   ├── crm/hubspot/
│   │   ├── HubSpotAdapter.ts      # CRM property/object deployer (Adapter tool)
│   │   ├── hubspotFileManager.ts  # File upload + Note attach (Fase B.0)
│   │   └── types.ts               # HubSpot API types
│   └── erp/sinco/
│       ├── SincoConnector.ts      # Read inventory + Write comprador/venta
│       ├── SincoHttpClient.ts     # Auth-aware HTTP (3-step token flow)
│       ├── SincoAuthManager.ts    # Token lifecycle (24h TTL)
│       └── types.ts               # Sinco API types (Swagger-aligned)
│
├── apps/quoter/                   # Quoter-specific domain logic
│   ├── inventory/
│   │   ├── clientConfigs/
│   │   │   ├── jimenez_demo.ts    # Client config: projects, overlays, typology rules
│   │   │   └── portoSabbiaTypologyRules.ts  # Area-based typology matching
│   │   ├── mapInventoryToDto.ts   # HubSpot COs → Quoter DTO (Result pattern)
│   │   ├── fetchAllPages.ts       # Paginated HubSpot CO fetch (Result pattern)
│   │   ├── joinGroupingWithUnit.ts # Agrupación + Unidad join logic
│   │   ├── typologyTypes.ts       # TypeScript types for typology matching
│   │   ├── parseUnitName.ts       # Extract unit number from Sinco naming
│   │   ├── normalizeUnitType.ts   # Normalize Sinco unit types
│   │   ├── resolveUnitFallbacks.ts # Fill missing data from related records
│   │   ├── fetchAssetSafe.ts      # Safe image fetch with size validation
│   │   ├── types.ts               # InventoryResponse, QuarantinedItem, etc.
│   │   └── index.ts               # Public exports
│   └── pdf/
│       └── pdfHubSpotSyncService.ts # PDF generate → upload → attach → PATCH deal
│
├── config/                        # Client configuration layer
│   ├── ClientConfigStore.ts       # Load client configs by clientId
│   └── ConnectorFactory.ts        # Create connector instances per client
│
├── interfaces/                    # Contracts between layers
│   ├── ICrmAdapter.ts             # CRM adapter interface
│   └── IErpConnector.ts           # ERP connector interface
│
└── index.ts                       # Public exports
```

### 4.2 Layers and Dependency Rules

```
┌──────────────────────────────────────┐
│  API Routes  (src/app/api/engine/)   │  ← HTTP layer. Zod validation.
│  Calls engine layer, returns JSON.   │     Never contains business logic.
├──────────────────────────────────────┤
│  Engine Apps  (src/engine/apps/)     │  ← Domain logic per product.
│  Quoter inventory, PDF sync, etc.    │     Uses connectors + core.
├──────────────────────────────────────┤
│  Engine Core  (src/engine/core/)     │  ← Shared infrastructure.
│  Auth, DB, errors, sync, eventlog.   │     Zero product-specific code.
├──────────────────────────────────────┤
│  Connectors  (src/engine/connectors/)│  ← External system adapters.
│  HubSpot, Sinco. Implement interfaces│     Pure I/O, no business logic.
├──────────────────────────────────────┤
│  Interfaces  (src/engine/interfaces/)│  ← Contracts.
│  ICrmAdapter, IErpConnector.         │     No implementation.
└──────────────────────────────────────┘

Rules:
  - API Routes → Engine (never the other way)
  - Engine Apps → Core + Connectors (never other Apps)
  - Core → Interfaces only (never Connectors directly)
  - Connectors → Interfaces (never Core or Apps)
```

---

## 5. Auth Architecture

The Engine has **3 independent auth mechanisms**, each for a different caller:

### 5.1 Quoter Session (asesor via HubSpot App Card)

| Component | Mechanism | File |
|-----------|-----------|------|
| App Function → Engine | Bearer `HUBSPOT_CARD_LAUNCH_SECRET_<CLIENT>` (timing-safe compare) | `quoterSession.ts` |
| Launch token | HMAC-SHA256, 5min TTL, claims: clientId, portalId, contactId, userEmail | `quoterSession.ts` |
| Session cookie | HMAC-SHA256, HttpOnly, SameSite=Lax, 8hr TTL | `quoterSession.ts` |
| PDF access token | HMAC-SHA256, 7-day TTL, used in PDF URLs for email/WhatsApp | `quoterSession.ts` |

**Portal → Client mapping:** `{ '51256354': 'jimenez_demo', '51059324': 'jimenez_prod' }` hardcoded in `quoterSession.ts`.

**Per-client secret naming:** `HUBSPOT_CARD_LAUNCH_SECRET_` + `clientId.toUpperCase().replace(/[^A-Z0-9]/g, '_')`

**Feature flags:**
- `QUOTER_REQUIRE_HUBSPOT_LAUNCH` — When `true`, all quoter endpoints require valid session cookie. Default: `false` (demo mode).
- `QUOTER_ALLOW_DIRECT_ACCESS` — When `true`, allows URL access without App Card launch. Default: `true` (demo mode).

### 5.2 Webhook Auth (HubSpot Workflows → Engine)

| Component | Mechanism | File |
|-----------|-----------|------|
| HubSpot WF → Engine | Bearer `WEBHOOK_SECRET_<CLIENT>` (timing-safe compare) | `verifyWebhookAuth.ts` |

Secret per client: `WEBHOOK_SECRET_JIMENEZ_DEMO` (Preview), `WEBHOOK_SECRET_JIMENEZ_PROD` (Production).

### 5.3 Admin Auth (ops endpoints)

| Component | Mechanism | File |
|-----------|-----------|------|
| Admin → Engine | Bearer `ADMIN_API_SECRET` | `adminAuth.ts` |

Fails closed in production (if secret missing, returns 500). In dev, allows access with console warning.

---

## 6. Database Schema (Neon Postgres)

### 6.1 quotations

The main table. 52+ columns. Stores every quotation ever generated.

Key columns: `id` (serial PK), `cot_number` (unique), `client_id`, buyer fields (`buyer_name`, `buyer_email`, `buyer_doc_number`, etc.), property fields (`macro_id`, `torre_id`, `unit_number`, `unit_price`, etc.), financial fields (`net_value`, `separation_amount`, `financed_amount`, etc.), `payment_plan` (JSONB), `bonuses` (JSONB), `config_snapshot` (JSONB), `observaciones`, Sinco IDs (`sinco_agrupacion_id`, `sinco_unidad_id`, `sinco_proyecto_id`), HubSpot refs (`hubspot_deal_id`, `hubspot_contact_id`), PDF tracking (`pdf_url`, `pdf_hubspot_file_id`, `pdf_upload_status`, `pdf_hubspot_url`), `status`, `expires_at`, `created_at`, `updated_at`.

**pdf_upload_status state machine:** `null` → `generation_failed` / `upload_failed` → `uploaded` → `attach_failed` → `attached`

### 6.2 event_log

Idempotency table for write-back operations.

Key columns: `id`, `transaction_id` (unique per operation), `client_id`, `deal_id`, `operation` (separar/legalizar), `status`, `sinco_response` (JSONB), `created_at`.

### 6.3 Migrations

Applied sequentially: `001_quotations.sql` → `002_pdf_hubspot_columns.sql` → `003_pdf_status_generation_failed.sql` → `004_pdf_hubspot_url.sql` → `005_event_log.sql` → `006_sinco_ids.sql`

Run manually via Neon SQL editor (no automated migration runner).

---

## 7. External Systems

### 7.1 HubSpot CRM

| Item | Demo Portal | Production Portal |
|------|-------------|-------------------|
| Portal ID | 51256354 | 51059324 |
| PAT env var | `HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN` | `HUBSPOT_JIMENEZ_PRIVATE_APP_TOKEN` |
| Pipeline ID | 889311333 | {{PIPELINE_ID_PROD}} |
| Stage "Cotización" | 1338267783 | {{STAGE_ID_PROD}} |
| Custom Object IDs | Macro=2-60986238, Proyecto=2-60987399, Unidad=2-60987403, Agrupación=2-60987404 | Macro=2-61560827, Proyecto=2-61560828, Unidad=2-61560829, Agrupación=2-61560831 |

**Properties:** All custom properties use suffix `_fx` and live in group `focux` (lowercase). 34 deal properties, ~20 contact properties.

**File Manager:** PDFs stored in `/cotizaciones/{clientSlug}/{macroSlug}/{YYYY-MM}/{cotNumber}_v1.pdf`. Access level: `PUBLIC_NOT_INDEXABLE`.

### 7.2 Sinco ERP

| Item | Test | Production |
|------|------|------------|
| Base URL | `https://pruebas3.sincoerp.com/SincoJimenez_Nueva_PRBINT/V3` | `https://www3.sincoerp.com/...` |
| Auth | 3-step: POST /Token (user+pass) → POST /Token (empresa=1) → Bearer token (24h) | Same flow |
| User | APICBR | APICBR |

**Key endpoints:**
- Read: `GET /Macros`, `GET /Proyectos/IdMacro/{id}`, `GET /Agrupaciones/IdProyecto/{id}`, `GET /Unidades/IdProyecto/{id}`
- Write: `POST /Compradores` (create buyer), `PUT /Ventas/ConfirmacionVenta` (confirm sale)

**Quirks (documented in code and memory):**
- Sinco returns HTTP 409 (not 404) for non-existent buyer with body "El comprador ingresado no existe"
- `viviendaPropia` is Byte (0/1), `discapacidad` is Boolean, `idCiudadResidencia` cannot be null
- Typo in API: accepts `idHubspot`, returns `idHusbpot` (missing second "t")

### 7.3 Vercel

- **Plan:** Hobby (maxDuration 60s)
- **Project:** focuxai-engine
- **Domain:** engine.focux.co
- **Auto-deploy:** Push to `main` → production. Push to feature branches → preview.
- **Neon integration:** DATABASE_URL injected automatically by Vercel.

---

## 8. Client Configuration (Multi-Tenancy)

Each client has a config file at `src/engine/apps/quoter/inventory/clientConfigs/<clientId>.ts`.

A client config defines:

```typescript
{
  clientId: 'jimenez_demo',
  portalId: '51256354',
  overlay: {
    projects: [
      {
        code: 'PSS',              // Abbreviation for cotNumber generation
        sincoMacroId: 58,
        sincoProyectoId: 361,
        pctSeparacion: 5,
        pctCuotaInicial: 30,
        tipo: 'NO_VIS',
        agrupacionesPreestablecidas: true,
        typologyRules: portoSabbiaTypologyRules,
      }
    ]
  },
  assetBaseUrl: 'https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez/porto-sabbia',
  allowedHosts: ['51256354.fs1.hubspotusercontent-na1.net'],
}
```

**To add a new client:** Create a new config file, add env vars for tokens/secrets, deploy properties to their HubSpot portal via Adapter, sync inventory, upload assets. Detailed in `docs/ONBOARDING_NEW_CLIENT.md`.

---

## 9. PDF Generation

**Library:** `pdf-lib` v1.17.1 + `@pdf-lib/fontkit` v1.1.1 (zero native dependencies).

**Custom fonts embedded:** AinslieSans (Regular, Bold) + CarlaSans (Bold) — loaded from `/public/fonts/`.

**Builder:** `src/app/api/engine/quotations/pdf/pdfBuilder.ts` — ~800 lines. Generates a branded PDF with header (company logo + info), buyer data, property details (with render + floor plan images from HubSpot CDN), financial summary, payment schedule table, extraordinary payments, observations, and legal disclaimers.

**Two access paths:**
1. `POST /quotations/pdf` — Generate from POST body (used by frontend "Download PDF" button)
2. `GET /quotations/pdf?token=<signed>` — Generate from DB lookup using signed token (used in HubSpot deal links and emails)

**After generation:** `pdfHubSpotSyncService.ts` uploads the PDF buffer to HubSpot File Manager as `PUBLIC_NOT_INDEXABLE`, attaches it as a Note to the Deal, and PATCHes the Deal with `pdf_hubspot_url_fx`.

---

## 10. Error Handling

### Error Taxonomy (EngineError.ts)

| Family | Prefix | HTTP Status | Examples |
|--------|--------|-------------|---------|
| Auth | `AUTH_*` | 401/403 | AUTH_INVALID_TOKEN, AUTH_SESSION_EXPIRED |
| Validation | `VALIDATION_*` | 400 | VALIDATION_MISSING_FIELD, VALIDATION_CRM_DUPLICATE_DETECTED |
| Resource | `RESOURCE_*` | 502/504 | RESOURCE_CRM_NETWORK_ERROR, RESOURCE_ERP_TIMEOUT |
| Business | `BUSINESS_*` | 422 | BUSINESS_WRITEBACK_NOT_APPROVED, BUSINESS_WRITEBACK_ALREADY_PROCESSED |

### Rules

- Business logic: **always** `Result<T, EngineError>`, never throw
- API routes: no `try/catch` for expected errors — pattern match on `Result`
- External calls (HubSpot, Sinco): catch network errors → wrap in `ResourceError`
- Individual bad data: **quarantine + continue** (don't abort the batch)
- Missing configuration: **abort with err()** (can't continue safely)

---

## 11. Testing

| Suite | Runner | Count | Location |
|-------|--------|-------|----------|
| Inventory v5 | Node test runner | 9 | `engine/apps/quoter/inventory/__tests__/` |
| HubSpot File Manager | Node test runner | 27 | `engine/connectors/crm/hubspot/__tests__/` |
| Sale Writeback | Node test runner | 21 | `engine/connectors/erp/sinco/__tests__/` |
| WB-5 Webhook | Node test runner | 49 | `engine/core/sync/__tests__/` |
| Event Log | Node test runner | varies | `engine/core/eventlog/__tests__/` |

Run: `node --import tsx --test <test-file>`

No CI pipeline — tests run locally before push. Vercel build (`next build`) catches TypeScript errors.

---

## 12. Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| Sinco Discovery | `npm run discover:sinco` | List all macros/projects from Sinco ERP |
| Sinco Raw Dump | `npm run dump:sinco` | Deep dump bypassing mappers |
| Sinco Business Explorer | `npm run explore:sinco` | Explore buyer/sale endpoints |
| Asset Migration | `npx tsx scripts/migrate-assets-to-hubspot.ts` | Upload renders/floor plans to HubSpot CDN |
| HubSpot Properties | `bash scripts/create-hubspot-properties.sh` | Create _fx properties in HubSpot portal |

All scripts require `.env.local` with credentials.

---

## 13. Deploy

**Vercel auto-deploy:**
```
git push origin main → Vercel builds → production at engine.focux.co
git push origin feature/* → Vercel builds → preview URL
```

**HubSpot App Card deploy (separate project):**
```
cd _hubspot-app/focux-quoter-card
npx hs project upload
```

**⚠️ CRITICAL:** Never run `npx vercel --prod` manually. Always push to `main` and let Vercel auto-deploy.

**⚠️ CRITICAL:** When adding Vercel env vars via CLI, always use `printf` (not `echo`):
```bash
# CORRECT:
printf 'my_secret' | vercel env add VAR_NAME production

# WRONG (adds trailing newline that breaks HMAC comparison):
echo "my_secret" | vercel env add VAR_NAME production
```

---

## 14. Key Architectural Decisions

| # | Decision | Why | Alternative Rejected |
|---|----------|-----|---------------------|
| 1 | pdf-lib over Puppeteer | Zero native deps, runs on Vercel Hobby | Puppeteer needs libnss3.so (unavailable on Hobby) |
| 2 | HMAC-SHA256 over JWT | Simpler, no kid rotation, tokens are short-lived | JWT adds library + complexity for 5min tokens |
| 3 | Asesor from HubSpot Owner, not lookup table | Owner data is live, tables go stale fast | Advisor dropdown (CEO rejected: "nadie va a actualizar eso") |
| 4 | PDFs in client's HubSpot, not Focux infra | Data sovereignty — if client leaves, their files stay | S3 bucket (client loses access on contract end) |
| 5 | Result pattern, no exceptions | Errors are values, compose safely, no hidden paths | try/catch (swallows context, hides error paths) |
| 6 | App Function proxy, not direct secret | HubSpot UI Extension bundles are client-side | Direct secret in App Card (exposed in browser) |
| 7 | Per-client secrets, not shared | Revoking one client doesn't affect others | Single shared launch secret |
| 8 | printf not echo for Vercel env vars | echo adds `\n` that breaks timingSafeEqual | echo (caused 30min debugging incident) |
| 9 | Quarantine, not abort | One bad unit shouldn't kill the entire inventory load | Fail-fast (loses all good data for one bad record) |
| 10 | No auto-rollback HubSpot→Sinco | Sinco sale confirmation is irreversible by design | Auto-reverse (dangerous: can't undo a real sale) |

---

*FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.*
*Focux Digital Group S.A.S. — Confidential.*
