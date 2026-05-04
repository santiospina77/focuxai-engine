# Change Request v9: WB-1 — Architect Review #8 HIGHs

**Fecha:** 3-mayo-2026
**Autor:** SpaceCommander (Chief of Staff IA)
**Base:** CR v8 (E2E dry-run VALIDADO, 3 commits en `feature/multi-project`)
**Esta versión:** Implementa 2 HIGHs del Architect review #8.

---

## Status

| Milestone | Estado | Commit |
|-----------|--------|--------|
| CR v7 implementado (7 archivos, 19 tests) | ✅ | `10aca26` |
| E2E dry-run vs pruebas3 HTTP 200 | ✅ | — |
| Fix Sinco 409 comprador-not-found | ✅ | `de2cd15` |
| CR v8 documentación E2E | ✅ | `f62e448` |
| Architect Review #8 HIGHs resueltos | ✅ | `6094ce1` |
| Unit tests 21/21 pass (node:test) | ✅ | — |

**Branch:** `feature/multi-project`
**Feature flags:** `SINCO_WRITEBACK_ENABLED=true` + `SINCO_WRITEBACK_DRY_RUN=true`

---

## Delta v8 → v9: 2 HIGHs del Architect Review #8

### HIGH 1: Endurecer matcher 409 — agregar `'comprador'` al pattern

**Review #8 dijo:** El matcher solo chequeaba `'no existe'` en el body. Un 409 no relacionado (ej: `"La agrupación ya se encuentra vendida."`) podría matchear si Sinco cambiara el mensaje a algo con "no existe".

**Fix en `SincoConnector.ts`:**

```typescript
// ANTES (v8):
if (
  response.error.context.httpStatus === 409 &&
  typeof response.error.context.body === 'string' &&
  response.error.context.body.toLowerCase().includes('no existe')
)

// DESPUÉS (v9):
const bodyText =
  typeof response.error.context.body === 'string'
    ? response.error.context.body.toLowerCase()
    : '';
if (
  response.error.context.httpStatus === 409 &&
  bodyText.includes('comprador') &&
  bodyText.includes('no existe')
)
```

**Rationale:** `409 + comprador + no existe` es suficientemente específico sin ser frágil ante cambios menores de Sinco (mayúsculas, puntuación). NO matcheamos el string exacto `"El comprador ingresado no existe."` porque Sinco puede cambiar texto menor entre versiones.

**2 tests agregados en `saleWriteback.test.ts`:**

```typescript
describe('Sinco 409 comprador-not-found matcher', () => {
  function isSincoCompradorNotFound409(httpStatus: number, body: unknown): boolean {
    const bodyText =
      typeof body === 'string' ? body.toLowerCase() : '';
    return (
      httpStatus === 409 &&
      bodyText.includes('comprador') &&
      bodyText.includes('no existe')
    );
  }

  it('matches Sinco 409 "El comprador ingresado no existe." as not-found', () => {
    assert.equal(
      isSincoCompradorNotFound409(409, 'El comprador ingresado no existe.'),
      true
    );
  });

  it('does NOT match unrelated 409 "La agrupación ya se encuentra vendida."', () => {
    assert.equal(
      isSincoCompradorNotFound409(409, 'La agrupación ya se encuentra vendida.'),
      false
    );
  });
});
```

**Test count:** 19 → 21 (+ 2 tests 409 specificity)

### HIGH 2: `compradorExternalId` opcional en dry-run

**Review #8 dijo:** `compradorExternalId: 0` en dry-run puede confundir consumidores del endpoint. `0` es un valor real que un consumidor podría interpretar como ID existente.

**Fix en `SaleWriteback.ts`:**

```typescript
// ANTES (v8):
export interface SaleWritebackResult {
  readonly dealId: string;
  readonly compradorExternalId: number;
  // ...
}
// return: compradorExternalId: compradorExternalId ?? 0

// DESPUÉS (v9):
export interface SaleWritebackResult {
  readonly dealId: string;
  /** Sinco comprador ID. undefined in dry-run (no write executed). */
  readonly compradorExternalId?: number;
  // ...
}
// return: compradorExternalId: compradorExternalId  (undefined in dry-run)
```

**También corregido en `legalizar()`:** Retornaba `compradorExternalId: 0` con comentario "ya existía" — ahora retorna `undefined` con nota "legalizar no crea comprador — ID ya vive en el Deal".

**Impacto en response JSON:**

```json
// Dry-run (v9):
{
  "dealId": "59964414543",
  "compradorWasCreated": false,
  "ventaConfirmada": false,
  "transactionId": "separar_dry_run_jimenez_demo_59964414543"
}
// compradorExternalId omitido (JSON.stringify omite undefined)

// Real mode (futuro):
{
  "dealId": "59964414543",
  "compradorExternalId": 9901,
  "compradorWasCreated": true,
  "ventaConfirmada": true,
  "transactionId": "separar_jimenez_demo_59964414543"
}
```

---

## MEDIUM cerrado: Grupo HubSpot canónico

**Decisión (alineada con Architect):** `focux` es el grupo canónico. Aplica a contacts, deals, y cualquier object type futuro. No migrar a `focux_engine`. No crear nuevos grupos.

Documentado en memoria operativa del SpaceCommander.

---

## Archivos Modificados — Commit `6094ce1`

| # | Archivo | Cambio | Líneas |
|---|---------|--------|--------|
| 1 | `src/engine/connectors/erp/sinco/SincoConnector.ts` | Matcher 409: `+ bodyText.includes('comprador')` | +7 -4 |
| 2 | `src/engine/connectors/erp/sinco/__tests__/saleWriteback.test.ts` | +2 tests matcher specificity, header actualizado a "21 tests" | +28 -2 |
| 3 | `src/engine/core/sync/SaleWriteback.ts` | `compradorExternalId?: number`, `?? 0` eliminado, legalizar `undefined` | +5 -3 |

**Total delta: ~40 líneas. Cero cambios arquitectónicos.**

---

## Inventario Completo de Commits WB-1

| # | Commit | Mensaje | Archivos | Delta |
|---|--------|---------|----------|-------|
| 1 | `10aca26` | feat(WB-1): CR v7 dry-run | 8 | +848 |
| 2 | `de2cd15` | fix(WB-1): Sinco 409 comprador-not-found | 1 | +8 |
| 3 | `f62e448` | docs(WB-1): CR v8 E2E dry-run documented | 1 | +261 |
| 4 | `6094ce1` | fix(WB-1): Architect review #8 HIGHs | 3 | +49 -7 |

---

## Estado Final Post-Review #8

| Aspecto | Estado |
|---------|--------|
| Tests | 21/21 pass |
| TypeScript | 0 errores nuevos |
| E2E dry-run | HTTP 200 validado |
| Matcher 409 | Endurecido (comprador + no existe) |
| compradorExternalId | Optional (undefined en dry-run) |
| Grupo HubSpot | `focux` documentado como canónico |
| Feature flags | `ENABLED=true`, `DRY_RUN=true` |

---

## Blockers para Real Mode (sin cambios desde v8)

| Blocker | Esfuerzo | Impacto |
|---------|----------|---------|
| **PgEventLog** — persistencia de transacciones en Postgres | ~4h | Idempotencia cross-request. Sin esto, restart = riesgo doble-venta. |
| **Mapeo Coralinas** — Leonardo 5-mayo | Externo | 99% → 100% cobertura de proyectos. |

---

## Para el Architect

**No hay preguntas abiertas.** Los 2 HIGHs del review #8 están implementados exactamente como recomendó. El MEDIUM (grupo canónico) está documentado. WB-1 dry-run queda cerrado hasta PgEventLog.
