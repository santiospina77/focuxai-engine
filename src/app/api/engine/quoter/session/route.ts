/**
 * GET /api/engine/quoter/session — Read current quoter session from cookie.
 *
 * Returns session data (clientId, portalId, contactId, userEmail) if a valid
 * session cookie exists. The frontend calls this on mount instead of reading
 * session data from query params (Architect HIGH-2: clean redirect URL).
 *
 * Responses:
 *   200 → { authenticated: true, session: { clientId, portalId, contactId, userEmail } }
 *   200 → { authenticated: false } (no session, direct access mode)
 *   401 → session required but missing or invalid
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 * Focux Digital Group S.A.S.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateQuoterSession } from '@/engine/core/auth/quoterSession';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionOrError = validateQuoterSession(request);

  // Auth error (401) — forward it
  if (sessionOrError instanceof NextResponse) return sessionOrError;

  // null = direct access / bypass mode
  if (!sessionOrError) {
    return NextResponse.json(
      { authenticated: false },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Valid session — return public fields (NOT the exp or signature)
  return NextResponse.json(
    {
      authenticated: true,
      session: {
        clientId: sessionOrError.clientId,
        portalId: sessionOrError.portalId,
        contactId: sessionOrError.contactId,
        userEmail: sessionOrError.userEmail,
      },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
