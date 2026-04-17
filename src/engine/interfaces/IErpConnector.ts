/**
 * IErpConnector — Contrato ERP-agnóstico.
 *
 * El Engine Core jamás habla con Sinco (o cualquier otro ERP) directamente.
 * Siempre pasa por esta interface. Esto permite:
 *
 *  - Soportar múltiples ERPs sin tocar la lógica de negocio.
 *  - Testear el Engine con un MockErpConnector.
 *  - Cambiar de Sinco a SAP/Oracle/propietario con cero cambios en el Core.
 *
 * Los tipos de dominio (Macroproyecto, Proyecto, Unidad, Comprador...) son
 * neutrales respecto a Sinco. Cada implementación traduce sus propios campos
 * a este vocabulario común.
 *
 * Regla crítica: todos los métodos retornan Result<T, EngineError>.
 * Ninguno hace throw. Esto fuerza manejo de errores explícito en el caller.
 *
 * v2 — Abril 17, 2026: Expanded domain types to carry all fields needed by
 * InventorySync mappers (76 HubSpot properties). Previous version only had
 * ~25 fields total; the rest were silently dropped during sync.
 */

import type { Result } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';

// ============================================================================
// Tipos de dominio (ERP-agnósticos)
// ============================================================================

export interface Macroproyecto {
  /** ID en el ERP de origen. Se guarda en id_sinco_fx del Custom Object. */
  readonly externalId: number;
  readonly nombre: string;
  readonly activo: boolean;
  readonly imagenUrl?: string;
  // --- v2: campos adicionales para sync completo ---
  readonly direccion?: string;
  readonly ciudadCodigo?: number;
  readonly numeroPisos?: number;
  readonly aptosPorPiso?: number;
  readonly estado?: string;
}

export interface Proyecto {
  readonly externalId: number;
  readonly macroproyectoExternalId: number;
  readonly nombre: string;
  readonly activo: boolean;
  readonly imagenUrl?: string;
  // --- v2: campos adicionales para sync completo ---
  readonly estrato?: number;
  readonly valorSeparacion?: number;
  readonly porcentajeFinanciacion?: number;
  readonly fechaEntrega?: string;
  readonly numeroDiasReservaOpcionVenta?: number;
  readonly estado?: string;
}

export type UnidadTipo = 'APARTAMENTO' | 'PARQUEADERO' | 'DEPOSITO' | 'OTRO';
export type UnidadEstado = 'DISPONIBLE' | 'BLOQUEADA' | 'RESERVADA' | 'VENDIDA' | 'ESCRITURADA';

export interface Unidad {
  readonly externalId: number;
  readonly proyectoExternalId: number;
  readonly nombre: string;
  readonly tipo: UnidadTipo;
  /** Código numérico del tipo en el ERP (ej. 2=Apto, 28=Parq, 3=Dep en Sinco). */
  readonly tipoCodigo?: number;
  /** Si es la unidad principal de una agrupación (el apto vs el parqueadero). */
  readonly esPrincipal: boolean;
  readonly precio: number;
  readonly estado: UnidadEstado;
  readonly areaConstruida?: number;
  readonly areaPrivada?: number;
  readonly areaTotal?: number;
  readonly piso?: number;
  // --- v2: campos adicionales para sync completo ---
  readonly cantidadAlcobas?: number;
  readonly cantidadBanos?: number;
  readonly bloqueadoEnErp?: boolean;
  readonly tipoInmuebleId?: number;
  readonly clasificacion?: string;
  readonly nomenclaturaTorre?: string;
  readonly areaTerraza?: number;
  readonly areaBalcon?: number;
  readonly areaPatio?: number;
  readonly tieneJardineria?: boolean;
  /** Campos específicos del ERP que no fueron mapeados. Útil para debugging. */
  readonly raw?: Readonly<Record<string, unknown>>;
}

export type AgrupacionEstado = 'DISPONIBLE' | 'COTIZADA' | 'BLOQUEADA' | 'SEPARADA' | 'VENDIDA';

export interface Agrupacion {
  readonly externalId: number;
  readonly proyectoExternalId: number;
  readonly nombre: string;
  readonly estado: AgrupacionEstado;
  readonly valorTotal: number;
  readonly unidades: readonly Unidad[];
  /**
   * ID de HubSpot guardado en el ERP para trazabilidad bidireccional.
   * En Sinco este campo existe (con typo "idHusbpot" en el response).
   */
  readonly crmDealId?: string | null;
  // --- v2: campos adicionales para sync completo ---
  readonly valorSubtotal?: number;
  readonly valorDescuento?: number;
  readonly valorDescuentoFinanciero?: number;
  readonly valorTotalNeto?: number;
  readonly valorSeparacion?: number;
  readonly compradorExternalId?: number;
  readonly vendedorExternalId?: number;
  readonly tipoVentaCodigo?: number;
  readonly fechaVenta?: string;
  readonly observaciones?: string;
  readonly numeroEncargo?: string;
  readonly fechaSeparacion?: string;
  readonly fechaCreacionErp?: string;
  readonly idUnidadPrincipalExternalId?: number;
  readonly idMedioPublicitario?: number;
  readonly ventaExterior?: boolean;
  readonly valorAdicionales?: number;
  readonly valorExclusiones?: number;
  readonly valorSobrecosto?: number;
  readonly compradorNumeroIdentificacion?: string;
  readonly raw?: Readonly<Record<string, unknown>>;
}

