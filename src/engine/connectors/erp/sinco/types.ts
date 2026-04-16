/**
 * Schemas Zod para validar responses de la API Sinco en runtime.
 *
 * Por qué Zod y no "as unknown as Tipo":
 *   La API de Sinco puede cambiar silenciosamente (nuevo campo requerido,
 *   tipo distinto, null inesperado). Sin validación runtime, un cambio
 *   upstream te tumba el sync en producción con errores crípticos.
 *   Con Zod, cada response es validado y si falla generas un
 *   ERP_SCHEMA_MISMATCH con detalles exactos de qué campo rompió.
 *
 * Estrategia:
 *   - `.passthrough()` en objetos — Sinco agrega campos y no queremos romper.
 *   - `.nullable()` agresivo — Sinco retorna null en campos "opcionales".
 *   - Enums mapeados a strings legibles — ej. tipoUnidad 2 -> APARTAMENTO.
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
// Autenticación
// ============================================================================

/**
 * Response del POST /API/Auth/Usuario — el primer paso del 3-step auth.
 * HTTP 200 = 1 BD, token listo. HTTP 300 = múltiples BDs, hay que seleccionar.
 * En ambos casos el body es parecido pero bdIngreso cambia.
 */
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

/**
 * Response del GET /API/Cliente/Empresas — lista de empresas (razones sociales).
 * IdOrigen es crítico: se usa en el Step 3 para obtener el token final.
 */
export const SincoEmpresaSchema = z.object({
  IdOrigen: z.number(),
  IdEmpresa: z.number(),
  Nombre: z.string(),
  Estado: z.boolean(),
  Imagenes: z.string().nullable().optional(),
}).passthrough();

export const SincoEmpresasResponseSchema = z.array(SincoEmpresaSchema);

export type SincoEmpresa = z.infer<typeof SincoEmpresaSchema>;

/**
 * Response del GET /API/Auth/Sesion/IniciarMovil/... — Step 3.
 * Devuelve el token final que se usa con los endpoints de negocio.
 */
export const SincoAuthStep3ResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  token_type: z.string(),
}).passthrough();

export type SincoAuthStep3Response = z.infer<typeof SincoAuthStep3ResponseSchema>;

// ============================================================================
// Macroproyecto
// ============================================================================

export const SincoMacroproyectoSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  activo: z.boolean().optional().default(true),
  imagen: z.string().nullable().optional(),
}).passthrough();

export const SincoMacroproyectosResponseSchema = z.array(SincoMacroproyectoSchema);

export type SincoMacroproyectoRaw = z.infer<typeof SincoMacroproyectoSchema>;

export function mapMacroproyecto(raw: SincoMacroproyectoRaw): Macroproyecto {
  return {
    externalId: raw.id,
    nombre: raw.nombre,
    activo: raw.activo ?? true,
    imagenUrl: raw.imagen ?? undefined,
  };
}

// ============================================================================
// Proyecto
// ============================================================================

export const SincoProyectoSchema = z.object({
  id: z.number(),
  idMacroproyecto: z.number(),
  nombre: z.string(),
  activo: z.boolean().optional().default(true),
  imagen: z.string().nullable().optional(),
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
  };
}

// ============================================================================
// Unidad
// ============================================================================

/**
 * Enums de Sinco para tipoUnidad e idEstado.
 * Fuente: validación de producción Porto Sabbia (abril 2026).
 */
const SINCO_TIPO_UNIDAD: Record<number, UnidadTipo> = {
  2: 'APARTAMENTO',
  3: 'DEPOSITO',
  28: 'PARQUEADERO',
};

const SINCO_ESTADO_UNIDAD: Record<number, UnidadEstado> = {
  0: 'DISPONIBLE',
  1: 'VENDIDA',
  // Sinco usa más estados internamente (bloqueado, reservado), pero a nivel
  // de API pública solo se observan 0 y 1. Si aparece otro, caemos al default.
};

export const SincoUnidadSchema = z.object({
  id: z.number(),
  idProyecto: z.number().optional(),
  nombre: z.string(),
  idTipoUnidad: z.number(),
  esPrincipal: z.boolean().optional().default(false),
  valor: z.number(),
  idEstado: z.number(),
  areaConstruida: z.number().nullable().optional(),
  areaPrivada: z.number().nullable().optional(),
  numeroPiso: z.number().nullable().optional(),
}).passthrough();

