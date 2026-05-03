/**
 * SincoConnector — Implementación de IErpConnector para Sinco CBR/CRM.
 *
 * Esta es la única clase en todo el Engine que sabe cómo hablar con Sinco.
 * Todo el resto del sistema (Engine Core, Apps, API routes) usa esta clase
 * solamente a través de la interface IErpConnector.
 *
 * Responsabilidades:
 *   - Orquestar auth + http client + schema validation + mapping.
 *   - Traducir conceptos Sinco a conceptos del Engine (y viceversa).
 *   - Retornar siempre Result<T, EngineError>, nunca hacer throw.
 *   - Retry automático de auth en caso de 401 (token invalidado upstream).
 *
 * Lo que NO hace:
 *   - Lógica de negocio (eso vive en el Engine Core).
 *   - Persistencia (esta clase es stateless salvo por el cache del auth).
 *   - Decidir qué hacer ante un error — solo reporta.
 */

import { ErpError, type EngineError } from '@/engine/core/errors/EngineError';
import type { Logger } from '@/engine/core/logging/Logger';
import { type Result, ok, err } from '@/engine/core/types/Result';
import type {
  IErpConnector,
  Macroproyecto,
  Proyecto,
  Unidad,
  Agrupacion,
  Comprador,
  CompradorInput,
  ConfirmacionVentaInput,
  Vendedor,
  ConceptoPlanPago,
} from '@/engine/interfaces/IErpConnector';
import { SincoAuthManager, type SincoAuthConfig } from './SincoAuthManager';
import { SincoHttpClient, type SincoHttpClientConfig } from './SincoHttpClient';
import {
  SincoMacroproyectosResponseSchema,
  SincoProyectosResponseSchema,
  SincoUnidadesResponseSchema,
  SincoAgrupacionesResponseSchema,
  SincoCompradorSchema,
  SincoVendedoresResponseSchema,
  SincoConceptosPlanPagoResponseSchema,
  SincoCreateCompradorResponseSchema,
  mapMacroproyecto,
  mapProyecto,
  mapUnidad,
  mapAgrupacion,
  mapComprador,
  mapVendedor,
  mapConceptoPlanPago,
  buildSincoCompradorBody,
  buildSincoConfirmacionBody,
} from './types';

export interface SincoConnectorConfig {
  readonly clientId: string;
  readonly auth: SincoAuthConfig;
  readonly http?: Omit<SincoHttpClientConfig, 'clientId'>;
}

/**
 * Base path de los endpoints de negocio (después del auth).
 * Todos los endpoints que no son auth van prefijados con esto.
 */
const CBR_API_BASE = '/CBRClientes/API';

export class SincoConnector implements IErpConnector {
  readonly erpKind = 'sinco';

  private readonly http: SincoHttpClient;
  private readonly auth: SincoAuthManager;
  private readonly logger: Logger;

  constructor(config: SincoConnectorConfig, logger: Logger) {
    this.logger = logger.child({ clientId: config.clientId, erpKind: 'sinco' });

    this.http = new SincoHttpClient(this.logger, {
      baseUrl: config.auth.baseUrl,
      defaultTimeoutMs: config.http?.defaultTimeoutMs,
      maxRetries: config.http?.maxRetries,
      baseRetryDelayMs: config.http?.baseRetryDelayMs,
      clientId: config.clientId,
    });

    this.auth = new SincoAuthManager(this.http, config.auth, this.logger);
  }

  // =========================================================================
  // Lectura — Inventario
  // =========================================================================

  async getMacroproyectos(): Promise<Result<readonly Macroproyecto[], EngineError>> {
    return this.authenticatedGet<any[]>(
      '/Macroproyectos/Basica',
      SincoMacroproyectosResponseSchema,
      'erp.getMacroproyectos'
    ).then((result) => result.map((data) => data.map(mapMacroproyecto)));
  }

