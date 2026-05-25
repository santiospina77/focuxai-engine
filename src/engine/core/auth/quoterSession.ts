/**
 * AUTH-1: Quoter session management — launch tokens + session cookies.
 *
 * Implements the HubSpot App Card → Focux Engine authentication flow:
 *   1. App Function calls POST /api/engine/quoter/launch-token with shared secret
 *   2. Engine validates secret + portalId→clientId, returns signed launch token (5min)
 *   3. App Card opens /quoter/launch?token=... in new tab
 *   4. Launch route validates token → sets HttpOnly session cookie (8hrs) → redirect
 *   5. Cotizador endpoints validate session cookie on every request
 *
 * Token format: base64url(JSON payload).base64url(HMAC-SHA256 signature)
 * No external JWT dependency — uses Node.js crypto natively.
 *
 * Security:
 *   - Timing-safe comparison for all secret/signature checks
 *   - Per-client launch secrets: HUBSPOT_CARD_LAUNCH_SECRET_<CLIENT_ID>
 *   - Separate QUOTER_SESSION_SECRET for cookie + token signing
 *   - Zod runtime validation on all deserialized payloads (Architect CRITICAL-1/2)
 *   - pdfAccessToken for HubSpot/email PDF links (Architect CRITICAL-3)
 *   - QUOTER_REQUIRE_HUBSPOT_LAUNCH=true forces session in production (Architect HIGH-1)
 *   - QUOTER_ALLOW_DIRECT_ACCESS=true bypasses session for dev/demo
 *
 * Architect decision: inline helper, NOT global middleware.
 * Reason: some endpoints compare body.clientId, others use query params.
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 * Focux Digital Group S.A.S.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

const LAUNCH_TOKEN_TTL_SECONDS = 5 * 60;        // 5 minutes
const SESSION_COOKIE_TTL_SECONDS = 8 * 60 * 60;  // 8 hours
const PDF_ACCESS_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days (email links)
const SESSION_COOKIE_NAME = 'quoter_session';

/** portalId → clientId. Source of truth for which HubSpot portals map to which clients. */
const PORTAL_CLIENT_MAP: Record<string, string> = {
  '51256354': 'jimenez_demo',
  '51059324': 'jimenez_prod',
};

// ═══════════════════════════════════════════════════════════
// Zod Schemas — runtime validation for deserialized payloads
// ═══════════════════════════════════════════════════════════

/** Schema for external launch-token request body (CRITICAL-1: Zod on external boundary). */
export const LaunchTokenRequestSchema = z.object({
  portalId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
  userEmail: z.string().trim().email(),
}).strict();

/** Schema for signed launch token payload after HMAC verification (CRITICAL-2). */
const LaunchTokenPayloadSchema = z.object({
  clientId: z.string().min(1),
  portalId: z.string().min(1),
  contactId: z.string().min(1),
  userEmail: z.string().email(),
  exp: z.number().int().positive(),
}).strict();

/** Schema for session cookie payload after HMAC verification (CRITICAL-2). */
const QuoterSessionSchema = z.object({
  clientId: z.string().min(1),
  portalId: z.string().min(1),
  contactId: z.string().min(1),
  userEmail: z.string().email(),
  exp: z.number().int().positive(),
}).strict();

/** Schema for PDF access token payload after HMAC verification (CRITICAL-3). */
const PdfAccessTokenPayloadSchema = z.object({
  clientId: z.string().min(1),
  cotNumber: z.string().min(1),
  exp: z.number().int().positive(),
}).strict();

// ═══════════════════════════════════════════════════════════
// Types (inferred from Zod schemas)
// ═══════════════════════════════════════════════════════════

export type LaunchTokenPayload = z.infer<typeof LaunchTokenPayloadSchema>;
export type QuoterSession = z.infer<typeof QuoterSessionSchema>;
export type PdfAccessTokenPayload = z.infer<typeof PdfAccessTokenPayloadSchema>;

interface ErrorBody {
  readonly error: string;
  readonly message: string;
  readonly timestamp: string;
}

// ═══════════════════════════════════════════════════════════
// Portal ↔ Client resolution
// ═══════════════════════════════════════════════════════════

/**
 * Resolve clientId from portalId. Returns null if portal is unknown.
 */
export function resolveClientId(portalId: string): string | null {
  return PORTAL_CLIENT_MAP[portalId] ?? null;
}

/**
 * Validate that a portalId maps to the expected clientId.
 */
export function validatePortalClient(portalId: string, expectedClientId: string): boolean {
  return PORTAL_CLIENT_MAP[portalId] === expectedClientId;
}

// ═══════════════════════════════════════════════════════════
// Launch secret validation (per-client)
// ═══════════════════════════════════════════════════════════

/**
 * Get the launch secret for a client.
 * Pattern: HUBSPOT_CARD_LAUNCH_SECRET_<SANITIZED_CLIENT_ID>
 * Follows same convention as verifyWebhookAuth.ts.
 */
