/**
 * GET /api/engine/quotations/asset-health — CDN asset health check.
 *
 * Admin-only. Validates that all expected PDF assets (render, planos, branding)
 * are accessible on HubSpot CDN by performing HEAD requests.
 *
 * Query params:
 *   - clientId (required): Client identifier
 *
 * Returns:
 *   status: "healthy" | "degraded"
 *   Per-asset: httpStatus, responseTimeMs
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAdminAuth } from '@/engine/core/http/adminAuth';
import type { PdfAssetOptions } from '@/app/api/engine/quotations/pdf/pdfBuilder';

// ═══════════════════════════════════════════════════════════
// Client asset config
// ═══════════════════════════════════════════════════════════

interface ClientAssetHealthConfig {
  readonly pdfAssets: PdfAssetOptions;
  /** All asset filenames that pdfBuilder expects at runtime. */
  readonly expectedAssets: readonly string[];
}

/**
 * Expected assets per client — must match what pdfBuilder fetches.
 *
 * Source of truth: pdfBuilder.ts resolveAssetUrl calls + migrate-assets-to-hubspot.ts manifest.
 * render.png = shared across all typologies (single file, Fase B.0 decision)
 * plano-{tip}.png = one per typology
 * logo-jimenez-horizontal.png + sello-40-anos.png = branding
 */
const CLIENT_REGISTRY: Record<string, ClientAssetHealthConfig> = {
  jimenez_demo: {
    pdfAssets: {
      assetBaseUrl: 'https://51256354.fs1.hubspotusercontent-na1.net/hubfs/51256354/assets/jimenez/porto-sabbia',
      allowedHosts: ['51256354.fs1.hubspotusercontent-na1.net'],
    },
    expectedAssets: [
      // Render — single shared file
      'render.png',
      // Planos — one per typology
      'plano-A1.png',
      'plano-A2.png',
      'plano-A3.png',
      'plano-B1.png',
      'plano-B2.png',
      'plano-B3.png',
      'plano-C1.png',
      'plano-C2.png',
      'plano-C3.png',
      'plano-D1.png',
      'plano-D2.png',
      'plano-E1.png',
      'plano-E2.png',
      'plano-E3.png',
      'plano-F1.png',
      'plano-F2.png',
      'plano-F3.png',
      // Branding
      'logo-jimenez-horizontal.png',
      'sello-40-anos.png',
    ],
  },
};

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface AssetCheckResult {
  readonly asset: string;
  readonly url: string;
  readonly httpStatus: number | null;
  readonly responseTimeMs: number;
  readonly ok: boolean;
  readonly error?: string;
}

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json(
    { error, message, timestamp: new Date().toISOString() },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

// ═══════════════════════════════════════════════════════════
// HEAD check with timeout
// ═══════════════════════════════════════════════════════════

async function checkAsset(url: string, asset: string): Promise<AssetCheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const elapsed = Date.now() - start;

    return {
      asset,
      url,
      httpStatus: res.status,
      responseTimeMs: elapsed,
      ok: res.status === 200,
      ...(res.status !== 200 ? { error: `HTTP ${res.status}` } : {}),
    };
  } catch (fetchErr) {
    const elapsed = Date.now() - start;
    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    return {
      asset,
      url,
      httpStatus: null,
      responseTimeMs: elapsed,
      ok: false,
      error: errMsg.includes('abort') ? 'TIMEOUT (10s)' : errMsg.slice(0, 200),
    };
  }
}

// ═══════════════════════════════════════════════════════════
// GET handler
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──
  const authErr = validateAdminAuth(request);
  if (authErr) return authErr;

  // ── Params ──
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim();

  if (!clientId) {
    return errorResponse(400, 'MISSING_CLIENT_ID', 'Query param clientId es obligatorio.');
  }

  const config = CLIENT_REGISTRY[clientId];
  if (!config) {
    return errorResponse(404, 'CLIENT_NOT_FOUND', `clientId="${clientId}" no está configurado para asset health.`);
  }

  const baseUrl = config.pdfAssets.assetBaseUrl;
  if (!baseUrl) {
    return errorResponse(500, 'NO_ASSET_BASE_URL', 'assetBaseUrl no configurado para este cliente.');
  }

  // ── Check all assets concurrently ──
  const checks = await Promise.all(
    config.expectedAssets.map(asset => {
      const url = `${baseUrl}/${asset}`;
      return checkAsset(url, asset);
    }),
  );

  const okCount = checks.filter(c => c.ok).length;
  const failedCount = checks.filter(c => !c.ok).length;
  const overallStatus = failedCount === 0 ? 'healthy' : 'degraded';

  // Log failures at ERROR level for alerting
  for (const check of checks) {
    if (!check.ok) {
      console.error('[asset-health] DEGRADED', {
        asset: check.asset,
        httpStatus: check.httpStatus,
        error: check.error,
        clientId,
      });
    }
  }

  return NextResponse.json(
    {
      status: overallStatus,
      clientId,
      checked: checks.length,
      ok: okCount,
      failed: failedCount,
      assets: checks,
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
