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
  // Capa de autenticación CRM (AUTH_CRM_*)
  | 'AUTH_CRM_UNAUTHORIZED'
  // Capa de configuración (CONFIG_*)
  | 'CONFIG_CLIENT_NOT_FOUND'
  | 'CONFIG_MISSING_SECRET'
  | 'CONFIG_INVALID_SCHEMA'
  // Capa de schema/validación de datos (SCHEMA_*)
  | 'SCHEMA_TYPOLOGY_RULES_INVALID'
  | 'SCHEMA_TYPOLOGY_RULES_EMPTY'
  // NOTA: DUPLICATE_AREA ya no es ErrorCode externo.
  // Vive como TypologyRuleValidationIssueCode interno en typologyTypes.ts.
  // Capa de validación de datos de inventario (VALIDATION_*)
  | 'VALIDATION_INVENTORY_MAPPING_FAILED'
  | 'VALIDATION_INVENTORY_UNMAPPED_AREA'
  | 'VALIDATION_INVENTORY_MISSING_FIELD'
  | 'VALIDATION_INVENTORY_INVALID_TYPE'
  | 'VALIDATION_INVENTORY_INVALID_VALUE'
  // Capa de validación CRM (VALIDATION_CRM_*)
  | 'VALIDATION_CRM_DUPLICATE_DETECTED'
  // Capa de recursos externos (RESOURCE_*)
  // — CRM (HubSpot) como dependencia externa
  | 'RESOURCE_CRM_NOT_FOUND'
  | 'RESOURCE_CRM_RATE_LIMITED'
  | 'RESOURCE_CRM_SERVER_ERROR'
  | 'RESOURCE_CRM_NETWORK_ERROR'
  | 'RESOURCE_CRM_TIMEOUT'
  | 'RESOURCE_CRM_DUPLICATE_RECORD'
  | 'RESOURCE_CRM_REQUEST_REJECTED'
  | 'RESOURCE_CRM_SCHEMA_MISMATCH'
  | 'RESOURCE_CRM_SEARCH_FAILED'
  | 'RESOURCE_CRM_MAX_PAGES_EXCEEDED'
  | 'RESOURCE_CRM_REPEATED_CURSOR'
  | 'RESOURCE_CRM_EMPTY_PAGE_WITH_CURSOR'
  // — HubSpot File Manager (uploads, attachments)
  | 'AUTH_CRM_FILE_TOKEN_INVALID'
  | 'RESOURCE_CRM_FILE_UPLOAD_FAILED'
  | 'RESOURCE_CRM_FILE_ATTACH_FAILED'
  | 'RESOURCE_CRM_FILE_RATE_LIMITED'
  | 'RESOURCE_CRM_FILE_SERVER_ERROR'
  | 'RESOURCE_CRM_FILE_TIMEOUT'
  | 'RESOURCE_CRM_FILE_NETWORK_ERROR'
  | 'SCHEMA_CRM_FILE_RESPONSE_INVALID'
  | 'SCHEMA_CRM_FILE_ACCESS_MISMATCH'
  | 'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE'
  | 'VALIDATION_CRM_FILE_FOLDER_INVALID'
  // — PDF generation
  | 'RESOURCE_PDF_GENERATION_FAILED'
  // — Assets (renders, planos)
  | 'RESOURCE_ASSET_URL_EMPTY'
  | 'RESOURCE_ASSET_INVALID_URL'
  | 'RESOURCE_ASSET_HOST_NOT_ALLOWED'
  | 'RESOURCE_ASSET_TIMEOUT'
  | 'RESOURCE_ASSET_HTTP_ERROR'
  | 'RESOURCE_ASSET_INVALID_CONTENT_TYPE'
  | 'RESOURCE_ASSET_SIZE_EXCEEDED'
  | 'RESOURCE_ASSET_PLACEHOLDER_IMAGE';

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
// Errores de CRM (HubSpot) — migrados a ResourceError / AuthError / ValidationError
// CrmError eliminado en v5.1. Todos los errores CRM usan familias válidas:
//   - Falla API externa → ResourceError (RESOURCE_CRM_*)
//   - Auth inválida → AuthError (AUTH_CRM_*)
//   - Validación de datos CRM → ValidationError (VALIDATION_CRM_*)
// ============================================================================

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

// ============================================================================
// SchemaValidationIssue — Tipo genérico para issues de validación de schema
// ============================================================================

