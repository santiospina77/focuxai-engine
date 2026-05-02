/**
 * Admin authentication guard for internal/ops endpoints.
 *
 * Validates `Authorization: Bearer <ADMIN_API_SECRET>` header.
 * Returns null if valid, NextResponse 401/403 if not.
 *
 * Usage in route handlers:
 *   const authErr = validateAdminAuth(request);
 *   if (authErr) return authErr;
 *
 * Environment variable: ADMIN_API_SECRET (required in production).
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { NextRequest, NextResponse } from 'next/server';

interface ErrorBody {
  readonly error: string;
  readonly message: string;
  readonly timestamp: string;
}

function forbidden(message: string): NextResponse<ErrorBody> {
  return NextResponse.json(
    { error: 'FORBIDDEN', message, timestamp: new Date().toISOString() },
    { status: 403, headers: { 'Cache-Control': 'no-store' } },
  );
}

function unauthorized(message: string): NextResponse<ErrorBody> {
  return NextResponse.json(
    { error: 'UNAUTHORIZED', message, timestamp: new Date().toISOString() },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Validate admin authentication.
 * Returns null if authorized, or a NextResponse error to return immediately.
 */
export function validateAdminAuth(request: NextRequest): NextResponse<ErrorBody> | null {
  const secret = process.env.ADMIN_API_SECRET;

  if (!secret?.trim()) {
    // In production, ADMIN_API_SECRET must be set
    if (process.env.NODE_ENV === 'production') {
      console.error('[adminAuth] ADMIN_API_SECRET not configured in production');
      return forbidden('Admin endpoints not available — ADMIN_API_SECRET not configured.');
    }
    // In development, allow unauthenticated access with a warning
    console.warn('[adminAuth] ADMIN_API_SECRET not set — allowing dev access');
    return null;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return unauthorized('Authorization header required. Use: Bearer <ADMIN_API_SECRET>');
  }

  const [scheme, token] = authHeader.split(' ', 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
    return unauthorized('Invalid authorization format. Use: Bearer <ADMIN_API_SECRET>');
  }

  if (token.trim() !== secret.trim()) {
    return forbidden('Invalid admin token.');
  }

  return null;
}
