/**
 * src/engine/connectors/erp/sinco/types.ts
 *
 * Schemas Zod para validar responses de la API Sinco en runtime.
 *
 * v2 — Abril 17, 2026: Expanded schemas to capture ALL fields returned by
 * Sinco's API (validated with production data from Jiménez). Previous version
 * only parsed ~5-7 fields per entity; the rest were silently dropped by Zod
 * even though .passthrough() kept them in the raw object.
 *
 * Strategy:
 *   - .passthrough() on all objects — Sinco may add fields, we don't break.
 *   - .nullable().optional() aggressively — Sinco returns null on many fields.
 *   - All new fields are optional — backwards compatible with existing data.
 */

import { z } from 'zod';
import type {
  Macroproyecto,
  Proyecto,
  Unidad,
  Agrupacion,
  UnidadTipo,
  UnidadEstado,
  AgrupacionEstado,
  Comprador,
  Vendedor,
  ConceptoPlanPago,
} from '@/engine/interfaces/IErpConnector';

// ============================================================================
// Autenticación (unchanged)
// ============================================================================

export const SincoAuthStep1ResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
  data: z.object({
    IdUsuario: z.number().optional(),
    NomUsuario: z.string().optional(),
    EsReplica: z.boolean().optional(),
    tipoBaseDatos: z.number().optional(),
    bdIngreso: z.array(z.number()).optional(),
  }).passthrough().optional(),
}).passthrough();

export type SincoAuthStep1Response = z.infer<typeof SincoAuthStep1ResponseSchema>;

export const SincoEmpresaSchema = z.object({
  IdOrigen: z.number(),
  IdEmpresa: z.number(),
  Nombre: z.string(),
  Estado: z.boolean(),
  Imagenes: z.string().nullable().optional(),
}).passthrough();

export const SincoEmpresasResponseSchema = z.array(SincoEmpresaSchema);
export type SincoEmpresa = z.infer<typeof SincoEmpresaSchema>;

export const SincoAuthStep3ResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
}).passthrough();

export type SincoAuthStep3Response = z.infer<typeof SincoAuthStep3ResponseSchema>;

// ============================================================================
// Macroproyecto — EXPANDED
// ============================================================================

export const SincoMacroproyectoSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  activo: z.boolean().optional().default(true),
  imagen: z.string().nullable().optional(),
  // v2: new fields from GET /Macroproyectos/Basica
  direccion: z.string().nullable().optional(),
  ciudad: z.number().nullable().optional(),
  numeroPisos: z.number().nullable().optional(),
  aptosPorPiso: z.number().nullable().optional(),
}).passthrough();

export const SincoMacroproyectosResponseSchema = z.array(SincoMacroproyectoSchema);
export type SincoMacroproyectoRaw = z.infer<typeof SincoMacroproyectoSchema>;

export function mapMacroproyecto(raw: SincoMacroproyectoRaw): Macroproyecto {
  return {
    externalId: raw.id,
    nombre: raw.nombre,
    activo: raw.activo ?? true,
    imagenUrl: raw.imagen ?? undefined,
    // v2
    direccion: raw.direccion ?? undefined,
    ciudadCodigo: raw.ciudad ?? undefined,
    numeroPisos: raw.numeroPisos ?? undefined,
    aptosPorPiso: raw.aptosPorPiso ?? undefined,
  };
}

// ============================================================================
// Proyecto — EXPANDED
// ============================================================================

export const SincoProyectoSchema = z.object({
  id: z.number(),
  idMacroproyecto: z.number(),
  nombre: z.string(),
  activo: z.boolean().optional().default(true),
  imagen: z.string().nullable().optional(),
  // v2: new fields from GET /Proyectos/{idMacro}
  estrato: z.number().nullable().optional(),
  valorSeparacion: z.number().nullable().optional(),
  porcentajeFinanciacion: z.number().nullable().optional(),
  fechaEntrega: z.string().nullable().optional(),
  numeroDiasReservaOpcionDeVenta: z.number().nullable().optional(),
}).passthrough();

export const SincoProyectosResponseSchema = z.array(SincoProyectoSchema);
export type SincoProyectoRaw = z.infer<typeof SincoProyectoSchema>;

export function mapProyecto(raw: SincoProyectoRaw): Proyecto {
  return {
    externalId: raw.id,
    macroproyectoExternalId: raw.idMacroproyecto,
    nombre: raw.nombre,
    activo: raw.activo ?? true,
    imagenUrl: raw.imagen ?? undefined,
    // v2
    estrato: raw.estrato ?? undefined,
    valorSeparacion: raw.valorSeparacion ?? undefined,
    porcentajeFinanciacion: raw.porcentajeFinanciacion ?? undefined,
    fechaEntrega: raw.fechaEntrega ?? undefined,
    numeroDiasReservaOpcionVenta: raw.numeroDiasReservaOpcionDeVenta ?? undefined,
  };
}

