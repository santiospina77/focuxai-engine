/**
 * ConnectorFactory — Ensambla conectores ERP/CRM a partir de config + secrets.
 *
 * Esta es la única clase que conoce la relación entre clientId, qué ERP/CRM
 * usa ese cliente, y cómo instanciar sus conectores. El resto del Engine solo
 * pide "dame el ERP/CRM del cliente X" y recibe algo que implementa la interface.
 *
 * Patrón:
 *   API route:
 *     const erp = factory.getErpConnector(clientId);
 *     const result = await erp.getMacroproyectos();
 *
 *   La API route nunca sabe si detrás hay Sinco, SAP u Oracle.
 *
 * El día que se agregue un ERP/CRM nuevo, solo se modifica este archivo
 * (agregar un case al switch). Cero cambios en apps o Engine Core.
 */

import { ConfigError, type EngineError } from '@/engine/core/errors/EngineError';
import type { Logger } from '@/engine/core/logging/Logger';
import { type Result, ok, err } from '@/engine/core/types/Result';
import type { IErpConnector } from '@/engine/interfaces/IErpConnector';
import type { ICrmAdapter } from '@/engine/interfaces/ICrmAdapter';
import type { IClientConfigStore, ISecretStore, ClientConfig } from '@/engine/config/ClientConfigStore';
import { SincoConnector } from '@/engine/connectors/erp/sinco/SincoConnector';
import { HubSpotAdapter } from '@/engine/connectors/crm/hubspot/HubSpotAdapter';

export interface ConnectorFactoryConfig {
  readonly configStore: IClientConfigStore;
  readonly secretStore: ISecretStore;
  readonly logger: Logger;
}

export class ConnectorFactory {
  // Cache de conectores por clientId para no re-instanciar en cada request.
  // Los conectores son thread-safe y stateless (salvo auth cache interno).
  private readonly erpCache = new Map<string, IErpConnector>();
  private readonly crmCache = new Map<string, ICrmAdapter>();

  constructor(private readonly config: ConnectorFactoryConfig) {}

  /**
   * Obtiene el ERP connector del cliente. Cachea por clientId.
   */
  getErpConnector(clientId: string): Result<IErpConnector, EngineError> {
    const cached = this.erpCache.get(clientId);
    if (cached) return ok(cached);

    const clientConfig = this.config.configStore.get(clientId);
    if (!clientConfig) {
      return err(ConfigError.clientNotFound(clientId));
    }
    if (!clientConfig.active) {
      return err(
        new ConfigError(
          'CONFIG_CLIENT_NOT_FOUND',
          `Client "${clientId}" is marked inactive`,
          { clientId, retryable: false }
        )
      );
    }

    const built = this.buildErpConnector(clientConfig);
    if (built.isErr()) return err(built.error);

    this.erpCache.set(clientId, built.value);
    return ok(built.value);
  }

  /**
   * Obtiene el CRM adapter del cliente. Cachea por clientId.
   */
  getCrmAdapter(clientId: string): Result<ICrmAdapter, EngineError> {
    const cached = this.crmCache.get(clientId);
    if (cached) return ok(cached);

    const clientConfig = this.config.configStore.get(clientId);
    if (!clientConfig) {
      return err(ConfigError.clientNotFound(clientId));
    }
    if (!clientConfig.active) {
      return err(
        new ConfigError(
          'CONFIG_CLIENT_NOT_FOUND',
          `Client "${clientId}" is marked inactive`,
          { clientId, retryable: false }
        )
      );
    }

    const built = this.buildCrmAdapter(clientConfig);
    if (built.isErr()) return err(built.error);

    this.crmCache.set(clientId, built.value);
    return ok(built.value);
  }

  /**
   * Retorna la config completa del cliente. Útil para acceder a features y
   * al objeto `name` cuando el caller los necesita junto con los conectores.
   */
  getClientConfig(clientId: string): Result<ClientConfig, EngineError> {
    const config = this.config.configStore.get(clientId);
    if (!config) return err(ConfigError.clientNotFound(clientId));
    return ok(config);
  }

  /**
   * Invalida el cache de un cliente específico. Útil después de rotar secrets
   * o actualizar config en caliente (si en el futuro soportamos hot reload).
   */
  invalidate(clientId: string): void {
    this.erpCache.delete(clientId);
    this.crmCache.delete(clientId);
  }

  // =========================================================================
  // Builders por tipo
  // =========================================================================

  private buildErpConnector(clientConfig: ClientConfig): Result<IErpConnector, EngineError> {
    switch (clientConfig.erp.kind) {
      case 'sinco': {
        const secrets = this.config.secretStore.getSincoSecrets(clientConfig.clientId);
        if (!secrets) {
          return err(ConfigError.missingSecret(clientConfig.clientId, 'sinco'));
        }
        const connector = new SincoConnector(
          {
            clientId: clientConfig.clientId,
            auth: {
              baseUrl: clientConfig.erp.baseUrl,
              username: secrets.username,
              password: secrets.password,
              idOrigen: clientConfig.erp.idOrigen,
              idEmpresa: clientConfig.erp.idEmpresa,
              idSucursal: clientConfig.erp.idSucursal,
            },
          },
          this.config.logger
        );
        return ok(connector);
      }
      // Futuro:
      // case 'sap':  return ok(new SapConnector(...));
      // case 'oracle': return ok(new OracleConnector(...));
      default: {
        const kind = (clientConfig.erp as { kind: string }).kind;
        return err(
          new ConfigError(
            'CONFIG_INVALID_SCHEMA',
            `ERP kind "${kind}" not supported`,
            { clientId: clientConfig.clientId, kind, retryable: false }
          )
        );
      }
    }
  }

  private buildCrmAdapter(clientConfig: ClientConfig): Result<ICrmAdapter, EngineError> {
    switch (clientConfig.crm.kind) {
      case 'hubspot': {
        const secrets = this.config.secretStore.getHubSpotSecrets(clientConfig.clientId);
        if (!secrets) {
          return err(ConfigError.missingSecret(clientConfig.clientId, 'hubspot'));
        }
        const adapter = new HubSpotAdapter(
          {
            clientId: clientConfig.clientId,
            privateAppToken: secrets.privateAppToken,
            customObjectTypeIds: clientConfig.crm.customObjectTypeIds,
          },
          this.config.logger
        );
        return ok(adapter);
      }
      // Futuro:
      // case 'salesforce': return ok(new SalesforceAdapter(...));
      // case 'focux':      return ok(new FocuxCrmAdapter(...));
      default: {
        const kind = (clientConfig.crm as { kind: string }).kind;
        return err(
          new ConfigError(
            'CONFIG_INVALID_SCHEMA',
            `CRM kind "${kind}" not supported`,
            { clientId: clientConfig.clientId, kind, retryable: false }
          )
        );
      }
    }
  }
}
