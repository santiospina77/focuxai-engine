/**
 * GET /quoter/launch?token=<launch_token> — Exchange launch token for session cookie.
 *
 * Flow:
 *   1. Validate signed launch token (5min TTL)
 *   2. Set HttpOnly session cookie (8hrs, SameSite=Lax, Secure in prod)
 *   3. Redirect to /quoter (clean URL — session data in cookie, not query params)
 *
 * This is the entry point for asesores launching from HubSpot App Card.
 * The token is single-use by intent (short TTL prevents replay).
 *
 * Error cases:
 *   - Missing token → redirect to /quoter with error param
 *   - Invalid/expired token → redirect to /quoter with error param
 *   - Session secret not configured → 500
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 * Focux Digital Group S.A.S.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyLaunchToken,
  createSessionCookieValue,
  getSessionCookieOptions,
} from '@/engine/core/auth/quoterSession';

// ═══════════════════════════════════════════════════════════
// GET handler
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token');

  // ── Base URL for redirects ──
  const baseUrl = request.nextUrl.origin;

  if (!token?.trim()) {
    return NextResponse.redirect(
      `${baseUrl}/quoter?error=missing_token`,
      { status: 302 },
    );
  }

  // ── Validate launch token ──
  const payload = verifyLaunchToken(token);

  if (!payload) {
    return NextResponse.redirect(
      `${baseUrl}/quoter?error=invalid_token`,
      { status: 302 },
    );
  }

  // ── Create session cookie ──
  const cookieValue = createSessionCookieValue(payload);

  if (!cookieValue) {
    console.error('[quoter/launch] Failed to create session cookie — QUOTER_SESSION_SECRET issue');
    return NextResponse.json(
      {
        error: 'CONFIG_ERROR',
        message: 'Session secret no configurado. Contactar administrador.',
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // ── Set cookie and redirect to quoter (clean URL — Architect HIGH-2) ──
  // Session data lives in the cookie. Frontend reads it via GET /api/engine/quoter/session.
  const cookieOptions = getSessionCookieOptions();

  const response = NextResponse.redirect(
    `${baseUrl}/quoter?clientId=${encodeURIComponent(payload.clientId)}`,
    { status: 302 },
  );

  response.cookies.set(cookieOptions.name, cookieValue, {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
  });

  return response;
}
