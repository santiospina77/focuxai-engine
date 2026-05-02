# Review Request — Fase B.0 Steps 6-9 v2: Asset Migration to HubSpot CDN

**Autor:** SpaceCommander
**Fecha:** 2026-05-01
**Contexto previo:** FASE_B0_SUMMARY.md (Steps 1-5 aprobados), Architect Review v1 (8 issues resueltos)
**Branch:** `feature/multi-project` (commit `e38a0ee` + refactor manifest)
**Estado:** Build limpio. `assetBaseUrl` comentado (zero-change deploy). Activación post-migration.

---

## Cambios desde Review v1

Este documento incorpora TODOS los fixes requeridos por el Architect en la primera revisión de Steps 6-9, más una corrección arquitectónica adicional (manifest explícito + folder por proyecto).

### Issues resueltos del Architect Review v1

| # | Severidad | Issue | Resolución |
|---|-----------|-------|------------|
| 1 | CRITICAL | pdfBuilder bypasses fetchAssetSafe (SSRF) | `fetchImageAsset()` wrapper → todas las imágenes pasan por `fetchAssetSafe`. Fonts separados en `fetchFont()` (same-origin Vercel, sin SSRF). |
| 2 | CRITICAL | fetchAssetSafe no valida credentials/port en URL | Agregado: reject explícito de `url.username`, `url.password`, `url.port` antes del fetch. |
| 3 | CRITICAL | Migration script no exporta `assetHost` | JSON output incluye `assetHost` (hostname parseado de `assetBaseUrl`). Listo para copiar a `allowedHosts`. |
| 4 | HIGH | Dos fuentes de verdad para `assetBaseUrl` | `PdfAssetOptions` interface en pdfBuilder.ts es el single source of truth. `ClientDealConfig.pdfAssets?: PdfAssetOptions`. `JIMENEZ_PDF_ASSETS` constante (comentada) referenciada desde el registry. `ClientInventoryConfig.assetBaseUrl` eliminado. |
| 5 | HIGH | GET /pdf endpoint no documenta fallback intencional | Comentario en `pdf/route.ts` línea 39: "Intentionally no assetOpts here. This endpoint is the fallback renderer..." |
| 6 | HIGH | Migration no valida estabilidad de base URL | Script valida que TODAS las URLs retornadas compartan la misma base. Si difieren → `ASSET_BASE_URL_NOT_STABLE` abort. |
| 7 | MEDIUM | Sin sha256 per asset | JSON output incluye `sha256` y `sizeBytes` por cada asset. |
| 8 | MEDIUM | CLIENT_SLUG sin validación | Regex `/^[a-z0-9-]+$/` — rechaza `.`, `..`, `/`, `\`, espacios. |

### Corrección arquitectónica adicional: Manifest + Project Folder

**Problema detectado post-review:** El script original usaba un array plano de filenames y asumía que todos los assets vivían flat en `/public/assets/`. En realidad los renders y planos están en `/public/assets/porto-sabbia/`, y el folder de HubSpot necesita incluir el proyecto para evitar colisiones multi-proyecto.

**Resolución:**

1. **`ASSET_MANIFEST` explícito** reemplaza la lista plana de filenames:
```typescript
interface AssetManifestEntry {
  readonly sourcePath: string;         // "public/assets/porto-sabbia/render-A1.png"
  readonly hubspotFileName: string;    // "render-A1.png" (canonical Engine name)
  readonly kind: 'render' | 'floorplan' | 'branding';
  readonly typology: string | null;    // "A1", null for branding
  readonly originalSourceName: string | null;  // audit trail
}
```

2. **Folder por proyecto:**
```
HubSpot: /assets/{client}/{project}/
Ejemplo: /assets/jimenez/porto-sabbia/
```

3. **URL final:**
```
https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez/porto-sabbia/render-A1.png
```

4. **Multi-proyecto ready:** Si mañana Jiménez lanza un proyecto "Porto Sabbia II" con tipologías A1, B1, etc., no hay colisión — van a `/assets/jimenez/porto-sabbia-ii/`.

5. **Nuevo env var:** `PROJECT_SLUG` (default: `porto-sabbia`). Validado con misma regex que `CLIENT_SLUG`.

6. **Validación de duplicados en manifest:** Antes de iniciar uploads, verifica que no haya `hubspotFileName` repetidos.

---

## Arquitectura final de asset resolution

### Flujo CDN (con `assetBaseUrl` activo)

```
pdfBuilder.buildPdfBuffer(quotation, pdfAssets)
  → assetUrl('render-A1.png')
    → resolveAssetUrl('render-A1.png', baseUrl, assetBaseUrl)
      → "https://51256354.fs1.../assets/jimenez/porto-sabbia/render-A1.png"
  → fetchImageAsset(resolvedUrl, allowedHosts)
    → fetchAssetSafe(url, { allowedHosts })
      → SSRF checks: protocol, credentials, port, host whitelist
      → content-type validation, size cap, timeout, placeholder detection
