/**
 * ICrmAdapter — Contrato CRM-agnóstico.
 *
 * El Engine Core jamás habla con HubSpot directamente. Siempre pasa por
 * esta interface. Esto permite:
 *
 *   - Soportar Salesforce, Zoho, CRM propio sin reescribir el Engine.
 *   - Testear con un MockCrmAdapter.
 *   - Mover lógica entre CRMs sin cambiar la capa de negocio.
 *
 * Los tipos de dominio son neutros. "CustomObject" en lugar de "HubSpot
 * Custom Object". "Deal" en lugar de "HubSpot Deal". Cada implementación
 * traduce a su vocabulario propio.
 *
 * Regla crítica: todos los métodos retornan Result<T, EngineError>.
 */

import type { Result } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';

// ============================================================================
// Tipos de dominio (CRM-agnósticos)
// ============================================================================

/**
 * Identificador neutral de tipo de objeto en el CRM.
 * En HubSpot se traduce a objectTypeId (ej. "2-12345678" para custom objects,
 * "0-1" para contacts, "0-3" para deals).
 * En Salesforce sería el API name. El Engine no sabe ni le importa.
 */
export type CrmObjectType =
  | 'contact'
  | 'deal'
  | 'macroproyecto'
  | 'proyecto'
  | 'unidad'
  | 'agrupacion';

/**
 * Un registro genérico en el CRM. El campo `id` es el ID interno del CRM
 * (no el externalId del ERP). `properties` es un diccionario flexible.
 */
export interface CrmRecord {
  readonly id: string;
  readonly objectType: CrmObjectType;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface CrmRecordInput {
  readonly objectType: CrmObjectType;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface CrmRecordUpdate {
  readonly id: string;
  readonly objectType: CrmObjectType;
  readonly properties: Readonly<Record<string, unknown>>;
}

/**
 * Resultado de una operación batch. Algunos registros pueden haber tenido
 * éxito y otros fallado — el caller decide qué hacer con cada uno.
 */
export interface BatchResult<T> {
  readonly successful: readonly T[];
  readonly failed: readonly {
    readonly input: unknown;
    readonly error: EngineError;
  }[];
}

/**
 * Búsqueda de registros. Usa una sintaxis neutral que cada CRM traduce.
 * Ejemplos:
 *   { property: 'id_sinco_fx', operator: 'eq', value: 361 }
 *   { property: 'cedula', operator: 'eq', value: '52785272' }
 */
export type CrmFilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains';

export interface CrmFilter {
  readonly property: string;
  readonly operator: CrmFilterOperator;
  readonly value: string | number | boolean | ReadonlyArray<string | number>;
}

export interface CrmSearchQuery {
  readonly objectType: CrmObjectType;
  readonly filters?: readonly CrmFilter[];
  readonly properties?: readonly string[]; // qué properties devolver
  readonly limit?: number;
  readonly after?: string; // cursor para paginación
}

export interface CrmSearchResult {
  readonly records: readonly CrmRecord[];
  readonly nextCursor?: string;
  readonly total?: number;
}

// ============================================================================
// Associations
// ============================================================================

export interface CrmAssociation {
  readonly fromObjectType: CrmObjectType;
  readonly fromId: string;
  readonly toObjectType: CrmObjectType;
  readonly toId: string;
  /**
   * Tipo de asociación. Algunos CRMs permiten múltiples tipos entre los mismos
   * objetos (ej. "primary contact" vs "secondary contact"). Opcional por defecto.
   */
  readonly associationTypeId?: number;
}

// ============================================================================
// Property schema management (necesario para el Adapter crear los Custom Objects)
// ============================================================================

export type CrmPropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enumeration';

export interface CrmPropertyDefinition {
  readonly internalName: string;
  readonly label: string;
  readonly type: CrmPropertyType;
  readonly description?: string;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly required?: boolean;
  readonly unique?: boolean;
}

// ============================================================================
// Interface principal
// ============================================================================

export interface ICrmAdapter {
  /**
   * Identificador del CRM subyacente ("hubspot", "salesforce", "focux"...).
   * Útil para branching en logs y métricas. Jamás para lógica de negocio.
   */
  readonly crmKind: string;

  // -------------------------------------------------------------------------
  // CRUD de registros (individual)
  // -------------------------------------------------------------------------

  createRecord(input: CrmRecordInput): Promise<Result<CrmRecord, EngineError>>;

  updateRecord(update: CrmRecordUpdate): Promise<Result<CrmRecord, EngineError>>;

  getRecord(
    objectType: CrmObjectType,
    id: string,
    properties?: readonly string[]
  ): Promise<Result<CrmRecord | null, EngineError>>;

  deleteRecord(
    objectType: CrmObjectType,
    id: string
  ): Promise<Result<void, EngineError>>;

  // -------------------------------------------------------------------------
  // CRUD batch (crítico para performance del sync)
  // -------------------------------------------------------------------------

  /**
   * Crea múltiples registros en una sola llamada. HubSpot soporta hasta
   * 100 por batch. Retorna BatchResult con éxitos y fallos separados.
   */
  createRecordsBatch(
    inputs: readonly CrmRecordInput[]
  ): Promise<Result<BatchResult<CrmRecord>, EngineError>>;

  updateRecordsBatch(
    updates: readonly CrmRecordUpdate[]
  ): Promise<Result<BatchResult<CrmRecord>, EngineError>>;

  /**
   * Upsert por external ID. Si existe un registro con esa clave, lo actualiza;
   * si no, lo crea. Es el método clave del sync — no nos interesa si existe
   * o no, queremos que quede en HubSpot con los datos de Sinco.
   */
  upsertRecordsByExternalId(
    objectType: CrmObjectType,
    externalIdProperty: string,
    inputs: readonly CrmRecordInput[]
  ): Promise<Result<BatchResult<CrmRecord>, EngineError>>;

  // -------------------------------------------------------------------------
  // Búsqueda
  // -------------------------------------------------------------------------

  searchRecords(
    query: CrmSearchQuery
  ): Promise<Result<CrmSearchResult, EngineError>>;

  /**
   * Helper común: buscar un registro por su external ID. Retorna null si no existe.
   */
  findByExternalId(
    objectType: CrmObjectType,
    externalIdProperty: string,
    externalIdValue: string | number,
    properties?: readonly string[]
  ): Promise<Result<CrmRecord | null, EngineError>>;

  // -------------------------------------------------------------------------
  // Associations
  // -------------------------------------------------------------------------

  createAssociation(
    association: CrmAssociation
  ): Promise<Result<void, EngineError>>;

  createAssociationsBatch(
    associations: readonly CrmAssociation[]
  ): Promise<Result<BatchResult<CrmAssociation>, EngineError>>;

  // -------------------------------------------------------------------------
  // Schema management (usado por el Adapter, no por apps en runtime)
  // -------------------------------------------------------------------------

  /**
   * Crea propiedades nuevas en un object type. Idempotente: si ya existen,
   * retorna éxito sin modificar.
   */
  ensureProperties(
    objectType: CrmObjectType,
    properties: readonly CrmPropertyDefinition[]
  ): Promise<Result<void, EngineError>>;

  // -------------------------------------------------------------------------
  // Diagnóstico
  // -------------------------------------------------------------------------

  healthCheck(): Promise<Result<{ latencyMs: number }, EngineError>>;
}
