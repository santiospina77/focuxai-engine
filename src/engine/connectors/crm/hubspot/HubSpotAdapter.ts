/**
 * HubSpotAdapter — Implementación de ICrmAdapter para HubSpot CRM API v3.
 *
 * Única clase que sabe hablar HubSpot. El resto del Engine usa ICrmAdapter.
 *
 * Endpoints clave usados:
 *   - GET  /crm/v3/objects/{type}/{id}          → getRecord
 *   - POST /crm/v3/objects/{type}               → createRecord
 *   - PATCH /crm/v3/objects/{type}/{id}         → updateRecord
 *   - POST /crm/v3/objects/{type}/batch/create  → createRecordsBatch
 *   - POST /crm/v3/objects/{type}/batch/update  → updateRecordsBatch
 *   - POST /crm/v3/objects/{type}/batch/upsert  → upsertRecordsByExternalId
 *   - POST /crm/v3/objects/{type}/search        → searchRecords
 *   - PUT  /crm/v4/objects/{from}/{fromId}/associations/default/{to}/{toId}
 *                                               → createAssociation
 *   - POST /crm/v3/properties/{type}/batch/create → ensureProperties
 *
 * Constraints de HubSpot:
 *   - Batch size máximo: 100 records.
 *   - Rate limit: 100 req / 10s por cada Private App Token.
 *   - Search API: 4 req/s, 100 resultados por página, max 10k total.
 */

import { ResourceError, AuthError, type EngineError } from '../../../core/errors/EngineError';
import { HttpClient } from '../../../core/http/HttpClient';
import type { Logger } from '../../../core/logging/Logger';
import { type Result, ok, err } from '../../../core/types/Result';
import type {
  ICrmAdapter,
  CrmRecord,
  CrmRecordInput,
  CrmRecordUpdate,
  CrmObjectType,
  CrmSearchQuery,
  CrmSearchResult,
  CrmAssociation,
  CrmPropertyDefinition,
  BatchResult,
} from '../../../interfaces/ICrmAdapter';
import {
  HubSpotObjectTypeResolver,
  HubSpotObjectSchema,
  HubSpotSearchResponseSchema,
  HubSpotBatchResponseSchema,
  mapFilterToHubSpot,
  mapPropertyTypeToHubSpot,
  mapHubSpotObjectToCrmRecord,
  type HubSpotCustomObjectTypeIds,
  type HubSpotPropertyDefinitionBody,
} from './types';

export interface HubSpotAdapterConfig {
  readonly clientId: string;
  readonly privateAppToken: string;
  readonly customObjectTypeIds: HubSpotCustomObjectTypeIds;
  readonly baseUrl?: string; // default https://api.hubapi.com
  readonly defaultTimeoutMs?: number;
  readonly maxRetries?: number;
}

const DEFAULT_BASE_URL = 'https://api.hubapi.com';
const BATCH_MAX_SIZE = 100;

export class HubSpotAdapter implements ICrmAdapter {
  readonly crmKind = 'hubspot';

  private readonly http: HttpClient;
  private readonly resolver: HubSpotObjectTypeResolver;
  private readonly logger: Logger;

  constructor(config: HubSpotAdapterConfig, logger: Logger) {
    this.logger = logger.child({ clientId: config.clientId, crmKind: 'hubspot' });
    this.resolver = new HubSpotObjectTypeResolver({
      customObjectTypeIds: config.customObjectTypeIds,
    });

    const token = config.privateAppToken;

    this.http = new HttpClient(
      {
        baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
        defaultTimeoutMs: config.defaultTimeoutMs ?? 15_000,
        maxRetries: config.maxRetries ?? 3,
        clientId: config.clientId,
        defaultHeaders: {
          Authorization: `Bearer ${token}`,
        },
        mapHttpError: ({ status, body, context }) => {
          if (status === 404) {
            return ResourceError.crmNotFound(
              'HubSpot resource not found',
              { ...context, httpStatus: status, body },
            );
          }
          if (status === 401 || status === 403) {
            return new AuthError(
              'AUTH_CRM_UNAUTHORIZED',
              `HubSpot auth error (HTTP ${status}) — verifica el Private App Token`,
              { ...context, httpStatus: status, body, retryable: false },
            );
          }
          if (status === 409) {
            return ResourceError.crmDuplicateRecord(
              'HubSpot rejected duplicate record',
              { ...context, httpStatus: status, body },
            );
          }
          if (status === 429) {
            return ResourceError.crmRateLimited(
              'HubSpot rate limit exceeded',
              { ...context, httpStatus: status, body },
            );
          }
          if (status >= 500) {
            return ResourceError.crmServerError(
              `HubSpot server error (HTTP ${status})`,
              { ...context, httpStatus: status, body },
            );
          }
          return ResourceError.crmRequestRejected(
            `HubSpot rejected request (HTTP ${status})`,
            { ...context, httpStatus: status, body },
          );
        },
        mapNetworkError: ({ cause, timedOut, context }) => {
          if (timedOut) {
            return ResourceError.crmTimeout(
              'HubSpot request timed out',
              { ...context, retryable: true },
              cause
            );
          }
          return ResourceError.crmNetworkError(
            'Network error communicating with HubSpot',
            { ...context, retryable: true },
            cause
          );
        },
      },
      this.logger
    );
  }