```

### Flujo fallback (sin `assetBaseUrl`)

```
pdfBuilder.buildPdfBuffer(quotation)  // sin assetOpts
  → assetUrl('render-A1.png')
    → resolveAssetUrl('render-A1.png', baseUrl, undefined)
      → "https://engine.focux.co/assets/render-A1.png"  // Vercel static
  → fetchImageAsset(resolvedUrl, [])
    → fetchAssetSafe(url, { allowedHosts: [] })
      → allowedHosts vacío + !production → permite (dev)
```

**Nota:** Los archivos flat en `/public/assets/` (render-A1.png, plano-A1.png, etc.) son copias de contingencia que hacen funcionar el fallback Vercel. NO se eliminan en Fase B.0.

### Dos funciones de fetch distintas

| Función | Qué busca | SSRF protection | Host whitelist |
|---------|-----------|-----------------|----------------|
| `fetchImageAsset()` | Renders, planos, logos, sello | Sí — via `fetchAssetSafe` | Sí — `allowedHosts` |
| `fetchFont()` | Fonts (AinslieSans, CarlaSans) | No — same-origin Vercel | No — siempre `baseUrl/fonts/` |

**Rationale:** Fonts son assets de plataforma Focux, no del cliente. Siempre same-origin. No aplica soberanía de datos. Agregar SSRF checks a fonts agregaría complejidad sin valor.

### GET /pdf endpoint (backup)

```typescript
// pdf/route.ts — línea 39
// Intentionally no assetOpts here. This endpoint is the fallback renderer
// that always resolves assets from Vercel static /assets/. If HubSpot CDN
// is down, the deal pipeline's pdf_cotizacion_url_fx still works via this route.
const pdfBuffer = await buildPdfBuffer(quotation);
```

---

## Migration script — JSON output esperado

```json
{
  "clientSlug": "jimenez",
  "projectSlug": "porto-sabbia",
  "hubspotFolder": "/assets/jimenez/porto-sabbia",
  "assetBaseUrl": "https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez/porto-sabbia",
  "assetHost": "51256354.fs1.hubspotusercontent-na1.net",
  "timestamp": "2026-05-01T...",
  "totalFiles": 36,
  "uploaded": 36,
  "existing": 0,
  "failed": 0,
  "assets": {
    "render-A1.png": {
      "sourcePath": "public/assets/porto-sabbia/render-A1.png",
      "kind": "render",
      "typology": "A1",
      "originalSourceName": null,
      "fileId": "...",
      "url": "https://51256354.fs1.../assets/jimenez/porto-sabbia/render-A1.png",
      "sha256": "a1b2c3...",
      "sizeBytes": 245760
    },
    "logo-jimenez-horizontal.png": {
      "sourcePath": "public/assets/logo-jimenez-horizontal.png",
      "kind": "branding",
      "typology": null,
      "originalSourceName": null,
      "fileId": "...",
      "url": "https://51256354.fs1.../assets/jimenez/porto-sabbia/logo-jimenez-horizontal.png",
      "sha256": "d4e5f6...",
      "sizeBytes": 58320
    }
  },
  "errors": []
}
```

**Ejecución:**
```bash
HUBSPOT_TOKEN=pat-na1-xxx CLIENT_SLUG=jimenez PROJECT_SLUG=porto-sabbia \
  npx tsx scripts/migrate-assets-to-hubspot.ts
