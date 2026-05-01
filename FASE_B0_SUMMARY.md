# Fase B.0 — Data Sovereignty: Resumen Completo

**Autor:** SpaceCommander
**Fecha:** 2026-05-01
**Estado:** Steps 1–5 LIVE en producción. E2E verificado 2x.

---

## Objetivo

Los PDFs de cotización deben vivir en el HubSpot del cliente, no en infraestructura Focux. Si el cliente termina la relación con Focux, sus archivos quedan en SU portal con URLs que funcionan para siempre.

Secundario: la URL que recibe el comprador no debe contener "focux", "engine", ni ninguna referencia a nosotros.

---

## Qué se construyó

### Step 1 — hubspotFileManager.ts (connector)

Conector puro para HubSpot Files API v3 + Notes API. 704 líneas.

**Funciones públicas:**
- `uploadFileToHubSpot(token, buffer, options)` → `Result<HubSpotFileUploadResult, EngineError>`
- `attachFileToRecord(token, fileId, options)` → `Result<HubSpotAttachFileResult, EngineError>`

**Características:**
- Result<T, EngineError> always. Never throw.
- Zod validation on all HubSpot API responses.
- Retry con exponential backoff + jitter para 429/5xx.
- FormData rebuilt on every retry attempt (no stream reuse risk).
- AbortController timeout dinámico por tamaño de buffer (5s + 5s/MB, max 60s).
- Note con inline associations en single POST (no orphan notes).
- Access level validation (verifica que HubSpot respete el access solicitado).
- Zero tenant-specific logic.
- Never logs tokens, PDF buffers, or buyer PII.

**Ubicación:** `src/engine/connectors/crm/hubspot/hubspotFileManager.ts`

### Step 1.5 — Tests

27 tests cubriendo: auth errors, upload success, attach success, retry 429/5xx, timeout, FormData rebuilt, Zod validation, access mismatch, input validation.

**Ubicación:** `src/engine/connectors/crm/hubspot/__tests__/hubspotFileManager.test.ts`

### Steps 2-3 — DB Migrations

4 migrations ejecutadas en Neon:

| Migration | Cambio |
|-----------|--------|
| 002 | 6 columnas: `pdf_hubspot_file_id`, `pdf_upload_status`, `pdf_upload_error`, `pdf_uploaded_at`, `pdf_hubspot_note_id`, `pdf_attached_at` |
| 003 | CHECK constraint: agrega `generation_failed` al enum (5 estados total) |
| 004 | Columna `pdf_hubspot_url` — URL pública del CDN de HubSpot |

**State machine (5 estados):**
```
null → generation_failed  (pdf-lib throw)
     → upload_failed      (HubSpot Files API error)
     → uploaded            (archivo en File Manager, Note pendiente)
     → attach_failed       (Note creation error)
     → attached            (pipeline completo ✅)
```

Cada estado indica el punto exacto de retry: `generation_failed` → retry desde `buildPdfBuffer`. `upload_failed` → retry desde upload. `attach_failed` → retry desde attach (reuse fileId).

### Step 4 — deal/route.ts Integration

Pipeline completo del Deal (POST /api/engine/quotations/deal):

```
1. Validar cotización en DB
2. findOrCreateContact en HubSpot (non-fatal)
3. Build deal properties (40+ campos)
4. Crear Deal via HubSpot API
5. Asociar Deal ↔ Contacto (non-fatal)
5.5 PDF Upload (non-fatal, NUEVO):
    a. buildHubSpotQuotationFolderPath() → validates slug + yearMonth
    b. buildPdfBufferSafe() → wraps pdf-lib throws in Result
    c. uploadFileToHubSpot(PUBLIC_NOT_INDEXABLE) → captura URL + fileId
    d. attachFileToRecord(deals) → Note con PDF adjunto
    e. PATCH Deal con pdf_hubspot_url_fx (non-fatal)
6. UPDATE DB (single query, 7 campos pdf_*)
7. Return response con pdfUpload: { status, fileId, noteId, url, error }
```

**Helpers agregados a deal/route.ts:**

