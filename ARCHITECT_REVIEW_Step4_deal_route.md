# ARCHITECT REVIEW REQUEST — Step 4: PDF Upload Integration in deal/route.ts

**Author:** SpaceCommander
**Date:** 2026-05-01
**Branch:** `feature/multi-project`
**Prerequisite:** Steps 1, 1.5, 3 ✅ (connector + tests + DB migration + types)

---

## Context

`deal/route.ts` is the pipeline that creates a HubSpot Deal from a persisted quotation. Current flow:

```
1. Validate quotation in DB
2. Find/create contact in HubSpot (non-fatal)
3. Build deal properties (40+ fields)
4. Create Deal via HubSpot API (with retry if custom props fail)
5. Associate Deal ↔ Contact (non-fatal)
6. Update quotation in DB (hubspot_deal_id, status)
7. Return response
```

**Goal:** Insert step 5.5 — generate PDF, upload to client's HubSpot File Manager, attach to Deal as Note. Non-fatal: if PDF upload fails, deal creation still succeeds.

---

## What exists today

### deal/route.ts (413 lines)

- `findOrCreateContact()` — search/create contact, update proyecto_activo + lista_proyectos. Non-fatal pattern already established (try/catch, warn, continue).
- `POST handler` — orchestrates the full pipeline.
- Deal properties include `pdf_cotizacion_url_fx` pointing to our API URL:
  ```typescript
  pdf_cotizacion_url_fx: `${baseUrl}/api/engine/quotations/pdf?clientId=${clientId}&cotNumber=${cotNumber}`,
  ```
- DB UPDATE (line 383) sets `hubspot_deal_id`, `hubspot_contact_id`, `deal_created_at`, `status`.

### pdfBuilder.ts (pure function)

```typescript
export async function buildPdfBuffer(quotation: QuotationRow): Promise<Buffer>
```

- Takes QuotationRow, returns PDF Buffer.
- No DB calls, no side effects. Uses pdf-lib + fontkit.
- Already imported and used by `pdf/route.ts`.

### hubspotFileManager.ts (on branch, tested)

```typescript
export async function uploadFileToHubSpot(
  token: string,
  buffer: Buffer,
  options: HubSpotFileUploadOptions,
): Promise<Result<HubSpotFileUploadResult, EngineError>>

export async function attachFileToRecord(
  token: string,
  fileId: string,
  options: HubSpotAttachFileOptions,
): Promise<Result<HubSpotAttachFileResult, EngineError>>
```

- Result<T, EngineError> pattern. Never throws.
- Retry with backoff for 429/5xx.
- FormData rebuilt per retry. Dynamic timeout by buffer size.
- Single POST for Note + associations (no orphan notes).
- 27 tests passing.

### DB columns (migration 002, executed on Neon)

```sql
pdf_hubspot_file_id   TEXT NULL          -- HubSpot File Manager ID
pdf_upload_status     TEXT NULL          -- 'upload_failed' | 'uploaded' | 'attach_failed' | 'attached'
pdf_upload_error      TEXT NULL          -- Error detail (truncated 500 chars)
pdf_uploaded_at       TIMESTAMPTZ NULL   -- When HubSpot received the file
pdf_hubspot_note_id   TEXT NULL          -- HubSpot Note ID holding the attachment
pdf_attached_at       TIMESTAMPTZ NULL   -- When the Note was associated
```

CHECK constraint: `pdf_upload_status IN ('upload_failed', 'uploaded', 'attach_failed', 'attached') OR NULL`

### QuotationRow type (updated)

```typescript
pdf_hubspot_file_id: string | null;
pdf_upload_status: 'upload_failed' | 'uploaded' | 'attach_failed' | 'attached' | null;
pdf_upload_error: string | null;
pdf_uploaded_at: string | null;
pdf_hubspot_note_id: string | null;
pdf_attached_at: string | null;
```

---

## Proposed changes to deal/route.ts

### 1. New imports

```typescript
import { buildPdfBuffer } from '../pdf/pdfBuilder';
import { uploadFileToHubSpot, attachFileToRecord } from '@/engine/connectors/crm/hubspot/hubspotFileManager';
```

**Decision: import buildPdfBuffer directly, not extract to shared service.**

Rationale: `buildPdfBuffer` is already a pure function (QuotationRow → Buffer) with no DB calls, no side effects, no circular dependencies. Extracting it to a shared service adds a layer without benefit. Both `pdf/route.ts` and `deal/route.ts` can import from the same `pdfBuilder.ts` module.

### 2. slugify helper