```

---

## Archivos modificados/creados

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `scripts/migrate-assets-to-hubspot.ts` | REESCRITO | Manifest explícito, PROJECT_SLUG, folder por proyecto, sha256, validaciones |
| `src/app/api/engine/quotations/pdf/pdfBuilder.ts` | MODIFICADO | `fetchImageAsset()` + `fetchFont()` reemplazan `fetchAsset()`. `PdfAssetOptions` interface. Import de `fetchAssetSafe` + `resolveAssetUrl`. |
| `src/app/api/engine/quotations/pdf/route.ts` | MODIFICADO | Comentario documentando fallback intencional |
| `src/app/api/engine/quotations/deal/route.ts` | MODIFICADO | `PdfAssetOptions` import, `JIMENEZ_PDF_ASSETS` constante (comentada) con ruta `/porto-sabbia`, `pdfAssets?` en `ClientDealConfig` |
| `src/engine/apps/quoter/inventory/fetchAssetSafe.ts` | MODIFICADO | `resolveAssetUrl()` 3 reglas, reject credentials/port en `fetchAssetSafe()` |
| `src/engine/apps/quoter/inventory/clientConfigs/jimenez_demo.ts` | MODIFICADO | `assetBaseUrl` removido de interface. HubSpot CDN hostname en `assetAllowedHosts`. |

---

## Decisiones de diseño

| # | Decisión | Rationale |
|---|----------|-----------|
| D11 | Paths relativos en tipologías, no URLs absolutas | Portabilidad: migrar CDN = cambiar 1 URL base, no 36 paths |
| D12 | `PdfAssetOptions` como single source of truth | Elimina dualidad entre ClientDealConfig y ClientInventoryConfig |
| D13 | Fonts siempre de Vercel via `fetchFont()` | Assets de plataforma, no del cliente. No aplica soberanía. |
| D14 | Manifest explícito, no glob | Previene subir duplicados, archivos huérfanos, o archivos con nombres incorrectos |
| D15 | `assetBaseUrl` comentado en deploy inicial | Zero risk deploy. Activación explícita post-verificación. |
| D16 | Hostname exacto, no wildcard | SSRF protection. Nuevo portal = agregar hostname explícitamente. |
| D17 | `RETURN_EXISTING` en migration | Idempotente. Re-ejecutar no duplica archivos. |
| D18 | GET /pdf siempre usa fallback Vercel | Backup independiente del CDN. Si HubSpot cae, la URL sigue. |
| D19 | Assets en `/public/assets/` NO se eliminan | Fallback + contingencia. Eliminar en B.1 con monitoreo. |
| D20 | Folder `/assets/{client}/{project}/` en HubSpot | Multi-proyecto: evita colisión si dos proyectos tienen tipología A1. |
| D21 | `hubspotFileName` = nombre canónico Engine, no original | Runtime depende de nombres estables. Nombres originales = metadata de auditoría. |
| D22 | `PROJECT_SLUG` como env var separado | Permite re-ejecutar para otro proyecto del mismo cliente. |

---

## Secuencia de activación

```
1. Deploy feature/multi-project a preview (assetBaseUrl comentado = cero cambio)
2. Ejecutar migration script contra portal demo
3. Verificar JSON: 36/36, sha256, assetHost = 51256354.fs1...
4. Verificar URLs accesibles en browser
5. Descomentar JIMENEZ_PDF_ASSETS en deal/route.ts
6. Deploy a preview
7. E2E: crear deal → PDF con renders desde CDN HubSpot
8. Verificar: GET /pdf endpoint sigue usando Vercel fallback
9. Merge a main → producción
```

**Rollback:** Comentar `JIMENEZ_PDF_ASSETS` → deploy → vuelve automáticamente a Vercel estáticos.

---

## Preguntas para el Architect

1. ¿El approach de `fetchFont()` separado sin SSRF (same-origin, sin host whitelist) es aceptable? O debería pasar también por `fetchAssetSafe` con Vercel hostname como allowed host?

2. ¿Los archivos flat duplicados en `/public/assets/` (copias de contingencia para fallback Vercel) deberían eliminarse ahora o mantenerlos hasta B.1 cuando haya monitoreo del CDN?

3. ¿`PROJECT_SLUG` como env var es suficiente, o debería vivir en la config del client registry para que sea auditado en código?