  // =========================================================================
  // CRUD individual
  // =========================================================================

  async createRecord(input: CrmRecordInput): Promise<Result<CrmRecord, EngineError>> {
    const objectTypeId = this.resolver.resolve(input.objectType);
    const response = await this.http.request({
      method: 'POST',
      path: `/crm/v3/objects/${objectTypeId}`,
      body: { properties: input.properties },
      operation: 'crm.createRecord',
    });

    if (response.isErr()) return err(response.error);

    const parsed = HubSpotObjectSchema.safeParse(response.value.body);
    if (!parsed.success) {
      return err(
        ResourceError.crmSchemaMismatch(
          'HubSpot createRecord response schema mismatch',
          { issues: parsed.error.issues, retryable: false }
        )
      );
    }

    return ok(mapHubSpotObjectToCrmRecord(parsed.data, input.objectType));
  }

  async updateRecord(update: CrmRecordUpdate): Promise<Result<CrmRecord, EngineError>> {
    const objectTypeId = this.resolver.resolve(update.objectType);
    const response = await this.http.request({
      method: 'PATCH',
      path: `/crm/v3/objects/${objectTypeId}/${encodeURIComponent(update.id)}`,
      body: { properties: update.properties },
      operation: 'crm.updateRecord',
    });

    if (response.isErr()) return err(response.error);

    const parsed = HubSpotObjectSchema.safeParse(response.value.body);
    if (!parsed.success) {
      return err(
        ResourceError.crmSchemaMismatch(
          'HubSpot updateRecord response schema mismatch',
          { issues: parsed.error.issues, retryable: false }
        )
      );
    }

    return ok(mapHubSpotObjectToCrmRecord(parsed.data, update.objectType));
  }

  async getRecord(
    objectType: CrmObjectType,
    id: string,
    properties?: readonly string[]
  ): Promise<Result<CrmRecord | null, EngineError>> {
    const objectTypeId = this.resolver.resolve(objectType);
    const query: Record<string, string | undefined> = {};
    if (properties && properties.length > 0) {
      query['properties'] = properties.join(',');
    }

    const response = await this.http.request({
      method: 'GET',
      path: `/crm/v3/objects/${objectTypeId}/${encodeURIComponent(id)}`,
      query,
      operation: 'crm.getRecord',
    });

    if (response.isErr()) {
      if (response.error.code === 'RESOURCE_CRM_NOT_FOUND') {
        return ok(null);
      }
      return err(response.error);
    }

    const parsed = HubSpotObjectSchema.safeParse(response.value.body);
    if (!parsed.success) {
      return err(
        ResourceError.crmSchemaMismatch(
          'HubSpot getRecord response schema mismatch',
          { issues: parsed.error.issues, retryable: false }
        )
      );
    }

    return ok(mapHubSpotObjectToCrmRecord(parsed.data, objectType));
  }

  async deleteRecord(
    objectType: CrmObjectType,
    id: string
  ): Promise<Result<void, EngineError>> {
    const objectTypeId = this.resolver.resolve(objectType);
    const response = await this.http.request({
      method: 'DELETE',
      path: `/crm/v3/objects/${objectTypeId}/${encodeURIComponent(id)}`,
      operation: 'crm.deleteRecord',
    });

    if (response.isErr()) return err(response.error);
    return ok(undefined);
  }

  // =========================================================================
  // CRUD batch — crítico para performance del sync
  // =========================================================================

