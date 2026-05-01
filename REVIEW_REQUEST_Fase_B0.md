# REVIEW REQUEST — Fase B.0: HubSpot File Integration + Production Readiness

**Author:** SpaceCommander (FocuxAI Engine co-builder)
**Date:** 2026-05-01
**Branch:** `feature/multi-project` (builds on Fase A v5.1 approved)
**Status:** Pre-implementation — requesting architectural review before coding

---

## Context

Focux Quoter is going to production for Constructora Jiménez. Fase A (multi-project technical foundation) is approved and deployed. Fase B.0 covers the mandatory items before production go-live.

**Critical business requirement from client (Omar/Jiménez):** All generated data — PDFs, assets — must live in the client's ecosystem (HubSpot), not in Focux infrastructure. The client must never feel that their data is held hostage by a vendor. If they leave Focux, their quotation history stays in their CRM.

**Product vision:** Focux Quoter is a SaaS engine. The engine processes data and generates outputs, but outputs live in the client's ecosystem. Focux = brain. Client's HubSpot = data home.

---

## Scope — 3 items

### Item 1: Assets (renders/planos) from HubSpot File Manager

**Current state:**
- Renders and floor plans are static files deployed with the Vercel app (`/assets/porto-sabbia/*.png`)
- `resolveAssetUrl()` in `fetchAssetSafe.ts` resolves relative paths to `${baseUrl}/assets/${path}`
- `fetchAssetSafe()` fetches with SSRF protection, timeout, content-type validation, size cap
- `assetAllowedHosts` in `jimenez_demo.ts` whitelists `focuxai-engine.vercel.app` (prod) or `localhost` (dev)
- Assets are bundled in the git repo → client cannot update renders without Focux touching code

**Target state:**
- Assets uploaded to client's HubSpot File Manager (they own them)
- Quoter fetches renders/planos from HubSpot File Manager URLs
- Client can update their own renders without Focux involvement
- `assetAllowedHosts` adds HubSpot's CDN hostname(s)

**Proposed approach:**
1. Upload current renders/planos to Jiménez's HubSpot portal via Files API (`POST /files/v3/files`)
2. Store HubSpot file URLs in typology config (each `TypologyRule` already has `renderPath` and `planoPath` — change to absolute HubSpot URLs)
3. `resolveAssetUrl()` already handles absolute URLs (`if (path.startsWith('http')) return path`) — no change needed
4. Add HubSpot CDN hostname to `assetAllowedHosts` (e.g., `f.hubspotusercontent-na1.net` or similar)
5. Remove static assets from git repo (optional, can coexist as fallback)

**Questions for Architect:**
- Q1: Should typology rules store the full HubSpot URL, or should we have an `assetBaseUrl` per tenant and keep paths relative?
- Q2: Should we create a one-time migration script to upload assets to HubSpot, or build a reusable `uploadAssetToHubSpot()` utility in the connector layer?
- Q3: Asset URLs from HubSpot are public (no auth needed). Is this acceptable for renders/planos, or do we need signed URLs?

### Item 2: PDF upload to HubSpot File Manager + attachment to Deal

**Current state:**
- PDF is generated on-the-fly by `buildPdfBuffer()` using pdf-lib
- `GET /api/engine/quotations/pdf?clientId=X&cotNumber=Y` regenerates PDF each time
- `pdf_cotizacion_url_fx` deal property points to our API endpoint (dynamic)
- If Focux Engine goes down, no PDFs are accessible
- Client has no persistent copy of their quotation PDFs

**Target state:**
- After generating PDF, upload it to client's HubSpot File Manager
- Attach PDF to the deal as an engagement/note
- `pdf_cotizacion_url_fx` points to HubSpot's persistent URL
- Client sees PDFs directly in their deal records
- If client leaves Focux, all PDFs remain in their CRM

**Proposed approach:**
1. After `buildPdfBuffer()` generates the PDF in `deal/route.ts`:
   a. Upload buffer to HubSpot File Manager: `POST /files/v3/files` (multipart, folder `/cotizaciones/{project}`)
   b. Get persistent URL from response
   c. Create engagement/note on deal with file attachment: `POST /crm/v3/objects/notes` + association
   d. Update `pdf_cotizacion_url_fx` deal property with HubSpot file URL (not our API URL)
   e. Store HubSpot file URL in DB (`pdf_url` column already exists in `quotations` table)
2. Keep `GET /api/engine/quotations/pdf` as fallback/regeneration endpoint
3. Create shared utility: `hubspotFileManager.ts` with `uploadFile()` and `attachFileToDeal()`