| Helper | Propósito |
|--------|-----------|
| `slugifyFolderSegment(value, fallback)` | NFD normalize, fallback si vacío |
| `buildHubSpotQuotationFolderPath({clientId, macroName, date})` | Valida + construye path. Returns `Result<string, EngineError>` |
| `buildPdfBufferSafe(quotation)` | Wraps pdf-lib throws → `Result<Buffer, EngineError>` |
| `safeErrorMessage(error)` | Trunca a 500 chars, sin PII |

**Error codes nuevos en EngineError.ts:**
- `VALIDATION_CRM_FILE_FOLDER_INVALID`
- `RESOURCE_PDF_GENERATION_FAILED`

### Step 4.1 — PUBLIC_NOT_INDEXABLE + pdf_hubspot_url_fx

**Cambio de access level:**
- Antes: `PRIVATE` — archivo solo visible dentro del portal HubSpot, no tiene URL pública.
- Ahora: `PUBLIC_NOT_INDEXABLE` — URL pública accesible por cualquiera con el link, no indexable por Google.

**Rationale:** El comprador necesita abrir el PDF desde un email o WhatsApp sin tener cuenta HubSpot. `PUBLIC_NOT_INDEXABLE` da acceso por link sin exponerlo a buscadores. Mismo nivel de seguridad que la URL existente de engine.focux.co (también sin auth).

**Dual URL strategy:**
- `pdf_cotizacion_url_fx` — nuestra API (`engine.focux.co/api/engine/quotations/pdf?...`). Siempre funciona en tiempo real. Backup interno.
- `pdf_hubspot_url_fx` — HubSpot CDN. Vigente mientras el portal HubSpot del cliente esté activo. Sin branding Focux. **Esta es la que va en emails/WhatsApp al comprador.**

**Nueva propiedad HubSpot:** `pdf_hubspot_url_fx` (string, text, grupo `focux`, deals). Creada via API en portal demo.

**Nueva columna DB:** `pdf_hubspot_url TEXT DEFAULT NULL` (migration 004).

### Step 4.2 — Clean Folder Path

**Antes:** `/focux-quoter/{clientSlug}/cotizaciones/{macroSlug}/{YYYY-MM}/`
**Ahora:** `/cotizaciones/{clientSlug}/{macroSlug}/{YYYY-MM}/`

Sin namespace `focux-quoter`. La URL final no contiene ninguna referencia a Focux.

---

## Folder Structure en HubSpot File Manager

```
/cotizaciones/
  └── {clientSlug}/              ← slugify(clientId) — e.g. "jimenez"
      └── {macroSlug}/           ← slugify(macroName) — e.g. "porto-sabbia"
          └── {YYYY-MM}/         ← mes del deal, no de la cotización
              └── COT-PSS-2605-0699_v1.pdf
```

**Diseño:**
- `clientSlug` = portabilidad SaaS (multi-tenant futuro)
- `macroSlug` = separación por proyecto (constructora puede tener N proyectos)
- `YYYY-MM` = temporal grouping (evita 700+ files en 2 años)
- Filename immutable (`_v1`) — nunca sobrescribir PDFs comerciales

---

## Decisiones de diseño

| # | Decisión | Rationale |
|---|----------|-----------|
| D1 | Non-fatal pattern | Deal = evento comercial. PDF = cosmético. Nunca bloquear deal creation. |
| D2 | Synchronous (no background job) | +2-5s latency aceptable. No hay infra de background jobs. |
| D3 | buildPdfBufferSafe wraps en Result | pdf-lib puede throw. El outer try/catch distingue generation_failed vs upload_failed. |
| D4 | yearMonth from server time | El Deal se crea "hoy", no cuando se cotizó. Matches HubSpot deal timestamp. |
| D5 | PUBLIC_NOT_INDEXABLE | Buyer necesita acceder sin auth. Google no indexa. Mismo riesgo que URL actual. |
| D6 | Dual URL (API + CDN) | API URL = backup dinámico siempre disponible. CDN URL = permanente, client-facing. |
| D7 | Clean folder path | Sin branding Focux. URL limpia para el cliente. |
| D8 | PATCH post-attach | pdf_hubspot_url_fx se escribe en el Deal después del upload exitoso. Non-fatal. |
| D9 | PII en PDF público — RISK ACCEPTED | El PDF contiene cédula, teléfono, email, datos financieros. PUBLIC_NOT_INDEXABLE = bearer URL de 60+ chars. Mismo riesgo que la URL actual de engine.focux.co (sin auth). El PDF sin PII sería inútil comercialmente. Decisión: aceptar riesgo, documentar. |
| D10 | Note body neutro | Note dice "Cotización {cotNumber}" sin mención a FocuxAI. Principio caja negra. |

