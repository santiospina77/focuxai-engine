/**
 * SincoAuthManager — Maneja el flujo de autenticación de 3 pasos de Sinco.
 *
 * Flujo completo (validado en producción Jiménez):
 *   1. POST /API/Auth/Usuario con {NomUsuario, ClaveUsuario}
 *      → HTTP 200 (1 BD) o HTTP 300 (múltiples BDs) + token temporal
 *   2. GET /API/Cliente/Empresas con token temporal
 *      → Lista de empresas (IdOrigen, IdEmpresa)
 *   3. GET /API/Auth/Sesion/IniciarMovil/{IdOrigen}/Empresa/{IdEmpresa}/Sucursal/0
 *      → Token final para endpoints de /CBRClientes/API/
 *
 * Responsabilidades:
 *   - Ejecutar los 3 pasos en orden.
 *   - Cachear el token final con margen de expiración (80% de su vida útil).
 *   - Refresh automático cuando el token está por expirar.
 *   - Thread-safe: múltiples calls concurrentes no provocan múltiples logins
 *     (single-flight pattern).
 *
 * Nota importante:
 *   Sucursal siempre es 0 o 1 según la doc; en producción Jiménez validamos
 *   que 0 funciona para todos los casos.
 */

import { AuthError, ErpError } from '@/engine/core/errors/EngineError';
import type { Logger } from '@/engine/core/logging/Logger';
import { type Result, ok, err } from '@/engine/core/types/Result';
import { SincoHttpClient } from './SincoHttpClient';
import {
  SincoAuthStep1ResponseSchema,
  SincoAuthStep3ResponseSchema,
  SincoEmpresasResponseSchema,
  type SincoEmpresa,
} from './types';

export interface SincoAuthConfig {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  /**
   * IdOrigen y IdEmpresa a seleccionar si el usuario tiene múltiples BDs.
   * Si se omite, se usa la primera empresa activa retornada por Sinco.
   */
  readonly idOrigen?: number;
  readonly idEmpresa?: number;
  /**
   * Sucursal. Default 0 (validado en Jiménez). La doc también acepta 1.
   */
  readonly idSucursal?: number;
}

interface CachedToken {
  readonly accessToken: string;
  readonly tokenType: string;
  /** Timestamp absoluto (ms) cuando debemos refrescar. */
  readonly refreshAt: number;
  readonly empresa: SincoEmpresa;
}

export class SincoAuthManager {
  private cached: CachedToken | null = null;
  private pendingLogin: Promise<Result<CachedToken, AuthError | ErpError>> | null = null;

  constructor(
    private readonly http: SincoHttpClient,
    private readonly config: SincoAuthConfig,
    private readonly logger: Logger
  ) {}

  /**
   * Obtiene un token válido. Usa cache si aún no expiró, sino hace login completo.
   * Seguro para llamar concurrentemente — única request de login a la vez.
   */
  async getToken(): Promise<Result<string, AuthError | ErpError>> {
    // Cache hit
    if (this.cached && Date.now() < this.cached.refreshAt) {
      return ok(this.cached.accessToken);
    }

    // Single-flight: si ya hay un login en curso, esperar su resultado.
    if (this.pendingLogin) {
      const result = await this.pendingLogin;
      return result.map((cached) => cached.accessToken);
    }

    this.pendingLogin = this.performFullLogin();
    try {
      const result = await this.pendingLogin;
      if (result.isOk()) {
        this.cached = result.value;
        return ok(result.value.accessToken);
      }
      return err(result.error);
    } finally {
      this.pendingLogin = null;
    }
  }

  /**
   * Fuerza un logout — útil si un endpoint retorna 401 y sospechamos
   * que el token fue invalidado antes de tiempo.
   */
  invalidate(): void {
    this.cached = null;
  }

  /**
   * Base URL de la instancia Sinco. Útil para que el connector no tenga
   * que duplicar la config.
   */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Retorna la empresa activa (útil para debugging y UI de Ops).
   * Null si aún no se ha hecho login.
   */
  getActiveEmpresa(): SincoEmpresa | null {
    return this.cached?.empresa ?? null;
  }

  // -------------------------------------------------------------------------
  // Internos — el flujo de 3 pasos
  // -------------------------------------------------------------------------