  async getProyectosByMacroproyecto(
    macroproyectoExternalId: number
  ): Promise<Result<readonly Proyecto[], EngineError>> {
    const path = `/Proyectos/${macroproyectoExternalId}`;
    return this.authenticatedGet<any[]>(
      path,
      SincoProyectosResponseSchema,
      'erp.getProyectosByMacroproyecto'
    ).then((result) =>
      result.map((data) =>
        data.map((raw) => {
          const r = raw as { idMacroproyecto?: number };
          return mapProyecto({
            ...(raw as object),
            idMacroproyecto: r.idMacroproyecto ?? macroproyectoExternalId,
          } as Parameters<typeof mapProyecto>[0]);
        })
      )
    );
  }

  async getUnidadesByProyecto(
    proyectoExternalId: number
  ): Promise<Result<readonly Unidad[], EngineError>> {
    const path = `/Unidades/PorProyecto/${proyectoExternalId}`;
    return this.authenticatedGet<any[]>(
      path,
      SincoUnidadesResponseSchema,
      'erp.getUnidadesByProyecto'
    ).then((result) => result.map((data) => data.map((u) => mapUnidad(u, proyectoExternalId))));
  }

  async getAgrupacionesByProyecto(
    proyectoExternalId: number
  ): Promise<Result<readonly Agrupacion[], EngineError>> {
    const path = `/Agrupaciones/IdProyecto/${proyectoExternalId}`;
    return this.authenticatedGet<any[]>(
      path,
      SincoAgrupacionesResponseSchema,
      'erp.getAgrupacionesByProyecto'
    ).then((result) => result.map((data) => data.map(mapAgrupacion)));
  }

  // =========================================================================
  // Lectura — Compradores y ventas
  // =========================================================================

  async getCompradorByIdentificacion(
    numeroIdentificacion: string
  ): Promise<Result<Comprador | null, EngineError>> {
    const path = `/Compradores/NumeroIdentificacion/${encodeURIComponent(numeroIdentificacion)}`;
    const tokenResult = await this.auth.getToken();
    if (tokenResult.isErr()) return err(tokenResult.error);

    const response = await this.http.request({
      method: 'GET',
      path: `${CBR_API_BASE}${path}`,
      token: tokenResult.value,
      operation: 'erp.getCompradorByIdentificacion',
    });

    if (response.isErr()) {
      // 404 = comprador no existe → no es error, retornamos null.
      if (response.error.code === 'ERP_RESOURCE_NOT_FOUND') {
        return ok(null);
      }
      return err(response.error);
    }

    const parsed = SincoCompradorSchema.safeParse(response.value.body);
    if (!parsed.success) {
      // Si el body es nulo/vacío lo tratamos como "no existe".
      if (response.value.body == null) return ok(null);
      return err(
        ErpError.schemaMismatch('Comprador', parsed.error.issues, {
          numeroIdentificacion,
        })
      );
    }

    return ok(mapComprador(parsed.data));
  }

  // =========================================================================
  // Lectura — Catálogos
  // =========================================================================

  async getVendedores(): Promise<Result<readonly Vendedor[], EngineError>> {
    return this.authenticatedGet<any[]>(
      '/Vendedores',
      SincoVendedoresResponseSchema,
      'erp.getVendedores'
    ).then((result) => result.map((data) => data.map(mapVendedor)));
  }

  async getConceptosPlanPago(): Promise<Result<readonly ConceptoPlanPago[], EngineError>> {
    return this.authenticatedGet<any[]>(
      '/Ventas/ConceptoPlanDePagos',
      SincoConceptosPlanPagoResponseSchema,
      'erp.getConceptosPlanPago'
    ).then((result) => result.map((data) => data.map(mapConceptoPlanPago)));
  }

  // =========================================================================
  // Escritura — Write-backs (idempotentes, sin retry automático)
  // =========================================================================

