/**
 * POST /api/engine/quoter/launch-token — Generate a signed launch token.
 *
 * Called by the HubSpot App Function (serverless proxy) when an asesor
 * clicks the "Focux Quote" App Card on a Contact record.
 *
 * Authentication: Bearer <HUBSPOT_CARD_LAUNCH_SECRET_<CLIENT_ID>>
 * The clientId is resolved from portalId, then used to look up the per-client secret.
 *
 * Request body: { portalId: string, contactId: string, userEmail: string }
 * Response 200: { token: string, expiresIn: number }
 *
 * Security:
 *   - portalId→clientId validated against PORTAL_CLIENT_MAP
 *   - Per-client shared secret (timing-safe comparison)
 *   - Token expires in 5 minutes (single-use intent)
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 * Focux Digital Group S.A.S.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  resolveClientId,
  verifyLaunchSecret,
  createLaunchToken,
  LaunchTokenRequestSchema,
} from '@/engine/core/auth/quoterSession';

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json(
    { error, message, timestamp: new Date().toISOString() },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

// ═══════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Parse + validate body with Zod (Architect CRITICAL-1) ──
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_BODY', 'Body debe ser JSON con { portalId, contactId, userEmail }.');
  }

  const parsed = LaunchTokenRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return errorResponse(400, 'VALIDATION_ERROR', `${firstError.path.join('.')}: ${firstError.message}`);
  }

  const { portalId, contactId, userEmail } = parsed.data;

  // ── 2. Resolve clientId from portalId ──
  const clientId = resolveClientId(portalId);

  if (!clientId) {
    return errorResponse(403, 'UNKNOWN_PORTAL', `Portal "${portalId}" no está autorizado.`);
  }

  // ── 3. Verify per-client launch secret ──
  const authHeader = request.headers.get('authorization');

  if (!verifyLaunchSecret(authHeader, clientId)) {
    return errorResponse(401, 'INVALID_LAUNCH_SECRET', 'Launch secret inválido o faltante.');
  }

  // ── 4. Check QUOTER_SESSION_SECRET is configured ──
  if (!process.env.QUOTER_SESSION_SECRET) {
    console.error('[launch-token] QUOTER_SESSION_SECRET not configured');
    return errorResponse(500, 'CONFIG_ERROR', 'Session secret no configurado. Contactar administrador.');
  }

  // ── 5. Generate launch token ──
  // portalId, contactId already trimmed by Zod. userEmail trimmed + validated as email.
  const token = createLaunchToken({
    clientId,
    portalId,
    contactId,
    userEmail: userEmail.toLowerCase(),
  });

  if (!token) {
    console.error('[launch-token] Failed to create launch token — QUOTER_SESSION_SECRET issue');
    return errorResponse(500, 'TOKEN_GENERATION_FAILED', 'Error generando token. Contactar administrador.');
  }

  // ── 6. Return token ──
  return NextResponse.json(
    {
      token,
      expiresIn: 300, // 5 minutes in seconds
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
