/**
 * ClientConfigStore — Gestión de configuración y secrets por cliente.
 *
 * Separación arquitectural crítica:
 *
 *   CONFIG (no-sensible):
 *     Base URLs, IDs de empresas, object type IDs, feature flags, reglas
 *     de negocio. Versionable en git. Auditable. Se carga desde un archivo
 *     JSON por cliente o (futuro) una DB.
 *
 *   SECRETS (sensibles):
 *     Usernames, passwords, tokens. NUNCA en git. Hoy viven en env vars de
 *     Vercel (encriptadas at-rest). Mañana pueden mudarse a AWS Secrets
 *     Manager, Doppler, o Vault sin cambiar el código — solo la
 *     implementación del SecretStore.
 *
 * El contrato es una interface: IClientConfigStore. El resto del Engine
 * (ConnectorFactory, API routes) solo conoce este contrato.
 */

import type { HubSpotCustomObjectTypeIds } from '@/engine/connectors/crm/hubspot/types';

// ============================================================================
// Config shape
// ============================================================================

export type ErpKind = 'sinco' | 'sap' | 'oracle'; // agregas aquí cuando haya más
export type CrmKind = 'hubspot' | 'salesforce' | 'focux';

export interface SincoErpConfig {
  readonly kind: 'sinco';
  readonly baseUrl: string;
  readonly idOrigen: number;
  readonly idEmpresa: number;
  readonly idSucursal?: number;
}

export type ErpConfig = SincoErpConfig; // | SapErpConfig | OracleErpConfig;

export interface HubSpotCrmConfig {
  readonly kind: 'hubspot';
  readonly customObjectTypeIds: HubSpotCustomObjectTypeIds;
}

export type CrmConfig = HubSpotCrmConfig; // | SalesforceCrmConfig;

/**
 * Feature flags por cliente. Permite activar/desactivar comportamientos sin
 * deploys. Ejemplo: Jiménez tiene agrupaciones preestablecidas = no crear
 * nuevas en Sinco al cerrar venta.
 */
export interface ClientFeatures {
  readonly agrupacionesPreestablecidas?: boolean;
  readonly diasBloqueo?: number;
  readonly syncIntervalHours?: number;
}

export interface ClientConfig {
  readonly clientId: string;
  readonly name: string;
  readonly active: boolean;
  readonly erp: ErpConfig;
  readonly crm: CrmConfig;
  readonly features: ClientFeatures;
}

// ============================================================================
// Secrets shape
// ============================================================================

export interface SincoSecrets {
  readonly username: string;
  readonly password: string;
}

export interface HubSpotSecrets {
  readonly privateAppToken: string;
}

export interface ClientSecrets {
  readonly sinco?: SincoSecrets;
  readonly hubspot?: HubSpotSecrets;
}

// ============================================================================
// Interfaces
// ============================================================================

export interface IClientConfigStore {
  get(clientId: string): ClientConfig | null;
  list(): readonly ClientConfig[];
}

export interface ISecretStore {
  getSincoSecrets(clientId: string): SincoSecrets | null;
  getHubSpotSecrets(clientId: string): HubSpotSecrets | null;
}

// ============================================================================
// Implementación: ConfigStore en memoria cargado desde JSON
// ============================================================================

/**
 * Implementación simple: guarda todos los configs en memoria.
 * Para producción hoy, el JSON se puede:
 *   - Incluir en el bundle de Vercel (config/clients.json)
 *   - Leer de Vercel Edge Config (más dinámico)
 *   - Leer de una DB en el futuro
 *
 * El contrato (IClientConfigStore) no cambia, solo la implementación.
 */
export class InMemoryClientConfigStore implements IClientConfigStore {
  private readonly configs: Map<string, ClientConfig>;

  constructor(configs: readonly ClientConfig[]) {
    this.configs = new Map(configs.map((c) => [c.clientId, c]));
  }

  get(clientId: string): ClientConfig | null {
    return this.configs.get(clientId) ?? null;
  }

  list(): readonly ClientConfig[] {
    return Array.from(this.configs.values());
  }
}

// ============================================================================
// Implementación: SecretStore desde process.env
// ============================================================================

/**
 * Convención de nombres de env vars:
 *   SINCO_{CLIENT_ID_UPPER}_USERNAME
 *   SINCO_{CLIENT_ID_UPPER}_PASSWORD
 *   HUBSPOT_{CLIENT_ID_UPPER}_PRIVATE_APP_TOKEN
 *
 * Ejemplo: SINCO_JIMENEZ_USERNAME, HUBSPOT_JIMENEZ_PRIVATE_APP_TOKEN.
 *
 * El día que migremos a Vault o Secrets Manager, esta clase es la ÚNICA que
 * se reemplaza. Todo lo demás sigue igual.
 */
export class EnvSecretStore implements ISecretStore {
  constructor(private readonly env: Record<string, string | undefined> = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) {}

  getSincoSecrets(clientId: string): SincoSecrets | null {
    const prefix = `SINCO_${clientId.toUpperCase()}`;
    const username = this.env[`${prefix}_USERNAME`];
    const password = this.env[`${prefix}_PASSWORD`];
    if (!username || !password) return null;
    return { username, password };
  }

  getHubSpotSecrets(clientId: string): HubSpotSecrets | null {
    const token = this.env[`HUBSPOT_${clientId.toUpperCase()}_PRIVATE_APP_TOKEN`];
    if (!token) return null;
    return { privateAppToken: token };
  }
}