  async createRecordsBatch(
    inputs: readonly CrmRecordInput[]
  ): Promise<Result<BatchResult<CrmRecord>, EngineError>> {
    if (inputs.length === 0) {
      return ok({ successful: [], failed: [] });
    }

    // Todos los inputs deben ser del mismo objectType para batch.
    const objectType = inputs[0]!.objectType;
    const objectTypeId = this.resolver.resolve(objectType);

    return this.executeInBatches(inputs, async (chunk) => {
      const response = await this.http.request({
        method: 'POST',
        path: `/crm/v3/objects/${objectTypeId}/batch/create`,
        body: {
          inputs: chunk.map((input) => ({ properties: input.properties })),
        },
        operation: 'crm.createRecordsBatch',
      });

      if (response.isErr()) {
        return {
          successful: [],
          failed: chunk.map((input) => ({ input, error: response.error })),
        };
      }

      const parsed = HubSpotBatchResponseSchema.safeParse(response.value.body);
      if (!parsed.success) {
        const schemaError = ResourceError.crmSchemaMismatch(
          'HubSpot batch response schema mismatch',
          { issues: parsed.error.issues, retryable: false }
        );
        return {
          successful: [],
          failed: chunk.map((input) => ({ input, error: schemaError })),
        };
      }

      return {
        successful: parsed.data.results.map((raw) =>
          mapHubSpotObjectToCrmRecord(raw, objectType)
        ),
        failed: parsed.data.errors.map((e) => ({
          input: e.context,
          error: ResourceError.crmRequestRejected(
            e.message,
            { category: e.category, retryable: false }
          ),
        })),
      };
    });
  }

  async updateRecordsBatch(
    updates: readonly CrmRecordUpdate[]
  ): Promise<Result<BatchResult<CrmRecord>, EngineError>> {
    if (updates.length === 0) {
      return ok({ successful: [], failed: [] });
    }

    const objectType = updates[0]!.objectType;
    const objectTypeId = this.resolver.resolve(objectType);

    return this.executeInBatches(updates, async (chunk) => {
      const response = await this.http.request({
        method: 'POST',
        path: `/crm/v3/objects/${objectTypeId}/batch/update`,
        body: {
          inputs: chunk.map((u) => ({
            id: u.id,
            properties: u.properties,
          })),
        },
        operation: 'crm.updateRecordsBatch',
      });

      if (response.isErr()) {
        return {
          successful: [],
          failed: chunk.map((input) => ({ input, error: response.error })),
        };
      }

      const parsed = HubSpotBatchResponseSchema.safeParse(response.value.body);
      if (!parsed.success) {
        const schemaError = ResourceError.crmSchemaMismatch(
          'HubSpot batch response schema mismatch',
          { issues: parsed.error.issues, retryable: false }
        );
        return {
          successful: [],
          failed: chunk.map((input) => ({ input, error: schemaError })),
        };
      }

      return {
        successful: parsed.data.results.map((raw) =>
          mapHubSpotObjectToCrmRecord(raw, objectType)
        ),
        failed: parsed.data.errors.map((e) => ({
          input: e.context,
          error: ResourceError.crmRequestRejected(
            e.message,
            { category: e.category, retryable: false }
          ),
        })),
      };
    });
  }

  async upsertRecordsByExternalId(
    objectType: CrmObjectType,
    externalIdProperty: string,
    inputs: readonly CrmRecordInput[]
  ): Promise<Result<BatchResult<CrmRecord>, EngineError>> {
    if (inputs.length === 0) {
      return ok({ successful: [], failed: [] });
    }

    const objectTypeId = this.resolver.resolve(objectType);

    return this.executeInBatches(inputs, async (chunk) => {
      // HubSpot upsert batch requiere idProperty + que cada input tenga
      // el valor del externalId en properties.
      const body = {
        inputs: chunk.map((input) => ({
          idProperty: externalIdProperty,
          id: String(input.properties[externalIdProperty] ?? ''),
          properties: input.properties,
        })),
      };

      const response = await this.http.request({
        method: 'POST',
        path: `/crm/v3/objects/${objectTypeId}/batch/upsert`,
        body,
        operation: 'crm.upsertRecordsByExternalId',
      });

      if (response.isErr()) {
        return {
          successful: [],
          failed: chunk.map((input) => ({ input, error: response.error })),
        };
      }

      const parsed = HubSpotBatchResponseSchema.safeParse(response.value.body);
      if (!parsed.success) {
        const schemaError = ResourceError.crmSchemaMismatch(
          'HubSpot upsert batch response schema mismatch',
          { issues: parsed.error.issues, retryable: false }
        );
        return {
          successful: [],
          failed: chunk.map((input) => ({ input, error: schemaError })),
        };
      }

      return {
        successful: parsed.data.results.map((raw) =>
          mapHubSpotObjectToCrmRecord(raw, objectType)
        ),
        failed: parsed.data.errors.map((e) => ({
          input: e.context,
          error: ResourceError.crmRequestRejected(
            e.message,
            { category: e.category, retryable: false }
          ),
        })),
      };
    });
  }

