# Runbook: Debug PDF Pipeline

> **When:** PDFs not generating, blank, or failing to attach to Deals.
> **Who:** Engineer with admin API access.
> **Confidential** — Focux Digital Group S.A.S.

---

## PDF Pipeline Stages

```
Quotation created → PDF generated (pdf-lib) → Uploaded to HubSpot File Manager → Note created on Deal → PDF URL stored in DB
```

Each stage has a tracked status in the `quotations` table:

| `pdf_upload_status` | Meaning |
|---------------------|---------|
| `null` | PDF not yet processed |
| `generation_failed` | pdf-lib failed to build the PDF |
| `uploaded` | File uploaded to HubSpot, not yet attached |
| `upload_failed` | HubSpot File Manager rejected the upload |
| `attached` | Note with PDF created on Deal ✅ |
| `attach_failed` | Note creation failed (file exists but not linked) |

---

## Step 1 — Check PDF Status Distribution

```bash
curl "https://engine.focux.co/api/engine/quotations/pdf-status?clientId=jimenez_demo&failures=20" \
  -H "Authorization: Bearer $ADMIN_API_SECRET" | jq .
```

This shows:
- Distribution of statuses (how many at each stage)
- Failure rate percentage
- Last N failures with error messages

---

## Step 2 — Diagnose by Status

### `generation_failed`

**Causa común:** Asset (render, plano, logo, font) no accesible en el momento de generación.

```bash
# Verificar assets
curl "https://engine.focux.co/api/engine/quotations/asset-health?clientId=jimenez_demo" \
  -H "Authorization: Bearer $ADMIN_API_SECRET"
```

Si assets están OK, el error probablemente fue transitorio. Retry:

```bash
curl -X POST "https://engine.focux.co/api/engine/quotations/retry-pdf" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_SECRET" \
  -d '{"clientId":"jimenez_demo","cotNumber":"COT-XXXX","dryRun":true}'
```

### `upload_failed`

**Causa común:** HubSpot File Manager rate limit o token expirado.

1. Verificar token: `curl "https://engine.focux.co/api/engine/health?clientId=jimenez_demo"`
2. Si `crm.ok: false` → token expirado, renovar en HubSpot Private Apps
3. Si token OK → retry (probablemente rate limit transitorio)

### `attach_failed`

**Causa común:** Deal no existe o fue eliminado después de la cotización.

1. Verificar que el Deal existe en HubSpot
2. Si existe y tiene `pdf_hubspot_file_id` en DB → retry con `attach_only`
3. Si no tiene fileId → retry con `full_rebuild`

---

## Step 3 — Retry

```bash
# Dry run primero (no ejecuta, solo reporta qué haría)
curl -X POST "https://engine.focux.co/api/engine/quotations/retry-pdf" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_SECRET" \
  -d '{"clientId":"jimenez_demo","all":true,"dryRun":true}'

# Si el dry run se ve bien, ejecutar:
curl -X POST "https://engine.focux.co/api/engine/quotations/retry-pdf" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_SECRET" \
  -d '{"clientId":"jimenez_demo","all":true,"dryRun":false,"limit":10}'
```

**State machine del retry:**

| Current status | Retry action |
|---------------|-------------|
| `generation_failed` | Full rebuild + upload + attach |
| `upload_failed` | Full rebuild + upload + attach |
| `uploaded` | Attach only |
| `attach_failed` | Attach only (if fileId exists), else full rebuild |

---

## Step 4 — Manual PDF Generation (debug)

Para generar un PDF localmente y ver el output:

```bash
curl -X POST "http://localhost:3000/api/engine/quotations/pdf" \
  -H "Content-Type: application/json" \
  -b "quoter_session=<cookie>" \
  -d '{"clientId":"jimenez_demo","cotNumber":"COT-XXXX"}' \
  -o debug-output.pdf

# Abrir
open debug-output.pdf
```

---

## PDF Generation Technical Notes

- **Library:** `pdf-lib` + `@pdf-lib/fontkit` (zero native deps)
- **Fonts:** Custom fonts embedded via fontkit — loaded from CDN at generation time
- **Images:** Fetched from HubSpot CDN with 10s timeout (`fetchAssetSafe`)
- **Fallback:** If an asset fails to load, PDF generates with placeholder text instead of image
- **Size:** Typical PDF is 200-400KB

---

*Focux | www.focux.co | Documento confidencial*