/**
 * Issue de validación de schema genérico.
 * Vive en core para que subtipos específicos (TypologyRuleValidationIssue)
 * en apps/ lo extiendan sin import cruzado core ← apps.
 */
export interface SchemaValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

// ============================================================================
// Errores de schema / validación de datos de negocio
// ============================================================================

export class SchemaError extends EngineError {
  constructor(code: ErrorCode, message: string, context: EngineErrorContext = {}, cause?: unknown) {
    super(code, message, { ...context, retryable: false }, cause);
  }

  /**
   * Factory para errores de validación de reglas de tipología.
   * Acepta issues estructurados que implementen SchemaValidationIssue.
   */
  static typologyRulesInvalid(issues: readonly SchemaValidationIssue[]): SchemaError {
    const summary = issues.map(i => `[${i.code}] ${i.message}`).join('; ');
    return new SchemaError(
      'SCHEMA_TYPOLOGY_RULES_INVALID',
      `Typology rules validation failed: ${summary}`,
      { issues }
    );
  }

  static typologyRulesEmpty(): SchemaError {
    return new SchemaError(
      'SCHEMA_TYPOLOGY_RULES_EMPTY',
      'Typology rules array is empty — cannot resolve any unit',
    );
  }
}

// ============================================================================
// Errores de recursos / assets externos
// ============================================================================

export class ResourceError extends EngineError {
  constructor(code: ErrorCode, message: string, context: EngineErrorContext = {}, cause?: unknown) {
    super(code, message, { ...context, retryable: false }, cause);
  }

  // ── CRM (HubSpot) como recurso externo ──

  static crmNotFound(message: string, context: EngineErrorContext = {}): ResourceError {
    return new ResourceError('RESOURCE_CRM_NOT_FOUND', message, { ...context, retryable: false });
  }

  static crmRateLimited(message: string, context: EngineErrorContext = {}): ResourceError {
    return new ResourceError('RESOURCE_CRM_RATE_LIMITED', message, { ...context, retryable: true });
  }

  static crmServerError(message: string, context: EngineErrorContext = {}): ResourceError {
    return new ResourceError('RESOURCE_CRM_SERVER_ERROR', message, { ...context, retryable: true });
  }

  static crmNetworkError(message: string, context: EngineErrorContext = {}, cause?: unknown): ResourceError {
    return new ResourceError('RESOURCE_CRM_NETWORK_ERROR', message, { ...context, retryable: true }, cause);
  }

  static crmTimeout(message: string, context: EngineErrorContext = {}, cause?: unknown): ResourceError {
    return new ResourceError('RESOURCE_CRM_TIMEOUT', message, { ...context, retryable: true }, cause);
  }

  static crmDuplicateRecord(message: string, context: EngineErrorContext = {}): ResourceError {
    return new ResourceError('RESOURCE_CRM_DUPLICATE_RECORD', message, { ...context, retryable: false });
  }

  static crmRequestRejected(message: string, context: EngineErrorContext = {}): ResourceError {
    return new ResourceError('RESOURCE_CRM_REQUEST_REJECTED', message, { ...context, retryable: false });
  }

  static crmSchemaMismatch(message: string, context: EngineErrorContext = {}): ResourceError {
    return new ResourceError('RESOURCE_CRM_SCHEMA_MISMATCH', message, { ...context, retryable: false });
  }

  static crmSearchFailed(objectType: string, page: number, cause?: unknown): ResourceError {
    return new ResourceError(
      'RESOURCE_CRM_SEARCH_FAILED',
      `HubSpot search failed on page ${page} for ${objectType}`,
      { objectType, page, retryable: true },
      cause,
    );
  }

  static crmMaxPagesExceeded(objectType: string, maxPages: number, recordsFetched: number): ResourceError {
    return new ResourceError(
      'RESOURCE_CRM_MAX_PAGES_EXCEEDED',
      `Exceeded max pages (${maxPages}) for ${objectType}. Fetched ${recordsFetched} records.`,
      { objectType, maxPages, recordsFetched, retryable: false },
    );
  }

  static crmRepeatedCursor(objectType: string, page: number, cursor: string): ResourceError {
    return new ResourceError(
      'RESOURCE_CRM_REPEATED_CURSOR',
      `Cursor "${cursor}" repeated on page ${page} for ${objectType}. Infinite loop detected.`,
      { objectType, page, cursor, retryable: false },
    );
  }

