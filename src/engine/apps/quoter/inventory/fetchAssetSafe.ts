/**
 * FocuxAI Engine™ — fetchAssetSafe (v2)
 *
 * Fetch seguro de assets (renders, planos, logos) con:
 *   - Result<T, EngineError> (nunca throw)
 *   - Timeout configurable (default 5s)
 *   - Validación de content-type (solo image/*)
 *   - Cap de tamaño (default 5MB)
 *   - Placeholder detection (< 15KB = RESOURCE_ASSET_PLACEHOLDER_IMAGE)
 *   - Host whitelist para SSRF protection (allowedHosts desde clientConfig)
 *   - URL resolution unificada via resolveAssetUrl()
 *
 * CALLER CONTRACT (PDF builder / QuoterClient):
 *   Cuando fetchAssetSafe retorna err con code RESOURCE_ASSET_PLACEHOLDER_IMAGE,
 *   el caller debe tratar como FALLBACK VISUAL — no crash.
 *   Mostrar placeholder genérico o espacio vacío. No propagar como error fatal.
 *
 * v2.1 (Architect review):
 *   - Migrado a Result<FetchAssetSuccess, EngineError>
 *   - Recibe URL ya resuelta (no resuelve internamente)
 *   - Host whitelist obligatoria en producción
 *   - Placeholder = error tipado, no booleano ambiguo
 *
 * @since v2.0.0 — Multi-proyecto
 * @since v2.1.0 — Architect review fixes
 */

import type { Result } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';
import { ok, err } from '@/engine/core/types/Result';
import { ResourceError } from '@/engine/core/errors/EngineError';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

/** Opciones de configuración para fetchAssetSafe */
export interface FetchAssetOptions {
  /** Timeout en milisegundos. Default: 5000 (5s) */
  readonly timeoutMs?: number;
  /** Tamaño máximo en bytes. Default: 5_242_880 (5MB) */
  readonly maxSizeBytes?: number;
  /** Content-types permitidos (prefijo). Default: ['image/'] */
  readonly allowedContentTypes?: readonly string[];
  /** Tamaño mínimo para considerar imagen real (no placeholder). Default: 15_000 (15KB) */
  readonly minRealImageBytes?: number;
  /**
   * Hostnames permitidos para fetch.
   * Si vacío + NODE_ENV=production → error RESOURCE_ASSET_HOST_NOT_ALLOWED.
   * Si vacío + NODE_ENV!=production → permite cualquiera (desarrollo local).
   */
  readonly allowedHosts?: readonly string[];
}

const DEFAULTS: Required<FetchAssetOptions> = {
  timeoutMs: 5_000,
  maxSizeBytes: 5_242_880,
  allowedContentTypes: ['image/'],
  minRealImageBytes: 15_000,
  allowedHosts: [],
};

/** Resultado exitoso de fetch de asset */
export interface FetchAssetSuccess {
  /** Buffer de la imagen */
  readonly data: Buffer;
  /** Content-Type retornado por el servidor */
  readonly contentType: string;
  /** Tamaño en bytes */
  readonly sizeBytes: number;
}

// ═══════════════════════════════════════════════════════════
// resolveAssetUrl — Única función de resolución de URLs
// ═══════════════════════════════════════════════════════════

/**
 * Resuelve la URL completa de un asset dado su path relativo y el proyecto.
 *
 * Fase A: /assets/{projectSlug}/{filename}
 * Fase B: URL de HubSpot File Manager
 *
 * @param path — Ruta relativa (ej: "porto-sabbia/render-A1.png") o URL absoluta
 * @param baseUrl — Base URL del servidor
 */
export function resolveAssetUrl(path: string | undefined, baseUrl: string): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${baseUrl.replace(/\/$/, '')}/assets/${path.replace(/^\//, '')}`;
}

// ═══════════════════════════════════════════════════════════
// fetchAssetSafe — Fetch con Result<T, EngineError>
// ═══════════════════════════════════════════════════════════

/**
 * Fetch seguro de un asset con validación completa.
 *
 * NUNCA lanza excepción. Retorna Result.
 * Recibe URL ya resuelta por resolveAssetUrl().
 *
 * @param resolvedUrl — URL absoluta del asset (output de resolveAssetUrl)
 * @param opts — Opciones de configuración
 * @returns Result con FetchAssetSuccess o EngineError tipado
 */
export async function fetchAssetSafe(
  resolvedUrl: string,
  opts?: FetchAssetOptions,
): Promise<Result<FetchAssetSuccess, EngineError>> {
  const config = { ...DEFAULTS, ...opts };

  // ── Validar URL ──
  let parsed: URL;
  try {
    parsed = new URL(resolvedUrl);
  } catch {
    return err(ResourceError.invalidUrl(resolvedUrl));
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return err(ResourceError.invalidUrl(resolvedUrl));
  }

  // ── SSRF protection: host whitelist ──
  const isProduction = process.env.NODE_ENV === 'production';
  if (config.allowedHosts.length > 0) {
    if (!config.allowedHosts.includes(parsed.hostname)) {
      return err(ResourceError.hostNotAllowed(parsed.hostname));
    }
  } else if (isProduction) {
    return err(ResourceError.hostNotAllowed(
      `${parsed.hostname} (whitelist required in production)`,
    ));
  }

  try {
    // ── Fetch con timeout ──
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    const response = await fetch(resolvedUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return err(ResourceError.httpError(resolvedUrl, response.status));
    }

    // ── Validar content-type ──
    const contentType = response.headers.get('content-type') ?? '';
    const isAllowedType = config.allowedContentTypes.some(
      prefix => contentType.startsWith(prefix),
    );
    if (!isAllowedType) {
      return err(ResourceError.invalidContentType(resolvedUrl, contentType));
    }

    // ── Leer y validar tamaño ──
    const arrayBuffer = await response.arrayBuffer();
    const sizeBytes = arrayBuffer.byteLength;

    if (sizeBytes > config.maxSizeBytes) {
      return err(ResourceError.sizeExceeded(resolvedUrl, sizeBytes, config.maxSizeBytes));
    }

    // ── Placeholder detection ──
    if (sizeBytes < config.minRealImageBytes) {
      return err(ResourceError.placeholderImage(resolvedUrl, sizeBytes));
    }

    const data = Buffer.from(arrayBuffer);
    return ok({ data, contentType, sizeBytes });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('aborted')) {
      return err(ResourceError.timeout(resolvedUrl, config.timeoutMs));
    }
    // Network error genérico — mapear a RESOURCE_ASSET_HTTP_ERROR con status 0
    return err(ResourceError.httpError(resolvedUrl, 0));
  }
}
