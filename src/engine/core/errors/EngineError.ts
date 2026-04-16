/**
 * Jerarquía de errores tipados para el dominio del Engine.
 *
 * Cada error tiene un `code` estable que los callers pueden usar para decidir
 * qué hacer (reintentar, fallar silenciosamente, mostrar al usuario, etc.).
 * Nunca dependas de `error.message` para lógica — los mensajes cambian.
 *
 * Los códigos están en SCREAMING_SNAKE_CASE y agrupados por prefijo de capa.
 */

export type ErrorCode =
  // Capa de autenticación (AUTH_*)
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_NO_EMPRESAS'
  | 'AUTH_EMPRESA_NOT_FOUND'
  | 'AUTH_NETWORK_ERROR'
  // Capa de ERP / Sinco (ERP_*)
  | 'ERP_RESOURCE_NOT_FOUND'
  | 'ERP_VALIDATION_ERROR'
  | 'ERP_BUSINESS_RULE_VIOLATION'
  | 'ERP_RATE_LIMITED'
  | 'ERP_SERVER_ERROR'
  | 'ERP_NETWORK_ERROR'
  | 'ERP_TIMEOUT'
  | 'ERP_SCHEMA_MISMATCH'
  | 'ERP_SALES_PERIOD_CLOSED'
  // Capa de CRM / HubSpot (CRM_*)
  | 'CRM_RESOURCE_NOT_FOUND'
  | 'CRM_VALIDATION_ERROR'
  | 'CRM_RATE_LIMITED'
  | 'CRM_SERVER_ERROR'
  | 'CRM_NETWORK_ERROR'
  | 'CRM_DUPLICATE_RECORD'
  // Capa de configuración (CONFIG_*)
  | 'CONFIG_CLIENT_NOT_FOUND'
  | 'CONFIG_MISSING_SECRET'
  | 'CONFIG_INVALID_SCHEMA';

export interface EngineErrorContext {
  readonly clientId?: string;
  readonly operation?: string;
  readonly resource?: string;
  readonly httpStatus?: number;
  readonly retryable?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Error base del Engine. Todos los errores del dominio extienden de aquí.
 * No se lanza directamente — usa las subclases específicas.
 */
export class EngineError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context: EngineErrorContext = {},
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    // Preservar stack trace en V8 (Node.js)
    const ErrorCtor = Error as ErrorConstructor & {
      captureStackTrace?: (target: object, constructor?: Function) => void;
    };
    if (ErrorCtor.captureStackTrace) {
      ErrorCtor.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialización segura para logs. No incluye el stack trace completo
   * para evitar logs gigantes en producción.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause:
        this.cause instanceof Error
          ? { name: this.cause.name, message: this.cause.message }
          : this.cause,
    };
  }

  /**
   * Indica si esta operación puede reintentarse de forma segura.
   * Los callers deben respetarlo — no reintentar un POST Comprador
   * solo porque hubo timeout puede crear duplicados.
   */
  get isRetryable(): boolean {
    return this.context.retryable ?? false;
  }
}

// ============================================================================
// Errores de autenticación
// ============================================================================

export class AuthError extends EngineError {
  constructor(code: ErrorCode, message: string, context: EngineErrorContext = {}, cause?: unknown) {
    super(code, message, context, cause);
  }
}

// ============================================================================
// Errores de ERP (Sinco)
// ============================================================================

export class ErpError extends EngineError {
  constructor(code: ErrorCode, message: string, context: EngineErrorContext = {}, cause?: unknown) {
    super(code, message, context, cause);
  }

  static notFound(resource: string, context: EngineErrorContext = {}): ErpError {
    return new ErpError(
      'ERP_RESOURCE_NOT_FOUND',
      `Sinco resource not found: ${resource}`,
      { ...context, resource, retryable: false }
    );
  }

  static rateLimited(context: EngineErrorContext = {}): ErpError {
    return new ErpError(
      'ERP_RATE_LIMITED',
      'Sinco API rate limit exceeded',
      { ...context, retryable: true }
    );
  }

  static serverError(httpStatus: number, body: unknown, context: EngineErrorContext = {}): ErpError {
    return new ErpError(
      'ERP_SERVER_ERROR',
      `Sinco server error (HTTP ${httpStatus})`,
      { ...context, httpStatus, body, retryable: httpStatus >= 500 }
    );
  }

  static networkError(cause: unknown, context: EngineErrorContext = {}): ErpError {
    return new ErpError(
      'ERP_NETWORK_ERROR',
      'Network error communicating with Sinco',
      { ...context, retryable: true },
      cause
    );
  }

  static timeout(timeoutMs: number, context: EngineErrorContext = {}): ErpError {
    return new ErpError(
      'ERP_TIMEOUT',
      `Sinco request timed out after ${timeoutMs}ms`,
      { ...context, timeoutMs, retryable: true }
    );
  }

  static schemaMismatch(resource: string, issues: unknown, context: EngineErrorContext = {}): ErpError {
    return new ErpError(
      'ERP_SCHEMA_MISMATCH',
      `Sinco response does not match expected schema: ${resource}`,
      { ...context, resource, issues, retryable: false }
    );
  }

  static validation(message: string, context: EngineErrorContext = {}): ErpError {
    return new ErpError(
      'ERP_VALIDATION_ERROR',
      message,
      { ...context, retryable: false }
    );
  }
}

// ============================================================================
// Errores de CRM (HubSpot)
// ============================================================================

export class CrmError extends EngineError {
  constructor(code: ErrorCode, message: string, context: EngineErrorContext = {}, cause?: unknown) {
    super(code, message, context, cause);
  }
}

// ============================================================================
// Errores de configuración
// ============================================================================

export class ConfigError extends EngineError {
  constructor(code: ErrorCode, message: string, context: EngineErrorContext = {}, cause?: unknown) {
    super(code, message, context, cause);
  }

  static clientNotFound(clientId: string): ConfigError {
    return new ConfigError(
      'CONFIG_CLIENT_NOT_FOUND',
      `Client configuration not found: ${clientId}`,
      { clientId, retryable: false }
    );
  }

  static missingSecret(clientId: string, secretName: string): ConfigError {
    return new ConfigError(
      'CONFIG_MISSING_SECRET',
      `Missing secret "${secretName}" for client "${clientId}"`,
      { clientId, secretName, retryable: false }
    );
  }
}