// ============================================================================
// Unidad — EXPANDED
// ============================================================================

const SINCO_TIPO_UNIDAD: Record<number, UnidadTipo> = {
  2: 'APARTAMENTO',
  3: 'DEPOSITO',
  28: 'PARQUEADERO',
};

const SINCO_ESTADO_UNIDAD: Record<number, UnidadEstado> = {
  0: 'DISPONIBLE',
  1: 'VENDIDA',
};

export const SincoUnidadSchema = z.object({
  id: z.number(),
  idProyecto: z.number().optional(),
  nombre: z.string(),
  idTipoUnidad: z.number(),
  tipoUnidad: z.string().nullable().optional(),
  esPrincipal: z.boolean().optional().default(false),
  valor: z.number(),
  idEstado: z.number(),
  estado: z.string().nullable().optional(),
  areaConstruida: z.number().nullable().optional(),
  areaPrivada: z.number().nullable().optional(),
  areaTotal: z.number().nullable().optional(),
  numeroPiso: z.number().nullable().optional(),
  // v2: new fields
  cantidadAlcobas: z.number().nullable().optional(),
  estBloq: z.boolean().nullable().optional(),
  idTipoInmueble: z.number().nullable().optional(),
  tipoInmueble: z.string().nullable().optional(),
  fechaCreacion: z.string().nullable().optional(),
}).passthrough();

export const SincoUnidadesResponseSchema = z.array(SincoUnidadSchema);
export type SincoUnidadRaw = z.infer<typeof SincoUnidadSchema>;

function inferPisoFromNombre(nombre: string): number | undefined {
  const match = nombre.match(/(\d{3,4})\s*$/);
  if (!match) return undefined;
  const digits = match[1]!;
  if (digits.length === 3) return Number(digits.charAt(0));
  if (digits.length === 4) return Number(digits.substring(0, 2));
  return undefined;
}

export function mapUnidad(raw: SincoUnidadRaw, proyectoExternalId: number): Unidad {
  const tipo = SINCO_TIPO_UNIDAD[raw.idTipoUnidad] ?? 'OTRO';
  const estado = SINCO_ESTADO_UNIDAD[raw.idEstado] ?? 'DISPONIBLE';
  const piso = raw.numeroPiso ?? inferPisoFromNombre(raw.nombre);

  return {
    externalId: raw.id,
    proyectoExternalId: raw.idProyecto ?? proyectoExternalId,
    nombre: raw.nombre,
    tipo,
    tipoCodigo: raw.idTipoUnidad,
    esPrincipal: raw.esPrincipal ?? false,
    precio: raw.valor,
    estado,
    areaConstruida: raw.areaConstruida ?? undefined,
    areaPrivada: raw.areaPrivada ?? undefined,
    areaTotal: raw.areaTotal ?? undefined,
    piso,
    // v2
    cantidadAlcobas: raw.cantidadAlcobas ?? undefined,
    bloqueadoEnErp: raw.estBloq ?? undefined,
    tipoInmuebleId: raw.idTipoInmueble ?? undefined,
    raw,
  };
}

// ============================================================================
// Agrupación — EXPANDED
// ============================================================================

export const SincoAgrupacionSchema = z.object({
  id: z.number(),
  idProyecto: z.number(),
  nombre: z.string().nullable().optional(),
  nombreUnidadPrincipal: z.string().nullable().optional(),
  idEstado: z.number().optional(),
  estado: z.string().nullable().optional(),
  estBloq: z.boolean().optional(),
  valorTotal: z.number().nullable().optional(),
  idHusbpot: z.string().nullable().optional(),
  unidades: z.array(SincoUnidadSchema).optional().default([]),
  // v2: all the fields InventorySync needs
  valorSubTotal: z.number().nullable().optional(),
  valorDescuento: z.number().nullable().optional(),
  valorDescuentoFinanciero: z.number().nullable().optional(),
  valorTotalNeto: z.number().nullable().optional(),
  valorSeparacion: z.number().nullable().optional(),
  idComprador: z.number().nullable().optional(),
  idVendedor: z.number().nullable().optional(),
  tipoVenta: z.number().nullable().optional(),
  fechaVenta: z.string().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  numeroEncargo: z.string().nullable().optional(),
  fechaSeparacion: z.string().nullable().optional(),
  fechaCreacion: z.string().nullable().optional(),
  idMedioPublicitario: z.number().nullable().optional(),
  ventaExterior: z.boolean().nullable().optional(),
  valorAdicionales: z.number().nullable().optional(),
  valorExclusiones: z.number().nullable().optional(),
  valorSobrecosto: z.number().nullable().optional(),
  numeroIdentificacionComprador: z.string().nullable().optional(),
}).passthrough();

