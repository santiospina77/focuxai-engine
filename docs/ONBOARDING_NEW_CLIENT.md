# FocuxAI Engine™ — Onboarding de un Nuevo Cliente

> **Audiencia:** Ingenieros replicando el Engine para una nueva constructora.
> **Última actualización:** 2026-05-26
> **Tiempo estimado:** ~4-6 horas (primera vez), ~2-3 horas (con experiencia)
> **Prerrequisitos:** Haber leído `ARCHITECTURE.md` y `SETUP.md`. Dev local corriendo.
> **Confidencial** — Focux Digital Group S.A.S. Uso interno exclusivo.

---

## Visión general

Agregar un nuevo cliente al Engine significa crear un tenant aislado: su propio portal HubSpot, credenciales Sinco, env vars, archivos de configuración, App Card, y (opcionalmente) branding personalizado. El código del Engine no cambia — se configura, no se codifica.

Este playbook usa `acme` como clientId de ejemplo. Reemplazar con el slug real del cliente (minúsculas, underscores, ej. `urbansa_prod`).

---

## Checklist Pre-Vuelo

Antes de empezar, confirmar que se tiene:

- [ ] Portal ID de HubSpot (ej. `12345678`) con acceso admin
- [ ] Token de Private App de HubSpot con scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.deals.write`, `crm.objects.custom.read`, `crm.objects.custom.write`, `files`, `crm.objects.owners.read`, `crm.schemas.custom.read`
- [ ] Credenciales Sinco ERP (usuario + contraseña) — solicitar al contacto técnico del cliente
- [ ] URL base de Sinco (ej. `https://api.sinco-cliente.com`) — confirmar con contacto técnico
- [ ] Inventario de macroproyectos y proyectos activos (nombres, IDs Sinco)
- [ ] Assets del cliente: renders (.png), planos (.png), logo, colores de marca
- [ ] Pipeline y stages definidos en HubSpot (o definirlos en este proceso)

---

## Paso 1 — Registrar cliente en el Engine

**Archivo:** `src/engine/core/config/clientRegistry.ts`

Agregar el nuevo client al registro:

```typescript
const CLIENTS: Record<string, ClientBaseConfig> = {
  jimenez_demo: {
    clientId: 'jimenez_demo',
    hubspotTokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
  },
  // ▼ NUEVO CLIENTE
  acme: {
    clientId: 'acme',
    hubspotTokenEnvVar: 'HUBSPOT_ACME_PRIVATE_APP_TOKEN',
  },
};
```

**Convención de naming:** `<empresa>` para producción, `<empresa>_demo` para demo/staging.

---

## Paso 2 — Agregar mapeo de portal (AUTH-1)

**Archivo:** `src/engine/core/auth/quoterSession.ts`

Agregar el portal al `PORTAL_CLIENT_MAP`:

```typescript
const PORTAL_CLIENT_MAP: Record<string, string> = {
  '51256354': 'jimenez_demo',
  '51059324': 'jimenez_prod',
  // ▼ NUEVO
  '12345678': 'acme',
};
```

---

## Paso 3 — Crear configuración del cotizador para el cliente

**Archivo:** `src/engine/apps/quoter/inventory/clientConfigs/acme.ts` (nuevo)

Copiar la estructura de `jimenez_demo.ts` y adaptar:

```typescript
import type { QuoterClientConfig } from '../types';

export const ACME_CONFIG: QuoterClientConfig = {
  clientId: 'acme',
  objectTypeIds: {
    macroproyecto: '2-XXXXXXXX',   // ← Custom Object IDs del portal del cliente
    proyecto: '2-XXXXXXXX',
    unidad: '2-XXXXXXXX',
    agrupacion: '2-XXXXXXXX',
  },
  overlay: {
    // Mapeo de assets por proyecto (renders, planos, branding)
    // Se configura después de subir assets al CDN (Paso 8)
  },
  canalesAtribucion: [
    'portal_web',
    'sala_de_ventas_fisica',
    'referido',
    'feria_inmobiliaria',
    // Agregar canales del cliente
  ],
  typologyRules: [],  // Reglas de matching tipología — configurar con data del cliente
};
```

