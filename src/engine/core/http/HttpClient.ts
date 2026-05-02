/**
 * HttpClient — Cliente HTTP genérico reutilizable.
 *
 * Esta clase abstrae toda la lógica de transporte HTTP (timeout, retry,
 * logging, mapeo de errores) para que los connectors (Sinco, HubSpot,
 * Salesforce, etc.) no dupliquen este código.
 *
 * Cada connector instancia un HttpClient con:
 *   - Su URL base
 *   - Su estrategia de mapeo de errores HTTP → EngineError
 *   - Opcionalmente su función de auth (provee token en cada request)
 *
 * Principios:
 *   - Retry automático SOLO en GETs con errores retryables.
 *   - NUNCA retry en POST/PUT/DELETE — evita writes duplicados.
 *   - Exponential backoff con jitter para no estampedar al servidor.
 *   - Logging estructurado de cada intento.
 */

import { EngineError } from '../errors/EngineError';
import type { Logger } from '../logging/Logger';
import { type Result, ok, err } from '../types/Result';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly operation?: string; // para logs
  /**
   * Override del comportamiento de retry por request.
   * Default: true para GETs, false para todo lo demás.
   */
  readonly idempotent?: boolean;
}

export interface HttpResponse<T = unknown> {
  readonly status: number;
  readonly body: T;
  readonly headers: Readonly<Record<string, string>>;
  readonly durationMs: number;
}

/**
 * Función que mapea un error HTTP a un EngineError tipado específico del dominio.
 * Cada connector provee su propia implementación.
 */
export type HttpErrorMapper = (input: {
  readonly status: number;
  readonly body: unknown;
  readonly request: HttpRequest;
  readonly context: Readonly<Record<string, unknown>>;
}) => EngineError;

/**
 * Función que provee headers de auth en cada request (ej. Bearer token).
 * Puede ser asíncrona porque el token puede venir de un cache o de un refresh.
 */
export type AuthProvider = () => Promise<Result<Record<string, string>, EngineError>>;

/**
 * Función que mapea errores de red/timeout a EngineError del dominio.
 */
export type NetworkErrorMapper = (input: {
  readonly cause: unknown;
  readonly timeoutMs: number;
  readonly timedOut: boolean;
  readonly request: HttpRequest;
  readonly context: Readonly<Record<string, unknown>>;
}) => EngineError;

export interface HttpClientConfig {
  readonly baseUrl: string;
  readonly defaultTimeoutMs?: number;
  readonly maxRetries?: number;
  readonly baseRetryDelayMs?: number;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly clientId?: string;
  readonly mapHttpError: HttpErrorMapper;
  readonly mapNetworkError: NetworkErrorMapper;
  readonly authProvider?: AuthProvider;
  /**
   * Status codes adicionales a considerar "éxito" además de 2xx.
   * Útil para Sinco que usa 300 Multiple Choices en el auth multi-BD.
   */
  readonly additionalSuccessStatuses?: readonly number[];
}

const DEFAULTS = {
  timeoutMs: 15_000,
  maxRetries: 3,
  baseRetryDelayMs: 500,
} as const;

export class HttpClient {
  private readonly config: Required<
    Omit<HttpClientConfig, 'authProvider' | 'defaultHeaders' | 'additionalSuccessStatuses' | 'clientId'>
  > & {
    authProvider?: AuthProvider;
    defaultHeaders: Readonly<Record<string, string>>;
    additionalSuccessStatuses: readonly number[];
    clientId?: string;
  };

