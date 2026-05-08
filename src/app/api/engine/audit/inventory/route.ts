/**
 * GET /api/engine/audit/inventory — Audit endpoint de inventario (DATA-3).
 *
 * PROPÓSITO:
 *   Reportar unidades en cuarentena, proyectos omitidos, y cobertura general.
 *   Read-only, desacoplado del sync — se puede ejecutar en cualquier momento.
 *
 * AUTH: CRON_SECRET (mismo que sync) — NO público.
 *
 * Query params:
 *   - clientId (obligatorio): ID del cliente en el Engine
 *
 * Responses:
 *   200 → AuditReport
 *   400 → clientId faltante
 *   401 → CRON_SECRET inválido o ausente
 *   404 → clientId no configurado
 *   502 → error de HubSpot o mapping
 *   500 → error inesperado
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { mapInventoryToDto } from '@/engine/apps/quoter/inventory/mapInventoryToDto';
import { HubSpotAdapter } from '@/engine/connectors/crm/hubspot/HubSpotAdapter';
import { ConsoleLogger } from '@/engine/core/logging/Logger';
import { JIMENEZ_DEMO_CONFIG, type ClientInventoryConfig } from '@/engine/apps/quoter/inventory/clientConfigs/jimenez_demo';

// ═══════════════════════════════════════════════════════════
// Client registry (same as inventory route)
// ═══════════════════════════════════════════════════════════

const CLIENT_REGISTRY: Record<string, ClientInventoryConfig> = {
  jimenez_demo: JIMENEZ_DEMO_CONFIG,
};

// ═══════════════════════════════════════════════════════════
// Auth helper
// ═══════════════════════════════════════════════════════════

function validateAuth(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Accept via Authorization header or query param
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${secret}`) return true;

  const querySecret = request.nextUrl.searchParams.get('secret');
  if (querySecret === secret) return true;

  return false;
}

// ═══════════════════════════════════════════════════════════
// GET handler
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth check ──
  if (!validateAuth(request)) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'CRON_SECRET requerido.' },
      { status: 401 },
    );
  }

  // ── Validate clientId ──
  const clientId = request.nextUrl.searchParams.get('clientId')?.trim() ?? '';
  if (!clientId) {
    return NextResponse.json(
      { error: 'MISSING_CLIENT_ID', message: 'Query param clientId es obligatorio.' },
      { status: 400 },
    );
  }

  const clientConfig = CLIENT_REGISTRY[clientId];
  if (!clientConfig) {
    return NextResponse.json(
      { error: 'CLIENT_NOT_FOUND', message: `clientId="${clientId}" no está configurado.` },
      { status: 404 },
    );
  }

  // ── Resolve HubSpot token ──
  const token = process.env[clientConfig.hubspotTokenEnvVar];
  if (!token?.trim()) {
    return NextResponse.json(
      { error: 'MISSING_TOKEN', message: `Env var ${clientConfig.hubspotTokenEnvVar} no configurada.` },
      { status: 500 },
    );
  }

  // ── Build deps ──
  const logger = new ConsoleLogger({ route: 'audit/inventory' }).child({ clientId });
  const adapter = new HubSpotAdapter(
    { clientId, privateAppToken: token, customObjectTypeIds: clientConfig.objectTypeIds },
    logger,
  );

  // ── Execute mapping (same as inventory, but we extract audit data) ──
  const result = await mapInventoryToDto({
    adapter,
    logger,
    clientId,
    overlay: clientConfig.overlay,
    canalesAtribucion: clientConfig.canalesAtribucion,
    typologyRules: clientConfig.typologyRules,
  });

  if (result.isErr()) {
    const e = result.error;
    logger.error(e.toJSON(), `Audit mapping failed: ${e.message}`);
    return NextResponse.json(
      { error: e.code, message: e.message },
      { status: e.code.startsWith('RESOURCE_') ? 502 : 500 },
    );
  }

  const inv = result.value;

  // ── Build audit report ──
  const projectSummaries = inv.macros.flatMap(m =>
    m.proyectos.map(p => ({
      macroNombre: m.nombre,
      projectNombre: p.nombre,
      projectSincoId: p.sincoId,
      codigo: p.codigo,
      selectionMode: p.selectionMode,
      selectableCount: p.selectableItems.length,
      quarantinedGridCount: p.quarantinedGridItems.length,
      quarantinedGridItems: p.quarantinedGridItems.map(q => ({
        sincoId: q.sincoId,
        nombre: q.nombre,
        numero: q.numero,
        piso: q.piso,
        pos: q.pos,
        area: q.area,
        code: q.code,
        reason: q.reason,
        missingFields: q.missingFields,
      })),
    })),
  );

  const report = {
    clientId,
    timestamp: inv.timestamp,
    summary: {
      totalMacros: inv.macros.length,
      totalProjects: projectSummaries.length,
      totalSelectableUnits: projectSummaries.reduce((s, p) => s + p.selectableCount, 0),
      totalQuarantinedGrid: projectSummaries.reduce((s, p) => s + p.quarantinedGridCount, 0),
      totalQuarantinedItems: inv.quarantinedItems.length,
      skippedProjects: inv.warnings.skippedProjects,
      skippedProjectDetails: inv.warnings.skippedProjectDetails,
      unmappedAreas: inv.warnings.unmappedAreas,
      unmappedUnits: inv.warnings.unmappedUnits,
      excludedUnits: inv.warnings.excludedUnits,
      excludedGroupings: inv.warnings.excludedGroupings,
    },
    quarantinedItems: inv.quarantinedItems,
    projects: projectSummaries,
    warnings: inv.warnings,
  };

  return NextResponse.json(report, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