**⚠️ Los `objectTypeIds` son únicos por portal.** Para obtenerlos:

```bash
# Listar Custom Object schemas del portal
curl "https://api.hubapi.com/crm/v3/schemas" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" | jq '.results[] | {name, objectTypeId}'
```

Si los Custom Objects no existen aún, crearlos primero (Paso 5).

---

## Paso 4 — Conectar config en la ruta de inventario

**Archivo:** `src/app/api/engine/inventory/route.ts`

Agregar el case para el nuevo client en el switch/map donde se selecciona la config del quoter:

```typescript
// Buscar donde se resuelve la config del client y agregar:
case 'acme': return ACME_CONFIG;
```

**Nota:** La ubicación exacta depende de cómo esté implementado el resolver. Buscar `jimenez_demo` en el archivo para encontrar el patrón.

---

## Paso 5 — Crear Custom Objects en HubSpot

Si el portal del cliente no tiene los Custom Objects del Engine, crearlos. Los 4 objetos requeridos:

| Objeto | Label | Propiedades clave (sufijo _fx) |
|--------|-------|-------------------------------|
| Macroproyecto | Macroproyecto | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `ciudad_fx` |
| Proyecto | Proyecto | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `id_macroproyecto_sinco_fx` |
| Unidad | Unidad | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `area_fx`, `precio_fx`, `piso_fx`, `tipologia_fx`, `id_proyecto_sinco_fx` |
| Agrupación | Agrupación | `nombre_fx`, `id_sinco_fx`, `estado_fx`, `valor_total_neto_fx`, `id_proyecto_sinco_fx`, `id_hubspot_deal_fx` |

**Todas las propiedades van en el grupo `focux`** (groupName: `focux`, label: `Focux Engine`).

Para crear Custom Objects programáticamente, usar el Adapter (`/adapter` en el dashboard) o curl directo:

```bash
# Crear schema de Custom Object
curl -X POST "https://api.hubapi.com/crm/v3/schemas" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "macroproyecto",
    "labels": { "singular": "Macroproyecto", "plural": "Macroproyectos" },
    "primaryDisplayProperty": "nombre_fx",
    "properties": [...]
  }'
```

Después de crear, anotar los `objectTypeId` que retorna cada uno y ponerlos en la config (Paso 3).

---

## Paso 6 — Crear propiedades HubSpot en Contacts y Deals

El Engine usa propiedades `_fx` en Contacts y Deals para sincronizar datos. Crearlas en el grupo `focux`:

**Propiedades de Contact (_fx):**

| Propiedad | Tipo | Descripción |
|-----------|------|-------------|
| `cedula_fx` | string | Número de documento |
| `tipo_documento_fx` | enumeration | CC, CE, NIT, PP, TI |
| `tipo_persona_fx` | enumeration | NATURAL, JURIDICA |
| `canal_atribucion_fx` | enumeration | portal_web, sala_de_ventas_fisica, etc. |
| `lista_proyectos_fx` | string | Proyectos de interés |
| `proyecto_activo_fx` | string | Proyecto activo |
| `autoriza_datos_fx` | booleancheckbox | Autorización datos personales |

**Propiedades de Deal (_fx):** ~25 propiedades (cotNumber, datos de comprador, datos de inmueble, datos financieros, URL del PDF, IDs Sinco). Copiar del portal demo.

**⚠️ Reglas críticas:**
- `groupName` SIEMPRE `"focux"` (minúsculas)
- Enumerations usan SLUG (`sala_de_ventas_fisica`), NO display name
- `booleancheckbox` en workflows requiere `IS_EQUAL_TO` + `BOOL` + value singular

```bash
# Crear property group
curl -X POST "https://api.hubapi.com/crm/v3/properties/contacts/groups" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"focux","label":"Focux Engine"}'

# Crear property
curl -X POST "https://api.hubapi.com/crm/v3/properties/contacts" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"cedula_fx","label":"Cédula","type":"string","fieldType":"text","groupName":"focux"}'
```