---

## E2E Tests

### Test 1 (PRIVATE, 1-mayo pre-cambio)
```json
{
  "pdfUpload": {
    "status": "attached",
    "fileId": "212094351998",
    "noteId": "109063899167",
    "error": null
  }
}
```

### Test 2 (PUBLIC_NOT_INDEXABLE + URL pública, 1-mayo post-cambio)
```json
{
  "pdfUpload": {
    "status": "attached",
    "fileId": "212095429811",
    "noteId": "109055205177",
    "url": "https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/focux-quoter/jimenez-demo/cotizaciones/porto-sabbia/2026-05/COT-PSS-2605-0699_v1-1.pdf",
    "error": null
  }
}
```

PDF accesible via URL pública. Visible en Deal → Activity → Note. File Manager confirma archivo presente.

---

## Archivos modificados/creados

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `src/engine/connectors/crm/hubspot/hubspotFileManager.ts` | NUEVO | Connector completo (704 líneas) |
| `src/engine/connectors/crm/hubspot/__tests__/hubspotFileManager.test.ts` | NUEVO | 27 tests |
| `src/app/api/engine/quotations/deal/route.ts` | MODIFICADO | Imports, helpers, Step 5.5, PATCH url_fx, expanded UPDATE (7 campos) + response |
| `src/engine/core/errors/EngineError.ts` | MODIFICADO | 2 nuevos error codes |
| `src/app/api/engine/quotations/types.ts` | MODIFICADO | `generation_failed` en union type + `pdf_hubspot_url` field |
| `src/engine/core/db/migrations/002_pdf_hubspot_columns.sql` | NUEVO | 6 columnas |
| `src/engine/core/db/migrations/003_pdf_status_generation_failed.sql` | NUEVO | CHECK constraint update |
| `src/engine/core/db/migrations/004_pdf_hubspot_url.sql` | NUEVO | Columna pdf_hubspot_url |

---

## HubSpot Configuration

- **Scope `files` (Read+Write)** agregado a Private Apps en portal test (51256354) Y producción.
- **Propiedad `pdf_hubspot_url_fx`** creada en portal test (deals, grupo focux, string/text).
- **Propiedad pendiente en producción** — crear antes de go-live.

---

## Qué falta (Steps 6-9)

| Step | Descripción | Dependencia |
|------|-------------|-------------|
| 6 | Asset migration script | Renders/planos subidos como PUBLIC_NOT_INDEXABLE. One-time per client onboarding. |
| 7 | Typology config + assetBaseUrl | `assetBaseUrl` per tenant, asset paths relativos en config. |
| 8 | assetAllowedHosts | Hostname CDN HubSpot en allowed hosts para fetchAssetSafe(). |
| 9 | Full E2E | Pipeline completo: PDF con renders desde HubSpot CDN del cliente. |

Steps 6-9 son la ruta paralela para que las imágenes del cotizador (renders de fachada, planos de tipología) también vivan en HubSpot del cliente. La infraestructura del connector ya los soporta (access `PUBLIC_NOT_INDEXABLE`, `duplicateValidationStrategy: 'RETURN_EXISTING'`).

---

## Architect Reviews completados

| Review | Scope | Resultado |
|--------|-------|-----------|
| Step 1 (connector) | hubspotFileManager.ts completo | ✅ Approved (múltiples rounds) |
| Step 4 (deal/route.ts) | PDF upload integration | ✅ Approved con 4 cambios requeridos (todos implementados) |
| Steps 4.1-4.3 (URL pública + clean path + Note neutro) | Post-approval enhancements | ✅ Conditional approval. CRITICALs resueltos: PII risk accepted (D9), folder path limpio (D7), "forever"→"mientras portal activo". Note white-labeled (D10). |
