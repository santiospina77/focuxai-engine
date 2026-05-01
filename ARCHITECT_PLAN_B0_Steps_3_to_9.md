# ARCHITECT PLAN — Fase B.0: Steps 3–9 (Post-Connector)

**Author:** SpaceCommander
**Date:** 2026-05-01
**Branch:** `feature/multi-project`
**Context:** Connector approved + tested. Now integrating into the pipeline.

---

## What's done (Steps 1 + 1.5) — Already on branch

### hubspotFileManager.ts (704 lines, 27 tests)

Shared connector with two public functions:

```typescript
uploadFileToHubSpot(token, buffer, options) → Result<HubSpotFileUploadResult, EngineError>
attachFileToRecord(token, fileId, options) → Result<HubSpotAttachFileResult, EngineError>
```

**Architect review changes applied:**
1. Single POST for Note + associations (no orphan notes)
2. Access level validation via z.enum (SCHEMA_CRM_FILE_ACCESS_MISMATCH)
3. FormData rebuild per retry attempt
4. SCHEMA_ error taxonomy for external response mismatches
5. Input validation guards on all public functions
6. Dynamic timeout by buffer size (5s + 5s/MB, max 60s)
7. Duplicate validation options for asset re-uploads

**10 ErrorCodes in EngineError.ts:**
```
AUTH_CRM_FILE_TOKEN_INVALID
RESOURCE_CRM_FILE_UPLOAD_FAILED / ATTACH_FAILED / RATE_LIMITED / SERVER_ERROR / TIMEOUT / NETWORK_ERROR
SCHEMA_CRM_FILE_RESPONSE_INVALID / ACCESS_MISMATCH
VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE
```

**27 tests pass with `npm run test:hubspot-files`** (tsx + node:test).

---

## What's next — Steps 3 through 9

### Step 3: DB migration — PDF traceability columns

**Current `quotations` table columns (relevant):**
```
pdf_url           TEXT NULL     — currently unused
pdf_generated_at  TIMESTAMPTZ  — set by pdf/route.ts on generation
hubspot_deal_id   TEXT NULL     — set by deal/route.ts on deal creation
```

**New columns needed:**
```sql
ALTER TABLE quotations
  ADD COLUMN pdf_hubspot_file_id   TEXT         NULL,
  ADD COLUMN pdf_upload_status     TEXT         NULL DEFAULT NULL,
  ADD COLUMN pdf_upload_error      TEXT         NULL,
  ADD COLUMN pdf_uploaded_at       TIMESTAMPTZ  NULL,
  ADD COLUMN pdf_hubspot_note_id   TEXT         NULL;
```

**Column semantics:**
- `pdf_hubspot_file_id` — HubSpot File Manager ID. Primary traceability key. Use this to request signed URLs for PRIVATE files.
- `pdf_upload_status` — `'uploaded'` | `'attached'` | `'failed'` | `NULL` (not attempted). Tracks progress through the 2-step process (upload → attach).
- `pdf_upload_error` — Error message if upload/attach failed. For debugging. Truncated to 500 chars.
- `pdf_uploaded_at` — Timestamp of successful upload to HubSpot.
- `pdf_hubspot_note_id` — HubSpot Note ID that holds the attachment. For traceability.

**QuotationRow type update** (`types.ts`):
```typescript
// Add to QuotationRow interface:
pdf_hubspot_file_id: string | null;
pdf_upload_status: string | null;
pdf_upload_error: string | null;
pdf_uploaded_at: string | null;
pdf_hubspot_note_id: string | null;
```

**Migration strategy:**
- Run ALTER TABLE directly on Neon DB (no migration framework in project)
- Create `migrations/001_pdf_hubspot_columns.sql` for documentation
- Non-destructive: all columns are NULL, no existing data affected

**Questions for Architect:**
- Q1: `pdf_upload_status` as TEXT with convention values vs. Postgres ENUM? I lean TEXT for simplicity and because Postgres ENUMs are painful to alter.
- Q2: Should `pdf_url` (existing, currently unused) be repurposed to store the HubSpot file URL, or keep it separate from `pdf_hubspot_file_id`? My proposal: `pdf_url` stores the public URL (for PUBLIC_NOT_INDEXABLE assets), `pdf_hubspot_file_id` stores the HubSpot internal ID.

---

### Step 4: Integrate PDF upload in deal/route.ts

**Current flow** (lines 280–399 of `deal/route.ts`):
```
1. Validate quotation in DB
2. Find/create contact in HubSpot
3. Create Deal with properties (including pdf_cotizacion_url_fx = our API URL)
4. Associate Deal ↔ Contact
5. Update quotation in DB (hubspot_deal_id, status)
6. Return response
```

