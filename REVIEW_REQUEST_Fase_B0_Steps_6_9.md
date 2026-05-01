# Review Request — Fase B.0 Steps 6-9: Asset Migration to HubSpot CDN

**Autor:** SpaceCommander
**Fecha:** 2026-05-01
**Contexto previo:** FASE_B0_SUMMARY.md (Steps 1-5 aprobados y en producción)
**Estado:** Código completo, `assetBaseUrl` comentado (activación post-migration).

---

## Objetivo

Los assets del PDF (renders de fachada, planos de tipología, logos, sello corporativo) actualmente viven como archivos estáticos en Vercel (`/public/assets/`). Migrarlos al HubSpot File Manager del cliente para completar la soberanía de datos de Fase B.0.

**Resultado final:** El PDF generado consume imágenes desde el CDN de HubSpot del cliente. Si el cliente termina la relación con Focux, sus assets comerciales quedan en SU portal.

---

## Inventario de assets (conteo confirmado)

| Categoría | Cantidad | Ejemplo |
|-----------|----------|---------|
| Branding | 2 | `logo-jimenez-horizontal.png`, `sello-40-anos.png` |
| Renders | 17 | `render-A1.png` ... `render-E1.png` |
| Planos | 17 | `plano-A1.png` ... `plano-E1.png` |
| **Total** | **36** | |

**Excluido:** `logo-jimenez-isotipo.png` (existe en repo pero no lo usa ni PDF ni UI).
**Nota:** Fonts (AinslieSans, CarlaSans) NO se migran — siempre se cargan desde Vercel.

---

## Step 6 — Migration Script

**Archivo:** `scripts/migrate-assets-to-hubspot.ts`

**Comportamiento:**
- Lee 36 PNGs de `public/assets/`
- Sube cada uno a HubSpot Files API como `PUBLIC_NOT_INDEXABLE`
- Folder destino: `/assets/{clientSlug}/` (ej: `/assets/jimenez/`)
- `duplicateValidationStrategy: 'RETURN_EXISTING'` + `duplicateValidationScope: 'EXACT_FOLDER'`
- Upload secuencial con 300ms entre archivos (respeta rate limits)
- Timeout dinámico por tamaño (10s base + 5s/MB, max 60s)

**Output:** JSON en `scripts/output/asset-migration-{clientSlug}-{timestamp}.json`:
```json
{
  "clientSlug": "jimenez",
  "hubspotFolder": "/assets/jimenez",
  "assetBaseUrl": "https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez",
  "totalFiles": 36,
  "uploaded": 36,
  "failed": 0,
  "assets": {
    "render-A1.png": { "fileId": "...", "url": "https://..." },
    "plano-A1.png": { "fileId": "...", "url": "https://..." }
  }
}
```

**Características de seguridad:**
- Verifica que TODOS los archivos existan antes de iniciar (abort si falta alguno)
- No modifica config ni código — solo produce JSON output
- Idempotente gracias a `RETURN_EXISTING`
- Requiere env vars explícitas: `HUBSPOT_TOKEN` + `CLIENT_SLUG`

**Ejecución:**
```bash
HUBSPOT_TOKEN=pat-na1-xxx CLIENT_SLUG=jimenez npx tsx scripts/migrate-assets-to-hubspot.ts
```

---

## Step 7 — `assetBaseUrl` + Resolver Backward Compatible

### 7a. `resolveAssetUrl()` actualizado (`fetchAssetSafe.ts`)

