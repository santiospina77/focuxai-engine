# Runbook: Write-Back Operations (Sinco)

> **When:** Debugging separar/legalizar failures, monitoring write-back health.
> **Who:** Engineer with Sinco knowledge and admin access.
> **⚠️ CAUTION:** Write-back modifica datos en producción de Sinco. Usar dry-run siempre primero.
> **Confidential** — Focux Digital Group S.A.S.

---

## Overview

Write-back = sincronización de Engine → Sinco ERP. Dos operaciones:

| Operation | Trigger | What it does in Sinco |
|-----------|---------|----------------------|
| **Separar** | HubSpot workflow (Deal stage change) | Crea comprador + registra venta con plan de pagos |
| **Legalizar** | HubSpot workflow (Deal stage change) | Confirma la venta legalmente |

**Flujo:** HubSpot workflow → POST webhook → Engine validates → builds payload → calls Sinco API → logs result.

---

## Feature Flags

| Variable | Default | Effect |
|----------|---------|--------|
| `SINCO_WRITEBACK_ENABLED` | `false` | `false` = bloquea toda escritura. Ningún request llega a Sinco. |
| `SINCO_WRITEBACK_DRY_RUN` | `true` | `true` = logea payload sin ejecutar. Útil para verificar data shape. |

**Para activar write-back en producción:**

```bash
printf 'true' | vercel env add SINCO_WRITEBACK_ENABLED production
printf 'false' | vercel env add SINCO_WRITEBACK_DRY_RUN production
```

---

## Idempotency

Cada operación genera un `transactionId` único (`{operation}:{dealId}:{timestamp}`). El `PgEventLog` previene ejecuciones duplicadas.

Si un webhook se envía dos veces (retry de HubSpot), la segunda ejecución retorna el resultado de la primera sin re-ejecutar.

**Tabla:** `pg_event_log` — migration `005_event_log.sql`.

---

## Debugging a Failed Write-Back

### Step 1 — Identify the failure

Buscar en Vercel Runtime Logs:

```
Vercel Dashboard → focuxai-engine → Deployments → [latest] → Runtime Logs
Filter: "writeback" or "separar" or "legalizar"
```

### Step 2 — Check webhook auth

```bash
# Verify webhook secret
curl -X POST "https://engine.focux.co/api/engine/sale/separar-webhook/jimenez_demo" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WEBHOOK_SECRET_JIMENEZ_DEMO" \
  -d '{"dealId":"test","operation":"separar"}'
# Should return 400 (invalid deal) not 401 (auth failure)
```

### Step 3 — Check Deal data

El webhook receiver carga el Deal de HubSpot y extrae los datos necesarios. Si faltan propiedades `_fx`:

```bash
curl "https://api.hubapi.com/crm/v3/objects/deals/DEAL_ID?properties=nombre_comprador_fx,cedula_comprador_fx,..." \
  -H "Authorization: Bearer $HUBSPOT_TOKEN" | jq '.properties'
```

### Step 4 — Test with dry-run

Con `SINCO_WRITEBACK_DRY_RUN=true`, enviar el webhook real y verificar el payload logueado sin tocar Sinco.

### Step 5 — Sinco-specific issues

| Error | Cause | Fix |
|-------|-------|-----|
| **409** from createComprador | Comprador ya existe en Sinco | Normal — Engine maneja 409 como "comprador found" |
| **401** from Sinco | Token expirado | El `SincoAuthManager` auto-renueva. Si persiste, verificar credenciales. |
| **400** with field errors | Tipo de dato incorrecto | Sinco es .NET: `viviendaPropia` = Byte(0/1), `discapacidad` = Boolean, `idCiudadResidencia` ≠ null, fechas ISO. |
| **Timeout** | Sinco lento | maxDuration es 60s. Si Sinco tarda más, la función aborta. |

---

## Manual Write-Back (bypass webhook)

**⚠️ Solo para testing/debug. En producción, el trigger es siempre vía HubSpot workflow.**

```bash
# Dry run
curl -X POST "https://engine.focux.co/api/engine/sale/separar" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "jimenez_demo",
    "dealId": "12345",
    "writebackReady": false,
    "comprador": { ... },
    "venta": { ... }
  }'
```

---

## Sinco Authentication Flow

1. `SincoAuthManager` → POST `/Authentication` con username + password
2. Recibe token JWT (expira en ~1hr)
3. Token cacheado in-memory
4. Si 401 en cualquier request → invalidar cache → re-authenticate → retry una vez

**Credenciales:** `SINCO_<CLIENT>_USERNAME` + `SINCO_<CLIENT>_PASSWORD`

---

## Monitoring

No hay dashboard dedicado todavía. Monitoreo manual:

```bash
# Health check (incluye latencia de Sinco)
curl "https://engine.focux.co/api/engine/health?clientId=jimenez_demo" | jq '.erp'

# Event log (via DB query)
# psql → SELECT * FROM pg_event_log ORDER BY created_at DESC LIMIT 20;
```

---

*Focux | www.focux.co | Documento confidencial*