  // =========================================================================
  // Búsqueda
  // =========================================================================

  async searchRecords(
    query: CrmSearchQuery
  ): Promise<Result<CrmSearchResult, EngineError>> {
    const objectTypeId = this.resolver.resolve(query.objectType);

    const filterGroups =
      query.filters && query.filters.length > 0
        ? [
            {
              filters: query.filters.map((f) =>
                mapFilterToHubSpot({
                  property: f.property,
                  operator: f.operator,
                  value: f.value,
                })
              ),
            },
          ]
        : [];

    const body: Record<string, unknown> = {
      filterGroups,
      limit: query.limit ?? 100,
    };
    if (query.properties && query.properties.length > 0) {
      body['properties'] = [...query.properties];
    }
    if (query.after) {
      body['after'] = query.after;
    }

    const response = await this.http.request({
      method: 'POST',
      path: `/crm/v3/objects/${objectTypeId}/search`,
      body,
      operation: 'crm.searchRecords',
      idempotent: true, // Search es idempotente aunque sea POST
    });

    if (response.isErr()) return err(response.error);

    const parsed = HubSpotSearchResponseSchema.safeParse(response.value.body);
    if (!parsed.success) {
      return err(
        ResourceError.crmSchemaMismatch(
          'HubSpot search response schema mismatch',
          { issues: parsed.error.issues, retryable: false }
        )
      );
    }

    return ok({
      records: parsed.data.results.map((raw) =>
        mapHubSpotObjectToCrmRecord(raw, query.objectType)
      ),
      nextCursor: parsed.data.paging?.next?.after,
      total: parsed.data.total,
    });
  }

  async findByExternalId(
    objectType: CrmObjectType,
    externalIdProperty: string,
    externalIdValue: string | number,
    properties?: readonly string[]
  ): Promise<Result<CrmRecord | null, EngineError>> {
    const result = await this.searchRecords({
      objectType,
      filters: [
        {
          property: externalIdProperty,
          operator: 'eq',
          value: externalIdValue,
        },
      ],
      properties,
      limit: 1,
    });

    if (result.isErr()) return err(result.error);
    if (result.value.records.length === 0) return ok(null);
    return ok(result.value.records[0]!);
  }

  // =========================================================================
  // Associations
  // =========================================================================

  async createAssociation(
    association: CrmAssociation
  ): Promise<Result<void, EngineError>> {
    const fromType = this.resolver.resolve(association.fromObjectType);
    const toType = this.resolver.resolve(association.toObjectType);

    // HubSpot v4 permite "default" como label cuando no se especifica tipo.
    const path = `/crm/v4/objects/${fromType}/${encodeURIComponent(association.fromId)}/associations/default/${toType}/${encodeURIComponent(association.toId)}`;

    const response = await this.http.request({
      method: 'PUT',
      path,
      operation: 'crm.createAssociation',
    });

    if (response.isErr()) return err(response.error);
    return ok(undefined);
  }

  async createAssociationsBatch(
    associations: readonly CrmAssociation[]
  ): Promise<Result<BatchResult<CrmAssociation>, EngineError>> {
    // HubSpot v4 batch associations se hace por pares (fromType, toType).
    // Agrupamos por el par, y luego por chunks de 100.
    const groups = new Map<string, CrmAssociation[]>();
    for (const assoc of associations) {
      const key = `${assoc.fromObjectType}|${assoc.toObjectType}`;
      let group = groups.get(key);
      if (!group) {
        group = [];
        groups.set(key, group);
      }
      group.push(assoc);
    }

    const successful: CrmAssociation[] = [];
    const failed: Array<{ input: CrmAssociation; error: EngineError }> = [];

    for (const [key, groupAssocs] of groups) {
      const [fromObjectType, toObjectType] = key.split('|') as [CrmObjectType, CrmObjectType];
      const fromType = this.resolver.resolve(fromObjectType);
      const toType = this.resolver.resolve(toObjectType);

      // Chunks de 100
      for (let i = 0; i < groupAssocs.length; i += BATCH_MAX_SIZE) {
        const chunk = groupAssocs.slice(i, i + BATCH_MAX_SIZE);

        const body = {
          inputs: chunk.map((assoc) => ({
            from: { id: assoc.fromId },
            to: { id: assoc.toId },
            types: assoc.associationTypeId
              ? [{
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: assoc.associationTypeId,
                }]
              : [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 0 }], // default
          })),
        };

        const response = await this.http.request({
          method: 'POST',
          path: `/crm/v4/associations/${fromType}/${toType}/batch/create`,
          body,
          operation: 'crm.createAssociationsBatch',
        });

        if (response.isErr()) {
          chunk.forEach((input) => failed.push({ input, error: response.error }));
        } else {
          chunk.forEach((input) => successful.push(input));
        }
      }
    }

