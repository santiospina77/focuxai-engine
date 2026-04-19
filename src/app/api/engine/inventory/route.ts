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
 *   500 → error inesperado
 *
 * Headers: Cache-Control: no-store
 *
 * Firmas verificadas contra repo real (abril 19, 2026):
 *   - HubSpotAdapter(config: HubSpotAdapterConfig, logger: Logger)
 *   - HubSpotAdapterConfig: { clientId, privateAppToken, customObjectTypeIds }
 *   - ConsoleLogger(baseContext?: LogContext, minLevel?: LogLevel)
 *   - Logger.child(context: LogContext): Logger
 */

import { NextRequest, NextResponse } from 'next/server';
import { mapInventoryToDto, InventoryMappingError } from '@/engine/apps/quoter/inventory/mapInventoryToDto';
import { FetchAllPagesError } from '@/engine/apps/quoter/inventory/fetchAllPages';
import { JoinError } from '@/engine/apps/quoter/inventory/joinGroupingWithUnit';
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

  try {
    // ── Build adapter inside try — constructor can fail ──
    const adapter = new HubSpotAdapter(
      {
        clientId,
        privateAppToken: token,
        customObjectTypeIds: clientConfig.objectTypeIds,
      },
      logger,
    );

    const result = await mapInventoryToDto({
      adapter,
      logger,
      clientId,
      overlay: clientConfig.overlay,
      canalesAtribucion: clientConfig.canalesAtribucion,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });

  } catch (err) {
    if (err instanceof FetchAllPagesError) {
      logger.error(
        { objectType: err.objectType, page: err.page, cause: String(err.cause) },
        `Inventory fetch failed: ${err.message}`,
      );
      return errorResponse(502, 'HUBSPOT_FETCH_ERROR', err.message);
    }

    if (err instanceof JoinError) {
      logger.error(
        { projectSincoId: err.projectSincoId, agrupacion: err.agrupacionNombre },
        `Inventory join failed: ${err.message}`,
      );
      return errorResponse(502, 'INVENTORY_JOIN_ERROR', err.message);
    }

    if (err instanceof InventoryMappingError) {
      logger.error(
        { projectSincoId: err.projectSincoId },
        `Inventory mapping failed: ${err.message}`,
      );
      return errorResponse(502, 'INVENTORY_MAPPING_ERROR', err.message);
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ stack: err instanceof Error ? err.stack : undefined }, `Unexpected error: ${message}`);
    return errorResponse(500, 'INTERNAL_ERROR', message);
  }
}
