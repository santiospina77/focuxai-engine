# FocuxAI Engine™ — API Reference

> **Audience:** Engineers integrating with or maintaining Engine endpoints.
> **Last updated:** 2026-05-25
> **Base URL:** `https://engine.focux.co` (production) · `http://localhost:3000` (local)
> **Confidential** — Focux Digital Group S.A.S. Internal use only.

---

## Auth Mechanisms Summary

| Mechanism | Header / Cookie | Used By |
|-----------|----------------|---------|
| **Quoter Session** | Cookie `quoter_session` (HttpOnly, 8hrs) | Quotation CRUD, PDF, Deal |
| **Cron Secret** | `Authorization: Bearer <CRON_SECRET>` | Sync, Audit |
| **Admin Secret** | `Authorization: Bearer <ADMIN_API_SECRET>` | PDF Status, Retry, Asset Health |
| **Webhook Secret** | `Authorization: Bearer <WEBHOOK_SECRET_<CLIENT>>` | Write-back webhooks |
| **Launch Secret** | `Authorization: Bearer <HUBSPOT_CARD_LAUNCH_SECRET_<CLIENT>>` | Launch token generation |
| **None (public)** | — | Health, Inventory, Contact search |

---

## Table of Contents

1. [Health Check](#1-health-check)
2. [Inventory](#2-inventory)
3. [Agrupaciones (Units by Project)](#3-agrupaciones)
4. [Inventory Sync](#4-inventory-sync)
5. [Inventory Audit](#5-inventory-audit)
6. [Contact Search](#6-contact-search)
7. [Launch Token (AUTH-1)](#7-launch-token)
8. [Launch Redirect (AUTH-1)](#8-launch-redirect)
9. [Session (AUTH-1)](#9-session)
10. [Create Quotation](#10-create-quotation)
11. [Get Quotation](#11-get-quotation)
12. [Generate PDF](#12-generate-pdf)
13. [Create Deal](#13-create-deal)
14. [PDF Status (Admin)](#14-pdf-status)
15. [Retry PDF (Admin)](#15-retry-pdf)
16. [Asset Health (Admin)](#16-asset-health)
17. [Separar (Write-Back)](#17-separar)
18. [Legalizar (Write-Back)](#18-legalizar)
19. [Separar Webhook](#19-separar-webhook)
20. [HubSpot Proxy](#20-hubspot-proxy)

---

## 1. Health Check

**`GET /api/engine/health?clientId={clientId}`**

Smoke test. Verifica conectividad con HubSpot y Sinco para un client.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| None | — | no-store |

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | string | ✅ | e.g. `jimenez_demo` |

**Response 200:**

```json
{
  "clientId": "jimenez_demo",
  "name": "Jiménez Demo",
  "active": true,
  "erp": { "kind": "sinco", "ok": true, "latencyMs": 42, "error": null },
  "crm": { "kind": "hubspot", "ok": true, "latencyMs": 38, "error": null }
}
```

```bash
curl "http://localhost:3000/api/engine/health?clientId=jimenez_demo"
```

---

## 2. Inventory

**`GET /api/engine/inventory?clientId={clientId}`**

Retorna el inventario completo (macros → proyectos → items seleccionables) para el cotizador.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| None (public — cotizador frontend) | — | no-store |

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | string | ✅ | e.g. `jimenez_demo` |

**Response 200:** `InventoryResponse` — estructura anidada de macros con proyectos y unidades/agrupaciones mapeadas.

**Errors:**

| Code | Cause |
|------|-------|
| 400 | `clientId` missing |
| 404 | Client not found in registry |
| 500 | Token not configured |
| 502 | HubSpot API error |

```bash
curl "http://localhost:3000/api/engine/inventory?clientId=jimenez_demo"
```

**⚠️ Nota:** Este endpoint lee de **HubSpot Custom Objects**, nunca de Sinco directamente. Los datos llegan vía inventory sync.

---

## 3. Agrupaciones

**`GET /api/engine/inventory/agrupaciones`**

Lista agrupaciones (unidades agrupadas) de un proyecto, filtradas por estado.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| None (cotizador frontend) | — | no-store |

**Query params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `clientId` | string | ✅ | — | e.g. `jimenez_demo` |
| `proyectoId` | number | ✅ | — | HubSpot record ID del proyecto |
| `estado` | string | ❌ | `DISPONIBLE` | `DISPONIBLE` \| `COTIZADA` \| `BLOQUEADA` \| `SEPARADA` \| `VENDIDA` |
| `limit` | number | ❌ | 100 | Max records |

**Response 200:**

```json
{
  "proyectoId": 123,
  "estado": "DISPONIBLE",
  "total": 5,
  "records": [
    {
      "id": "hs-record-id",
      "id_sinco_fx": "456",
      "nombre_fx": "T1-101",
      "estado_fx": "DISPONIBLE",
      "valor_total_neto_fx": "350000000",
      "id_proyecto_sinco_fx": "789",
      "id_hubspot_deal_fx": null
    }
  ]
}
```

```bash
curl "http://localhost:3000/api/engine/inventory/agrupaciones?clientId=jimenez_demo&proyectoId=123&estado=DISPONIBLE"
```

---

## 4. Inventory Sync

**`GET|POST /api/engine/sync/inventory`**

Sincroniza inventario desde Sinco hacia HubSpot Custom Objects. GET y POST hacen lo mismo (GET para Vercel Cron compatibility).

| Auth | Rate limit | Cache | maxDuration |
|------|-----------|-------|-------------|
| `CRON_SECRET` Bearer | — | — | 300s |

**Query params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `clientId` | string | ✅ | — | e.g. `jimenez_demo` |
| `mode` | string | ❌ | `prices` | `full` (all fields) \| `prices` (only price updates) |
| `macroproyectoId` | number | ❌ | — | Filter by macro (Sinco ID) |
| `proyectoId` | number | ❌ | — | Filter by project (Sinco ID) |

```bash
curl "http://localhost:3000/api/engine/sync/inventory?clientId=jimenez_demo&mode=prices" \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## 5. Inventory Audit

**`GET /api/engine/audit/inventory`**

Genera reporte de auditoría del inventario — quarantined items, inconsistencias, warnings.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| `CRON_SECRET` Bearer OR `?secret=` query | — | — |

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | string | ✅ | e.g. `jimenez_demo` |
| `secret` | string | ❌ | Alternativa al header Authorization |

```bash
curl "http://localhost:3000/api/engine/audit/inventory?clientId=jimenez_demo" \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## 6. Contact Search

**`POST /api/engine/contacts/search`**

Busca un contacto en HubSpot por email.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| None (internal) | — | — |

**Request body:**

```json
{
  "clientId": "jimenez_demo",
  "email": "comprador@example.com"
}
```

**Response 200 (found):**

```json
{
  "found": true,
  "contact": {
    "hubspotId": "12345",
    "firstname": "Juan",
    "lastname": "Pérez",
    "phone": "+573001234567",
    "email": "comprador@example.com",
    "cedula": "1234567890",
    "tipoDocumento": "CC",
    "tipoPersona": "NATURAL",
    "canal": "sala_de_ventas_fisica",
    "listaProyectos": "Porto Sabbia",
    "proyectoActivo": "Porto Sabbia"
  }
}
```

**Response 200 (not found):**

```json
{ "found": false }
```

**Errors:** 400 (missing fields) · 404 (client not in registry) · 500 (token missing) · 502 (HubSpot error)

```bash
curl -X POST "http://localhost:3000/api/engine/contacts/search" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"jimenez_demo","email":"test@example.com"}'
```

---

## 7. Launch Token

**`POST /api/engine/quoter/launch-token`**

Genera un token firmado HMAC-SHA256 (5min TTL) para iniciar sesión en el cotizador. Llamado por la App Function de HubSpot.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| `HUBSPOT_CARD_LAUNCH_SECRET_<CLIENT>` Bearer | — | — |

**Request body (Zod-validated):**

```json
{
  "portalId": "51256354",
  "contactId": "12345",
  "userEmail": "asesor@jimenez.com"
}
```

**Portal → clientId mapping (hardcoded):**

| portalId | clientId |
|----------|----------|
| `51256354` | `jimenez_demo` |
| `51059324` | `jimenez_prod` |

**Response 200:**

```json
{
  "token": "eyJwb3J0YWxJZCI6IjUxMjU2MzU0Ii...",
  "expiresIn": 300
}
```

**Errors:** 400 (validation) · 401 (bad secret — timing-safe comparison) · 403 (unknown portal) · 500 (session secret missing)

```bash
curl -X POST "http://localhost:3000/api/engine/quoter/launch-token" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HUBSPOT_CARD_LAUNCH_SECRET_JIMENEZ_DEMO" \
  -d '{"portalId":"51256354","contactId":"12345","userEmail":"test@focux.co"}'
```

---

## 8. Launch Redirect

**`GET /quoter/launch?token={token}`**

Valida el launch token, setea cookie HttpOnly `quoter_session` (8hrs), y redirige al cotizador.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| Launch token (query param) | — | — |

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | ✅ | HMAC-signed token de `/api/engine/quoter/launch-token` (5min TTL) |

**Success:** 302 redirect → `/quoter?clientId=jimenez_demo` + `Set-Cookie: quoter_session=...`

**Cookie properties:** HttpOnly, SameSite=Lax, Secure (prod), Path=/, Max-Age=28800 (8hrs)

**Errors:** Redirect a `/quoter?error=missing_token` o `/quoter?error=invalid_token`

```bash
# No usar curl — abrir en browser para recibir la cookie:
open "http://localhost:3000/quoter/launch?token=abc123..."
```

---

## 9. Session

**`GET /api/engine/quoter/session`**

Retorna datos de la sesión activa — contacto HubSpot + owner (asesor).

| Auth | Rate limit | Cache |
|------|-----------|-------|
| Cookie `quoter_session` (optional) | — | — |

**Response 200 (authenticated):**

```json
{
  "authenticated": true,
  "session": {
    "clientId": "jimenez_demo",
    "portalId": "51256354",
    "contactId": "12345",
    "userEmail": "asesor@jimenez.com"
  },
  "contact": {
    "hubspotId": "12345",
    "firstname": "María",
    "lastname": "García",
    "phone": "+573009876543",
    "email": "maria@example.com",
    "cedula": "9876543210",
    "tipoDocumento": "CC",
    "tipoPersona": "NATURAL",
    "canal": "portal_web",
    "listaProyectos": "Porto Sabbia",
    "proyectoActivo": "Porto Sabbia"
  },
  "owner": {
    "id": "67890",
    "firstName": "Carlos",
    "lastName": "Jiménez",
    "email": "carlos@jimenez.com"
  }
}
```

**Response 200 (no session):**

```json
{ "authenticated": false }
```

```bash
curl "http://localhost:3000/api/engine/quoter/session" \
  -b "quoter_session=<cookie_value>"
```

---

## 10. Create Quotation

**`POST /api/engine/quotations`**

Crea una cotización nueva. Guarda en DB y retorna URL del PDF.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| Cookie `quoter_session` | — | — |

**Request body (QuotationInput):**

```json
{
  "clientId": "jimenez_demo",
  "cotNumber": "COT-2026-0001",
  "buyer": {
    "name": "María",
    "lastname": "García",
    "docType": "CC",
    "docNumber": "9876543210",
    "email": "maria@example.com",
    "phone": "3009876543",
    "phoneCc": "+57",
    "tipoPersona": "NATURAL",
    "hubspotContactId": "12345"
  },
  "property": {
    "macroId": 1,
    "macroName": "Porto Sabbia",
    "torreId": 101,
    "torreName": "Torre 1",
    "unitNumber": "101",
    "unitTipologia": "Tipo A - 65m²",
    "unitPiso": "1",
    "unitArea": 65.0,
    "unitHabs": 3,
    "unitBanos": 2,
    "unitPrice": 350000000,
    "parking": [],
    "storage": [],
    "includesParking": false,
    "includesStorage": false,
    "sincoAgrupacionId": "456",
    "sincoUnidadId": "789",
    "sincoProyectoId": "012"
  },
  "advisor": {
    "id": null,
    "email": "carlos@jimenez.com",
    "name": "Carlos Jiménez"
  },
  "financial": {
    "saleType": "CREDITO",
    "subtotal": 350000000,
    "discountCommercial": 0,
    "discountFinancial": 0,
    "totalDiscounts": 0,
    "netValue": 350000000,
    "separationAmount": 5000000,
    "initialPaymentPct": 30,
    "initialPaymentAmount": 105000000,
    "numInstallments": 24,
    "installmentAmount": 4375000,
    "financedAmount": 245000000,
    "financedPct": 70,
    "paymentPlan": "30/70",
    "bonuses": []
  },
  "config": { "vigenciaDias": 15 },
  "observaciones": ""
}
```

**Response 201:**

```json
{
  "success": true,
  "quotation": {
    "id": "uuid-here",
    "cotNumber": "COT-2026-0001",
    "url": "https://engine.focux.co/quoter?clientId=jimenez_demo",
    "pdfUrl": "https://engine.focux.co/api/engine/quotations/pdf?token=...",
    "expiresAt": "2026-06-09T00:00:00.000Z",
    "createdAt": "2026-05-25T15:30:00.000Z"
  }
}
```

**Errors:** 400 (validation) · 409 (duplicate cotNumber) · 500

---

## 11. Get Quotation

**`GET /api/engine/quotations?clientId={clientId}&cotNumber={cotNumber}`**

Recupera una cotización por número.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| Cookie `quoter_session` | — | — |

```bash
curl "http://localhost:3000/api/engine/quotations?clientId=jimenez_demo&cotNumber=COT-2026-0001" \
  -b "quoter_session=<cookie>"
```

---

## 12. Generate PDF

**`POST /api/engine/quotations/pdf`** — Session-protected (frontend)
**`GET /api/engine/quotations/pdf`** — Token-based OR session-based (links, emails)

Genera y retorna el PDF binario de una cotización.

| Auth (POST) | Auth (GET path A) | Auth (GET path B) |
|-------------|-------------------|-------------------|
| Cookie `quoter_session` | `?token=<pdfAccessToken>` (7-day HMAC) | Cookie `quoter_session` |

**POST body:**

```json
{ "clientId": "jimenez_demo", "cotNumber": "COT-2026-0001" }
```

**GET query params (path A — token-based, for HubSpot/email links):**

```
?token=<pdfAccessToken>
```

**GET query params (path B — session-based):**

```
?clientId=jimenez_demo&cotNumber=COT-2026-0001
```

**Response:** `Content-Type: application/pdf`, binary stream.

```bash
# Via token (no session needed):
curl "http://localhost:3000/api/engine/quotations/pdf?token=abc123..." -o cotizacion.pdf

# Via session:
curl -X POST "http://localhost:3000/api/engine/quotations/pdf" \
  -H "Content-Type: application/json" \
  -b "quoter_session=<cookie>" \
  -d '{"clientId":"jimenez_demo","cotNumber":"COT-2026-0001"}' \
  -o cotizacion.pdf
```

---

## 13. Create Deal

**`POST /api/engine/quotations/deal`**

Pipeline completo: crea/actualiza contacto en HubSpot → crea Deal con propiedades `_fx` → asocia Deal↔Contact → sube PDF a HubSpot File Manager → adjunta nota con PDF al Deal → actualiza DB.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| Cookie `quoter_session` | — | — |

**Request body:**

```json
{ "clientId": "jimenez_demo", "cotNumber": "COT-2026-0001" }
```

**Query params (optional):**

| Param | Type | Description |
|-------|------|-------------|
| `debug` | boolean | Solo si `ENABLE_DEBUG_RESPONSES=true`. Agrega campos debug. |

**Response 201:**

```json
{
  "success": true,
  "deal": {
    "hubspotDealId": "12345678",
    "dealUrl": "https://app.hubspot.com/contacts/51256354/deal/12345678",
    "contactId": "98765",
    "contactCreated": false,
    "contactError": null,
    "cotNumber": "COT-2026-0001",
    "dealName": "COT-2026-0001 | María García | Porto Sabbia T1-101",
    "pdfUpload": {
      "status": "attached",
      "fileId": "file-id",
      "noteId": "note-id",
      "url": "https://...",
      "error": null
    }
  }
}
```

**Errors:** 400 · 404 (quotation not found) · 409 (deal already exists for this cotNumber) · 502 (HubSpot error)

```bash
curl -X POST "http://localhost:3000/api/engine/quotations/deal" \
  -H "Content-Type: application/json" \
  -b "quoter_session=<cookie>" \
  -d '{"clientId":"jimenez_demo","cotNumber":"COT-2026-0001"}'
```

---

## 14. PDF Status (Admin)

**`GET /api/engine/quotations/pdf-status`**

Distribución de estados de upload PDF y últimos N failures.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| `ADMIN_API_SECRET` Bearer | — | — |

**Query params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `clientId` | string | ✅ | — | |
| `failures` | number | ❌ | 10 | Max failures to return (max 50) |

```bash
curl "http://localhost:3000/api/engine/quotations/pdf-status?clientId=jimenez_demo" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

---

## 15. Retry PDF (Admin)

**`POST /api/engine/quotations/retry-pdf`**

Re-procesa PDFs fallidos. State machine: genera → sube → adjunta, según el estado actual.

| Auth | Rate limit | Cache |
|------|-----------|-------|
| `ADMIN_API_SECRET` Bearer | — | — |

**Request body (Zod-validated):**

```json
{
  "clientId": "jimenez_demo",
  "cotNumber": "COT-2026-0001",
  "all": false,
  "limit": 10,
  "dryRun": true
}
```

Puede enviar `cotNumber` (uno específico) o `all: true` (todos los fallidos).

**Response 200:**

```json
{
  "ok": true,
  "dryRun": true,
  "processed": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    { "cotNumber": "COT-001", "status": "success", "action": "full_rebuild" },
    { "cotNumber": "COT-002", "status": "success", "action": "attach_only" },
    { "cotNumber": "COT-003", "status": "failed", "action": "full_rebuild", "error": "..." }
  ]
}
```

```bash
curl -X POST "http://localhost:3000/api/engine/quotations/retry-pdf" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_SECRET" \
  -d '{"clientId":"jimenez_demo","all":true,"dryRun":true}'
```

---

## 16. Asset Health (Admin)

**`GET /api/engine/quotations/asset-health`**

HEAD-check paralelo de todos los assets CDN esperados (renders, planos, branding).

| Auth | Rate limit | Cache |
|------|-----------|-------|
| `ADMIN_API_SECRET` Bearer | — | — |

**Query params:**

| Param | Type | Required |
|-------|------|----------|
| `clientId` | string | ✅ |

**Response 200:**

```json
{
  "status": "healthy",
  "clientId": "jimenez_demo",
  "checked": 12,
  "ok": 12,
  "failed": 0,
  "assets": [
    { "name": "render.png", "url": "https://...", "ok": true, "statusCode": 200 }
  ],
  "timestamp": "2026-05-25T15:30:00.000Z"
}
```

```bash
curl "http://localhost:3000/api/engine/quotations/asset-health?clientId=jimenez_demo" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

---

## 17. Separar (Write-Back)

**`POST /api/engine/sale/separar`**

Ejecuta separación en Sinco ERP — crea comprador + registra venta con plan de pagos.

| Auth | Rate limit | Cache | maxDuration |
|------|-----------|-------|-------------|
| None (internal/ops) | — | — | 60s |

**Request body (Zod strict):** Ver schema completo en `ARCHITECTURE.md` §3.3 o en el código fuente (`src/engine/apps/sale/`).

Campos principales: `clientId`, `dealId`, `writebackReady`, `comprador` (datos personales completos), `venta` (IDs Sinco, tipo venta, plan de pagos), `compradoresAlternos`.

**⚠️ Schema strict:** cualquier campo extra o tipo incorrecto retorna 422 con path exacto.

```bash
curl -X POST "http://localhost:3000/api/engine/sale/separar" \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

---

## 18. Legalizar (Write-Back)

**`POST /api/engine/sale/legalizar`**

Ejecuta legalización en Sinco ERP. Mismo shape de input que separar. Idempotente por `dealId`.

| Auth | Rate limit | Cache | maxDuration |
|------|-----------|-------|-------------|
| None (internal/ops) | — | — | 60s |

---

## 19. Separar Webhook

**`POST /api/engine/sale/separar-webhook/{clientId}`**

Receiver para HubSpot workflows. 4 capas de validación: clientId → Bearer secret → Zod strict → Result builders.

| Auth | Rate limit | Cache | maxDuration |
|------|-----------|-------|-------------|
| `WEBHOOK_SECRET_<CLIENT>` Bearer | — | — | 60s |

**URL param:** `clientId` (e.g. `jimenez_demo`)

**Request body (Zod strict):**

```json
{
  "dealId": "12345678",
  "operation": "separar",
  "workflowId": "wf-123",
  "eventId": "evt-456"
}
```

**Flow:** validate → auth → parse → load Deal → resolve Sinco IDs → resolve contact → build input → dispatch operation.

**Idempotent** vía `PgEventLog` con `transactionId` único por operación.

```bash
curl -X POST "http://localhost:3000/api/engine/sale/separar-webhook/jimenez_demo" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WEBHOOK_SECRET_JIMENEZ_DEMO" \
  -d '{"dealId":"12345678","operation":"separar"}'
```

---

## 20. HubSpot Proxy

### 20a. Simple proxy (legacy)

**`GET /api/hubspot?url={hubspot_api_path}`**

| Auth | Headers |
|------|---------|
| `x-hubspot-token` (required) | — |

### 20b. Full proxy (catch-all)

**`GET|POST|PUT|PATCH|DELETE /api/hubspot/{...path}`**

Proxy transparente a `https://api.hubapi.com`. El caller provee `Authorization: Bearer` header.

**Allowed path prefixes (SSRF protection):**

- `/crm/v3/properties/`
- `/crm/v3/pipelines/`
- `/crm/v3/owners`
- `/crm/v3/objects/`
- `/crm/v3/schemas`
- `/crm/v4/associations/`
- `/automation/v4/flows`
- `/marketing/v3/forms`
- `/crm/v3/lists`
- `/settings/v3/users`

Cualquier otro path retorna **403**.

```bash
curl "http://localhost:3000/api/hubspot/crm/v3/objects/contacts/12345" \
  -H "Authorization: Bearer pat-na1-..."
```

---

## Error Response Format

Todos los endpoints de Engine retornan errores con estructura consistente:

```json
{
  "error": "DESCRIPTIVE_ERROR_CODE",
  "message": "Human-readable explanation",
  "details": { ... }
}
```

**Códigos HTTP estándar:**

| Code | Meaning |
|------|---------|
| 400 | Bad request / validation error (Zod details included) |
| 401 | Authentication failed (bad token/secret) |
| 403 | Forbidden (unknown portal, blocked path) |
| 404 | Resource not found (client, quotation, etc.) |
| 409 | Conflict (duplicate cotNumber, deal already exists) |
| 422 | Unprocessable entity (schema strict validation failed) |
| 500 | Internal server error |
| 502 | Upstream error (HubSpot/Sinco unreachable or returned error) |

---

*Focux | www.focux.co | Documento confidencial*
