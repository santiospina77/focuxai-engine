/**
 * WB-5: Build SeparacionInput from HubSpot Deal + Contact data.
 *
 * Pure function. No CRM calls. All parsers return Result — zero fail-silent.
 * Exact match: SaleWriteback.ts:57-102 (SeparacionInput interface).
 *
 * v6 changes:
 * - primerNombre and primerApellido are REQUIRED (Sinco needs them)
 * - parseStrictHubSpotDate shared with buildPlanPagosFromDealProps
 */

import { buildPlanPagosFromDealProps } from './buildPlanPagosFromDealProps';
import { type Result, ok, err } from '../types/Result';
import { EngineError, WebhookValidationError } from '../errors/EngineError';
import type { SeparacionInput } from './SaleWriteback';
import type { TipoIdentificacion, TipoVenta } from '@/engine/interfaces/IErpConnector';
import type { CrmRecord } from '@/engine/interfaces/ICrmAdapter';

// ============================================================================
// Enum parsers — ALL return Result, NONE fail-silent
// ============================================================================

const VALID_TIPO_PERSONA = ['NATURAL', 'JURIDICA'] as const;
type TipoPersona = (typeof VALID_TIPO_PERSONA)[number];

const VALID_TIPO_IDENTIFICACION: readonly TipoIdentificacion[] = ['CC', 'CE', 'NIT', 'PASAPORTE', 'TI'];
const VALID_TIPO_VENTA: readonly TipoVenta[] = ['CONTADO', 'CREDITO', 'CREDITO_TERCEROS', 'LEASING'];
const VALID_GENERO = ['M', 'F', 'O'] as const;
type Genero = (typeof VALID_GENERO)[number];

function parseTipoPersona(value: string | null | undefined): Result<TipoPersona, EngineError> {
  if (!value || value.trim() === '') return err(WebhookValidationError.missingField('tipo_persona_fx'));
  const upper = value.toUpperCase().trim();
  if (VALID_TIPO_PERSONA.includes(upper as TipoPersona)) return ok(upper as TipoPersona);
  return err(WebhookValidationError.invalidValue('tipo_persona_fx', `Expected NATURAL|JURIDICA, got: ${value}`));
}

function parseTipoIdentificacion(value: string | null | undefined): Result<TipoIdentificacion, EngineError> {
  if (!value || value.trim() === '') return err(WebhookValidationError.missingField('tipo_identificacion_fx'));
  const upper = value.toUpperCase().trim();
  if (VALID_TIPO_IDENTIFICACION.includes(upper as TipoIdentificacion)) return ok(upper as TipoIdentificacion);
  return err(WebhookValidationError.invalidValue('tipo_identificacion_fx', `Expected CC|CE|NIT|PASAPORTE|TI, got: ${value}`));
}

function parseTipoVenta(value: string | null | undefined): Result<TipoVenta, EngineError> {
  if (!value || value.trim() === '') return err(WebhookValidationError.missingField('tipo_venta_fx'));
  const upper = value.toUpperCase().trim();
  if (VALID_TIPO_VENTA.includes(upper as TipoVenta)) return ok(upper as TipoVenta);
  return err(WebhookValidationError.invalidValue('tipo_venta_fx', `Expected CONTADO|CREDITO|CREDITO_TERCEROS|LEASING, got: ${value}`));
}

/**
 * Genero: optional field, but if PRESENT must be valid.
 * Missing/empty → ok(undefined). Present + invalid → error.
 */
function parseGenero(value: string | null | undefined): Result<Genero | undefined, EngineError> {
  if (value === null || value === undefined || value.trim() === '') return ok(undefined);
  const upper = value.toUpperCase().trim();
  if (VALID_GENERO.includes(upper as Genero)) return ok(upper as Genero);
  return err(WebhookValidationError.invalidValue('genero_fx', `Expected M|F|O, got: ${value}`));
}

// ============================================================================
// Numeric parsers
// ============================================================================

/**
 * For money fields where missing = use default (typically 0).
 * Present but non-numeric or negative = ERROR (not silent zero).
 */
function parseOptionalMoney(
  field: string,
  value: string | null | undefined,
  defaultValue = 0
): Result<number, EngineError> {
  if (value === null || value === undefined || value.trim() === '') {
    return ok(defaultValue);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return err(WebhookValidationError.invalidValue(field, `must be a non-negative number, got: ${value}`));
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
    return err(WebhookValidationError.invalidValue(field, `must be a non-negative integer, got: ${value}`));
  }
  return ok(n);
}

function parseHubSpotBoolean(value: unknown): boolean {
  return value === 'true' || value === '1' || value === true;
}

// ============================================================================
// Builder input
// ============================================================================

export interface BuildSeparacionInputParams {
  readonly clientId: string;
  readonly dealId: string;
  readonly deal: CrmRecord;
  readonly contact: CrmRecord;
  readonly sincoIds: {
    readonly idAgrupacionSinco: number;
    readonly idProyectoSinco: number;
  };
  readonly now: Date;
}

// ============================================================================
// Main builder
// ============================================================================

