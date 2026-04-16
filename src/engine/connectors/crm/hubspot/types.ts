/**
 * Tipos y helpers específicos de HubSpot.
 *
 * HubSpot usa objectTypeId como identificador de tipo de objeto:
 *   - Nativos: "0-1" = contact, "0-3" = deal, "0-2" = company, etc.
 *   - Custom Objects: "2-{portalId}-{customIndex}" (variable por portal).
 *
 * Por eso cada instalación tiene su propia configuración — los custom objects
 * que creamos en el portal demo tienen IDs distintos a los del portal real
 * de Jiménez. El config debe guardarlos por clientId.
 */

import { z } from 'zod';
import type {
  CrmObjectType,
  CrmFilterOperator,
  CrmRecord,
} from '@/engine/interfaces/ICrmAdapter';

// ============================================================================
// ObjectType IDs
// ============================================================================

/**
 * Los object type IDs nativos de HubSpot son constantes globales.
 */
export const HUBSPOT_NATIVE_OBJECT_TYPES = {
  contact: '0-1',
  company: '0-2',
  deal: '0-3',
  ticket: '0-5',
} as const;

/**
 * Configuración por cliente de los object type IDs de Custom Objects.
 * Se llena cuando el Adapter crea los custom objects en el portal.
 * Guardado en ClientConfigStore.
 */
export interface HubSpotCustomObjectTypeIds {
  readonly macroproyecto: string;
  readonly proyecto: string;
  readonly unidad: string;
  readonly agrupacion: string;
}

export interface HubSpotObjectTypeResolverConfig {
  readonly customObjectTypeIds: HubSpotCustomObjectTypeIds;
}

export class HubSpotObjectTypeResolver {
  constructor(private readonly config: HubSpotObjectTypeResolverConfig) {}

  resolve(objectType: CrmObjectType): string {
    switch (objectType) {
      case 'contact':
        return HUBSPOT_NATIVE_OBJECT_TYPES.contact;
      case 'deal':
        return HUBSPOT_NATIVE_OBJECT_TYPES.deal;
      case 'macroproyecto':
        return this.config.customObjectTypeIds.macroproyecto;
      case 'proyecto':
        return this.config.customObjectTypeIds.proyecto;
      case 'unidad':
        return this.config.customObjectTypeIds.unidad;
      case 'agrupacion':
        return this.config.customObjectTypeIds.agrupacion;
      default: {
        const _exhaustive: never = objectType;
        throw new Error(`Unknown object type: ${String(_exhaustive)}`);
      }
    }
  }
}

// ============================================================================
// Schemas Zod para responses de HubSpot API
// ============================================================================

/**
 * Response shape de GET /crm/v3/objects/{objectType}/{id}.
 */
export const HubSpotObjectSchema = z.object({
  id: z.string(),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  archived: z.boolean().optional(),
}).passthrough();

export type HubSpotObjectRaw = z.infer<typeof HubSpotObjectSchema>;

/**
 * Response shape de POST /crm/v3/objects/{objectType}/search.
 */
export const HubSpotSearchResponseSchema = z.object({
  total: z.number().optional(),
  results: z.array(HubSpotObjectSchema),
  paging: z.object({
    next: z.object({
      after: z.string(),
    }).optional(),
  }).optional(),
}).passthrough();

/**
 * Response shape de los endpoints batch.
 * Ojo: HubSpot retorna 207 Multi-Status cuando algunos fallan.
 */
export const HubSpotBatchResponseSchema = z.object({
  status: z.string().optional(),
  results: z.array(HubSpotObjectSchema).optional().default([]),
  errors: z.array(z.object({
    status: z.string().optional(),
    category: z.string().optional(),
    message: z.string(),
    context: z.record(z.string(), z.unknown()).optional(),
  })).optional().default([]),
  numErrors: z.number().optional(),
}).passthrough();

export type HubSpotBatchResponse = z.infer<typeof HubSpotBatchResponseSchema>;

// ============================================================================
// Properties API
// ============================================================================

/**
 * Response shape de GET /crm/v3/properties/{objectType}.
 */
export const HubSpotPropertySchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.string(),
  fieldType: z.string().optional(),
  description: z.string().optional(),
  groupName: z.string().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
}).passthrough();

export const HubSpotPropertiesListResponseSchema = z.object({
  results: z.array(HubSpotPropertySchema),
}).passthrough();

// ============================================================================
// Filter mapping (neutral → HubSpot)
// ============================================================================

const OPERATOR_MAP: Record<CrmFilterOperator, string> = {
  eq: 'EQ',
  neq: 'NEQ',
  gt: 'GT',
  gte: 'GTE',
  lt: 'LT',
  lte: 'LTE',
  in: 'IN',
  not_in: 'NOT_IN',
  contains: 'CONTAINS_TOKEN',
};

export interface HubSpotFilter {
  propertyName: string;
  operator: string;
  value?: string | number | boolean;
  values?: ReadonlyArray<string | number>;
}

export function mapFilterToHubSpot(filter: {
  property: string;
  operator: CrmFilterOperator;
  value: string | number | boolean | ReadonlyArray<string | number>;
}): HubSpotFilter {
  const hsOp = OPERATOR_MAP[filter.operator];

  if (filter.operator === 'in' || filter.operator === 'not_in') {
    return {
      propertyName: filter.property,
      operator: hsOp,
      values: Array.isArray(filter.value) ? filter.value : [filter.value as string | number],
    };
  }

  return {
    propertyName: filter.property,
    operator: hsOp,
    value: filter.value as string | number | boolean,
  };
}

// ============================================================================
// Property types (neutral → HubSpot)
// ============================================================================

export interface HubSpotPropertyDefinitionBody {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description?: string;
  groupName?: string;
  options?: ReadonlyArray<{ label: string; value: string; displayOrder: number }>;
  hasUniqueValue?: boolean;
  required?: boolean;
}

/**
 * Mapea un tipo neutral a los pares (type, fieldType) que HubSpot exige.
 * HubSpot distingue entre el tipo de dato (type) y el widget de UI (fieldType).
 */
export function mapPropertyTypeToHubSpot(type: string): { type: string; fieldType: string } {
  switch (type) {
    case 'string':
      return { type: 'string', fieldType: 'text' };
    case 'number':
      return { type: 'number', fieldType: 'number' };
    case 'boolean':
      return { type: 'bool', fieldType: 'booleancheckbox' };
    case 'date':
      return { type: 'date', fieldType: 'date' };
    case 'datetime':
      return { type: 'datetime', fieldType: 'date' };
    case 'enumeration':
      return { type: 'enumeration', fieldType: 'select' };
    default:
      return { type: 'string', fieldType: 'text' };
  }
}

// ============================================================================
// Mapping: HubSpot raw → CrmRecord del dominio
// ============================================================================

export function mapHubSpotObjectToCrmRecord(
  raw: HubSpotObjectRaw,
  objectType: CrmObjectType
): CrmRecord {
  return {
    id: raw.id,
    objectType,
    properties: raw.properties ?? {},
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
  };
}
