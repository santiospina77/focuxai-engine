# ADR-009: Data Sovereignty — Assets & PDFs in Client's HubSpot Portal

**Status:** Accepted
**Date:** 2026-04-22
**Decision makers:** Santiago Ospina (CEO)

---

## Context

The Engine generates PDFs and uses image assets (renders, planos, logos). These files need to be stored somewhere accessible via URL. Options:

1. **S3/Cloudflare R2** — Focux-controlled bucket
2. **Vercel Blob** — tied to the Vercel project
3. **HubSpot File Manager** — in the client's own portal

## Decision

All client-facing files live in the **client's HubSpot File Manager**, not in Focux infrastructure.

- Renders, planos, logos → `hubfs/<portalId>/assets/<client>/<project>/`
- Generated PDFs → uploaded to client's File Manager, attached to Deals as notes
- Access level: `PUBLIC_NOT_INDEXABLE` (accessible by URL, not indexed by search engines)

## Rationale

1. **Client owns their data.** If the client leaves Focux, their files stay in their HubSpot portal. No data extraction needed, no vendor lock-in argument.

2. **No separate storage bill.** HubSpot File Manager is included in the client's HubSpot subscription. No S3 costs, no egress fees.

3. **CDN built-in.** HubSpot serves files from `*.fs1.hubspotusercontent-na1.net` which is CloudFront-backed. No CDN setup needed.

4. **Compliance simplicity.** The client's data governance policies apply to their HubSpot portal. Focux doesn't need to maintain a separate data processing agreement for file storage.

## Consequences

**Positive:**
- Client owns their data — zero vendor lock-in
- No storage costs for Focux
- Built-in CDN with HubSpot
- PDFs are visible in HubSpot Deal timeline (attached as notes)

**Negative:**
- HubSpot File Manager API has rate limits
- File upload is slower than direct S3 upload (~2-5s vs ~500ms)
- If client's HubSpot subscription expires, assets become inaccessible
- `PUBLIC_NOT_INDEXABLE` is not truly private — anyone with the URL can access (acceptable for renders/planos, not for sensitive docs)

---

*Focux | www.focux.co | Documento confidencial*
