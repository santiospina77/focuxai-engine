/**
 * GET /api/engine/inventory — Endpoint de inventario para el cotizador.
 *
 * Route delgado: valida clientId, construye dependencias, llama mapInventoryToDto,
 * mapea errores a HTTP. CERO lógica de negocio aquí.
 *
 * Query params:
 *   - clientId (obligatorio): ID del cliente en el Engine
 *
 * Responses:
 *   200 → InventoryResponse
 *   400 → clientId faltante
 *   404 → clientId no configurado
 *   502 → error de HubSpot, mapping, o join
 *   500 → error inesperado / schema / config
 *
 * Headers: Cache-Control: no-store
 *
 * v2.2: Adaptado a Result<T, EngineError>. Sin try/catch para errores esperados.
 */

import { NextRequest, NextResponse } from 'next/server';
import { mapInventoryToDto } from '@/engine/apps/quoter/inventory/mapInventoryToDto';
import type { InventoryErrorResponse } from '@/engine/apps/quoter/inventory/types';
import { HubSpotAdapter } from '@/engine/connectors/crm/hubspot/HubSpotAdapter';
import { ConsoleLogger } from '@/engine/core/logging/Logger';
import { JIMENEZ_DEMO_CONFIG, type ClientInventoryConfig } from '@/engine/apps/quoter/inventory/clientConfigs/jimenez_demo';

// ═══════════════════════════════════════════════════════════
// Client registry — wiring only, data lives in config modules
// ═══════════════════════════════════════════════════════════

const CLIENT_REGISTRY: Record<string, ClientInventoryConfig> = {
  jimenez_demo: JIMENEZ_DEMO_CONFIG,
};

// ═══════════════════════════════════════════════════════════
// Error response helper
// ═══════════════════════════════════════════════════════════

function errorResponse(status: number, error: string, message: string): NextResponse<InventoryErrorResponse> {
  return NextResponse.json(
    { error, message, timestamp: new Date().toISOString() },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Mapea ErrorCode a HTTP status code.
 *
 * SCHEMA_* / CONFIG_* → 500 (error de configuración del servidor)
 * RESOURCE_* → 502 (upstream: HubSpot, assets)
 * VALIDATION_* → 502 (datos inválidos en upstream)
 * Default → 500
 */
function errorCodeToStatus(code: string): number {
  if (code.startsWith('SCHEMA_') || code.startsWith('CONFIG_')) return 500;
  if (code.startsWith('RESOURCE_')) return 502;
  if (code.startsWith('VALIDATION_')) return 502;
  return 500;
}

// ═══════════════════════════════════════════════════════════
// GET handler
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Validate + normalize clientId ──
  const rawClientId = request.nextUrl.searchParams.get('clientId');
  const clientId = rawClientId?.trim() ?? '';

  if (clientId.length === 0) {
    return errorResponse(400, 'MISSING_CLIENT_ID', 'Query param clientId es obligatorio.');
  }

  const clientConfig = CLIENT_REGISTRY[clientId];
  if (!clientConfig) {
    return errorResponse(404, 'CLIENT_NOT_FOUND', `clientId="${clientId}" no está configurado.`);
  }

  // ── Resolve HubSpot token from env ──
  const token = process.env[clientConfig.hubspotTokenEnvVar];
  if (!token || token.trim().length === 0) {
    return errorResponse(
      500, 'MISSING_TOKEN',
      `Env var ${clientConfig.hubspotTokenEnvVar} no está configurada.`,
    );
  }

  // ── Build logger ──
  const baseLogger = new ConsoleLogger({ route: 'inventory' });
  const logger = baseLogger.child({ clientId });

  // ── Build adapter ──
  const adapter = new HubSpotAdapter(
    {
      clientId,
      privateAppToken: token,
      customObjectTypeIds: clientConfig.objectTypeIds,
    },
    logger,
  );

  // ── Execute mapping — Result-based, no try/catch for expected errors ──
  const result = await mapInventoryToDto({
    adapter,
    logger,
    clientId,
    overlay: clientConfig.overlay,
    canalesAtribucion: clientConfig.canalesAtribucion,
    typologyRules: clientConfig.typologyRules,
  });

  if (result.isErr()) {
    const engineErr = result.error;
    logger.error(engineErr.toJSON(), `Inventory mapping failed: ${engineErr.message}`);
    const status = errorCodeToStatus(engineErr.code);
    return errorResponse(status, engineErr.code, engineErr.message);
  }

  return NextResponse.json(result.value, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