  async createComprador(
    input: CompradorInput
  ): Promise<Result<{ externalId: number }, EngineError>> {
    const body = buildSincoCompradorBody(input);

    const tokenResult = await this.auth.getToken();
    if (tokenResult.isErr()) return err(tokenResult.error);

    const response = await this.http.request({
      method: 'POST',
      path: `${CBR_API_BASE}/Compradores`,
      token: tokenResult.value,
      body,
      operation: 'erp.createComprador',
    });

    if (response.isErr()) return err(response.error);

    const parsed = SincoCreateCompradorResponseSchema.safeParse(response.value.body);
    if (!parsed.success) {
      return err(
        ErpError.schemaMismatch('createComprador response', parsed.error.issues, {
          numeroIdentificacion: input.numeroIdentificacion,
        })
      );
    }

    return ok({ externalId: parsed.data });
  }

  async confirmarVenta(
    input: ConfirmacionVentaInput
  ): Promise<Result<void, EngineError>> {
    const body = buildSincoConfirmacionBody(input);

    const tokenResult = await this.auth.getToken();
    if (tokenResult.isErr()) return err(tokenResult.error);

    const response = await this.http.request({
      method: 'PUT',
      path: `${CBR_API_BASE}/Ventas/ConfirmacionVenta`,
      token: tokenResult.value,
      body,
      operation: 'erp.confirmarVenta',
    });

    if (response.isErr()) {
      // Sinco retorna mensajes específicos cuando el periodo de ventas está cerrado
      const errorBody = response.error.context.body;
      const errorText = typeof errorBody === 'string' ? errorBody.toLowerCase() : '';
      if (errorText.includes('periodo') || errorText.includes('cerrado')) {
        return err(
          new ErpError(
            'ERP_SALES_PERIOD_CLOSED',
            'Periodo de ventas cerrado en Sinco',
            {
              ...response.error.context,
              retryable: false,
            }
          )
        );
      }
      return err(response.error);
    }

    return ok(undefined);
  }

  // =========================================================================
  // Health check
  // =========================================================================

  async healthCheck(): Promise<Result<{ latencyMs: number }, EngineError>> {
    const startedAt = Date.now();

    const tokenResult = await this.auth.getToken();
    if (tokenResult.isErr()) return err(tokenResult.error);

    const result = await this.http.request({
      method: 'GET',
      path: `${CBR_API_BASE}/Macroproyectos/Basica`,
      token: tokenResult.value,
      operation: 'erp.healthCheck',
      timeoutMs: 10_000,
    });

    if (result.isErr()) return err(result.error);

    return ok({ latencyMs: Date.now() - startedAt });
  }

  // =========================================================================
  // Internos
  // =========================================================================

  private get baseUrl(): string {
    return this.auth.baseUrl;
  }

  /**
   * Helper genérico para GETs autenticados:
   *  1. Obtiene token (cached o nuevo).
   *  2. Ejecuta el GET.
   *  3. Si retorna 401, invalida token y reintenta UNA vez.
   *  4. Valida el response con el schema Zod.
   */
  private async authenticatedGet<T>(
    subpath: string,
    schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: { issues: unknown } } },
    operation: string
  ): Promise<Result<T, EngineError>> {
    const fullPath = `${CBR_API_BASE}${subpath}`;

    const execute = async (): Promise<Result<T, EngineError>> => {
      const tokenResult = await this.auth.getToken();
      if (tokenResult.isErr()) return err(tokenResult.error);

      const response = await this.http.request({
        method: 'GET',
        path: fullPath,
        token: tokenResult.value,
        operation,
      });

      if (response.isErr()) return err(response.error);

      const parsed = schema.safeParse(response.value.body);
      if (!parsed.success) {
        const issues = (parsed as { success: false; error: { issues: unknown } }).error.issues;
        return err(
          ErpError.schemaMismatch(operation, issues, {
            operation,
            path: fullPath,
          })
        );
      }

      return ok(parsed.data);
    };

    const first = await execute();
    if (first.isOk()) return first;

    // Si fue un 401, el token pudo haber sido invalidado upstream.
    // Invalidamos el cache y reintentamos una sola vez.
    const error = first.error;
    if (
      error.context.httpStatus === 401 ||
      error.code === 'AUTH_TOKEN_EXPIRED'
    ) {
      this.logger.warn({ operation }, 'Got 401, invalidating token and retrying once');
      this.auth.invalidate();
      return execute();
    }

    return first;
  }
}