export const SincoAgrupacionesResponseSchema = z.array(SincoAgrupacionSchema);
export type SincoAgrupacionRaw = z.infer<typeof SincoAgrupacionSchema>;

const SINCO_ESTADO_AGRUPACION: Record<number, AgrupacionEstado> = {
  0: 'DISPONIBLE',
  1: 'VENDIDA',
};

export function mapAgrupacion(raw: SincoAgrupacionRaw): Agrupacion {
  const unidades = (raw.unidades ?? []).map((u) => mapUnidad(u, raw.idProyecto));
  const valorTotal = raw.valorTotal ?? unidades.reduce((sum, u) => sum + u.precio, 0);
  const estado = SINCO_ESTADO_AGRUPACION[raw.idEstado ?? 0] ?? 'DISPONIBLE';

  // Sinco puede devolver el nombre en "nombre" o en "nombreUnidadPrincipal"
  const nombre = raw.nombreUnidadPrincipal ?? raw.nombre ?? unidades.map((u) => u.nombre).join(' + ');

  // Derive idUnidadPrincipal from the unidades array
  const unidadPrincipal = unidades.find((u) => u.esPrincipal);

  return {
    externalId: raw.id,
    proyectoExternalId: raw.idProyecto,
    nombre,
    estado,
    valorTotal,
    unidades,
    crmDealId: raw.idHusbpot ?? null,
    // v2: all additional fields
    valorSubtotal: raw.valorSubTotal ?? undefined,
    valorDescuento: raw.valorDescuento ?? undefined,
    valorDescuentoFinanciero: raw.valorDescuentoFinanciero ?? undefined,
    valorTotalNeto: raw.valorTotalNeto ?? undefined,
    valorSeparacion: raw.valorSeparacion ?? undefined,
    compradorExternalId: raw.idComprador ?? undefined,
    vendedorExternalId: raw.idVendedor ?? undefined,
    tipoVentaCodigo: raw.tipoVenta ?? undefined,
    fechaVenta: raw.fechaVenta ?? undefined,
    observaciones: raw.observaciones ?? undefined,
    numeroEncargo: raw.numeroEncargo ?? undefined,
    fechaSeparacion: raw.fechaSeparacion ?? undefined,
    fechaCreacionErp: raw.fechaCreacion ?? undefined,
    idUnidadPrincipalExternalId: unidadPrincipal?.externalId ?? undefined,
    idMedioPublicitario: raw.idMedioPublicitario ?? undefined,
    ventaExterior: raw.ventaExterior ?? undefined,
    valorAdicionales: raw.valorAdicionales ?? undefined,
    valorExclusiones: raw.valorExclusiones ?? undefined,
    valorSobrecosto: raw.valorSobrecosto ?? undefined,
    compradorNumeroIdentificacion: raw.numeroIdentificacionComprador ?? undefined,
    raw,
  };
}

// ============================================================================
// Comprador (unchanged)
// ============================================================================

export const SincoCompradorSchema = z.object({
  id: z.number(),
  tipoPersona: z.string(),
  tipoIdentificacion: z.string(),
  numeroIdentificacion: z.string(),
  primerNombre: z.string().nullable().optional(),
  segundoNombre: z.string().nullable().optional(),
  primerApellido: z.string().nullable().optional(),
  segundoApellido: z.string().nullable().optional(),
  correo: z.string().nullable().optional(),
  celular: z.string().nullable().optional(),
  direccion: z.string().nullable().optional(),
  genero: z.string().nullable().optional(),
  usoVivienda: z.number().nullable().optional(),
}).passthrough();

export type SincoCompradorRaw = z.infer<typeof SincoCompradorSchema>;

const SINCO_USO_VIVIENDA: Record<number, Comprador['usoVivienda']> = {
  1: 'INVERSION_ARRIENDO',
  2: 'INVERSION_VENTA',
  3: 'USO_PROPIO',
};