export const SincoUnidadesResponseSchema = z.array(SincoUnidadSchema);

export type SincoUnidadRaw = z.infer<typeof SincoUnidadSchema>;

/**
 * Extrae el piso del nombre de la unidad si numeroPiso es null.
 * Ejemplo: "APT-401" -> 4, "APT-APTO1302" -> 13.
 * Patrón observado en Jiménez: 4 dígitos al final, primeros 1-2 son el piso.
 */
function inferPisoFromNombre(nombre: string): number | undefined {
  const match = nombre.match(/(\d{3,4})\s*$/);
  if (!match) return undefined;
  const digits = match[1]!;
  // APT-401 -> "401" -> piso 4
  // APT-1302 -> "1302" -> piso 13
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
    esPrincipal: raw.esPrincipal ?? false,
    precio: raw.valor,
    estado,
    areaConstruida: raw.areaConstruida ?? undefined,
    areaPrivada: raw.areaPrivada ?? undefined,
    piso,
    raw,
  };
}

// ============================================================================
// Agrupación
// ============================================================================

/**
 * El campo idHusbpot existe con ese typo en el response real de Sinco.
 * Lo aceptamos y lo exponemos como crmDealId en nuestro dominio.
 */
export const SincoAgrupacionSchema = z.object({
  id: z.number(),
  idProyecto: z.number(),
  nombre: z.string().optional(),
  idEstado: z.number().optional(),
  estBloq: z.boolean().optional(),
  valorTotal: z.number().optional(),
  idHusbpot: z.string().nullable().optional(), // typo original preservado
  unidades: z.array(SincoUnidadSchema).optional().default([]),
}).passthrough();

export const SincoAgrupacionesResponseSchema = z.array(SincoAgrupacionSchema);

export type SincoAgrupacionRaw = z.infer<typeof SincoAgrupacionSchema>;

const SINCO_ESTADO_AGRUPACION: Record<number, AgrupacionEstado> = {
  0: 'DISPONIBLE',
  1: 'VENDIDA',
  // Estados intermedios si aparecen
};

export function mapAgrupacion(raw: SincoAgrupacionRaw): Agrupacion {
  const unidades = (raw.unidades ?? []).map((u) => mapUnidad(u, raw.idProyecto));
  const valorTotal = raw.valorTotal ?? unidades.reduce((sum, u) => sum + u.precio, 0);
  const estado = SINCO_ESTADO_AGRUPACION[raw.idEstado ?? 0] ?? 'DISPONIBLE';

  // Si no hay nombre en Sinco, construir uno con las unidades.
  const nombre = raw.nombre ?? unidades.map((u) => u.nombre).join(' + ');

  return {
    externalId: raw.id,
    proyectoExternalId: raw.idProyecto,
    nombre,
    estado,
    valorTotal,
    unidades,
    crmDealId: raw.idHusbpot ?? null,
    raw,
  };
}

// ============================================================================
// Comprador
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
// Vendedor
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
// Concepto Plan de Pagos
// ============================================================================

/**
 * Los conceptos "core" mapeados de Jiménez (producción):
 *   - Separación
 *   - Cuota Inicial
 *   - Saldo Final
 *   - Crédito Hipotecario
 *   - Confirmación
 */
const CONCEPTOS_CORE_KEYWORDS = [
  'separacion',
  'separación',
  'cuota inicial',
  'saldo final',
  'credito',
  'crédito',
  'confirmacion',
  'confirmación',
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
// Create Comprador (request body)
// ============================================================================

/**
 * POST /Compradores — body mínimo requerido.
 * Sinco acepta 80+ campos pero solo 3 son obligatorios.
 */
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
// Confirmar Venta (request body) — el write-back más crítico
// ============================================================================

export interface SincoConfirmacionVentaBody {
  idVenta: number;
  idProyecto: number;
  numeroIdentificacionComprador: string;
  fecha?: string; // DD-MM-YYYY
  porcentajeParticipacion: number;
  valorDescuento: number;
  valorDescuentoFinanciero: number;
  tipoVenta: number;
  idAsesor?: number | null;
  planPagos: ReadonlyArray<{
    idConcepto: number;
    fecha: string; // DD-MM-YYYY
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

/**
 * Formatea una fecha a DD-MM-YYYY como exige Sinco.
 * Otros formatos causan FormatException.
 */
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