  constructor(
    config: HttpClientConfig,
    private readonly logger: Logger
  ) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ''),
      defaultTimeoutMs: config.defaultTimeoutMs ?? DEFAULTS.timeoutMs,
      maxRetries: config.maxRetries ?? DEFAULTS.maxRetries,
      baseRetryDelayMs: config.baseRetryDelayMs ?? DEFAULTS.baseRetryDelayMs,
      defaultHeaders: config.defaultHeaders ?? {},
      mapHttpError: config.mapHttpError,
      mapNetworkError: config.mapNetworkError,
      authProvider: config.authProvider,
      additionalSuccessStatuses: config.additionalSuccessStatuses ?? [],
      clientId: config.clientId,
    };
  }

  async request<T = unknown>(req: HttpRequest): Promise<Result<HttpResponse<T>, EngineError>> {
    const isIdempotent = req.idempotent ?? req.method === 'GET';
    const maxAttempts = isIdempotent ? this.config.maxRetries : 1;

    let lastError: EngineError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { result, retryAfterMs } = await this.executeOnce<T>(req, attempt);

      if (result.isOk()) return result;

      lastError = result.error;

      if (!lastError.isRetryable || !isIdempotent) {
        return result;
      }

      if (attempt < maxAttempts) {
        // Prefer Retry-After header when available (429 rate limits).
        // Falls back to exponential backoff + jitter.
        const backoffMs = this.computeBackoff(attempt);
        const delayMs = retryAfterMs !== null ? Math.max(retryAfterMs, backoffMs) : backoffMs;
        this.logger.warn(
          {
            clientId: this.config.clientId,
            operation: req.operation ?? req.path,
            attempt,
            maxAttempts,
            delayMs,
            retryAfterMs,
            errorCode: lastError.code,
          },
          'HTTP request failed, retrying'
        );
        await sleep(delayMs);
      }
    }

    return err(lastError!);
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /**
   * Internal result of a single HTTP attempt.
   * Carries retry metadata alongside the Result without mutating EngineError.
   */
  private async executeOnce<T>(
    req: HttpRequest,
    attempt: number
  ): Promise<HttpAttemptResult<HttpResponse<T>>> {
    const url = this.buildUrl(req.path, req.query);
    const timeoutMs = req.timeoutMs ?? this.config.defaultTimeoutMs;
    const startedAt = Date.now();

    // Obtener headers de auth (si hay provider)
    const authHeadersResult = await this.resolveAuthHeaders();
    if (authHeadersResult.isErr()) return { result: err(authHeadersResult.error), retryAfterMs: null };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this.config.defaultHeaders,
      ...authHeadersResult.value,
      ...(req.headers ?? {}),
    };

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const init: RequestInit = {
      method: req.method,
      headers,
      signal: controller.signal,
    };

    if (req.body !== undefined && req.method !== 'GET') {
      init.body = JSON.stringify(req.body);
    }

    const logContext = {
      clientId: this.config.clientId,
      operation: req.operation ?? req.path,
      method: req.method,
      path: req.path,
    };

    try {
      const response = await fetch(url, init);
      const durationMs = Date.now() - startedAt;

      const rawText = await response.text();
      let parsedBody: unknown = null;
      if (rawText.length > 0) {
        try {
          parsedBody = JSON.parse(rawText);
        } catch {
          parsedBody = rawText;
        }
      }

      const responseHeaders = this.extractHeaders(response);

      this.logger.info(
        {
          ...logContext,
          status: response.status,
          durationMs,
          attempt,
        },
        'HTTP request completed'
      );

      const isSuccess =
        response.ok ||
        this.config.additionalSuccessStatuses.includes(response.status);

      if (isSuccess) {
        return {
          result: ok({
            status: response.status,
            body: parsedBody as T,
            headers: responseHeaders,
            durationMs,
          }),
          retryAfterMs: null,
        };
      }

      const mappedError = this.config.mapHttpError({
        status: response.status,
        body: parsedBody,
        request: req,
        context: logContext,
      });

      // Extract Retry-After as sidecar metadata — never mutate the error.
      const retryAfterMs = parseRetryAfterMs(responseHeaders['retry-after']);

      return { result: err(mappedError), retryAfterMs };
    } catch (caught) {
      const durationMs = Date.now() - startedAt;
      const timedOut = caught instanceof Error && caught.name === 'AbortError';

      const mapped = this.config.mapNetworkError({
        cause: caught,
        timeoutMs,
        timedOut,
        request: req,
        context: logContext,
      });

      this.logger.error(
        {
          ...logContext,
          durationMs,
          attempt,
          errorCode: mapped.code,
          timedOut,
        },
        'HTTP request failed'
      );

      return { result: err(mapped), retryAfterMs: null };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async resolveAuthHeaders(): Promise<Result<Record<string, string>, EngineError>> {
    if (!this.config.authProvider) return ok({});
    return this.config.authProvider();
  }

  private buildUrl(path: string, query?: HttpRequest['query']): string {
    const trimmedPath = path.startsWith('/') ? path : `/${path}`;
    let url = `${this.config.baseUrl}${trimmedPath}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    return url;
  }

  private extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return headers;
  }

  private computeBackoff(attempt: number): number {
    const exponential = this.config.baseRetryDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * exponential * 0.5;
    return Math.floor(exponential + jitter);
  }
}

// ─── Private helpers (outside class, no access to instance state) ───

/**
 * Internal result of a single HTTP attempt.
 * Carries retry metadata as a sidecar — EngineError stays immutable.
 */
interface HttpAttemptResult<T> {
  readonly result: Result<T, EngineError>;
  readonly retryAfterMs: number | null;
}

/**
 * Parse Retry-After header value to milliseconds.
 * HubSpot sends seconds (e.g., "10"). HTTP spec also allows HTTP-date (ignored).
 * Returns null if absent, unparseable, or out of sane range.
 * Cap at 120s to prevent absurd waits from malformed headers.
 */
function parseRetryAfterMs(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120) return null;
  return Math.ceil(seconds * 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