**Questions for Architect:**
- Q4: Should PDF upload be synchronous (block deal creation until uploaded) or async (fire-and-forget with retry)?
- Q5: The `quotations` table already has `pdf_url` and `pdf_generated_at`. Should we add `pdf_hubspot_file_id` for traceability?
- Q6: Should we create a HubSpot folder structure per tenant? e.g., `/focux-quoter/jimenez/cotizaciones/2026-05/`
- Q7: PDF regeneration — if quotation data changes (shouldn't, but edge case), should we overwrite the HubSpot file or create a new version?

### Item 3: Shared HubSpot File Manager connector

**Both Item 1 and Item 2 use the same HubSpot Files API.** This should be a shared module.

**Proposed location:** `src/engine/connectors/crm/hubspot/hubspotFileManager.ts`

**Proposed interface:**
```typescript
interface FileUploadResult {
  readonly fileId: string;
  readonly url: string;         // Public URL
  readonly hubspotUrl: string;  // HubSpot internal URL
  readonly sizeBytes: number;
}

// Upload a file buffer to HubSpot File Manager
async function uploadFileToHubSpot(
  token: string,
  buffer: Buffer,
  options: {
    fileName: string;
    folder: string;
    contentType: string;
  }
): Promise<Result<FileUploadResult, EngineError>>

// Attach a file to a CRM record via note/engagement
async function attachFileToRecord(
  token: string,
  fileId: string,
  options: {
    objectType: 'deals' | 'contacts';
    objectId: string;
    noteBody?: string;
  }
): Promise<Result<string, EngineError>>
```

**Questions for Architect:**
- Q8: This lives in `connectors/crm/hubspot/` — correct placement, or should file operations be a separate connector concern (e.g., `connectors/storage/hubspot/`)?
- Q9: Should `uploadFileToHubSpot` return `Result<T, EngineError>` (our pattern) even though it's a connector? Or should connectors have their own error type?
- Q10: HubSpot Files API has rate limits (10 req/s for files). Should we add rate limiting logic in the connector or handle it at the caller level?

---

## Non-scope (explicitly excluded from B.0)

- Admin console UI (Fase B.2)
- CRUD for projects/typologies (Fase B.2)
- Connector interfaces (`IErpConnector`, `ICrmConnector`) — Fase D
- Multi-tenant isolation — Fase C
- Sinco write-back — separate item, not blocked by this

---

## Existing code to be aware of

| File | Relevance |
|------|-----------|
| `fetchAssetSafe.ts` | Already handles absolute URLs, SSRF protection, host whitelist. Needs HubSpot CDN added to allowed hosts. |
| `resolveAssetUrl()` | Already passes through absolute URLs. No change needed. |
| `jimenez_demo.ts` | `assetAllowedHosts` needs HubSpot CDN hostname added. |
| `deal/route.ts` | PDF upload step goes after deal creation (step 4.5). `pdf_cotizacion_url_fx` value changes from our API URL to HubSpot file URL. |
| `pdf/route.ts` | `generatePdf()` stays as fallback. No changes. |
| `pdfBuilder.ts` | No changes. Still generates the buffer. |
| `TypologyRule` type | `renderPath` / `planoPath` fields change from relative paths to absolute HubSpot URLs. |
| `quotations` table | `pdf_url` column already exists. Will store HubSpot file URL. |

---

## Architectural principles (non-negotiable)

1. `Result<T, EngineError>` always. Never throw.
2. Fail-hard, never fail-silent. If PDF upload fails, deal creation still succeeds (PDF upload is non-fatal, like contact creation today).
3. HubSpot is a connector, not the core. File upload logic lives in connector layer.
4. Zero Jiménez-specific code in the file manager module.
5. Code and comments in English. UI and final errors in Spanish.
6. All work in `feature/multi-project` branch.

---

## Expected deliverables

1. `hubspotFileManager.ts` — shared upload + attach utility
2. Modified `deal/route.ts` — PDF upload step after deal creation
3. Modified `jimenez_demo.ts` — HubSpot CDN in `assetAllowedHosts`, typology rules with HubSpot URLs
4. Migration script — upload current assets to HubSpot File Manager
5. Tests for file upload (mock HubSpot API)

---

## Request

Architect: Please review this scope for completeness, flag any architectural concerns, and answer Q1–Q10. Specifically looking for:
- Are there any dependencies or ordering issues I'm missing?
- Is the connector placement correct?
- Should PDF upload block deal response or be async?
- Any HubSpot API gotchas with Files v3 that I should know?
