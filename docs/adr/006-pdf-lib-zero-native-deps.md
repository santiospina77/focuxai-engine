# ADR-006: pdf-lib for PDF Generation — Zero Native Dependencies

**Status:** Accepted
**Date:** 2026-04-22
**Decision makers:** Santiago Ospina (CEO)

---

## Context

The cotizador generates branded PDF quotations with images (renders, planos), custom fonts, tables, and legal text. Common PDF libraries for Node.js include Puppeteer/Playwright (headless browser), wkhtmltopdf, and pdf-lib.

## Decision

Use `pdf-lib` + `@pdf-lib/fontkit` for all PDF generation. No headless browser, no native binary, no Docker.

## Rationale

1. **Vercel Hobby plan constraint.** Puppeteer requires a Chromium binary (~130MB). It works on Vercel Pro/Enterprise with custom runtimes but not on Hobby. pdf-lib is pure JavaScript — it runs on any Node.js environment including Vercel Serverless and Edge.

2. **Predictable output.** Headless browser PDF generation depends on CSS rendering, viewport size, and font availability — small changes in Chrome version can shift layout. pdf-lib builds PDFs programmatically with absolute coordinates, so the output is deterministic.

3. **Performance.** pdf-lib generates a typical quotation PDF in ~200-500ms. Puppeteer takes 2-5s (browser launch + page render + PDF export).

4. **Font embedding.** `fontkit` allows embedding custom TTF/OTF fonts. The client's brand fonts are loaded from CDN at generation time and embedded in the PDF.

## Trade-offs

**What pdf-lib can do well:**
- Text with custom fonts
- Images (PNG, JPG) at specified coordinates
- Tables (manual layout with lines and cells)
- Page numbers, headers, footers
- Multi-page documents

**What pdf-lib does NOT do:**
- HTML/CSS → PDF conversion (need absolute positioning)
- Complex layouts (flexbox, grid — must calculate coordinates manually)
- SVG rendering (must rasterize to PNG first)
- Rich text formatting within a single text block

For the cotizador's PDF (structured table layout with images and text), pdf-lib is the right fit. If future requirements need HTML→PDF (e.g., email-style reports), evaluate alternatives then.

## Image Handling

Images are fetched from HubSpot CDN at generation time via `fetchAssetSafe`:
- 10-second timeout per image
- If fetch fails → PDF renders with placeholder text (graceful degradation)
- Images are `PUBLIC_NOT_INDEXABLE` in HubSpot File Manager (data sovereignty in client's portal)

## Consequences

**Positive:**
- Zero native dependencies — deploys on Vercel Hobby
- Deterministic output — same input = same PDF, always
- Fast generation (~200-500ms)
- Custom font embedding

**Negative:**
- Manual coordinate layout (more code than HTML→PDF)
- No CSS — every position, size, and color is explicit
- Complex layout changes require recalculating coordinates
- PDF approved by client (Jiménez) — **UI and layout must NOT be modified** (see ADR-003-like permanence)

---

*Focux | www.focux.co | Documento confidencial*