---

## Paso 7 — Configurar conector de Sinco

**Archivo:** `src/engine/index.ts` (o donde viva el `EnvSecretStore`)

Agregar las credenciales del nuevo client al secret store. El patrón de env vars:

```
SINCO_ACME_USERNAME=APICBR
SINCO_ACME_PASSWORD=<password_from_client>
```

**Verificar conectividad:**

```bash
curl "http://localhost:3000/api/engine/health?clientId=acme"
```

Debe retornar `erp.ok: true` y `crm.ok: true`.

---

## Paso 8 — Subir assets al CDN de HubSpot

Los assets del cotizador (renders, planos, logos) se suben al File Manager de HubSpot del portal del cliente.

**Estructura esperada:**

```
hubfs/<portalId>/assets/<clientSlug>/<projectSlug>/
├── render.png          (render principal del proyecto)
├── plano-tipo-a.png    (plano por tipología)
├── plano-tipo-b.png
└── logo.png            (logo del cliente para PDF)
```

Subir via HubSpot File Manager UI o API:

```bash
curl -X POST "https://api.hubapi.com/filemanager/api/v3/files/upload" \
  -H "Authorization: Bearer $HUBSPOT_ACME_PRIVATE_APP_TOKEN" \
  -F "file=@render.png" \
  -F "options={\"access\":\"PUBLIC_NOT_INDEXABLE\",\"folderPath\":\"assets/acme/project-name\"}"
```

**`PUBLIC_NOT_INDEXABLE`** — accesible por URL pero no indexado por Google. Decisión de data sovereignty: los assets viven en el portal del cliente, no en el nuestro.

Después de subir, actualizar el `overlay` en la config del client (Paso 3) con las URLs del CDN.

---

## Paso 9 — Configurar variables de entorno en Vercel

**⚠️ SIEMPRE usar `printf`, NUNCA `echo`** (ver `SETUP.md` §11).

```bash
# HubSpot token
printf 'pat-na1-...' | vercel env add HUBSPOT_ACME_PRIVATE_APP_TOKEN production

# Credenciales Sinco
printf 'APICBR' | vercel env add SINCO_ACME_USERNAME production
printf 'sinco_password_here' | vercel env add SINCO_ACME_PASSWORD production

# Secretos AUTH-1 (generar nuevos para cada cliente)
printf "$(openssl rand -hex 32)" | vercel env add HUBSPOT_CARD_LAUNCH_SECRET_ACME production

# Secreto de webhook (si write-back activo)
printf "$(openssl rand -hex 32)" | vercel env add WEBHOOK_SECRET_ACME production
```

---

## Paso 10 — Crear y desplegar App Card de HubSpot

Los archivos de la App Card NO viven en el repo Git — se crean en un proyecto HubSpot separado.

**Archivos necesarios (copiar de la App Card de Jiménez y adaptar):**

```
focux-quoter-card/
├── src/app/
│   ├── app.json                          ← Permisos y scopes
│   ├── extensions/
│   │   ├── QuoterCard.tsx               ← UI del card (sidebar contacto)
│   │   └── QuoterCard.json             ← Metadata del card (título, ubicación)
│   └── app.functions/
│       ├── launchQuoter.js              ← App Function (serverless)
│       └── launchQuoter.json            ← Metadata de la función
└── hsproject.json                        ← Proyecto HubSpot
```

**Cambios por cliente:**
1. `hsproject.json` → `accountId` del portal del cliente
2. `launchQuoter.js` → URL del Engine (`ENGINE_URL`), secreto del launch
3. `QuoterCard.tsx` → Texto del botón, branding si aplica

**Deploy:**

```bash
cd focux-quoter-card
npx hs project upload --account=<portalId>
```

---

## Paso 11 — Ejecutar sync inicial de inventario

```bash
# Sync completo (primera vez — puede tardar ~5min)
curl -X POST "https://engine.focux.co/api/engine/sync/inventory?clientId=acme&mode=full" \
  -H "Authorization: Bearer $CRON_SECRET"

# Verificar
curl "https://engine.focux.co/api/engine/inventory?clientId=acme" | jq '.macros | length'
```

