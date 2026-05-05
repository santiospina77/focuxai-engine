/**
 * WB-5: Build planPagos[] from flat Deal properties.
 *
 * Pure function. No CRM calls. All parsers return Result — zero fail-silent.
 * Dates use parseStrictHubSpotDate (v6 calendar validation).
 * Concepts are per-client (lab-validated IDs).
 *
 * Contract: IErpConnector.ts PlanPagoCuota { idConcepto, fecha: Date, valor, numeroCuota, idEntidad?: number }
 */

import { type Result, ok, err } from '../types/Result';
import { EngineError, BusinessError, WebhookValidationError } from '../errors/EngineError';
import type { PlanPagoCuota } from '@/engine/interfaces/IErpConnector';

// ============================================================================
// Payment concept config per-client (lab-validated)
// ============================================================================

interface PaymentConceptConfig {
  readonly separacion: number;
  readonly cuotaInicial: number;
  readonly cuotasMensuales: number;
  readonly saldoFinal: number;
}

/**
 * Lab evidence:
 * - All 4 concepts validated 2026-05-02 via WB-1 E2E against Sinco sandbox.
 * - Swagger: PlanPagoDetalleConfirmacionVenta.idConcepto matches.
 */
const PAYMENT_CONCEPTS_BY_CLIENT: Record<string, PaymentConceptConfig> = {
  jimenez_demo: { separacion: 0, cuotaInicial: 1, cuotasMensuales: 2, saldoFinal: 3 },
  jimenez_prod: { separacion: 0, cuotaInicial: 1, cuotasMensuales: 2, saldoFinal: 3 },
};

// ============================================================================
// Parsers (fail-hard, v6 strict)
// ============================================================================

/**
 * Required money field. Missing → error. Present but non-numeric/negative → error.
 */
function parseRequiredMoney(
  field: string,
  value: string | null | undefined
): Result<number, EngineError> {
  if (value === null || value === undefined || value.trim() === '') {
    return err(WebhookValidationError.missingField(field));
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return err(WebhookValidationError.invalidValue(field, `must be non-negative number, got: ${value}`));
  }
  return ok(n);
}

/**
 * Optional money field. Missing/empty → null. Present but invalid → error.
 */
function parseOptionalMoney(
  field: string,
  value: string | null | undefined
): Result<number | null, EngineError> {
  if (value === null || value === undefined || value.trim() === '') return ok(null);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return err(WebhookValidationError.invalidValue(field, `must be non-negative number, got: ${value}`));
  }
  return ok(n);
}

/**
 * v6: For integer count fields (numero_de_cuotas, etc.)
 * Missing/empty → null (absent). Present → must be positive integer.
 * "0", "-1", "1.5", "abc" → ERROR.
 */
function parseOptionalPositiveInt(
  field: string,
  value: string | null | undefined
): Result<number | null, EngineError> {
  if (value === null || value === undefined || value.trim() === '') {
    return ok(null);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return err(WebhookValidationError.invalidValue(
      field,
      `must be positive integer when present, got: ${value}`
    ));
  }
  return ok(n);
}

/**
 * Optional numeric ID. Missing → undefined. Present but invalid → error.
 */
function parseOptionalNumericId(
  field: string,
  value: string | null | undefined
): Result<number | undefined, EngineError> {
  if (value === null || value === undefined || value.trim() === '') return ok(undefined);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    return err(WebhookValidationError.invalidValue(field, `must be non-negative integer, got: ${value}`));
  }
  return ok(n);
}

/**
 * v6: Strict date parser for HubSpot date properties.
 *
 * Accepts:
 * - YYYY-MM-DD (HubSpot date picker format)
 * - ISO 8601 datetime (YYYY-MM-DDTHH:mm:ss.sssZ)
 * - Unix milliseconds as string (HubSpot internal format for some date props)
 *
 * Rejects:
 * - Impossible calendar dates (2026-02-31, 2026-13-01)
 * - Ambiguous formats (MM/DD/YYYY, DD-MM-YYYY)
 * - Empty/null/undefined
 */
function parseStrictHubSpotDate(
  field: string,
  value: string | null | undefined
): Result<Date, EngineError> {
  if (!value || value.trim() === '') {
    return err(WebhookValidationError.missingField(field));
  }

  const trimmed = value.trim();

  // Try Unix milliseconds (HubSpot sometimes sends dates as ms since epoch)
  if (/^\d{13}$/.test(trimmed)) {
    const d = new Date(Number(trimmed));
    if (!Number.isNaN(d.getTime())) return ok(d);
    return err(WebhookValidationError.invalidValue(field, `Invalid timestamp: ${value}`));
  }

  // Try YYYY-MM-DD or ISO 8601
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!isoMatch) {
    return err(WebhookValidationError.invalidValue(field, `Expected YYYY-MM-DD or ISO 8601, got: ${value}`));
  }

  const [, yearStr, monthStr, dayStr] = isoMatch;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  // Calendar validation
  if (month < 1 || month > 12) {
    return err(WebhookValidationError.invalidValue(field, `Invalid month ${month} in: ${value}`));
  }

  const maxDay = new Date(year, month, 0).getDate(); // last day of month
  if (day < 1 || day > maxDay) {
    return err(WebhookValidationError.invalidValue(field, `Invalid day ${day} for month ${month} in: ${value}`));
  }

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return err(WebhookValidationError.invalidValue(field, `Could not parse date: ${value}`));
  }

  return ok(d);
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Builds planPagos from EXPLICIT Deal properties.
 *
 * Rules:
 * - ALL dates come from Deal props as Date (never computed from "now").
 * - Concepts from per-client config. Fail-hard if no config.
 * - Present-but-invalid values = error (never fail-silent).
 * - Returns readonly PlanPagoCuota[] matching IErpConnector.ts contract.
 */
