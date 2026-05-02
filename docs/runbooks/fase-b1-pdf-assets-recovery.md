# Runbook — PDF & Asset Recovery (Fase B.1)

> FocuxAI Engine™ — Operaciones internas. Documento confidencial.
> Última actualización: 2026-05-01

## Prerequisitos

- `ADMIN_API_SECRET` configurado en Vercel (o en `.env.local` para desarrollo)
- `HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN` configurado
- Acceso a `engine.focux.co` (producción) o `localhost:3000` (dev)

## Variables

```bash
BASE=https://engine.focux.co
SECRET=<ADMIN_API_SECRET>
AUTH="Authorization: Bearer $SECRET"
CLIENT=jimenez_demo
```

---

## 1. Revisar estado de PDFs

```bash
curl -s -H "$AUTH" "$BASE/api/engine/quotations/pdf-status?clientId=$CLIENT" | jq .
```

Respuesta esperada:

```json
{
  "clientId": "jimenez_demo",
  "total": 42,
  "attached": 38,
  "uploaded": 0,
  "pending": 2,
  "failureCount": 2,
  "failureRate": 4.76,
  "lastFailureAt": "2026-05-01T14:30:00Z",
  "distribution": [
    { "status": "attached", "count": 38 },
    { "status": "null", "count": 2 },
    { "status": "upload_failed", "count": 1 },
    { "status": "attach_failed", "count": 1 }
  ],
  "recentFailures": [...]
}
```

**Qué buscar:**
- `failureRate` > 5% → investigar
- `uploaded` > 0 → cotizaciones con PDF subido pero no adjuntado al Deal
- `pending` (`null`) con `hubspot_deal_id` presente → deal creado sin PDF sync

---

## 2. Retry de una cotización específica

```bash
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"clientId":"'"$CLIENT"'","cotNumber":"COT-PSS-2605-0461"}' \
  "$BASE/api/engine/quotations/retry-pdf" | jq .
```

---

## 3. Retry batch con dry run

Siempre correr `dryRun:true` primero para ver qué se va a procesar:

```bash
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"clientId":"'"$CLIENT"'","all":true,"limit":10,"dryRun":true}' \
  "$BASE/api/engine/quotations/retry-pdf" | jq .
```

Revisar los `skipReason`:
- `dry_run:attach_only` → tiene fileId, solo necesita adjuntar
- `dry_run:full_rebuild` → no tiene fileId, necesita generar PDF + subir + adjuntar

Si todo se ve correcto, ejecutar sin dry run:

```bash
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"clientId":"'"$CLIENT"'","all":true,"limit":10}' \
  "$BASE/api/engine/quotations/retry-pdf" | jq .
```

**Límites:** default 10, máximo 50 por batch. Si hay más de 50 pendientes, ejecutar múltiples veces.

---

## 4. Verificar salud de assets CDN

```bash
curl -s -H "$AUTH" "$BASE/api/engine/quotations/asset-health?clientId=$CLIENT" | jq .
```

**Status esperado:** `"healthy"` con `failed: 0`.

Si algún asset falla:
```json
{
  "status": "degraded",
  "failed": 1,
  "assets": [
    { "asset": "render.png", "httpStatus": 404, "ok": false }
  ]
}
```

---

## 5. Re-ejecutar migración de assets

**Cuándo:** Cuando asset-health reporta `degraded`, o cuando se onboardea un nuevo proyecto/torre.

**Prerequisitos:**
- Node.js instalado
- En el directorio del proyecto: `cd ~/focuxai-engine`
- `HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN` en `.env.local`

```bash
# 1. Verificar estado actual
curl -s -H "$AUTH" "$BASE/api/engine/quotations/asset-health?clientId=$CLIENT" | jq .status

# 2. Ejecutar migración
npx ts-node scripts/migrate-assets-to-hubspot.ts

# 3. Verificar que los 20 assets están OK (el script valida URLs construidas)
# Output esperado: "✅ URL validation: 20/20 OK"

# 4. Verificar de nuevo con el endpoint
curl -s -H "$AUTH" "$BASE/api/engine/quotations/asset-health?clientId=$CLIENT" | jq .status
# Esperado: "healthy"
```

**Notas sobre la migración:**
- El script usa **hybrid duplicate validation**: `NONE` para render (force-create), `RETURN_EXISTING` para planos y branding
- Si render.png ya existe con nombre diferente (RETURN_EXISTING problem), la estrategia NONE fuerza la creación con el nombre exacto
- `PROJECT_SLUG` en el script debe coincidir con la ruta en `assetBaseUrl` (default: `porto-sabbia`)
- Los archivos fuente están en `public/assets/porto-sabbia/`

---

## 6. Rollback a Vercel fallback (emergencia)

Si HubSpot CDN está completamente caído y los PDFs no pueden generar imágenes:

**En `deal/route.ts` y `pdf/route.ts`:** Comentar `assetBaseUrl` en `JIMENEZ_PDF_ASSETS`:

```typescript
const JIMENEZ_PDF_ASSETS: PdfAssetOptions = {
  // assetBaseUrl: 'https://51256354.fs1.hubspotusercontent-na1.net/...',  // DISABLED - CDN outage
  allowedHosts: ['focuxai-engine.vercel.app', 'engine.focux.co'],
};
```

Sin `assetBaseUrl`, `resolveAssetUrl` cae al fallback: `{VERCEL_URL}/assets/{path}`.

**Prerequisito:** Los assets deben existir en `public/assets/porto-sabbia/` en el deploy de Vercel.

**Para revertir:** Descomentar `assetBaseUrl` y deployar.

---

## 7. HubSpot CDN devuelve 404

**Diagnóstico:**
1. Correr asset-health → identificar qué asset falta
2. Verificar en HubSpot File Manager (portal 51256354) → Marketing → Files → `/assets/jimenez/porto-sabbia/`
3. Si el archivo no existe → re-ejecutar migración (paso 5)
4. Si el archivo existe pero con otro nombre → el script de migración tiene estrategia `NONE` para forzar el nombre correcto

**Causa raíz más probable:** `RETURN_EXISTING` devolvió URL con nombre diferente. La migración con `NONE` lo resuelve.

---

## 8. HubSpot rate limit (429)

**Síntomas:** retry-pdf batch falla con errores de rate limit.

**Mitigación:**
1. Reducir `limit` en el batch: `"limit": 3`
2. Esperar 30 segundos entre batches
3. El connector `hubspotFileManager.ts` tiene retry con backoff exponencial y `Retry-After` header support

**Si persiste:**
- Verificar en HubSpot → Settings → Private Apps → Usage que no se esté excediendo el daily limit
- El throttling de 3 capas en HttpClient debería manejar la mayoría de casos

---

## Checklist de onboarding nuevo proyecto

Cuando se agrega una nueva torre o proyecto al cotizador:

1. [ ] Agregar assets (render, planos) a `public/assets/{proyecto}/`
2. [ ] Actualizar manifest en `migrate-assets-to-hubspot.ts` con las nuevas entries
3. [ ] Ejecutar migración: `npx ts-node scripts/migrate-assets-to-hubspot.ts`
4. [ ] Verificar: asset-health endpoint
5. [ ] Actualizar `expectedAssets` en `asset-health/route.ts`
6. [ ] Actualizar `assetBaseUrl` si el proyecto tiene ruta CDN diferente
7. [ ] Deploy: `git add . && git commit -m "feat: assets for {proyecto}" && git push && npx vercel --prod`
