/**
 * WB-5: Webhook authentication for the separar-webhook endpoint.
 *
 * Verifies Bearer token per-client using timing-safe comparison.
 * Never throws — always returns Result.
 */

import { type Result, ok, err } from '../types/Result';
import type { ErrorCode, EngineErrorContext } from '../errors/EngineError';
import { EngineError } from '../errors/EngineError';
import { timingSafeEqual } from 'crypto';

// ============================================================================
// AuthError for webhook (uses AUTH_INVALID_CREDENTIALS)
// ============================================================================

class WebhookAuthError extends EngineError {
  constructor(message: string) {
    super('AUTH_INVALID_CREDENTIALS', message, { retryable: false });
  }

  static unauthorized(detail: string): WebhookAuthError {
    return new WebhookAuthError(detail);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Verifies Bearer token for webhook endpoint.
 * - Fail-hard: no throws, always returns Result.
 * - Timing-safe comparison with length check (prevents timing attacks).
 * - Secret resolved from env var: WEBHOOK_SECRET_<SANITIZED_CLIENT_ID>
 */
export function verifyWebhookAuth(
  req: Request,
  clientId: string
): Result<void, EngineError> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return err(WebhookAuthError.unauthorized('Missing webhook bearer token'));
  }

  const token = authHeader.slice('Bearer '.length);
  const expectedSecret = getWebhookSecretForClient(clientId);

  if (!expectedSecret) {
    return err(WebhookAuthError.unauthorized(
      `Webhook secret not configured for client: ${clientId}`
    ));
  }

  // Length check BEFORE timingSafeEqual (which throws on length mismatch)
  const tokenBuffer = Buffer.from(token, 'utf-8');
  const expectedBuffer = Buffer.from(expectedSecret, 'utf-8');

  if (tokenBuffer.length !== expectedBuffer.length) {
    return err(WebhookAuthError.unauthorized('Invalid webhook bearer token'));
  }

  if (!timingSafeEqual(tokenBuffer, expectedBuffer)) {
    return err(WebhookAuthError.unauthorized('Invalid webhook bearer token'));
  }

  return ok(undefined);
}

// ============================================================================
// Internals
// ============================================================================

/**
 * Maps clientId to env var name for webhook secret.
 * Pattern: WEBHOOK_SECRET_<SANITIZED_CLIENT_ID>
 *
 * Sanitization: uppercase, non-alphanumeric → underscore
 * Example: "jimenez_demo" → WEBHOOK_SECRET_JIMENEZ_DEMO
 */
function getWebhookSecretForClient(clientId: string): string | null {
  const envKey = `WEBHOOK_SECRET_${sanitizeForEnvKey(clientId)}`;
  return process.env[envKey] ?? null;
}

function sanitizeForEnvKey(clientId: string): string {
  return clientId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}