function getLaunchSecretForClient(clientId: string): string | null {
  const envKey = `HUBSPOT_CARD_LAUNCH_SECRET_${sanitizeForEnvKey(clientId)}`;
  return process.env[envKey] ?? null;
}

function sanitizeForEnvKey(clientId: string): string {
  return clientId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/**
 * Verify the Bearer token from App Function against the per-client launch secret.
 * Timing-safe comparison.
 */
export function verifyLaunchSecret(authHeader: string | null, clientId: string): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.slice('Bearer '.length);
  const expected = getLaunchSecretForClient(clientId);

  if (!expected) return false;

  const tokenBuf = Buffer.from(token, 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');

  if (tokenBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(tokenBuf, expectedBuf);
}

// ═══════════════════════════════════════════════════════════
// HMAC token signing / verification
// ═══════════════════════════════════════════════════════════

function base64urlEncode(data: Buffer): string {
  return data.toString('base64url');
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

function hmacSign(payload: string, secret: string): string {
  return base64urlEncode(
    createHmac('sha256', secret).update(payload, 'utf-8').digest()
  );
}

function hmacVerify(payload: string, signature: string, secret: string): boolean {
  const expected = hmacSign(payload, secret);

  const sigBuf = Buffer.from(signature, 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');

  if (sigBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(sigBuf, expectedBuf);
}

// ═══════════════════════════════════════════════════════════
// Launch Token — short-lived, single-use intent
// ═══════════════════════════════════════════════════════════

/**
 * Create a signed launch token.
 * Uses QUOTER_SESSION_SECRET for signing (shared between launch + session).
 */
export function createLaunchToken(params: {
  clientId: string;
  portalId: string;
  contactId: string;
  userEmail: string;
}): string | null {
  const secret = process.env.QUOTER_SESSION_SECRET;
  if (!secret) return null;

  const payload: LaunchTokenPayload = {
    clientId: params.clientId,
    portalId: params.portalId,
    contactId: params.contactId,
    userEmail: params.userEmail,
    exp: Math.floor(Date.now() / 1000) + LAUNCH_TOKEN_TTL_SECONDS,
  };

  const payloadStr = base64urlEncode(Buffer.from(JSON.stringify(payload), 'utf-8'));
  const signature = hmacSign(payloadStr, secret);

  return `${payloadStr}.${signature}`;
}

/**
 * Verify and decode a launch token. Returns null if invalid or expired.
 * Uses Zod for runtime validation after HMAC verification (Architect CRITICAL-2).
 */
export function verifyLaunchToken(token: string): LaunchTokenPayload | null {
  const secret = process.env.QUOTER_SESSION_SECRET;
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadStr, signature] = parts;

  if (!hmacVerify(payloadStr, signature, secret)) return null;

  try {
    const raw = JSON.parse(base64urlDecode(payloadStr).toString('utf-8'));
    const parsed = LaunchTokenPayloadSchema.safeParse(raw);
    if (!parsed.success) return null;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (parsed.data.exp <= now) return null;

    // Defense in depth: verify portalId↔clientId consistency (Architect HIGH-2 v2)
    if (!validatePortalClient(parsed.data.portalId, parsed.data.clientId)) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// Session Cookie — long-lived authenticated session
// ═══════════════════════════════════════════════════════════

/**
 * Create a signed session cookie value from a validated launch token.
 */
export function createSessionCookieValue(payload: LaunchTokenPayload): string | null {
  const secret = process.env.QUOTER_SESSION_SECRET;
  if (!secret) return null;

  const session: QuoterSession = {
    clientId: payload.clientId,
    portalId: payload.portalId,
    contactId: payload.contactId,
    userEmail: payload.userEmail,
    exp: Math.floor(Date.now() / 1000) + SESSION_COOKIE_TTL_SECONDS,
  };

  const sessionStr = base64urlEncode(Buffer.from(JSON.stringify(session), 'utf-8'));
  const signature = hmacSign(sessionStr, secret);

  return `${sessionStr}.${signature}`;
}

/**
 * Verify and decode a session cookie value. Returns null if invalid or expired.
 * Uses Zod for runtime validation after HMAC verification (Architect CRITICAL-2).
 */
export function verifySessionCookie(cookieValue: string): QuoterSession | null {
  const secret = process.env.QUOTER_SESSION_SECRET;
  if (!secret) return null;

  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;

  const [sessionStr, signature] = parts;

  if (!hmacVerify(sessionStr, signature, secret)) return null;

  try {
    const raw = JSON.parse(base64urlDecode(sessionStr).toString('utf-8'));
    const parsed = QuoterSessionSchema.safeParse(raw);
    if (!parsed.success) return null;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (parsed.data.exp <= now) return null;

    // Defense in depth: verify portalId↔clientId consistency (Architect HIGH-2 v2)
    if (!validatePortalClient(parsed.data.portalId, parsed.data.clientId)) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

/** Cookie options for session. Secure=true only in production. */
export function getSessionCookieOptions(): {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_TTL_SECONDS,
  };
}

// ═══════════════════════════════════════════════════════════
// Session requirement logic (HIGH-1: Architect review)
// ═══════════════════════════════════════════════════════════

/**
 * Determine if quoter session is required.
 *
 * Priority:
 *   1. QUOTER_REQUIRE_HUBSPOT_LAUNCH=true → session required (production)
 *   2. QUOTER_ALLOW_DIRECT_ACCESS=true → session NOT required (demo/dev)
 *   3. Default: required in production, not required in dev
 *
 * Prevents "unset" from being the only production guard.
 */
function isQuoterSessionRequired(): boolean {
  if (process.env.QUOTER_REQUIRE_HUBSPOT_LAUNCH === 'true') return true;
  if (process.env.QUOTER_ALLOW_DIRECT_ACCESS === 'true') return false;
  return process.env.NODE_ENV === 'production';
}

// ═══════════════════════════════════════════════════════════
// Session validation guard — for use in route handlers
// ═══════════════════════════════════════════════════════════

/**
 * Validate quoter session from request cookies.
 *
 * If session is NOT required (dev/demo) → returns null (bypass mode).
 * Otherwise → returns QuoterSession or a 401/403 NextResponse error.
 *
 * Usage in route handlers:
 *   const sessionOrError = validateQuoterSession(request);
 *   if (sessionOrError instanceof NextResponse) return sessionOrError;
 *   // sessionOrError is QuoterSession | null
 *   // null means direct access mode (dev/demo)
 *
 * When session exists, callers SHOULD compare session.clientId against body/query clientId.
 */
export function validateQuoterSession(
  request: NextRequest
): QuoterSession | null | NextResponse<ErrorBody> {
  // Bypass: session not required (dev/demo environments)
  if (!isQuoterSessionRequired()) {
    return null;
  }

  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!cookieValue) {
    return NextResponse.json(
      {
        error: 'SESSION_REQUIRED',
        message: 'Sesión de cotizador requerida. Inicie desde HubSpot.',
        timestamp: new Date().toISOString(),
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const session = verifySessionCookie(cookieValue);

  if (!session) {
    return NextResponse.json(
      {
        error: 'SESSION_INVALID',
        message: 'Sesión expirada o inválida. Vuelva a iniciar desde HubSpot.',
        timestamp: new Date().toISOString(),
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return session;
}

/**
 * Compare session clientId against a request-provided clientId.
 * Returns null if match or bypass, NextResponse 403 if mismatch.
 *
 * Usage:
 *   const mismatch = validateSessionClientId(session, body.clientId);
 *   if (mismatch) return mismatch;
 */
export function validateSessionClientId(
  session: QuoterSession | null,
  requestClientId: string
): NextResponse<ErrorBody> | null {
  // null session = direct access mode, no validation needed
  if (!session) return null;

  if (session.clientId !== requestClientId) {
    return NextResponse.json(
      {
        error: 'SESSION_CLIENT_MISMATCH',
        message: `Sesión para cliente "${session.clientId}" no coincide con request "${requestClientId}".`,
        timestamp: new Date().toISOString(),
      },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// PDF Access Token — signed link for HubSpot/email (CRITICAL-3)
// ═══════════════════════════════════════════════════════════

/**
 * Create a signed PDF access token for embedding in HubSpot CRM card links and emails.
 * TTL: 7 days (email links need longer validity).
 * Payload: { clientId, cotNumber, exp }
 *
 * Generated when a quotation is created or when a user requests a shareable link.
 */
export function createPdfAccessToken(params: {
  clientId: string;
  cotNumber: string;
}): string | null {
  const secret = process.env.QUOTER_SESSION_SECRET;
  if (!secret) return null;

  const payload: PdfAccessTokenPayload = {
    clientId: params.clientId,
    cotNumber: params.cotNumber,
    exp: Math.floor(Date.now() / 1000) + PDF_ACCESS_TOKEN_TTL_SECONDS,
  };

  const payloadStr = base64urlEncode(Buffer.from(JSON.stringify(payload), 'utf-8'));
  const signature = hmacSign(payloadStr, secret);

  return `${payloadStr}.${signature}`;
}

/**
 * Verify and decode a PDF access token. Returns null if invalid or expired.
 * Uses Zod for runtime validation after HMAC verification.
 */
export function verifyPdfAccessToken(token: string): PdfAccessTokenPayload | null {
  const secret = process.env.QUOTER_SESSION_SECRET;
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadStr, signature] = parts;

  if (!hmacVerify(payloadStr, signature, secret)) return null;

  try {
    const raw = JSON.parse(base64urlDecode(payloadStr).toString('utf-8'));
    const parsed = PdfAccessTokenPayloadSchema.safeParse(raw);
    if (!parsed.success) return null;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (parsed.data.exp <= now) return null;

    return parsed.data;
  } catch {
    return null;
  }
}