**New flow** (insert step 4.5):
```
1. Validate quotation in DB
2. Find/create contact in HubSpot
3. Create Deal with properties
4. Associate Deal ↔ Contact
4.5 NEW — PDF upload + attach (non-fatal):
    a. Generate PDF buffer via buildPdfBuffer()
    b. uploadFileToHubSpot(token, buffer, {
         fileName: `COT-${cotNumber}.pdf`,
         folderPath: `/focux-quoter/${clientId}/cotizaciones/${YYYY-MM}/`,
         contentType: 'application/pdf',
         access: 'PRIVATE',
       })
    c. If upload OK → attachFileToRecord(token, fileId, {
         objectType: 'deals',
         objectId: hubspotDealId,
         noteBody: `Cotización ${cotNumber} — generada por Focux Quoter`,
       })
    d. If attach OK → update Deal property pdf_cotizacion_url_fx with HubSpot file URL
       (only if access is PUBLIC_NOT_INDEXABLE; for PRIVATE, leave as our API URL or set to HubSpot File ID reference)
    e. Update quotation in DB with pdf_hubspot_file_id, pdf_upload_status, etc.
5. Update quotation in DB (hubspot_deal_id, status)
6. Return response (include pdf upload status in response body)
```

**Key design decisions:**
- **Synchronous best-effort**: Upload happens in the same request. If it fails, deal creation still succeeds. PDF upload status is logged in DB.
- **Non-fatal**: Like contact creation today — if it fails, we warn but don't block.
- **pdf_cotizacion_url_fx**: For PRIVATE files, we can't use the HubSpot file URL (requires signed URL). Options:
  - Keep pointing to our API URL (current behavior, always works)
  - Store `HS_FILE:{fileId}` as a reference (not a URL)
  - Leave unchanged and rely on the Note attachment for HubSpot UI visibility

**Proposed code structure** (pseudocode):
```typescript
// After deal creation (step 4), before DB update (step 5):

// 4.5a — Generate PDF
const pdfBuffer = await buildPdfBuffer(quotation, clientConfig);

// 4.5b — Upload to HubSpot
const uploadResult = await uploadFileToHubSpot(token, pdfBuffer, {
  fileName: `${cotNumber}.pdf`,
  folderPath: `/focux-quoter/${clientId}/cotizaciones/${yearMonth}/`,
  contentType: 'application/pdf',
  access: 'PRIVATE',
});

let pdfHubspotFileId: string | null = null;
let pdfUploadStatus: string | null = null;
let pdfNoteId: string | null = null;

if (uploadResult.isOk()) {
  pdfHubspotFileId = uploadResult.value.fileId;
  pdfUploadStatus = 'uploaded';

  // 4.5c — Attach to Deal
  const attachResult = await attachFileToRecord(token, pdfHubspotFileId, {
    objectType: 'deals',
    objectId: hubspotDealId,
    noteBody: `Cotización ${cotNumber} — generada por Focux Quoter`,
  });

  if (attachResult.isOk()) {
    pdfNoteId = attachResult.value.noteId;
    pdfUploadStatus = 'attached';
  } else {
    pdfUploadStatus = 'failed';
    console.warn(`[deal] PDF attach failed (non-fatal): ${attachResult.error.message}`);
  }
} else {
  pdfUploadStatus = 'failed';
  console.warn(`[deal] PDF upload failed (non-fatal): ${uploadResult.error.message}`);
}

// 4.5e — Update DB with PDF status (merged into step 5 UPDATE)
```

**Questions for Architect:**
- Q3: Should `buildPdfBuffer()` be called here, or should we reuse the buffer if the PDF was already generated? Currently, `pdf/route.ts` generates on-the-fly. For deal creation, we'd generate once and upload.
- Q4: The existing `pdf_generated_at` is set by `pdf/route.ts`. Should we also set it in `deal/route.ts` when we generate the buffer for upload? Or is `pdf_uploaded_at` sufficient?
- Q5: Should `pdf_cotizacion_url_fx` on the Deal continue pointing to our API URL (always works, even for PRIVATE files), or should we change it?

---

### Step 5: Update Deal property (conditional)

Already covered in Step 4 pseudocode. The key question is what `pdf_cotizacion_url_fx` should contain:

| Option | Pros | Cons |
|--------|------|------|
| Keep our API URL | Always works, no auth needed | If Focux goes down, PDF inaccessible |
| HubSpot PRIVATE URL | Lives in client ecosystem | Requires signed URL, may 404 |
| HubSpot File ID ref | Traceable | Not a clickable URL in HubSpot UI |

**My recommendation:** Keep our API URL in `pdf_cotizacion_url_fx` (backward compat). The Note attachment handles HubSpot UI visibility. The `pdf_hubspot_file_id` in our DB handles traceability.

---

### Step 6: Asset migration script

**Purpose:** Upload current renders/planos (bundled in git repo as PNGs) to Jiménez's HubSpot File Manager.

**Current assets in repo:**
```
/public/assets/porto-sabbia/
  ├── render-fachada.png
  ├── plano-C2.png
  ├── plano-C3.png
  ├── plano-C4.png
  └── plano-C5.png
```

