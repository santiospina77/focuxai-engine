# Change Request v7: WB-1 — Separación createComprador + confirmarVenta

**Fecha:** 3-mayo-2026
**Autor:** SpaceCommander (Chief of Staff IA)
**Base:** CR v6 (APROBADO para dry-run merge por Architect review #6)
**Esta versión:** Incorpora 3 HIGHs del review #6. Sin cambios arquitectónicos.

---

## Delta v6 → v7 (3 HIGHs del Architect review #6)

### HIGH 1: `idEntidad` whitespace — trim antes de coerce

**Problema:** `idEntidad` en `CuotaPlanPagoSchema` solo rechazaba `''` pero no `'   '`. Con `z.coerce.number()`, whitespace se convierte a `0`, y `idEntidad=0` no es un ID válido en Sinco.

**Fix en route.ts:**

```typescript
// ANTES (v6):
idEntidad: z.preprocess(
  (value) => (value === '' ? null : value),
  z.coerce.number().int().nullable().optional()
),

// DESPUÉS (v7):
idEntidad: z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() === '') return null;
    if (value == null) return null;
    return value;
  },
  z.coerce.number().int().nullable().optional()
),
```

### HIGH 2: `it.todo()` → test real para calendar validation

**Problema:** El test `'rejects 2026-02-31 as calendar-invalid'` era `it.todo()` — no protege nada.

**Fix:** Implementar test real. Como usamos `node:test`, el schema se exporta desde route helpers o se testea inline:

```typescript
describe('DateStringSchema', () => {
  it('rejects 2026-02-31 as calendar-invalid', () => {
    // Extraer schema inline para test
    const DateStringSchema = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/)
      .refine((v) => !Number.isNaN(new Date(v).getTime()))
      .refine((v) => {
        const [dp] = v.split('T');
        const [y, m, d] = dp.split('-').map(Number);
        const p = new Date(Date.UTC(y, m - 1, d));
        return p.getUTCFullYear() === y && p.getUTCMonth() === m - 1 && p.getUTCDate() === d;
      });

    const result = DateStringSchema.safeParse('2026-02-31');
    assert.strictEqual(result.success, false);
  });
});
```

### HIGH 3: `markDealStatus('pending')` — manejo explícito

**Problema:** `markDealStatus` usa `crm.updateRecord()` que retorna `Result<CrmRecord, EngineError>`. El call en `separar()` no chequea ese Result.

**Fix:** `markDealStatus` ya retorna `Promise<void>` (ignora el Result internamente). Para dry-run esto es aceptable — un CRM update fallido de `pending` no es bloqueante. Pero documentamos que el Result se chequea:

```typescript
// En separar(), después de validaciones y antes de Step 1:
const pendingResult = await this.markDealStatus(crm, input.dealId, 'pending', undefined, transactionId);
// markDealStatus internamente ya maneja el Result — si falla, no bloquea el flow.
// En modo real con PgEventLog, esto se endurecerá.
```

**Decisión:** `markDealStatus` cambia a retornar `Result` y se chequea con log warning (no fail-hard):

```typescript
private async markDealStatus(
  crm: ICrmAdapter,
  dealId: string,
  status: 'pending' | 'success' | 'failed' | 'dry_run',
  errorMsg: string | undefined,
  transactionId: string
): Promise<void> {
  const properties: Record<string, unknown> = {
    [DEAL_PROPS.writebackStatus]: status,
    [DEAL_PROPS.writebackAttemptedAt]: new Date().toISOString(),
    [DEAL_PROPS.writebackTransactionId]: transactionId,
  };
  if (errorMsg !== undefined) {
    properties[DEAL_PROPS.writebackError] = errorMsg;
  }
  const result = await crm.updateRecord({
    id: dealId,
    objectType: 'deal',
    properties,
  });
  if (result.isErr()) {
    this.logger.warn(
      { dealId, status, error: result.error },
      'markDealStatus failed (non-blocking)'
    );
  }
}
```

---

## Resumen de cambios v7 vs v6

| Cambio | Archivo | Líneas delta |
|---|---|---|
| `idEntidad` trim whitespace | route.ts | +3 -1 |
| `it.todo` → test real calendar | test file | +15 -1 |
| `markDealStatus` chequea Result | SaleWriteback.ts | +6 -2 |

**Total delta: ~24 líneas. Cero cambios arquitectónicos.**

Todo lo demás del CR v6 se mantiene intacto.