export type TipoPersona = 'NATURAL' | 'JURIDICA';
export type TipoIdentificacion = 'CC' | 'CE' | 'NIT' | 'PASAPORTE' | 'TI';
export type UsoVivienda = 'INVERSION_ARRIENDO' | 'INVERSION_VENTA' | 'USO_PROPIO';
export type Genero = 'M' | 'F' | 'O';

export interface CompradorInput {
  readonly tipoPersona: TipoPersona;
  readonly tipoIdentificacion: TipoIdentificacion;
  readonly numeroIdentificacion: string;
  readonly primerNombre?: string;
  readonly segundoNombre?: string;
  readonly primerApellido?: string;
  readonly segundoApellido?: string;
  readonly correo?: string;
  readonly celular?: string;
  readonly direccion?: string;
  readonly genero?: Genero;
  readonly usoVivienda?: UsoVivienda;
  readonly aceptoPoliticaDatos?: boolean;
}

export interface Comprador extends CompradorInput {
  readonly externalId: number;
}

export type TipoVenta = 'CONTADO' | 'CREDITO' | 'CREDITO_TERCEROS' | 'LEASING';

export interface PlanPagoCuota {
  /** ID del concepto en el ERP (separación, cuota inicial, saldo final, etc.). */
  readonly idConcepto: number;
  readonly fecha: Date;
  readonly valor: number;
  /** Secuencial por concepto, empieza en 1. */
  readonly numeroCuota: number;
  readonly idEntidad?: number;
}

export interface CompradorAlterno {
  readonly numeroIdentificacion: string;
  readonly porcentajeParticipacion: number;
}

export interface ConfirmacionVentaInput {
  readonly idVenta: number; // = idAgrupacion en Sinco
  readonly idProyecto: number;
  readonly numeroIdentificacionComprador: string;
  readonly fecha?: Date;
  readonly porcentajeParticipacion: number;
  readonly valorDescuento: number;
  readonly valorDescuentoFinanciero: number;
  readonly tipoVenta: TipoVenta;
  readonly idAsesor?: number;
  readonly planPagos: readonly PlanPagoCuota[];
  readonly compradoresAlternos?: readonly CompradorAlterno[];
  /** Deal ID de HubSpot para trazabilidad bidireccional. */
  readonly crmDealId?: string;
}

export interface Vendedor {
  readonly externalId: number;
  readonly nombre: string;
  readonly activo: boolean;
  readonly correo?: string;
}

export interface ConceptoPlanPago {
  readonly externalId: number;
  readonly nombre: string;
  /** Si es un concepto "core" como separación, cuota inicial, saldo final. */
  readonly esCore: boolean;
}

// ============================================================================
// Interface principal
// ============================================================================

export interface IErpConnector {
  /**
   * Identificador del ERP subyacente ("sinco", "sap", "oracle"...).
   * Útil para branching en logs y métricas. Jamás para lógica de negocio.
   */
  readonly erpKind: string;

  // -------------------------------------------------------------------------
  // Lectura — Inventario
  // -------------------------------------------------------------------------

  getMacroproyectos(): Promise<Result<readonly Macroproyecto[], EngineError>>;

  getProyectosByMacroproyecto(
    macroproyectoExternalId: number
  ): Promise<Result<readonly Proyecto[], EngineError>>;

  getUnidadesByProyecto(
    proyectoExternalId: number
  ): Promise<Result<readonly Unidad[], EngineError>>;

  getAgrupacionesByProyecto(
    proyectoExternalId: number
  ): Promise<Result<readonly Agrupacion[], EngineError>>;

  // -------------------------------------------------------------------------
  // Lectura — Compradores y ventas
  // -------------------------------------------------------------------------

  getCompradorByIdentificacion(
    numeroIdentificacion: string
  ): Promise<Result<Comprador | null, EngineError>>;

  // -------------------------------------------------------------------------
  // Lectura — Catálogos
  // -------------------------------------------------------------------------

  getVendedores(): Promise<Result<readonly Vendedor[], EngineError>>;

  getConceptosPlanPago(): Promise<Result<readonly ConceptoPlanPago[], EngineError>>;

  // -------------------------------------------------------------------------
  // Escritura — Write-backs (solo en Separada y Legalizada)
  // -------------------------------------------------------------------------

  createComprador(input: CompradorInput): Promise<Result<{ externalId: number }, EngineError>>;

  /**
   * Confirma la venta de una agrupación existente.
   * En Sinco: PUT /Ventas/ConfirmacionVenta. Cambia el estado de las unidades
   * automáticamente. Este es el write-back más crítico del sistema.
   */
  confirmarVenta(input: ConfirmacionVentaInput): Promise<Result<void, EngineError>>;

  // -------------------------------------------------------------------------
  // Diagnóstico / Salud
  // -------------------------------------------------------------------------

  /**
   * Verifica que la conexión esté sana: credenciales válidas, token obtenible,
   * al menos un GET de catálogo retorna 200. Usado por /api/engine/health.
   */
  healthCheck(): Promise<Result<{ latencyMs: number }, EngineError>>;
}