export function mapComprador(raw: SincoCompradorRaw): Comprador {
  return {
    externalId: raw.id,
    tipoPersona: raw.tipoPersona === 'J' ? 'JURIDICA' : 'NATURAL',
    tipoIdentificacion: (raw.tipoIdentificacion as Comprador['tipoIdentificacion']) ?? 'CC',
    numeroIdentificacion: raw.numeroIdentificacion,
    primerNombre: raw.primerNombre ?? undefined,
    segundoNombre: raw.segundoNombre ?? undefined,
    primerApellido: raw.primerApellido ?? undefined,
    segundoApellido: raw.segundoApellido ?? undefined,
    correo: raw.correo ?? undefined,
    celular: raw.celular ?? undefined,
    direccion: raw.direccion ?? undefined,
    genero: (raw.genero as Comprador['genero']) ?? undefined,
    usoVivienda: raw.usoVivienda != null ? SINCO_USO_VIVIENDA[raw.usoVivienda] : undefined,
  };
}

// ============================================================================
// Vendedor (unchanged)
// ============================================================================

export const SincoVendedorSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  activo: z.boolean().optional().default(true),
  correo: z.string().nullable().optional(),
}).passthrough();

export const SincoVendedoresResponseSchema = z.array(SincoVendedorSchema);
export type SincoVendedorRaw = z.infer<typeof SincoVendedorSchema>;

export function mapVendedor(raw: SincoVendedorRaw): Vendedor {
  return {
    externalId: raw.id,
    nombre: raw.nombre,
    activo: raw.activo ?? true,
    correo: raw.correo ?? undefined,
  };
}

// ============================================================================
// Concepto Plan de Pagos (unchanged)
// ============================================================================

const CONCEPTOS_CORE_KEYWORDS = [
  'separacion', 'separación',
  'cuota inicial',
  'saldo final',
  'credito', 'crédito',
  'confirmacion', 'confirmación',
];

export const SincoConceptoPlanPagoSchema = z.object({
  id: z.number(),
  nombre: z.string(),
}).passthrough();

export const SincoConceptosPlanPagoResponseSchema = z.array(SincoConceptoPlanPagoSchema);
export type SincoConceptoPlanPagoRaw = z.infer<typeof SincoConceptoPlanPagoSchema>;

export function mapConceptoPlanPago(raw: SincoConceptoPlanPagoRaw): ConceptoPlanPago {
  const nombreLower = raw.nombre.toLowerCase();
  const esCore = CONCEPTOS_CORE_KEYWORDS.some((kw) => nombreLower.includes(kw));
  return {
    externalId: raw.id,
    nombre: raw.nombre,
    esCore,
  };
}

// ============================================================================
// Create Comprador (request body — unchanged)
// ============================================================================

export interface SincoCreateCompradorBody {
  tipoPersona: string;
  tipoIdentificacion: string;
  numeroIdentificacion: string;
  primerNombre?: string;
  segundoNombre?: string;
  primerApellido?: string;
  segundoApellido?: string;
  correo?: string;
  celular?: string;
  direccion?: string;
  genero?: string;
  usoVivienda?: number;
  aceptoPoliticaDeDatos?: number;
}

export const SincoCreateCompradorResponseSchema = z.number();

// ============================================================================
// Confirmar Venta (request body — unchanged)
// ============================================================================

export interface SincoConfirmacionVentaBody {
  idVenta: number;
  idProyecto: number;
  numeroIdentificacionComprador: string;
  fecha?: string;
  porcentajeParticipacion: number;
  valorDescuento: number;
  valorDescuentoFinanciero: number;
  tipoVenta: number;
  idAsesor?: number | null;
  planPagos: ReadonlyArray<{
    idConcepto: number;
    fecha: string;
    valor: number;
    numeroCuota: number;
    idEntidad?: number | null;
  }>;
  compradoresAlternos?: ReadonlyArray<{
    numeroIdentificacion: string;
    porcentajeParticipacion: number;
  }>;
  idHubspot?: string;
}

const TIPO_VENTA_TO_SINCO: Record<string, number> = {
  CONTADO: 0,
  CREDITO: 1,
  CREDITO_TERCEROS: 2,
  LEASING: 3,
};

export function mapTipoVentaToSinco(tipo: string): number {
  return TIPO_VENTA_TO_SINCO[tipo] ?? 1;
}

export function formatSincoDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

const TIPO_PERSONA_TO_SINCO: Record<string, string> = {
  NATURAL: 'N',
  JURIDICA: 'J',
};

const USO_VIVIENDA_TO_SINCO: Record<string, number> = {
  INVERSION_ARRIENDO: 1,
  INVERSION_VENTA: 2,
  USO_PROPIO: 3,
};

export function mapTipoPersonaToSinco(tipo: string): string {
  return TIPO_PERSONA_TO_SINCO[tipo] ?? 'N';
}

export function mapUsoViviendaToSinco(uso: string | undefined): number | undefined {
  if (!uso) return undefined;
  return USO_VIVIENDA_TO_SINCO[uso];
}