  private async performFullLogin(): Promise<Result<CachedToken, AuthError | ErpError>> {
    this.logger.info({ baseUrl: this.config.baseUrl }, 'Sinco auth: starting 3-step login');

    const step1 = await this.step1InitialToken();
    if (step1.isErr()) return err(step1.error);

    const empresas = await this.step2ListEmpresas(step1.value.tempToken);
    if (empresas.isErr()) return err(empresas.error);

    const empresa = this.selectEmpresa(empresas.value);
    if (!empresa) {
      return err(
        new AuthError(
          'AUTH_EMPRESA_NOT_FOUND',
          `No se encontró empresa (idOrigen=${this.config.idOrigen}, idEmpresa=${this.config.idEmpresa})`,
          { idOrigen: this.config.idOrigen, idEmpresa: this.config.idEmpresa, retryable: false }
        )
      );
    }

    const step3 = await this.step3FinalToken(step1.value.tempToken, empresa);
    if (step3.isErr()) return err(step3.error);

    const refreshAt = Date.now() + step3.value.expiresInMs * 0.8;
    this.logger.info(
      {
        empresa: empresa.Nombre,
        idOrigen: empresa.IdOrigen,
        expiresInSec: Math.floor(step3.value.expiresInMs / 1000),
      },
      'Sinco auth: login complete'
    );

    return ok({
      accessToken: step3.value.accessToken,
      tokenType: step3.value.tokenType,
      refreshAt,
      empresa,
    });
  }

  /**
   * Step 1: POST /API/Auth/Usuario
   * Puede retornar HTTP 200 (1 BD) o HTTP 300 (multi-BD). Ambos traen token temporal.
   */
  private async step1InitialToken(): Promise<
    Result<{ tempToken: string }, AuthError | ErpError>
  > {
    const result = await this.http.request({
      method: 'POST',
      path: '/API/Auth/Usuario',
      body: {
        NomUsuario: this.config.username,
        ClaveUsuario: this.config.password,
      },
      operation: 'auth.step1',
    });

    if (result.isErr()) {
      // 401 del step 1 = credenciales inválidas
      if (result.error.code === 'ERP_VALIDATION_ERROR' && result.error.context.httpStatus === 401) {
        return err(
          new AuthError(
            'AUTH_INVALID_CREDENTIALS',
            'Credenciales Sinco inválidas',
            { retryable: false }
          )
        );
      }
      return err(result.error);
    }

    const parsed = SincoAuthStep1ResponseSchema.safeParse(result.value.body);
    if (!parsed.success) {
      return err(
        ErpError.schemaMismatch('auth.step1', parsed.error.issues, {
          operation: 'auth.step1',
        })
      );
    }

    return ok({ tempToken: parsed.data.access_token });
  }

  /**
   * Step 2: GET /API/Cliente/Empresas con el token temporal.
   */
  private async step2ListEmpresas(
    tempToken: string
  ): Promise<Result<readonly SincoEmpresa[], ErpError>> {
    const result = await this.http.request({
      method: 'GET',
      path: '/API/Cliente/Empresas',
      token: tempToken,
      operation: 'auth.step2',
    });

    if (result.isErr()) return err(result.error);

    const parsed = SincoEmpresasResponseSchema.safeParse(result.value.body);
    if (!parsed.success) {
      return err(
        ErpError.schemaMismatch('auth.step2', parsed.error.issues, {
          operation: 'auth.step2',
        })
      );
    }

    if (parsed.data.length === 0) {
      return err(
        new ErpError(
          'ERP_VALIDATION_ERROR',
          'Usuario Sinco no tiene empresas asociadas',
          { retryable: false }
        )
      );
    }

    return ok(parsed.data);
  }

  private selectEmpresa(empresas: readonly SincoEmpresa[]): SincoEmpresa | null {
    // Si hay selección explícita en config, usarla.
    if (this.config.idOrigen != null && this.config.idEmpresa != null) {
      return (
        empresas.find(
          (e) =>
            e.IdOrigen === this.config.idOrigen &&
            e.IdEmpresa === this.config.idEmpresa &&
            e.Estado
        ) ?? null
      );
    }

    // Si solo hay una empresa activa, usarla.
    const activas = empresas.filter((e) => e.Estado);
    if (activas.length === 1) return activas[0]!;

    // Múltiples empresas activas sin selección explícita es un error de config.
    return null;
  }

  /**
   * Step 3: GET /API/Auth/Sesion/IniciarMovil/{IdOrigen}/Empresa/{IdEmpresa}/Sucursal/{IdSucursal}
   * Devuelve el token final para usar con /CBRClientes/API/
   */
  private async step3FinalToken(
    tempToken: string,
    empresa: SincoEmpresa
  ): Promise<
    Result<
      { accessToken: string; tokenType: string; expiresInMs: number },
      ErpError
    >
  > {
    const sucursal = this.config.idSucursal ?? 0;
    const path = `/API/Auth/Sesion/IniciarMovil/${empresa.IdOrigen}/Empresa/${empresa.IdEmpresa}/Sucursal/${sucursal}`;

    const result = await this.http.request({
      method: 'GET',
      path,
      token: tempToken,
      operation: 'auth.step3',
    });

    if (result.isErr()) return err(result.error);

    const parsed = SincoAuthStep3ResponseSchema.safeParse(result.value.body);
    if (!parsed.success) {
      return err(
        ErpError.schemaMismatch('auth.step3', parsed.error.issues, {
          operation: 'auth.step3',
        })
      );
    }

    return ok({
      accessToken: parsed.data.access_token,
      tokenType: parsed.data.token_type,
      expiresInMs: parsed.data.expires_in * 1000,
    });
  }
}