export function buildPlanPagosFromDealProps(
  dealProps: Readonly<Record<string, unknown>>,
  clientId: string
): Result<readonly PlanPagoCuota[], EngineError> {

  // --- Config lookup ---
  const concepts = PAYMENT_CONCEPTS_BY_CLIENT[clientId];
  if (!concepts) {
    return err(BusinessError.missingPaymentPlanConfig(clientId));
  }

  // Helper to safely get string from props
  const prop = (key: string): string | null | undefined => {
    const v = dealProps[key];
    if (v === null || v === undefined) return null;
    return String(v);
  };

  // --- Separación (OBLIGATORIA) ---
  const separacionValor = parseRequiredMoney('valor_separacion_fx', prop('valor_separacion_fx'));
  if (separacionValor.isErr()) return err(separacionValor.error);

  const separacionFecha = parseStrictHubSpotDate('separacion_fecha_fx', prop('separacion_fecha_fx'));
  if (separacionFecha.isErr()) return err(separacionFecha.error);

  const cuotas: PlanPagoCuota[] = [];

  cuotas.push({
    idConcepto: concepts.separacion,
    fecha: separacionFecha.value,
    valor: separacionValor.value,
    numeroCuota: 1,
  });

  // --- Cuota inicial (OPCIONAL: present if valor > 0) ---
  const cuotaInicialValor = parseOptionalMoney('valor_cuota_inicial_fx', prop('valor_cuota_inicial_fx'));
  if (cuotaInicialValor.isErr()) return err(cuotaInicialValor.error);

  if (cuotaInicialValor.value !== null && cuotaInicialValor.value > 0) {
    const cuotaInicialFecha = parseStrictHubSpotDate(
      'cuota_inicial_fecha_fx',
      prop('cuota_inicial_fecha_fx')
    );
    if (cuotaInicialFecha.isErr()) return err(cuotaInicialFecha.error);

    cuotas.push({
      idConcepto: concepts.cuotaInicial,
      fecha: cuotaInicialFecha.value,
      valor: cuotaInicialValor.value,
      numeroCuota: 1,
    });
  }

  // --- Cuotas mensuales (v6: parseOptionalPositiveInt for numero_de_cuotas) ---
  const cuotaMensualValor = parseOptionalMoney('valor_cuota_mensual_fx', prop('valor_cuota_mensual_fx'));
  if (cuotaMensualValor.isErr()) return err(cuotaMensualValor.error);

  const numeroCuotas = parseOptionalPositiveInt('numero_de_cuotas_fx', prop('numero_de_cuotas_fx'));
  if (numeroCuotas.isErr()) return err(numeroCuotas.error);

  const hasMensualValor = cuotaMensualValor.value !== null && cuotaMensualValor.value > 0;
  const hasNumeroCuotas = numeroCuotas.value !== null;

  if (hasMensualValor && hasNumeroCuotas) {
    const cuotaMensualFecha = parseStrictHubSpotDate(
      'cuotas_mensuales_fecha_fx',
      prop('cuotas_mensuales_fecha_fx')
    );
    if (cuotaMensualFecha.isErr()) return err(cuotaMensualFecha.error);

    const idEntidad = parseOptionalNumericId('id_entidad_financiera_fx', prop('id_entidad_financiera_fx'));
    if (idEntidad.isErr()) return err(idEntidad.error);

    cuotas.push({
      idConcepto: concepts.cuotasMensuales,
      fecha: cuotaMensualFecha.value,
      valor: cuotaMensualValor.value!,
      numeroCuota: numeroCuotas.value!,
      idEntidad: idEntidad.value,
    });
  } else if (hasMensualValor !== hasNumeroCuotas) {
    return err(WebhookValidationError.invalidValue(
      'cuotas_mensuales',
      'valor_cuota_mensual_fx and numero_de_cuotas_fx must both be present or both absent'
    ));
  }

  // --- Saldo final (OPCIONAL: present if valor > 0) ---
  const saldoFinalValor = parseOptionalMoney('saldo_final_fx', prop('saldo_final_fx'));
  if (saldoFinalValor.isErr()) return err(saldoFinalValor.error);

  if (saldoFinalValor.value !== null && saldoFinalValor.value > 0) {
    const saldoFinalFecha = parseStrictHubSpotDate('saldo_fecha_fx', prop('saldo_fecha_fx'));
    if (saldoFinalFecha.isErr()) return err(saldoFinalFecha.error);

    const idEntidad = parseOptionalNumericId('id_entidad_financiera_fx', prop('id_entidad_financiera_fx'));
    if (idEntidad.isErr()) return err(idEntidad.error);

    cuotas.push({
      idConcepto: concepts.saldoFinal,
      fecha: saldoFinalFecha.value,
      valor: saldoFinalValor.value,
      numeroCuota: 1,
      idEntidad: idEntidad.value,
    });
  }

  return ok(cuotas);
}