    return ok({ successful, failed });
  }

  // =========================================================================
  // Schema — ensureProperties (idempotente)
  // =========================================================================

  async ensureProperties(
    objectType: CrmObjectType,
    properties: readonly CrmPropertyDefinition[]
  ): Promise<Result<void, EngineError>> {
    if (properties.length === 0) return ok(undefined);

    const objectTypeId = this.resolver.resolve(objectType);

    // Primero leer las existentes para evitar 409 Conflict.
    const existingResponse = await this.http.request({
      method: 'GET',
      path: `/crm/v3/properties/${objectTypeId}`,
      operation: 'crm.listProperties',
    });

    if (existingResponse.isErr()) return err(existingResponse.error);

    const existingBody = existingResponse.value.body as { results?: Array<{ name: string }> };
    const existingNames = new Set((existingBody.results ?? []).map((p) => p.name));

    const toCreate = properties.filter((p) => !existingNames.has(p.internalName));
    if (toCreate.length === 0) {
      this.logger.info(
        { objectType, requested: properties.length },
        'All properties already exist, nothing to create'
      );
      return ok(undefined);
    }

    const bodies: HubSpotPropertyDefinitionBody[] = toCreate.map((p, idx) => {
      const { type, fieldType } = mapPropertyTypeToHubSpot(p.type);
      return {
        name: p.internalName,
        label: p.label,
        type,
        fieldType,
        description: p.description,
        groupName: 'focuxai_properties',
        hasUniqueValue: p.unique,
        options: p.options?.map((opt, i) => ({
          label: opt.label,
          value: opt.value,
          displayOrder: i,
        })),
      };
    });

    // HubSpot batch create properties: 100 max por call
    for (let i = 0; i < bodies.length; i += BATCH_MAX_SIZE) {
      const chunk = bodies.slice(i, i + BATCH_MAX_SIZE);
      const response = await this.http.request({
        method: 'POST',
        path: `/crm/v3/properties/${objectTypeId}/batch/create`,
        body: { inputs: chunk },
        operation: 'crm.ensureProperties',
      });
      if (response.isErr()) return err(response.error);
    }

    this.logger.info(
      { objectType, created: toCreate.length, skipped: properties.length - toCreate.length },
      'Properties ensured'
    );
    return ok(undefined);
  }

  // =========================================================================
  // Health check
  // =========================================================================

  async healthCheck(): Promise<Result<{ latencyMs: number }, EngineError>> {
    const startedAt = Date.now();
    // Endpoint ligero que solo requiere token válido.
    const response = await this.http.request({
      method: 'GET',
      path: '/account-info/v3/details',
      operation: 'crm.healthCheck',
      timeoutMs: 10_000,
    });

    if (response.isErr()) return err(response.error);
    return ok({ latencyMs: Date.now() - startedAt });
  }

  // =========================================================================
  // Internos
  // =========================================================================

  /**
   * Ejecuta una operación batch en chunks de BATCH_MAX_SIZE (100).
   * Combina los resultados parciales en un BatchResult final.
   * Si un chunk entero falla, todos sus items quedan en `failed`.
   */
  private async executeInBatches<I, R>(
    inputs: readonly I[],
    executor: (chunk: readonly I[]) => Promise<{
      successful: readonly R[];
      failed: ReadonlyArray<{ input: unknown; error: EngineError }>;
    }>
  ): Promise<Result<BatchResult<R>, EngineError>> {
    const successful: R[] = [];
    const failed: Array<{ input: unknown; error: EngineError }> = [];

    for (let i = 0; i < inputs.length; i += BATCH_MAX_SIZE) {
      const chunk = inputs.slice(i, i + BATCH_MAX_SIZE);
      const result = await executor(chunk);
      successful.push(...result.successful);
      failed.push(...result.failed);
    }

    return ok({ successful, failed });
  }
}
