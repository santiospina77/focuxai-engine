/**
 * SincoHttpClient — Wrapper thin sobre HttpClient genérico con los mappers
 * de error específicos de Sinco.
 *
 * La lógica de transporte (timeout, retry, logging) vive en HttpClient.
 * Este archivo solo aporta:
 *   - Saber que HTTP 300 (Multiple Choices) de Sinco es éxito (multi-BD auth).
 *   - Mapear status codes de Sinco a ErpError con contexto apropiado.
 */

import { HttpClient } from '@/engine/core/http/HttpClient';
import type { HttpRequest, HttpResponse } from '@/engine/core/http/HttpClient';
import { ErpError } from '@/engine/core/errors/EngineError';
import type { Logger } from '@/engine/core/logging/Logger';
import type { Result } from '@/engine/core/types/Result';

export interface SincoHttpClientConfig {
  readonly baseUrl: string;
  readonly defaultTimeoutMs?: number;
  readonly maxRetries?: number;
  readonly baseRetryDelayMs?: number;
  readonly clientId?: string;
}

export interface SincoHttpRequest extends Omit<HttpRequest, 'idempotent'> {
  /**
   * Para requests autenticados — el caller pasa el token final del 3-step.
   * Si no se provee (ej. durante auth inicial), no se agrega Authorization.
   */
  readonly token?: string;
  readonly idempotent?: boolean;
}

export class SincoHttpClient {
  private readonly http: HttpClient;

  constructor(logger: Logger, config: SincoHttpClientConfig) {
    this.http = new HttpClient(
      {
        baseUrl: config.baseUrl,
        defaultTimeoutMs: config.defaultTimeoutMs,
        maxRetries: config.maxRetries,
        baseRetryDelayMs: config.baseRetryDelayMs,
        clientId: config.clientId,
        // Sinco usa HTTP 300 Multiple Choices en el auth multi-BD. Es éxito.
        additionalSuccessStatuses: [300],
        mapHttpError: ({ status, body, request, context }) => {
          if (status === 404) {
            return ErpError.notFound(request.path, context);
          }
          if (status === 401 || status === 403) {
            return new ErpError(
              'ERP_VALIDATION_ERROR',
              `Sinco auth/authorization error (HTTP ${status})`,
              { ...context, httpStatus: status, body, retryable: false }
            );
          }
          if (status === 429) {
            return ErpError.rateLimited({ ...context, body });
          }
          if (status >= 500) {
            return ErpError.serverError(status, body, context);
          }
          return ErpError.validation(
            `Sinco rejected request (HTTP ${status})`,
            { ...context, httpStatus: status, body }
          );
        },
        mapNetworkError: ({ cause, timeoutMs, timedOut, context }) => {
          if (timedOut) {
            return ErpError.timeout(timeoutMs, context);
          }
          return ErpError.networkError(cause, context);
        },
      },
      logger
    );
  }

  async request<T = unknown>(
    req: SincoHttpRequest
  ): Promise<Result<HttpResponse<T>, ErpError>> {
    const headers: Record<string, string> = { ...(req.headers ?? {}) };
    if (req.token) {
      headers['Authorization'] = `Bearer ${req.token}`;
    }

    return this.http.request<T>({
      ...req,
      headers,
    }) as Promise<Result<HttpResponse<T>, ErpError>>;
  }
}
