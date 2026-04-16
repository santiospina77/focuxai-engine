/**
 * Logger estructurado — interface agnóstica.
 *
 * El Engine nunca depende de pino/winston/etc directamente. En su lugar
 * acepta cualquier implementación de Logger. Esto permite:
 *  - Tests con un logger mock
 *  - Cambiar de pino a otro sin tocar el Engine
 *  - Inyectar context por capa (clientId, operationId, requestId)
 *
 * El logger default es un wrapper simple sobre console.log con JSON.
 * En producción (Vercel) lo reemplazas por pino o axiom/datadog.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(context: LogContext, message: string): void;
  info(context: LogContext, message: string): void;
  warn(context: LogContext, message: string): void;
  error(context: LogContext, message: string): void;
  /**
   * Crea un logger hijo que hereda el context del padre y agrega más.
   * Útil para inyectar clientId/requestId sin tener que pasarlo en cada log.
   */
  child(context: LogContext): Logger;
}

/**
 * Logger default basado en console con JSON estructurado.
 * Vercel recolecta stdout y lo indexa — con JSON puedes filtrar por campo.
 */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly baseContext: LogContext = {},
    private readonly minLevel: LogLevel = 'info'
  ) {}

  private static readonly levelOrder: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private shouldLog(level: LogLevel): boolean {
    return ConsoleLogger.levelOrder[level] >= ConsoleLogger.levelOrder[this.minLevel];
  }

  private emit(level: LogLevel, context: LogContext, message: string): void {
    if (!this.shouldLog(level)) return;

    const record = {
      level,
      time: new Date().toISOString(),
      msg: message,
      ...this.baseContext,
      ...context,
    };

    // console.error para warn/error, console.log para lo demás.
    // Vercel separa stderr de stdout y permite filtros distintos.
    const emit = level === 'error' || level === 'warn' ? console.error : console.log;
    emit(JSON.stringify(record));
  }

  debug(context: LogContext, message: string): void {
    this.emit('debug', context, message);
  }

  info(context: LogContext, message: string): void {
    this.emit('info', context, message);
  }

  warn(context: LogContext, message: string): void {
    this.emit('warn', context, message);
  }

  error(context: LogContext, message: string): void {
    this.emit('error', context, message);
  }

  child(context: LogContext): Logger {
    return new ConsoleLogger({ ...this.baseContext, ...context }, this.minLevel);
  }
}

/**
 * Logger silencioso — para tests que no quieren spam en la salida.
 */
export class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  child(): Logger {
    return this;
  }
}

/**
 * Factory default. En producción sobreescribes esto con pino o similar
 * desde tu composition root (ej. instrumentation.ts de Next.js).
 */
let defaultLogger: Logger = new ConsoleLogger(
  { service: 'focuxai-engine' },
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);

export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}

export function getDefaultLogger(): Logger {
  return defaultLogger;
}