**Script behavior:**
```typescript
// One-time script: scripts/migrate-assets-to-hubspot.ts
// For each asset file:
//   1. Read file from disk
//   2. uploadFileToHubSpot(token, buffer, {
//        fileName: 'render-fachada.png',
//        folderPath: '/focux-quoter/jimenez/assets/porto-sabbia/',
//        contentType: 'image/png',
//        access: 'PUBLIC_NOT_INDEXABLE',
//        duplicateValidationStrategy: 'RETURN_EXISTING',
//        duplicateValidationScope: 'EXACT_FOLDER',
//      })
//   3. Log { fileName, fileId, url } for each uploaded asset
//   4. Output a JSON mapping: { 'render-fachada.png': 'https://f.hubspotusercontent...' }
```

**This script runs once per client onboarding.** Not part of the runtime pipeline.

**Questions for Architect:**
- Q6: Should the migration script output be stored as a JSON file, or should it directly update `jimenez_demo.ts` config?
- Q7: Should we add an `assetBaseUrl` field to ClientConfig and keep asset paths relative? Or store full URLs in typology rules?

---

### Step 7: Update typology config with HubSpot URLs

**Current** (in `jimenez_demo.ts`):
```typescript
typologyRules: [
  { renderPath: 'porto-sabbia/render-fachada.png', planoPath: 'porto-sabbia/plano-C2.png', ... },
  ...
]
```

**After migration:** Replace with absolute HubSpot URLs from Step 6 output.

**Option A — assetBaseUrl per tenant (Architect's recommendation from B.0 review):**
```typescript
// ClientConfig
assetBaseUrl: 'https://f.hubspotusercontent-na1.net/hubfs/PORTAL_ID/focux-quoter/jimenez/assets',

// TypologyRule — paths stay relative
typologyRules: [
  { renderPath: 'porto-sabbia/render-fachada.png', ... },
]
```

**Option B — Full URLs in rules:**
```typescript
typologyRules: [
  { renderPath: 'https://f.hubspotusercontent-na1.net/hubfs/.../render-fachada.png', ... },
]
```

I recommend **Option A** — matches Architect's Q1 answer. `resolveAssetUrl()` already handles this: if `assetBaseUrl` is set, prepend it; if path is already absolute, pass through.

---

### Step 8: Add HubSpot CDN to assetAllowedHosts

**Current** (`jimenez_demo.ts`):
```typescript
assetAllowedHosts: isDevMode
  ? ['localhost', '127.0.0.1']
  : ['focuxai-engine.vercel.app'],
```

**After:**
```typescript
assetAllowedHosts: isDevMode
  ? ['localhost', '127.0.0.1']
  : ['focuxai-engine.vercel.app', 'f.hubspotusercontent-na1.net'],
```

The exact HubSpot CDN hostname will be confirmed from the migration script output (Step 6). It may vary by region (`na1`, `eu1`, etc.).

---

### Step 9: E2E verification

1. Create a test quotation via UI
2. Create Deal → verify PDF uploads to HubSpot + Note visible on Deal
3. Verify `quotations` table has `pdf_hubspot_file_id`, `pdf_upload_status = 'attached'`
4. Verify renders load from HubSpot CDN (not from Vercel static)
5. Verify HubSpot File Manager shows assets in correct folder structure

---

## Implementation order

```
Step 3: DB migration (15 min)           — prerequisite for everything
Step 4: deal/route.ts integration (2h)  — core value: PDFs in HubSpot
Step 5: Deal property decision (0 min)  — folded into Step 4
Step 6: Asset migration script (1h)     — one-time, can run anytime
Step 7: Typology config update (30 min) — depends on Step 6 output
Step 8: assetAllowedHosts (5 min)       — depends on Step 6 output
Step 9: E2E verification (30 min)       — final gate before production
```

**Critical path:** Step 3 → Step 4 → Step 9
**Parallel path:** Step 6 → Step 7 → Step 8 → Step 9

---

## Dependencies / blockers

| Item | Status | Blocker? |
|------|--------|----------|
| hubspotFileManager.ts | ✅ On branch, tested | No |
| Neon DB access | ✅ Available | No |
| HubSpot Jiménez token | ✅ In env vars | No |
| buildPdfBuffer() import | Needs verification — currently in pdf/route.ts, may need extraction | Step 4 |
| HubSpot CDN hostname | Unknown until first upload | Step 8 |
| Production HubSpot portal | Jiménez production token needed | Step 9 |

---

## Architectural principles (unchanged)

1. `Result<T, EngineError>` always. Never throw.
2. PDF upload is non-fatal (like contact creation).
3. HubSpot is a connector, not the core.
4. Zero Jiménez-specific code in shared modules.
5. PRIVATE for PDFs (PII), PUBLIC_NOT_INDEXABLE for assets.
6. `pdf_cotizacion_url_fx` keeps pointing to our API URL (backward compat).
7. Note attachment handles HubSpot UI visibility.
8. `pdf_hubspot_file_id` in DB handles traceability.

---

## Request

Architect: Review Steps 3–9 for completeness. Specifically:
- Q1–Q7 above
- Is the deal/route.ts integration sequence correct?
- Any concerns with running buildPdfBuffer() synchronously in deal creation?
- Is the non-fatal pattern (upload fails → deal still succeeds) the right call?