**Antes (Fase A):**
```typescript
export function resolveAssetUrl(path: string | undefined, baseUrl: string): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${baseUrl.replace(/\/$/, '')}/assets/${path.replace(/^\//, '')}`;
}
```

**Ahora (Fase B):**
```typescript
export function resolveAssetUrl(
  path: string | undefined,
  fallbackBaseUrl: string,
  assetBaseUrl?: string,
): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;           // 1. absolute → use as-is
  const cleanPath = path.replace(/^\//, '');
  if (assetBaseUrl) {                                  // 2. CDN base → CDN + path
    return `${assetBaseUrl.replace(/\/$/, '')}/${cleanPath}`;
  }
  return `${fallbackBaseUrl.replace(/\/$/, '')}/assets/${cleanPath}`;  // 3. fallback → Vercel
}
```

**Resolution order:**
1. Path absoluto (http/https) → usar directo
2. `assetBaseUrl` definido → CDN + path relativo
3. Fallback → `${baseUrl}/assets/${path}` (Vercel estáticos)

**Backward compatible:** tercer parámetro es opcional. Callers existentes sin `assetBaseUrl` siguen funcionando idéntico.

### 7b. `buildPdfBuffer()` actualizado (`pdfBuilder.ts`)

**Cambio de signature:**
```typescript
// Antes
export async function buildPdfBuffer(q: QuotationRow): Promise<Uint8Array>

// Ahora
export async function buildPdfBuffer(q: QuotationRow, assetBaseUrl?: string): Promise<Uint8Array>
```

**Resolver interno agregado:**
```typescript
const assetUrl = (relativePath: string) =>
  assetBaseUrl
    ? `${assetBaseUrl.replace(/\/$/, '')}/${relativePath}`
    : `${baseUrl}/assets/${relativePath}`;
```

**Uso en fetch de imágenes:**
```typescript
// Antes
fetchAsset(baseUrl, 'assets/logo-jimenez-horizontal.png')
fetchAsset(baseUrl, `assets/render-${tip}.png`)

// Ahora
fetchAsset(assetUrl('logo-jimenez-horizontal.png'))
fetchAsset(assetUrl(`render-${tip}.png`))
```

**Fonts no se tocan:** Siempre `fetchAsset(baseUrl, 'fonts/...')` — Vercel.

**`fetchAsset()` interno actualizado:**
```typescript
// Antes
async function fetchAsset(baseUrl: string, path: string): Promise<Uint8Array | null>

// Ahora — acepta URL absoluta sin segundo arg
async function fetchAsset(urlOrBase: string, path?: string): Promise<Uint8Array | null> {
  const url = path ? `${urlOrBase}/${path}` : urlOrBase;
  // ...
}
```

### 7c. Caller chain

```
deal/route.ts
  → clientConfig.assetBaseUrl (undefined = fallback)
  → buildPdfBufferSafe(quotation, assetBaseUrl)
    → buildPdfBuffer(quotation, assetBaseUrl)
      → assetUrl('render-A1.png')
        → CDN: "https://51256354.fs1.../assets/jimenez/render-A1.png"
        → OR fallback: "https://engine.focux.co/assets/render-A1.png"
```

**Segundo caller:** `pdf/route.ts` (GET endpoint, URL backup) llama `buildPdfBuffer(quotation)` sin `assetBaseUrl` → siempre fallback a Vercel. Esto es intencional — el endpoint de backup funciona independiente del CDN.

### 7d. Config (`ClientDealConfig` + `ClientInventoryConfig`)

Ambos interfaces tienen `assetBaseUrl?: string` opcional.

**Estado actual en código:**
```typescript
// deal/route.ts — CLIENT_REGISTRY
jimenez_demo: {
  // ...
  // assetBaseUrl: 'https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez',
}

// jimenez_demo.ts — ClientInventoryConfig
// assetBaseUrl: 'https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez',
```

**Ambos comentados.** Se descomentan después de ejecutar migration script y verificar URLs.

---

## Step 8 — `assetAllowedHosts`

**Antes:**
```typescript
assetAllowedHosts:
  process.env.NODE_ENV === 'production'
    ? ['focuxai-engine.vercel.app']
    : ['localhost', '127.0.0.1'],
```

**Ahora:**
```typescript
assetAllowedHosts:
  process.env.NODE_ENV === 'production'
    ? ['focuxai-engine.vercel.app', '51256354.fs1.hubspotusercontent-na1.net']
    : ['localhost', '127.0.0.1', '51256354.fs1.hubspotusercontent-na1.net'],
