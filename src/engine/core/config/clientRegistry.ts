/**
 * FocuxAI Engine™ — Client Registry (compartido)
 *
 * Single source of truth para la config base de cada cliente.
 * Todos los API routes del Engine importan de aquí.
 *
 * Para config específica de un módulo (overlay, objectTypeIds, etc.),
 * cada módulo extiende esta base con su propia interface.
 *
 * Focux Digital Group S.A.S. — Abril 22, 2026
 */

// ═══════════════════════════════════════════════════════════
// Base config — lo mínimo que todo route del Engine necesita
// ═══════════════════════════════════════════════════════════

export interface ClientBaseConfig {
  readonly clientId: string;
  readonly hubspotTokenEnvVar: string;
}

// ═══════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════

const CLIENTS: Record<string, ClientBaseConfig> = {
  jimenez_demo: {
    clientId: 'jimenez_demo',
    hubspotTokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
  },
  // Agregar más clientes aquí (Urbansa, etc.)
};

/**
 * Resuelve la config base de un cliente.
 * Retorna undefined si el clientId no está registrado.
 */
export function getClientBaseConfig(clientId: string): ClientBaseConfig | undefined {
  return CLIENTS[clientId];
}

/**
 * Resuelve el token de HubSpot para un cliente desde env vars.
 * Retorna undefined si el clientId no existe o el env var no está set.
 */
export function resolveHubSpotToken(clientId: string): string | undefined {
  const config = CLIENTS[clientId];
  if (!config) return undefined;
  const token = process.env[config.hubspotTokenEnvVar];
  if (!token || token.trim().length === 0) return undefined;
  return token;
}
