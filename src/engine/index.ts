/**
 * Engine — Singleton composition root.
 *
 * Punto de entrada único desde las API routes. Ensambla la factory, el
 * config store y el secret store una sola vez y los reutiliza.
 *
 * Uso desde una API route de Next.js:
 *
 *   import { Engine } from '@/engine';
 *
 *   export async function GET(req: Request) {
 *     const erp = Engine.getErpConnector('jimenez');
 *     if (erp.isErr()) return Response.json(erp.error.toJSON(), { status: 500 });
 *     const macros = await erp.value.getMacroproyectos();
 *     ...
 *   }
 *
 * Por qué singleton y no DI container:
 *   - En Next.js/Vercel el servidor es stateless entre invocaciones, pero
 *     dentro de una invocación Node reusa módulos — el singleton evita
 *     cablear todo en cada request.
 *   - Mantiene el cache de auth tokens de Sinco vivo durante la vida del
 *     proceso (hasta que Vercel lo recicle), lo que minimiza logins.
 */

import { ConnectorFactory } from '@/engine/config/ConnectorFactory';
import {
  InMemoryClientConfigStore,
  EnvSecretStore,
  type ClientConfig,
  type IClientConfigStore,
  type ISecretStore,
} from '@/engine/config/ClientConfigStore';
import { ConsoleLogger, type Logger } from '@/engine/core/logging/Logger';
import { InMemoryEventLog, type IEventLog } from '@/engine/core/eventlog/EventLog';
import { PgEventLog } from '@/engine/core/eventlog/PgEventLog';
import { InventorySync } from '@/engine/core/sync/InventorySync';
import { SaleWriteback } from '@/engine/core/sync/SaleWriteback';

// ============================================================================
// Bootstrap — configuración inicial de clientes
// ============================================================================

/**
 * Lista de clientes configurados.
 *
 * Para agregar un cliente nuevo:
 *   1. Agregar su config aquí (URLs, IDs).
 *   2. Agregar sus secrets en env vars de Vercel.
 *   3. Correr el Adapter para crear sus Custom Objects.
 *   4. Actualizar customObjectTypeIds con los IDs reales que retornó HubSpot.
 *
 * En el futuro este array se reemplaza por lectura desde DB/Edge Config.
 */
const CLIENTS: ClientConfig[] = [
  // Demo / desarrollo — portal de pruebas de Focux con data de Jiménez.
  {
    clientId: 'jimenez_demo',
    name: 'Constructora Jiménez (Demo)',
    active: true,
    erp: {
      kind: 'sinco',
      baseUrl: 'https://www3.sincoerp.com/SincoJimenez_Nueva/V3',
      idOrigen: 1,
      idEmpresa: 1,
      idSucursal: 0,
    },
    crm: {
      kind: 'hubspot',
      // Placeholders — se actualizan tras correr el Adapter en el portal demo.
      customObjectTypeIds: {
        macroproyecto: '2-60986238',
        proyecto: '2-60987399',
        unidad: '2-60987403',
        agrupacion: '2-60987404',
      },
    },
    features: {
      agrupacionesPreestablecidas: true,
      diasBloqueo: 4,
      syncIntervalHours: 2,
    },
  },
  // Producción Jiménez — se activa cuando el Adapter corra en el portal real.
  // {
  //   clientId: 'jimenez',
  //   name: 'Constructora Jiménez S.A.',
  //   active: false,  // flip a true tras setup completo
  //   ...
  // },
];

// ============================================================================
// Singleton
// ============================================================================

class EngineSingleton {
  private _factory: ConnectorFactory | null = null;
  private _configStore: IClientConfigStore | null = null;
  private _secretStore: ISecretStore | null = null;
  private _logger: Logger | null = null;
  private _eventLog: IEventLog | null = null;
  private _inventorySync: InventorySync | null = null;
  private _saleWriteback: SaleWriteback | null = null;

  private bootstrap(): void {
    if (this._factory) return;

    this._logger = new ConsoleLogger(
      { service: 'focuxai-engine' },
      (((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['LOG_LEVEL']) as
        | 'debug'
        | 'info'
        | 'warn'
        | 'error') ?? 'info'
    );

    this._configStore = new InMemoryClientConfigStore(CLIENTS);
    this._secretStore = new EnvSecretStore();
    // EventLog wiring: PgEventLog for production (needs DATABASE_URL),
    // InMemoryEventLog for dry-run/dev without DB.
    // Real mode (DRY_RUN=false) without DATABASE_URL → PgEventLog will fail
    // on first begin() with RESOURCE_EVENT_LOG_FAILED (typed, not crash).
    const dryRun = process.env.SINCO_WRITEBACK_DRY_RUN !== 'false';
    if (!dryRun && !process.env.DATABASE_URL) {
      this._logger.error(
        {},
        'SINCO_WRITEBACK_DRY_RUN=false requires DATABASE_URL. Write-back calls will fail with RESOURCE_EVENT_LOG_FAILED.',
      );
    }
    if (process.env.DATABASE_URL) {
      this._eventLog = new PgEventLog(this._logger);
    } else if (dryRun) {
      this._eventLog = new InMemoryEventLog(this._logger);
    } else {
      // Real mode without DB — PgEventLog will fail on first begin()
      this._eventLog = new PgEventLog(this._logger);
    }

    this._factory = new ConnectorFactory({
      configStore: this._configStore,
      secretStore: this._secretStore,
      logger: this._logger,
    });

    this._inventorySync = new InventorySync(this._logger, this._eventLog);
    this._saleWriteback = new SaleWriteback(this._logger, this._eventLog);
  }

  get factory(): ConnectorFactory {
    this.bootstrap();
    return this._factory!;
  }

  get logger(): Logger {
    this.bootstrap();
    return this._logger!;
  }

  get configStore(): IClientConfigStore {
    this.bootstrap();
    return this._configStore!;
  }

  get eventLog(): IEventLog {
    this.bootstrap();
    return this._eventLog!;
  }

  get inventorySync(): InventorySync {
    this.bootstrap();
    return this._inventorySync!;
  }

  get saleWriteback(): SaleWriteback {
    this.bootstrap();
    return this._saleWriteback!;
  }

  /**
   * Override point para tests — permite inyectar mocks.
   */
  overrideForTesting(overrides: {
    factory?: ConnectorFactory;
    configStore?: IClientConfigStore;
    secretStore?: ISecretStore;
    logger?: Logger;
  }): void {
    if (overrides.logger) this._logger = overrides.logger;
    if (overrides.configStore) this._configStore = overrides.configStore;
    if (overrides.secretStore) this._secretStore = overrides.secretStore;
    if (overrides.factory) {
      this._factory = overrides.factory;
    } else if (this._configStore && this._secretStore && this._logger) {
      this._factory = new ConnectorFactory({
        configStore: this._configStore,
        secretStore: this._secretStore,
        logger: this._logger,
      });
    }
  }

  /**
   * Métodos convenientes — proxies al factory. Las API routes usan estos.
   */
  getErpConnector(clientId: string) {
    return this.factory.getErpConnector(clientId);
  }

  getCrmAdapter(clientId: string) {
    return this.factory.getCrmAdapter(clientId);
  }

  getClientConfig(clientId: string) {
    return this.factory.getClientConfig(clientId);
  }
}

export const Engine = new EngineSingleton();
