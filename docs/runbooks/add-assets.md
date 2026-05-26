# Runbook: Upload Renders & Planos to HubSpot CDN

> **When:** New project added, or client provides updated renders/planos.
> **Who:** Any engineer with HubSpot File Manager access.
> **Time:** ~15min per project.
> **Confidential** — Focux Digital Group S.A.S.

---

## Asset Requirements

| Asset | Format | Naming | Notes |
|-------|--------|--------|-------|
| Render principal | PNG | `render.png` | Imagen hero del proyecto |
| Plano por tipología | PNG | `plano-tipo-a.png`, `plano-tipo-b.png` | Uno por tipo de unidad |
| Logo cliente | PNG | `logo.png` | Para header del PDF |
| Logo footer | PNG | `logo-footer.png` | Opcional — si difiere del header |

**Resolución recomendada:** Renders 1200x800px, Planos 800x600px, Logos 400xauto.

---

## Step 1 — Prepare Files

Verificar que los archivos:
- Son PNG (no JPG, no WebP)
- Tienen nombres consistentes (lowercase, hyphens)
- No tienen espacios ni caracteres especiales en el nombre

---

## Step 2 — Upload via HubSpot API

```bash
# Estructura de carpetas en CDN:
# hubfs/<portalId>/assets/<clientSlug>/<projectSlug>/

PORTAL_ID=51256354
CLIENT=jimenez
PROJECT=porto-sabbia
TOKEN=$HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN

# Upload render
curl -X POST "https://api.hubapi.com/filemanager/api/v3/files/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@render.png" \
  -F "options={\"access\":\"PUBLIC_NOT_INDEXABLE\",\"folderPath\":\"assets/$CLIENT/$PROJECT\"}"

# Upload plano
curl -X POST "https://api.hubapi.com/filemanager/api/v3/files/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@plano-tipo-a.png" \
  -F "options={\"access\":\"PUBLIC_NOT_INDEXABLE\",\"folderPath\":\"assets/$CLIENT/$PROJECT\"}"
```

**`PUBLIC_NOT_INDEXABLE`:** El archivo es accesible por URL directa pero no aparece en Google. Decisión de data sovereignty — los assets viven en el portal del cliente.

---

## Step 3 — Get CDN URLs

Después del upload, el response incluye la URL pública:

```json
{
  "objects": [{
    "url": "https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez/porto-sabbia/render.png"
  }]
}
```

Anotar todas las URLs para configurar el overlay (Step 4).

---

## Step 4 — Update Client Config

Agregar las URLs al overlay en la config del client:

**File:** `src/engine/apps/quoter/inventory/clientConfigs/<client>.ts`

---

## Step 5 — Verify Assets

```bash
# Health check de assets
curl "https://engine.focux.co/api/engine/quotations/asset-health?clientId=jimenez_demo" \
  -H "Authorization: Bearer $ADMIN_API_SECRET" | jq '.status, .failed'
```

Debe retornar `status: "healthy"` y `failed: 0`.

Si un asset falta o la URL está rota, el cotizador funciona sin él (graceful degradation) pero el PDF mostrará un placeholder.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Asset retorna 403 | Verificar `access: "PUBLIC_NOT_INDEXABLE"` en el upload |
| Asset retorna 404 | Verificar folderPath exacto y nombre de archivo |
| PDF muestra placeholder | Verificar que la URL en overlay coincide exactamente con la del CDN |
| Imagen se ve pixelada | Subir a mayor resolución. Mínimo 1200px de ancho para renders. |

---

*Focux | www.focux.co | Documento confidencial*
