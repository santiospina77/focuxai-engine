# Runbook: Add a New Project to the Cotizador

> **When:** Client launches a new tower/project and needs it in the cotizador.
> **Who:** Engineer with HubSpot access and Sinco credentials.
> **Time:** ~30min (if assets ready), ~2hrs (if typology rules needed).
> **Confidential** — Focux Digital Group S.A.S.

---

## Prerequisites

- Project already exists in Sinco ERP (client's responsibility)
- Renders and planos received from client (PNG format)
- Typology info: unit types, areas, bedrooms/bathrooms per type

---

## Step 1 — Verify Project in Sinco

```bash
# Descubrir proyectos disponibles
npm run discover:sinco
# Buscar el nuevo proyecto en el output — anotar IDs de Sinco
```

Si el proyecto no aparece, contactar al técnico del cliente (Leonardo para Jiménez).

---

## Step 2 — Run Inventory Sync

```bash
# Sync del macroproyecto específico
curl -X POST "https://engine.focux.co/api/engine/sync/inventory?clientId=jimenez_demo&mode=full&macroproyectoId=SINCO_ID" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Esto crea los Custom Objects (Proyecto, Unidades, Agrupaciones) en HubSpot.

---

## Step 3 — Upload Assets

Ver `runbooks/add-assets.md` para el proceso de subir renders y planos al CDN de HubSpot.

---

## Step 4 — Configure Typology Rules (si aplica)

Si el nuevo proyecto tiene tipologías diferentes a las existentes:

**File:** `src/engine/apps/quoter/inventory/clientConfigs/<client>.ts`

Agregar reglas de matching en `typologyRules`:

```typescript
typologyRules: [
  {
    projectName: 'Nuevo Proyecto',
    rules: [
      { pattern: /tipo.*a/i, tipologia: 'Tipo A', area: 65, habs: 3, banos: 2 },
      { pattern: /tipo.*b/i, tipologia: 'Tipo B', area: 48, habs: 2, banos: 1 },
    ],
  },
],
```

**⚠️ El matching es por área, NO por nombre.** Sinco NO trae alcobas/baños. Los nombres de tipología deben coincidir con los archivos del cliente. Ver `ARCHITECTURE.md` para detalles.

---

## Step 5 — Update Overlay (assets mapping)

**File:** `src/engine/apps/quoter/inventory/clientConfigs/<client>.ts`

Agregar el nuevo proyecto al overlay:

```typescript
overlay: {
  'nuevo-proyecto': {
    render: 'https://PORTAL.fs1.hubspotusercontent-na1.net/hubfs/PORTAL/assets/client/proyecto/render.png',
    planos: {
      'Tipo A': 'https://PORTAL.../plano-tipo-a.png',
      'Tipo B': 'https://PORTAL.../plano-tipo-b.png',
    },
  },
},
```

---

## Step 6 — Deploy & Verify

```bash
# Build
npm run build

# Push
git add -A && git commit -m "feat: add proyecto X for client Y" && git push origin main

# Verificar en cotizador
curl "https://engine.focux.co/api/engine/inventory?clientId=jimenez_demo" | jq '.macros[].projects[].name'
```

Abrir el cotizador y verificar que el nuevo proyecto aparece en el selector, con renders y planos correctos.

---

## Step 7 — Run Audit

```bash
curl "https://engine.focux.co/api/engine/audit/inventory?clientId=jimenez_demo" \
  -H "Authorization: Bearer $CRON_SECRET" | jq '.summary'
```

El audit debe reportar 0 quarantined y 0 warnings para el nuevo proyecto.

---

*Focux | www.focux.co | Documento confidencial*