**Configurar Vercel Cron** para sync automático diario:

**Archivo:** `vercel.json` — agregar entrada:

```json
{
  "crons": [
    {
      "path": "/api/engine/sync/inventory?clientId=acme&mode=prices",
      "schedule": "0 6 * * *"
    }
  ]
}
```

---

## Paso 12 — Verificación E2E

### 12a. Cotizador (acceso directo — modo demo)

Con `QUOTER_ALLOW_DIRECT_ACCESS=true`:

```
https://engine.focux.co/quoter?clientId=acme
```

Verificar:
- [ ] Inventario carga (macros, proyectos, unidades)
- [ ] Renders y planos se muestran
- [ ] Formulario de cotización funciona
- [ ] PDF se genera correctamente con branding del cliente
- [ ] Deal se crea en HubSpot con todas las propiedades `_fx`
- [ ] PDF se sube y adjunta al Deal

### 12b. Flujo AUTH-1 (App Card → Cotizador)

1. Abrir un contacto en HubSpot del portal del cliente
2. Verificar que el App Card aparece en el sidebar
3. Click "Abrir Cotizador"
4. Verificar que abre nueva pestaña con datos del buyer precargados
5. Verificar que el asesor es el Owner del contacto

### 12c. Auditoría

```bash
curl "https://engine.focux.co/api/engine/audit/inventory?clientId=acme" \
  -H "Authorization: Bearer $CRON_SECRET" | jq '.summary'
```

---

## Paso 13 — Checklist de salida a producción

| # | Ítem | Estado |
|---|------|--------|
| 1 | Cliente registrado en `clientRegistry.ts` | ☐ |
| 2 | Mapeo de portal en `quoterSession.ts` | ☐ |
| 3 | Config de quoter creada (`clientConfigs/acme.ts`) | ☐ |
| 4 | Config conectada en ruta de inventario | ☐ |
| 5 | Custom Objects creados en HubSpot | ☐ |
| 6 | Propiedades `_fx` creadas en Contacts y Deals | ☐ |
| 7 | Conector de Sinco configurado y health OK | ☐ |
| 8 | Assets subidos al CDN de HubSpot | ☐ |
| 9 | Env vars en Vercel (con `printf`) | ☐ |
| 10 | App Card desplegada | ☐ |
| 11 | Sync de inventario ejecutado y verificado | ☐ |
| 12 | E2E verificado (cotizador + AUTH-1 + deal + PDF) | ☐ |
| 13 | Cron configurado en `vercel.json` | ☐ |
| 14 | `QUOTER_REQUIRE_HUBSPOT_LAUNCH=true` (flip a prod) | ☐ |
| 15 | `QUOTER_ALLOW_DIRECT_ACCESS=false` (flip a prod) | ☐ |
| 16 | Output de debug removido de App Card | ☐ |
| 17 | Reporte de auditoría limpio (0 en cuarentena, 0 warnings) | ☐ |

---

## Errores comunes

| Error | Solución |
|-------|----------|
| `objectTypeIds` copiados del portal equivocado | Son únicos por portal. Siempre obtener con `GET /crm/v3/schemas` del portal correcto. |
| Env var con trailing `\n` | Siempre `printf`, nunca `echo`. Ver `SETUP.md` §11. |
| Propiedades no aparecen en HubSpot | Verificar `groupName: "focux"` (minúsculas exactas). |
| Valores de enum no matchean en workflows | Usar slug (`sala_de_ventas_fisica`), no display name. |
| Timeout en sync de primera corrida | Usar filtro: `?macroproyectoId=X` para sincronizar un macro a la vez. |
| App Card no aparece en sidebar | Verificar que el App Card está en `contact` location, no `deal`. Verificar scopes en `app.json`. |
| Asesor vacío en cotizador | El contacto no tiene Owner asignado en HubSpot. Asignar Owner primero. |

---

*Focux | www.focux.co | Documento confidencial*