export function buildSeparacionInputFromHubSpot(
  params: BuildSeparacionInputParams
): Result<SeparacionInput, EngineError> {
  const { clientId, dealId, deal, contact, sincoIds, now } = params;
  const dp = deal.properties as Record<string, unknown>;

  // Helper to safely get string
  const prop = (key: string): string | null | undefined => {
    const v = dp[key];
    if (v === null || v === undefined) return null;
    return String(v);
  };

  // --- Comprador ---
  const comprador = buildComprador(dp, contact);
  if (comprador.isErr()) return err(comprador.error);

  // --- Plan Pagos ---
  const planPagos = buildPlanPagosFromDealProps(dp, clientId);
  if (planPagos.isErr()) return err(planPagos.error);

  // --- TipoVenta ---
  const tipoVenta = parseTipoVenta(prop('tipo_venta_fx'));
  if (tipoVenta.isErr()) return err(tipoVenta.error);

  // --- Descuentos (fail-hard on present-but-invalid) ---
  const valorDescuento = parseOptionalMoney('valor_descuento_fx', prop('valor_descuento_fx'));
  if (valorDescuento.isErr()) return err(valorDescuento.error);

  const valorDescuentoFinanciero = parseOptionalMoney('valor_descuento_financiero_fx', prop('valor_descuento_financiero_fx'));
  if (valorDescuentoFinanciero.isErr()) return err(valorDescuentoFinanciero.error);

  // --- Asesor (optional ID) ---
  const idAsesor = parseOptionalNumericId('id_asesor_sinco_fx', prop('id_asesor_sinco_fx'));
  if (idAsesor.isErr()) return err(idAsesor.error);

  // --- Venta ---
  const venta = {
    idAgrupacionSinco: sincoIds.idAgrupacionSinco,
    idProyectoSinco: sincoIds.idProyectoSinco,
    fecha: now,
    tipoVenta: tipoVenta.value,
    valorDescuento: valorDescuento.value,
    valorDescuentoFinanciero: valorDescuentoFinanciero.value,
    idAsesor: idAsesor.value,
    planPagos: planPagos.value,
  };

  // --- SeparacionInput (exact match: SaleWriteback.ts:57-102) ---
  return ok({
    clientId,
    dealId,
    writebackReady: parseHubSpotBoolean(dp.writeback_ready_fx),
    comprador: comprador.value,
    venta,
    compradoresAlternos: undefined,
  });
}

// ============================================================================
// Comprador builder (v6: primerNombre + primerApellido REQUIRED)
// ============================================================================

/**
 * Builds comprador matching SeparacionInput.comprador exactly.
 * Priority: Deal mirror props > Contact props.
 * v6: primerNombre and primerApellido are REQUIRED (Sinco requires them).
 */
function buildComprador(
  dealProps: Record<string, unknown>,
  contact: CrmRecord
): Result<SeparacionInput['comprador'], EngineError> {
  const cp = contact.properties as Record<string, unknown>;

  // Helper
  const dpStr = (key: string): string | null => {
    const v = dealProps[key];
    if (v === null || v === undefined) return null;
    return String(v);
  };
  const cpStr = (key: string): string | null => {
    const v = cp[key];
    if (v === null || v === undefined) return null;
    return String(v);
  };

  // --- Required enums ---
  const tipoPersona = parseTipoPersona(dpStr('tipo_persona_fx') ?? cpStr('tipo_persona_fx'));
  if (tipoPersona.isErr()) return err(tipoPersona.error);

  const tipoIdentificacion = parseTipoIdentificacion(dpStr('tipo_identificacion_fx') ?? cpStr('tipo_identificacion_fx'));
  if (tipoIdentificacion.isErr()) return err(tipoIdentificacion.error);

  // --- Required string: cédula ---
  const cedula = dpStr('cedula_fx') ?? cpStr('cedula_fx');
  if (!cedula || cedula.trim() === '') {
    return err(WebhookValidationError.missingField('cedula_fx'));
  }

  // --- v6: Required: primerNombre ---
  const primerNombre = dpStr('nombre_comprador_fx') ?? cpStr('firstname');
  if (!primerNombre || primerNombre.trim() === '') {
    return err(WebhookValidationError.missingField('primerNombre (nombre_comprador_fx or contact.firstname)'));
  }

  // --- v6: Required: primerApellido ---
  const primerApellido = dpStr('apellido_comprador_fx') ?? cpStr('lastname');
  if (!primerApellido || primerApellido.trim() === '') {
    return err(WebhookValidationError.missingField('primerApellido (apellido_comprador_fx or contact.lastname)'));
  }

  // --- Optional enum (fail-hard if present but invalid) ---
  const genero = parseGenero(dpStr('genero_fx') ?? cpStr('genero_fx'));
  if (genero.isErr()) return err(genero.error);

  // --- Optional money (fail-hard if present but invalid) ---
  const ingresoPromedioMensual = parseOptionalMoney('ingreso_mensual_fx', dpStr('ingreso_mensual_fx'));
  if (ingresoPromedioMensual.isErr()) return err(ingresoPromedioMensual.error);

  // --- Optional numeric ID ---
  const idCiudadResidencia = parseOptionalNumericId('ciudad_residencia_fx', dpStr('ciudad_residencia_fx'));
  if (idCiudadResidencia.isErr()) return err(idCiudadResidencia.error);

  return ok({
    tipoPersona: tipoPersona.value,
    tipoIdentificacion: tipoIdentificacion.value,
    numeroIdentificacion: cedula.trim(),
    primerNombre: primerNombre.trim(),
    segundoNombre: undefined,
    primerApellido: primerApellido.trim(),
    segundoApellido: undefined,
    correo: dpStr('email_comprador_fx') ?? cpStr('email') ?? undefined,
    celular: dpStr('telefono_comprador_fx') ?? cpStr('phone') ?? undefined,
    direccion: undefined,
    genero: genero.value,
    ingresoPromedioMensual: ingresoPromedioMensual.value || undefined,
    idCiudadResidencia: idCiudadResidencia.value !== undefined
      ? idCiudadResidencia.value
      : null,
  });
}
