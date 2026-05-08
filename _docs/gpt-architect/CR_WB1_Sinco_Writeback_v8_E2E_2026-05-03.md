# Change Request v8: WB-1 — Post E2E Dry-Run Update

**Fecha:** 3-mayo-2026
**Autor:** SpaceCommander (Chief of Staff IA)
**Base:** CR v7 (APROBADO por Architect review #6, implementado + commiteado)
**Esta versión:** Documenta hallazgos del E2E dry-run contra Sinco pruebas3 + fixes aplicados.

---

## Status

| Milestone | Estado | Commit |
|-----------|--------|--------|
| CR v7 implementado (7 archivos, 19 tests) | ✅ | `10aca26` |
| Unit tests 19/19 pass (node:test) | ✅ | — |
| TypeScript 0 errores nuevos | ✅ | — |
| E2E dry-run vs pruebas3 HTTP 200 | ✅ | — |
| Fix Sinco 409 comprador-not-found | ✅ | `de2cd15` |
| HubSpot props demo (51256354) | ✅ 4/4 | — |
| HubSpot props producción | ✅ 4/4 | — |

**Branch:** `feature/multi-project`
**Feature flags:** `SINCO_WRITEBACK_ENABLED=false` + `SINCO_WRITEBACK_DRY_RUN=true`

---

## Delta v7 → v8: Hallazgos E2E Dry-Run

### FIX 1 (CRITICAL): Sinco HTTP 409 = comprador no existe

**Descubierto:** E2E dry-run contra pruebas3 con CC 99999999.

**Problema:** `SincoConnector.getCompradorByIdentificacion()` solo manejaba `ERP_RESOURCE_NOT_FOUND` (HTTP 404) como "comprador no existe". Sinco devuelve **HTTP 409** con body `"El comprador ingresado no existe."` — un quirk de su API.

**Impacto sin fix:** El flujo trataba "comprador no existe" como error fatal en vez de trigger para crearlo. Todo WB-1 fallaba en Step 1.

**Fix en `SincoConnector.ts`:**

```typescript
if (response.isErr()) {
  // 404 = comprador no existe → no es error, retornamos null.
  if (response.error.code === 'ERP_RESOURCE_NOT_FOUND') {
    return ok(null);
  }
  // Sinco quirk: devuelve 409 (no 404) con "no existe" para compradores inexistentes.
  if (
    response.error.context.httpStatus === 409 &&
    typeof response.error.context.body === 'string' &&
    response.error.context.body.toLowerCase().includes('no existe')
  ) {
    return ok(null);
  }
  return err(response.error);
}
```

**Commit:** `de2cd15`

### FIX 2 (CONFIG): HubSpot properties faltantes

**Descubierto:** E2E dry-run — CRM update al deal retornaba 400 con 4 errores.

**Problema:** 3 propiedades no existían + 1 opción faltaba en `writeback_status_fx`.

**Propiedades creadas (grupo `focux` en ambos portales):**

| Propiedad | Tipo | Portal Demo | Portal Prod |
|-----------|------|-------------|-------------|
| `writeback_error_fx` | string/text | ✅ Creada | ✅ Creada |
| `writeback_attempted_at_fx` | datetime/date | ✅ Creada | ✅ Creada |
| `writeback_transaction_id_fx` | string/text | ✅ Creada | ✅ Creada |
| `writeback_status_fx` += `dry_run` | PATCH opciones | ✅ Patcheada | ✅ Patcheada |

**Nota:** El grupo de propiedades deals en ambos portales es `focux` (no `focux_engine`). El Adapter lo creó así originalmente.

---

## E2E Dry-Run — Flujo Completo Validado

**Endpoint:** `POST /api/engine/sale/separar`
**Target:** Sinco pruebas3 (`pruebas3.sincoerp.com/SincoJimenez_Nueva_PRBINT/V3`)
**Deal:** `59964414543` (portal demo 51256354)
**Comprador:** CC 99999999 (test del Sinco Lab, no existe en Sinco)

**Payload de prueba:**
```json
{
  "clientId": "jimenez_demo",
  "dealId": "59964414543",
  "comprador": {
    "tipoPersona": "NATURAL",
    "tipoIdentificacion": "CC",
    "numeroIdentificacion": "99999999",
    "primerNombre": "Prueba",
    "primerApellido": "DryRun",
    "correo": "prueba@test.com",
    "celular": "3001234567",
    "genero": "M",
    "ingresoPromedioMensual": 5000000,
    "idCiudadResidencia": 902
  },
  "venta": {
    "idAgrupacionSinco": 6412,
    "idProyectoSinco": 276,
    "fecha": "2026-05-03T12:00:00Z",
    "tipoVenta": "CREDITO",
    "valorDescuento": 0,
    "valorDescuentoFinanciero": 0,
    "planPagos": [
      { "idConcepto": 0, "fecha": "2026-05-03", "valor": 5000000, "numeroCuota": 1 },
      { "idConcepto": 1, "fecha": "2026-06-03", "valor": 15000000, "numeroCuota": 1, "idEntidad": 42 }
    ]
  }
}
```

**Response (HTTP 200):**
```json
{
  "dealId": "59964414543",
  "compradorExternalId": 0,
  "compradorWasCreated": false,
  "ventaConfirmada": false,
  "transactionId": "separar_dry_run_jimenez_demo_59964414543"
}
```

**Steps ejecutados:**

| # | Step | Acción | Resultado |
|---|------|--------|-----------|
| 1 | Zod validation | Schema strict parse | ✅ Pass |
| 2 | Feature flag gate | `SINCO_WRITEBACK_ENABLED=true` | ✅ Pass |
| 3 | Idempotency check | InMemoryEventLog.hasSucceeded | ✅ Pass (first run) |
| 4 | Participation validation | 100% principal, 0% alternos | ✅ Pass |
| 5 | idConcepto=0 check | planPagos[0].idConcepto === 0 | ✅ Pass |
| 6 | markDealStatus('pending') | HubSpot PATCH deal | ✅ Non-blocking |
| 7 | Sinco lookup | GET /Compradores/NumeroIdentificacion/99999999 | ✅ 409 → null (fix v8) |
| 8 | DRY-RUN createComprador | Skipped (log only) | ✅ Skipped |
| 9 | DRY-RUN confirmarVenta | Skipped (log only) | ✅ Skipped |
| 10 | CRM update deal | PATCH writeback_status_fx=dry_run | ✅ Success |
| 11 | EventLog succeed | InMemoryEventLog | ✅ Recorded |

---

## Archivos Modificados — Inventario Completo

### Commit `10aca26` — feat(WB-1): CR v7 dry-run

| # | Archivo | Cambio | Líneas |
|---|---------|--------|--------|
| 1 | `src/engine/connectors/erp/sinco/types.ts` | `SincoConfirmacionVentaBody` Swagger-aligned (`idAgrupacion` NOT `idVenta`, `numeroIdentificacionComprador`, `idHubspot`, `idMedioPublicitario`). `SincoCreateCompradorBody` +7 financial defaults + `ingresoPromedioMensual` + `idCiudadResidencia`. Pure body builders: `buildSincoCompradorBody()` + `buildSincoConfirmacionBody()`. | ~+120 |
| 2 | `src/engine/connectors/erp/sinco/SincoConnector.ts` | `createComprador()` y `confirmarVenta()` usan pure body builders. Imports limpiados (removed inline mappers). | ~+5 -30 |
| 3 | `src/engine/interfaces/IErpConnector.ts` | `CompradorInput` +`ingresoPromedioMensual?: number` +`idCiudadResidencia?: number \| null` | +2 |
| 4 | `src/engine/core/errors/EngineError.ts` | +4 error codes: `ERP_FEATURE_DISABLED`, `BUSINESS_INVALID_PARTICIPATION`, `BUSINESS_MISSING_SEPARACION_CONCEPTO`, `BUSINESS_MISSING_COMPRADOR_ID` | +4 |
| 5 | `src/engine/core/sync/SaleWriteback.ts` | `separar()` rewrite: feature flags, participation validation (epsilon), idConcepto=0 check, dry-run gates, `eventLog.succeed()` before CRM, `handleFailureBestEffort()` pattern. `legalizar()` updated con mismo pattern. `markDealStatus()` chequea Result (v7 HIGH 3). | ~+350 -200 |
| 6 | `src/app/api/engine/sale/separar/route.ts` | Complete rewrite: `RequiredNumberSchema`, `OptionalNumberSchema`, `DateStringSchema` (calendar + time validation), `CuotaPlanPagoSchema` (idEntidad whitespace trim v7 HIGH 1), `SeparacionRequestSchema` (.strict()). Explicit field mapping from Zod output to `SeparacionInput`. | ~+200 -30 |
| 7 | `src/engine/connectors/erp/sinco/__tests__/saleWriteback.test.ts` | NEW: 19 tests (node:test + node:assert). 4 buildSincoCompradorBody + 11 buildSincoConfirmacionBody + 3 DateStringSchema (v7 HIGH 2) + 1 RequiredNumberSchema whitespace. | +226 |
| 8 | `_docs/gpt-architect/CR_WB1_Sinco_Writeback_v7_2026-05-03.md` | NEW: CR documentation v7 delta. | +121 |

### Commit `de2cd15` — fix(WB-1): Sinco 409 comprador-not-found

| # | Archivo | Cambio | Líneas |
|---|---------|--------|--------|
| 1 | `src/engine/connectors/erp/sinco/SincoConnector.ts` | Handle HTTP 409 + "no existe" as null (not error). | +8 |

---

## Interfaces Clave (referencia rápida)

### SeparacionInput (route → SaleWriteback)
```typescript
interface SeparacionInput {
  clientId: string;
  dealId: string;
  comprador: {
    tipoPersona: 'NATURAL' | 'JURIDICA';
    tipoIdentificacion: TipoIdentificacion; // 'CC' | 'CE' | 'NIT' | 'PASAPORTE' | 'TI'
    numeroIdentificacion: string;
    primerNombre?: string;
    segundoNombre?: string;
    primerApellido?: string;
    segundoApellido?: string;
    correo?: string;
    celular?: string;
    direccion?: string;
    genero?: 'M' | 'F' | 'O';
    ingresoPromedioMensual?: number;
    idCiudadResidencia?: number | null;
  };
  venta: {
    idAgrupacionSinco: number;
    idProyectoSinco: number;
    fecha: Date;
    tipoVenta: TipoVenta; // 'CONTADO' | 'CREDITO' | 'CREDITO_TERCEROS' | 'LEASING'
    valorDescuento: number;
    valorDescuentoFinanciero: number;
    idAsesor?: number;
    planPagos: PlanPagoCuota[];
  };
  compradoresAlternos?: { numeroIdentificacion: string; porcentajeParticipacion: number; }[];
}
```

### SaleWritebackResult (SaleWriteback → route)
```typescript
interface SaleWritebackResult {
  dealId: string;
  compradorExternalId: number;   // 0 in dry-run
  compradorWasCreated: boolean;  // false in dry-run
  ventaConfirmada: boolean;      // false in dry-run
  transactionId: string;         // "separar_dry_run_{clientId}_{dealId}"
}
```

### HubSpot Deal Properties (WB-1)
```
writeback_status_fx:         pendiente | comprador_creado | agrupacion_creada | venta_confirmada | error | dry_run
writeback_error_fx:          string (error message, empty on success)
writeback_attempted_at_fx:   datetime (ISO string)
writeback_transaction_id_fx: string (separar_{mode}_{clientId}_{dealId})
id_comprador_sinco_fx:       number (Sinco comprador externalId) — only in real mode
id_venta_sinco_fx:           number (Sinco agrupación ID) — only in real mode
```

---

## Blockers para Activar Real Mode

| Blocker | Esfuerzo | Impacto |
|---------|----------|---------|
| **PgEventLog** — persistencia de transacciones en Postgres | ~4h | Idempotencia cross-request. Sin esto, reiniciar el server resetea el InMemoryEventLog → riesgo de doble-venta. |
| **Mapeo Coralinas** — Leonardo 5-mayo | Externo | 99% → 100% cobertura de proyectos. |

---

## Arquitectura de Seguridad

```
SINCO_WRITEBACK_ENABLED=false  →  Endpoint retorna 422 "feature disabled"
SINCO_WRITEBACK_ENABLED=true
  SINCO_WRITEBACK_DRY_RUN=true   →  Valida todo, GET real a Sinco, NO escribe
  SINCO_WRITEBACK_DRY_RUN=false  →  BLOQUEADO hasta PgEventLog

Cadena de protección (modo real):
  1. EventLog.hasSucceeded()     → previene doble-ejecución
  2. EventLog.begin()            → write-ahead log
  3. Sinco createComprador       → idempotente por cédula (409 si existe)
  4. Sinco confirmarVenta        → PUT idempotente por agrupación
  5. EventLog.succeed()          → INMEDIATAMENTE después de Sinco (antes de CRM)
  6. CRM updateRecord            → si falla, Sinco ya está protegido
  7. handleFailureBestEffort     → nunca enmascara error original
```

---

## Para el Architect

**Review request:** Validar el fix del 409 en `SincoConnector.ts` (commit `de2cd15`). Es un pattern matching defensivo contra un quirk de Sinco API — solo matchea `httpStatus === 409` + body contiene "no existe". ¿Es suficientemente específico o debería matchear el string exacto `"El comprador ingresado no existe."`?

**Pregunta abierta:** El grupo de propiedades deal en HubSpot es `focux` (no `focux_engine` como en contacts). ¿Documentar como estándar o alinear a un solo nombre?
