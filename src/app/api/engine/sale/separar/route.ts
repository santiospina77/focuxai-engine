/**
 * POST /api/engine/sale/separar
 *
 * Body: SeparacionInput (ver SaleWriteback.ts)
 *
 * Llamado por:
 *   - Webhook de HubSpot cuando un Deal pasa a etapa "Unidad Separada"
 *   - Endpoint manual desde Ops para reintentos
 *
 * Idempotente por dealId: ejecutar 2 veces el mismo dealId NO duplica el
 * comprador en Sinco — el segundo intento retorna 422.
 *
 * v2 — WB-1 CR v7: Zod strict + RequiredNumber + DateString + feature flags.
 */

import { z } from 'zod';
import { Engine } from '@/engine';
import { jsonOk, jsonError } from '@/lib/api-helpers';
import type { SeparacionInput } from '@/engine/core/sync/SaleWriteback';
import type { PlanPagoCuota, TipoIdentificacion } from '@/engine/interfaces/IErpConnector';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// --- Safe coercion: rejects '' and whitespace before coerce ---

const RequiredNumberSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return value;
  },
  z.coerce.number()
);

const OptionalNumberSchema = z.preprocess(
  (value) => {
    if (value == null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return value;
  },
  z.coerce.number().optional()
);

// --- Date validation: ISO format + calendar + time ---

const DateStringSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/,
    'Fecha debe estar en formato ISO (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ssZ)'
  )
  .refine((value) => {
    // Reject Invalid Date from full string (catches T99:99:99)
    const full = new Date(value);
    return !Number.isNaN(full.getTime());
  }, 'Fecha/hora inválida')
  .refine((value) => {
    // Reject calendar-invalid dates (2026-02-31 → normalized by JS)
    const [datePart] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, 'Fecha calendario inválida');

// --- Schemas ---

const CompradorAlternoSchema = z.object({
  numeroIdentificacion: z.string().min(4),
  porcentajeParticipacion: RequiredNumberSchema.pipe(z.number().positive().max(100)),
});

const CuotaPlanPagoSchema = z.object({
  idConcepto: RequiredNumberSchema.pipe(z.number().int().nonnegative()),
  fecha: DateStringSchema,
  valor: RequiredNumberSchema.pipe(z.number().nonnegative()),
  numeroCuota: RequiredNumberSchema.pipe(z.number().int().positive()),
  // v7 HIGH 1: trim whitespace before coerce to prevent '   ' → 0
  idEntidad: z.preprocess(
    (value) => {
      if (value == null) return null;
      if (typeof value === 'string' && value.trim() === '') return null;
      return value;
    },
    z.coerce.number().int().nullable().optional()
  ),
});

export const SeparacionRequestSchema = z.object({
  clientId: z.string().min(1),
  dealId: z.string().min(1),
  /**
   * WB-3.5: Hint de aprobación. NO ES FUENTE DE VERDAD.
   * En modo real, Engine verifica writeback_ready_fx directamente en HubSpot.
   */
  writebackReady: z.boolean().optional().default(false),
  comprador: z.object({
    tipoPersona: z.enum(['NATURAL', 'JURIDICA']),
    tipoIdentificacion: z.string().min(1),
    numeroIdentificacion: z.string().min(4),
    primerNombre: z.string().optional(),
    segundoNombre: z.string().optional(),
    primerApellido: z.string().optional(),
    segundoApellido: z.string().optional(),
    correo: z.string().email().optional(),
    celular: z.string().optional(),
    direccion: z.string().optional(),
    genero: z.enum(['M', 'F', 'O']).default('O'),
    ingresoPromedioMensual: OptionalNumberSchema.pipe(z.number().nonnegative().optional()),
    idCiudadResidencia: OptionalNumberSchema.pipe(z.number().int().positive().optional()),
  }),
  venta: z.object({
    idAgrupacionSinco: RequiredNumberSchema.pipe(z.number().int().positive()),
    idProyectoSinco: RequiredNumberSchema.pipe(z.number().int().positive()),
    fecha: DateStringSchema,
    tipoVenta: z.enum(['CONTADO', 'CREDITO', 'CREDITO_TERCEROS', 'LEASING']),
    valorDescuento: RequiredNumberSchema.pipe(z.number().nonnegative()),
    valorDescuentoFinanciero: RequiredNumberSchema.pipe(z.number().nonnegative()),
    idAsesor: OptionalNumberSchema.pipe(z.number().int().positive().optional()),
    planPagos: z.array(CuotaPlanPagoSchema).min(1),
  }),
  compradoresAlternos: z.array(CompradorAlternoSchema).optional(),
}).strict();

export async function POST(req: Request) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { code: 'VALIDATION_INVALID_JSON', message: 'Body inválido o no es JSON' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const parsed = SeparacionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'VALIDATION_SCHEMA_MISMATCH',
          message: 'Payload no cumple schema SeparacionInput',
          details: parsed.error.issues,
        },
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const raw = parsed.data;

  // Explicit mapping — Zod .pipe() outputs optional types, but all fields
  // are guaranteed present after validation. Map explicitly for type safety.
  const v = raw.venta;
  const comp = raw.comprador;
  const input: SeparacionInput = {
    clientId: raw.clientId,
    dealId: raw.dealId,
    writebackReady: raw.writebackReady,
    comprador: {
      tipoPersona: comp.tipoPersona,
      tipoIdentificacion: comp.tipoIdentificacion as TipoIdentificacion,
      numeroIdentificacion: comp.numeroIdentificacion,
      primerNombre: comp.primerNombre,
      segundoNombre: comp.segundoNombre,
      primerApellido: comp.primerApellido,
      segundoApellido: comp.segundoApellido,
      correo: comp.correo,
      celular: comp.celular,
      direccion: comp.direccion,
      genero: comp.genero,
      ingresoPromedioMensual: comp.ingresoPromedioMensual,
      idCiudadResidencia: comp.idCiudadResidencia,
    },
    compradoresAlternos: raw.compradoresAlternos?.map((a) => ({
      numeroIdentificacion: a.numeroIdentificacion,
      porcentajeParticipacion: a.porcentajeParticipacion!,
    })),
    venta: {
      idAgrupacionSinco: v.idAgrupacionSinco!,
      idProyectoSinco: v.idProyectoSinco!,
      fecha: new Date(v.fecha),
      tipoVenta: v.tipoVenta,
      valorDescuento: v.valorDescuento!,
      valorDescuentoFinanciero: v.valorDescuentoFinanciero!,
      idAsesor: v.idAsesor,
      planPagos: v.planPagos.map((c) => ({
        idConcepto: c.idConcepto!,
        fecha: new Date(c.fecha),
        valor: c.valor!,
        numeroCuota: c.numeroCuota!,
        idEntidad: c.idEntidad ?? undefined,
      })),
    },
  };

  const erp = Engine.getErpConnector(input.clientId);
  if (erp.isErr()) return jsonError(erp.error);

  const crm = Engine.getCrmAdapter(input.clientId);
  if (crm.isErr()) return jsonError(crm.error);

  const result = await Engine.saleWriteback.separar(erp.value, crm.value, input);
  if (result.isErr()) return jsonError(result.error);
  return jsonOk(result.value);
}