```typescript
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

Used to build the HubSpot folder path from `macroName`. Example: `"Porto Sabbia"` → `"porto-sabbia"`.

### 3. New block: Step 5.5 — PDF Upload (non-fatal)

Inserted between current step 5 (Associate Deal ↔ Contact) and step 6 (DB update).

```typescript
// ── 5.5 PDF Upload to HubSpot (non-fatal) ──
let pdfHubspotFileId: string | null = null;
let pdfUploadStatus: 'upload_failed' | 'uploaded' | 'attach_failed' | 'attached' | null = null;
let pdfUploadError: string | null = null;
let pdfHubspotNoteId: string | null = null;

try {
  // 5.5a — Generate PDF buffer
  const pdfBuffer = await buildPdfBuffer(quotation);

  // 5.5b — Upload to HubSpot File Manager
  const macroSlug = slugify(String(quotation.macro_name));
  const yearMonth = new Date().toISOString().slice(0, 7); // "2026-05"

  const uploadResult = await uploadFileToHubSpot(token, pdfBuffer, {
    fileName: `${cotNumber}.pdf`,
    folderPath: `/focux-quoter/cotizaciones/${macroSlug}/${yearMonth}/`,
    contentType: 'application/pdf',
    access: 'PRIVATE',
  });

  if (uploadResult.isOk()) {
    pdfHubspotFileId = uploadResult.value.fileId;
    pdfUploadStatus = 'uploaded';

    // 5.5c — Attach to Deal as Note
    const attachResult = await attachFileToRecord(token, pdfHubspotFileId, {
      objectType: 'deals',
      objectId: hubspotDealId,
      noteBody: `Cotización ${cotNumber} — generada por FocuxAI Quoter`,
    });

    if (attachResult.isOk()) {
      pdfHubspotNoteId = attachResult.value.noteId;
      pdfUploadStatus = 'attached';
    } else {
      pdfUploadStatus = 'attach_failed';
      pdfUploadError = attachResult.error.message.slice(0, 500);
      console.warn(`[deal] PDF attach failed (non-fatal): ${attachResult.error.code} — ${attachResult.error.message}`);
    }
  } else {
    pdfUploadStatus = 'upload_failed';
    pdfUploadError = uploadResult.error.message.slice(0, 500);
    console.warn(`[deal] PDF upload failed (non-fatal): ${uploadResult.error.code} — ${uploadResult.error.message}`);
  }
} catch (err) {
  // Catch-all for buildPdfBuffer failures or unexpected errors
  pdfUploadStatus = 'upload_failed';
  pdfUploadError = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  console.warn(`[deal] PDF generation/upload failed (non-fatal): ${pdfUploadError}`);
}
```

### 4. Expanded DB UPDATE (step 6)

Current:
```sql
UPDATE quotations
SET hubspot_deal_id = $1,
    hubspot_contact_id = COALESCE(hubspot_contact_id, $2),
    deal_created_at = NOW(),
    status = 'deal_created'
WHERE id = $3
```

Proposed:
```sql
UPDATE quotations
SET hubspot_deal_id = $1,
    hubspot_contact_id = COALESCE(hubspot_contact_id, $2),
    deal_created_at = NOW(),
    status = 'deal_created',
    pdf_hubspot_file_id = $3,
    pdf_upload_status = $4,
    pdf_upload_error = $5,
    pdf_uploaded_at = CASE WHEN $4 IN ('uploaded', 'attached') THEN NOW() ELSE NULL END,
    pdf_hubspot_note_id = $6,
    pdf_attached_at = CASE WHEN $4 = 'attached' THEN NOW() ELSE NULL END
WHERE id = $7
```

All 6 new fields written in a single UPDATE (no extra round trip).

### 5. Expanded response

Add to response body:
```typescript
pdfUpload: {
  status: pdfUploadStatus,     // 'attached' | 'uploaded' | 'upload_failed' | 'attach_failed' | null
  fileId: pdfHubspotFileId,
  noteId: pdfHubspotNoteId,
  error: pdfUploadError,
}
```

---

## HubSpot File Manager folder structure

Approved structure (no clientId inside client's own portal):

```
/focux-quoter/
  ├── cotizaciones/
  │   └── {macroSlug}/            ← slugify(macroName)
  │       └── {YYYY-MM}/
  │           └── COT-0001.pdf
  └── assets/                     ← Step 6 (future)
      └── {macroSlug}/
          ├── render-fachada.png
          └── plano-C2.png