```

**Decisiones:**
- Hostname exacto, no wildcard (`*.hubspotusercontent-na1.net`)
- Incluido en dev para testing local
- `fetchAssetSafe` ya valida: `https only`, `content-type image/*`, `size cap 5MB`, `timeout 5s`, `host whitelist`
- No se requiere validar username/password/port porque `fetchAssetSafe` ya parsea con `new URL()` y valida protocolo

---

## Step 9 — Secuencia de activación y E2E

**Este PR se deploya con `assetBaseUrl` comentado.** Cero cambio funcional.

**Secuencia post-deploy:**
1. Ejecutar `migrate-assets-to-hubspot.ts` contra portal demo
2. Verificar JSON output: 36/36 uploaded, URLs accesibles
3. Descomentar `assetBaseUrl` en `jimenez_demo.ts` y `deal/route.ts`
4. Deploy
5. E2E: crear deal → verificar PDF tiene renders/planos desde CDN HubSpot
6. Verificar: PDF endpoint GET (`pdf_cotizacion_url_fx`) sigue usando fallback Vercel

**Rollback:** Comentar `assetBaseUrl` → deploy → automáticamente vuelve a Vercel estáticos. Assets en `/public/assets/` NO se eliminan en esta fase.

---

## Archivos modificados/creados

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `scripts/migrate-assets-to-hubspot.ts` | NUEVO | Script de migración one-time |
| `src/engine/apps/quoter/inventory/fetchAssetSafe.ts` | MODIFICADO | `resolveAssetUrl()` con 3 reglas (absoluto → CDN → fallback) |
| `src/app/api/engine/quotations/pdf/pdfBuilder.ts` | MODIFICADO | `buildPdfBuffer(q, assetBaseUrl?)`, `assetUrl()` resolver, `fetchAsset(url, path?)` |
| `src/app/api/engine/quotations/deal/route.ts` | MODIFICADO | `ClientDealConfig.assetBaseUrl?`, `buildPdfBufferSafe(q, assetBaseUrl?)`, caller pasa config |
| `src/engine/apps/quoter/inventory/clientConfigs/jimenez_demo.ts` | MODIFICADO | `assetBaseUrl?` en interface, hostname CDN en `assetAllowedHosts` |

---

## Decisiones de diseño

| # | Decisión | Rationale |
|---|----------|-----------|
| D11 | Paths relativos en tipologías, no URLs absolutas | Portabilidad: migrar CDN/portal = cambiar 1 URL base, no 36 paths |
| D12 | `assetBaseUrl` en 2 configs (deal + inventory) | Deal config controla PDF generation, inventory config controla SSRF whitelist |
| D13 | Fonts siempre de Vercel | Son assets de plataforma Focux, no del cliente. No aplica soberanía de datos. |
| D14 | Migration script → JSON output, no edita config | Separación de concerns. Humano revisa output y descuenta manualmente. |
| D15 | `assetBaseUrl` comentado en deploy inicial | Zero risk deploy. Activación explícita post-verificación. |
| D16 | Hostname exacto, no wildcard | SSRF protection. Si cambia portal → agregar nuevo hostname explícitamente. |
| D17 | `RETURN_EXISTING` en migration | Idempotente. Re-ejecutar no duplica archivos. |
| D18 | GET /pdf endpoint siempre usa fallback Vercel | Backup independiente del CDN. Si HubSpot cae, la URL de engine sigue funcionando. |
| D19 | Assets en `/public/assets/` NO se eliminan | Fallback + contingencia. Eliminar va en B.1 cuando haya monitoreo. |

---

## Preguntas para el Architect

1. ¿El approach de `assetUrl()` inline en pdfBuilder vs. usar el `resolveAssetUrl()` centralizado de fetchAssetSafe es aceptable? El pdfBuilder no importa de fetchAssetSafe — tiene su propia resolución de 2 líneas. Duplicación mínima pero aislamiento total.

2. ¿La strategy de `RETURN_EXISTING` + `EXACT_FOLDER` es suficiente para idempotencia, o debería el script verificar por filename antes de intentar upload?

3. ¿`assetBaseUrl` debería ser env var en vez de hardcodeado en config? Pro: no requiere deploy para cambiar. Con: agrega complejidad de naming para multi-tenant.
