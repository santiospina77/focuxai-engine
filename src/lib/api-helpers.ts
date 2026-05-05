/**
 * Helpers compartidos por todas las API routes del Engine.
 *
 * Patrones:
 *   - jsonError(): traduce EngineError a Response con status HTTP correcto.
 *   - requireCronAuth(): valida que un cron job venga de Vercel (CRON_SECRET).
 *   - parseQueryParam(): parser tipo-safe de query params.
 */

import type { EngineError } from '@/engine/core/errors/EngineError';

export function jsonOk<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Traduce un EngineError a Response. Mapea code → status HTTP estándar.
 * El body siempre tiene { error: { code, message, context } }.
 */
export function jsonError(error: EngineError): Response {
  const status = httpStatusForCode(error.code);
  return new Response(
    JSON.stringify({ error: error.toJSON() }, null, 2),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

function httpStatusForCode(code: string): number {
  // 4xx — error del caller
  if (code === 'CONFIG_CLIENT_NOT_FOUND') return 404;
  if (code === 'ERP_RESOURCE_NOT_FOUND' || code === 'RESOURCE_CRM_NOT_FOUND') return 404;
  if (code === 'AUTH_INVALID_CREDENTIALS' || code === 'AUTH_CRM_UNAUTHORIZED') return 401;
  if (code === 'CONFIG_MISSING_SECRET') return 401;
  if (code === 'ERP_VALIDATION_ERROR' || code === 'VALIDATION_CRM_DUPLICATE_DETECTED') return 400;
  if (code === 'RESOURCE_CRM_DUPLICATE_RECORD') return 409;
  if (code === 'ERP_RATE_LIMITED' || code === 'RESOURCE_CRM_RATE_LIMITED') return 429;
  if (code === 'RESOURCE_CRM_REQUEST_REJECTED') return 400;
  if (code === 'ERP_BUSINESS_RULE_VIOLATION') return 422;
  if (code === 'ERP_SALES_PERIOD_CLOSED') return 422;

  // WB-5: Webhook validation errors
  if (code === 'VALIDATION_WEBHOOK_MISSING_FIELD') return 400;
  if (code === 'VALIDATION_WEBHOOK_INVALID_VALUE') return 400;
  if (code === 'VALIDATION_WEBHOOK_AMBIGUOUS_RESOURCE') return 422;
  if (code === 'VALIDATION_WEBHOOK_RESOURCE_NOT_FOUND') return 404;
  if (code === 'BUSINESS_MISSING_PAYMENT_PLAN_CONFIG') return 422;

  // 5xx — error del Engine o upstream
  if (code === 'ERP_TIMEOUT' || code === 'ERP_NETWORK_ERROR') return 502;
  if (code === 'RESOURCE_CRM_NETWORK_ERROR' || code === 'RESOURCE_CRM_TIMEOUT') return 502;
  if (code === 'ERP_SERVER_ERROR' || code === 'RESOURCE_CRM_SERVER_ERROR') return 502;
  if (code === 'ERP_SCHEMA_MISMATCH' || code === 'RESOURCE_CRM_SCHEMA_MISMATCH') return 502;

  // RESOURCE_CRM_* genéricos que no matchearon arriba
  if (code.startsWith('RESOURCE_CRM_')) return 502;

  return 500;
}

/**
 * Valida que la request venga de un Vercel Cron job (header autoinjectado)
 * o que tenga el bearer token correcto en Authorization.
 *
 * Vercel Cron envía el header `Authorization: Bearer ${CRON_SECRET}`.
 */
export function requireCronAuth(req: Request): Response | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const cronSecret = env['CRON_SECRET'];
  if (!cronSecret) {
    // Sin secret configurado — solo permitimos en dev local.
    if (env['NODE_ENV'] === 'production') {
      return new Response('CRON_SECRET not configured', { status: 500 });
    }
    return null;
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return null;

  return new Response('Unauthorized', { status: 401 });
}

export function parseQueryString(req: Request, key: string): string | null {
  const url = new URL(req.url);
  return url.searchParams.get(key);
}

export function parseQueryNumber(req: Request, key: string): number | null {
  const value = parseQueryString(req, key);
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function requireQueryString(req: Request, key: string): string | Response {
  const value = parseQueryString(req, key);
  if (!value) {
    return new Response(
      JSON.stringify({ error: { code: 'MISSING_PARAM', message: `Missing required query param: ${key}` } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return value;
}

export function requireQueryNumber(req: Request, key: string): number | Response {
  const value = parseQueryNumber(req, key);
  if (value == null) {
    return new Response(
      JSON.stringify({ error: { code: 'MISSING_PARAM', message: `Missing or invalid number param: ${key}` } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return value;
}