```

**Rationale for no clientId:** Each constructora has its own HubSpot portal. `focux-quoter/` namespace isolates our files from other portal content. Adding `jimenez/` inside Jiménez's own portal is redundant.

**macroSlug required:** Constructora may have multiple projects (Porto Sabbia today, another tomorrow). Without this, quotations from different projects mix in the same folder.

**YYYY-MM required:** A single macro can generate 30-50 quotations/month. Without temporal grouping, folder accumulates 700+ files in 2 years.

**No torre/unit folders:** COT number is globally unique. PDF content has all unit detail. Creating folders per torre would produce dozens of near-empty directories.

---

## Design decisions

### D1: Import pdfBuilder directly (no shared service extraction)

`buildPdfBuffer` is already a pure function in its own module. Both `pdf/route.ts` and `deal/route.ts` import it. No circular dependency. No shared state. Extracting to a "service layer" would be pure ceremony.

### D2: pdf_cotizacion_url_fx unchanged

The Deal property `pdf_cotizacion_url_fx` continues pointing to our API URL (`/api/engine/quotations/pdf?clientId=X&cotNumber=Y`). This always works regardless of HubSpot file access level. The Note attachment handles HubSpot UI visibility. The `pdf_hubspot_file_id` in our DB handles traceability.

### D3: Non-fatal pattern (same as contact creation)

PDF upload failure must never block deal creation. The deal is the commercial event — it triggers workflows, assignments, pipeline metrics. A PDF that didn't upload is a cosmetic issue that can be retried.

The pattern mirrors `findOrCreateContact()` — try/catch, warn, continue. The difference: we also write the failure reason to DB (`pdf_upload_error`) for observability.

### D4: Synchronous in request (no background job)

PDF generation + upload + attach runs in the same request. Estimated added latency:
- `buildPdfBuffer()`: ~200-500ms (pdf-lib, no network)
- `uploadFileToHubSpot()`: ~1-3s (network, dynamic timeout)
- `attachFileToRecord()`: ~500ms-1s (network)

Total: ~2-5s added to a request that already takes 3-5s (DB + contact + deal + association). Acceptable for a synchronous operation triggered by an advisor clicking "Crear Deal". No background job infrastructure exists or is justified.

### D5: try/catch wraps everything including buildPdfBuffer

`buildPdfBuffer` uses pdf-lib which could throw on corrupt font files, memory issues, etc. The outer try/catch ensures even PDF generation failures are captured as `upload_failed` with the error message persisted.

### D6: yearMonth from server time (not quotation date)

`const yearMonth = new Date().toISOString().slice(0, 7)` uses the upload date, not `quotation.created_at`. Rationale: a quotation created in April but whose deal is created in May should file under May (when the commercial action happened). This matches HubSpot's deal creation timestamp.

---

## Questions for Architect

**Q1:** Is importing `buildPdfBuffer` from `'../pdf/pdfBuilder'` (relative path from deal/route.ts) acceptable, or should it use the `@/` alias pattern?

**Q2:** The `slugify()` helper is small (~5 lines). Should it live inline in deal/route.ts, or in a shared utils module? Currently no shared string utils exist in the project.

**Q3:** `buildPdfBuffer()` returns `Promise<Buffer>` but it's not wrapped in Result. Should we wrap the call in a Result pattern for consistency, or is the try/catch sufficient given it's in a non-fatal block?

**Q4:** Should the connector's `uploadFileToHubSpot` receive the folderPath as-is, or should we validate the slug format before passing it? (e.g., reject empty slugs, paths with `..`, etc.)

**Q5:** If `buildPdfBuffer` throws, we set `pdfUploadStatus = 'upload_failed'`. Should there be a separate status like `'generation_failed'` to distinguish PDF generation errors from upload errors? This would require adding it to the CHECK constraint and the TypeScript union type.

---

## Files to modify

| File | Change |
|------|--------|
| `src/app/api/engine/quotations/deal/route.ts` | New imports, slugify(), step 5.5 block, expanded UPDATE, expanded response |

No other files change. The connector, migration, and types are already done.

---

## Verification plan

1. Create test quotation via UI
2. Hit POST /api/engine/quotations/deal
3. Verify Deal created in HubSpot with all properties
4. Verify PDF visible in Deal → Activity → Note attachment
5. Verify HubSpot File Manager: `/focux-quoter/cotizaciones/{macroSlug}/{YYYY-MM}/{cotNumber}.pdf` exists
6. Verify DB: `pdf_upload_status = 'attached'`, `pdf_hubspot_file_id` populated, `pdf_hubspot_note_id` populated
7. Simulate upload failure (invalid token) → verify Deal still created, `pdf_upload_status = 'upload_failed'`, `pdf_upload_error` populated