  static crmEmptyPageWithCursor(objectType: string, page: number, cursor: string): ResourceError {
    return new ResourceError(
      'RESOURCE_CRM_EMPTY_PAGE_WITH_CURSOR',
      `HubSpot returned nextCursor "${cursor}" but 0 records on page ${page} for ${objectType}.`,
      { objectType, page, cursor, retryable: false },
    );
  }

  // ── Assets (renders, planos) ──

  static urlEmpty(): ResourceError {
    return new ResourceError('RESOURCE_ASSET_URL_EMPTY', 'Asset URL is empty or undefined');
  }

  static invalidUrl(url: string): ResourceError {
    return new ResourceError('RESOURCE_ASSET_INVALID_URL', `Invalid asset URL: ${url}`, { url });
  }

  static hostNotAllowed(hostname: string): ResourceError {
    return new ResourceError(
      'RESOURCE_ASSET_HOST_NOT_ALLOWED',
      `Asset host not in whitelist: ${hostname}`,
      { hostname }
    );
  }

  static timeout(url: string, timeoutMs: number): ResourceError {
    return new ResourceError(
      'RESOURCE_ASSET_TIMEOUT',
      `Asset fetch timed out after ${timeoutMs}ms: ${url}`,
      { url, timeoutMs, retryable: true }
    );
  }

  static httpError(url: string, httpStatus: number): ResourceError {
    return new ResourceError(
      'RESOURCE_ASSET_HTTP_ERROR',
      `Asset fetch failed with HTTP ${httpStatus}: ${url}`,
      { url, httpStatus, retryable: httpStatus >= 500 }
    );
  }

  static invalidContentType(url: string, contentType: string): ResourceError {
    return new ResourceError(
      'RESOURCE_ASSET_INVALID_CONTENT_TYPE',
      `Asset has invalid content-type "${contentType}": ${url}`,
      { url, contentType }
    );
  }

  static sizeExceeded(url: string, sizeBytes: number, maxBytes: number): ResourceError {
    return new ResourceError(
      'RESOURCE_ASSET_SIZE_EXCEEDED',
      `Asset exceeds max size (${sizeBytes} > ${maxBytes}): ${url}`,
      { url, sizeBytes, maxBytes }
    );
  }

  static placeholderImage(url: string, sizeBytes: number): ResourceError {
    return new ResourceError(
      'RESOURCE_ASSET_PLACEHOLDER_IMAGE',
      `Asset appears to be a placeholder image (${sizeBytes} bytes): ${url}`,
      { url, sizeBytes }
    );
  }
}

// ============================================================================
// Errores de validación de datos de inventario
// ============================================================================

/**
 * Errores de validación de datos durante el mapping de inventario.
 *
 * Diferencia con SchemaError:
 *   - SchemaError = las REGLAS/CONFIG son inválidas (tipologyRules vacías, etc.)
 *   - ValidationError = los DATOS no pasan validación (area=0, tipo desconocido, etc.)
 *
 * Nunca retryable — si los datos son inválidos, reintentar no ayuda.
 */
export class ValidationError extends EngineError {
  constructor(code: ErrorCode, message: string, context: EngineErrorContext = {}, cause?: unknown) {
    super(code, message, { ...context, retryable: false }, cause);
  }

  static missingField(field: string, entity: string, context: EngineErrorContext = {}): ValidationError {
    return new ValidationError(
      'VALIDATION_INVENTORY_MISSING_FIELD',
      `${entity}: campo obligatorio "${field}" faltante o inválido`,
      { ...context, field, entity }
    );
  }

  static invalidType(entity: string, context: EngineErrorContext = {}): ValidationError {
    return new ValidationError(
      'VALIDATION_INVENTORY_INVALID_TYPE',
      `${entity}: tipo de unidad no reconocido`,
      { ...context, entity }
    );
  }

  static invalidValue(field: string, value: unknown, entity: string, context: EngineErrorContext = {}): ValidationError {
    return new ValidationError(
      'VALIDATION_INVENTORY_INVALID_VALUE',
      `${entity}: ${field}=${value} inválido`,
      { ...context, field, value, entity }
    );
  }

  static unmappedArea(area: number, entity: string, projectId: number): ValidationError {
    return new ValidationError(
      'VALIDATION_INVENTORY_UNMAPPED_AREA',
      `${entity}: area=${area} no matchea ninguna regla de tipología`,
      { area, entity, projectId }
    );
  }

  static mappingFailed(message: string, context: EngineErrorContext = {}): ValidationError {
    return new ValidationError(
      'VALIDATION_INVENTORY_MAPPING_FAILED',
      message,
      context
    );
  }
}
