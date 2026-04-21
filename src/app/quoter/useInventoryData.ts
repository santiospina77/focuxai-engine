/**
 * useInventoryData — Hook React que conecta el QuoterClient al endpoint real.
 *
 * RESPONSABILIDADES:
 *   1. Fetch GET /api/engine/inventory?clientId={clientId} en mount
 *   2. Transformar InventoryResponse → shapes que el QuoterClient consume
 *   3. Exponer getters por torreId (sincoId del proyecto) para units, parking, storage
 *   4. Exponer getConfig(torreId) para config dinámico por proyecto
 *   5. Manejar loading/error states
 *
 * LO QUE REEMPLAZA EN QuoterClient:
 *   - SINCO_RAW, parseSincoUnits(), AREA_TIPOLOGIA/HABS/BANOS (líneas 52-151)
 *   - MACROS (líneas 208-211)
 *   - TORRES dict (líneas 214-229)
 *   - UNITS_BY_TORRE, genDemoUnits(), genComps() (líneas 153-206)
 *   - CONFIG constante global (líneas 262-266)
 *   - ESTADOS dict parcial (línea 138)
 *   - getUnits(), getParking(), getStorage() helpers (líneas 258-260)
 *   - precioDesde dynamic calc (líneas 250-255)
 *   - Canal de atribución hardcodeado (línea 387)
 *
 * LO QUE NO TOCA:
 *   - Plan de pagos (lógica de cálculos)
 *   - UX (7 steps, tower view, tabla, filtros)
 *   - ASESORES (mock hasta OAuth)
 *   - ABONO_TIPOS, COUNTRIES
 *   - COT numbering (generateCotNumber)
 *   - PDF print
 *   - Branding, colores, fonts
 *
 * SHAPES DE SALIDA — compatibles 1:1 con lo que QuoterClient ya consume:
 *
 *   macro:  { id, nombre, ciudad, zona, estado, tipo }
 *   torre:  { id, nombre, tipo, areaDesde, areaHasta, codigo, precioDesde }
 *   unit:   { id, sincoId, piso, numero, pos, tipologia, area, habs, banos,
 *             precio, estado, tipo_inmueble, hubspotId, esPrincipal, nombre }
 *   config: { separacion_pct, cuota_inicial_pct, cuotas_default, financiacion_pct,
 *             dias_bloqueo, vigencia_cotizacion, agrupaciones_preestablecidas }
 *
 * NOTA: torre.id y unit.id ahora son sincoId (números de Sinco) en lugar de
 *       los IDs arbitrarios del mock (1,2,3...). Esto es correcto porque el
 *       QuoterClient los usa solo como keys para indexar — nunca los manda a
 *       ningún servicio externo.
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 * Focux Digital Group S.A.S. — Abril 21, 2026
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════
// Types — shapes compatibles con QuoterClient
// ═══════════════════════════════════════════════════════════

/** Macro para la UI — shape compatible con MACROS del QuoterClient */
export interface UIMacro {
  readonly id: number;        // sincoId
  readonly nombre: string;
  readonly ciudad: string;
  readonly zona: string;
  readonly estado: string;
  readonly tipo: string;
}

/** Torre para la UI — shape compatible con TORRES del QuoterClient */
export interface UITorre {
  readonly id: number;        // sincoId del proyecto
  readonly nombre: string;
  readonly tipo: string;
  readonly areaDesde: number;
  readonly areaHasta: number;
  readonly codigo: string;
  readonly precioDesde: number;
}

/** Unidad para la UI — shape compatible con units del QuoterClient */
export interface UIUnit {
  readonly id: number;        // sincoId
  readonly hubspotId: string;
  readonly sincoId: number;
  readonly nombre: string;
  readonly piso: number;
  readonly numero: string;
  readonly pos: string;
  readonly tipologia: string;
  readonly area: number;
  readonly habs: number;
  readonly banos: number;
  readonly precio: number;
  readonly estado: string;    // "disponible" | "vendida" | "bloqueada" | "separada" | "cotizada"
  readonly tipo_inmueble: string; // "APT" | "PARQ" | "DEP"
  readonly esPrincipal: boolean;
}

/** Canal de atribución */
export interface UICanal {
  readonly label: string;
  readonly value: string;
}

/** Config dinámico por proyecto */
export interface UIConfig {
  readonly separacion_pct: number;
  readonly cuota_inicial_pct: number;
  readonly cuotas_default: number;
  readonly financiacion_pct: number;
  readonly dias_bloqueo: number;
  readonly vigencia_cotizacion: number;
  readonly agrupaciones_preestablecidas: boolean;
}

// ═══════════════════════════════════════════════════════════
// API Response types (mirror from types.ts — client-side)
//
// DEUDA TÉCNICA: Estas interfaces duplican los tipos del backend
// (src/engine/apps/quoter/inventory/types.ts). No importamos del
// engine porque es server-side code con imports de ICrmAdapter, etc.
//
// ACCIÓN FUTURA: Extraer un archivo shared de DTOs puros (sin deps
// del engine) que ambos lados importen. Esto elimina el riesgo de
// drift cuando se agregan campos al InventoryResponse.
//
// Por ahora: si cambias types.ts en el backend, refleja aquí.
// ═══════════════════════════════════════════════════════════

interface ApiProjectConfig {
  separacion_pct: number;
  cuota_inicial_pct: number;
  financiacion_pct: number;
  cuotas_default: number;
  dias_bloqueo: number;
  vigencia_cotizacion: number;
  agrupaciones_preestablecidas: boolean;
}

interface ApiSelectableUnit {
  hubspotId: string;
  sincoId: number;
  nombre: string;
  numero: string;
  piso: number;
  pos: string;
  tipologia: string;
  area: number;
  habs: number;
  banos: number;
  precio: number;
  estado: string;
  tipo_inmueble: string;
  esPrincipal: boolean;
}

interface ApiProject {
  hubspotId: string;
  sincoId: number;
  nombre: string;
  tipo: string;
  areaDesde: number;
  areaHasta: number;
  precioDesde: number;
  codigo: string;
  selectionMode: 'agrupacion' | 'unidad';
  selectableItems: ApiSelectableUnit[];
  config: ApiProjectConfig;
}

interface ApiMacro {
  hubspotId: string;
  sincoId: number;
  nombre: string;
  ciudad: string;
  zona: string;
  estado: string;
  tipo: string;
  proyectos: ApiProject[];
}

interface ApiWarnings {
  fallbackTipologia: number;
  fallbackHabs: number;
  fallbackBanos: number;
  fallbackPiso: number;
  unmappedAreas: number;
  totalUnidades: number;
  totalAgrupaciones: number;
  pagesConsumed: number;
  joinsFK: number;
  joinsNombre: number;
  excludedUnits: number;
  excludedGroupings: number;
}

interface ApiCanalOption {
  label: string;
  value: string;
}

interface ApiInventoryResponse {
  clientId: string;
  timestamp: string;
  macros: ApiMacro[];
  unidades: Record<string, ApiSelectableUnit[]>;
  parking: Record<string, ApiSelectableUnit[]>;
  storage: Record<string, ApiSelectableUnit[]>;
  agrupaciones: Record<string, unknown[]>;
  canalesAtribucion: ApiCanalOption[];
  warnings: ApiWarnings;
}

interface ApiErrorResponse {
  error: string;
  message: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════
// Hook return type
// ═══════════════════════════════════════════════════════════

export interface InventoryData {
  /** Macros para step 0 (selección de macroproyecto) */
  readonly macros: UIMacro[];
  /** Torres indexadas por macroSincoId para step 1 (selección de torre) */
  readonly torresByMacro: Readonly<Record<number, UITorre[]>>;
  /** Apartamentos (selectableItems) por torreId (sincoId proyecto) */
  getUnits: (torreId: number) => UIUnit[];
  /** Parqueaderos por torreId (sincoId proyecto) */
  getParking: (torreId: number) => UIUnit[];
  /** Depósitos por torreId (sincoId proyecto) */
  getStorage: (torreId: number) => UIUnit[];
  /** Config dinámico del proyecto seleccionado */
  getConfig: (torreId: number) => UIConfig;
  /** Canales de atribución dinámicos */
  canalesAtribucion: UICanal[];
  /** Warnings/diagnóstico del backend */
  warnings: ApiWarnings | null;
}

export interface UseInventoryDataResult {
  readonly data: InventoryData | null;
  readonly loading: boolean;
  readonly error: string | null;
  /** Re-fetch manual (ej: después de un sync) */
  readonly refetch: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════
// Default config — SOLO como fallback de emergencia.
// agrupaciones_preestablecidas=false por seguridad:
//   Si getConfig() no encuentra la torre, es un bug de wiring.
//   Con false el subtotal sumará complementarias = error visible.
//   Con true taparía un problema silenciosamente.
// ═══════════════════════════════════════════════════════════

const DEFAULT_CONFIG: UIConfig = {
  separacion_pct: 5,
  cuota_inicial_pct: 30,
  cuotas_default: 24,
  financiacion_pct: 70,
  dias_bloqueo: 4,
  vigencia_cotizacion: 7,
  agrupaciones_preestablecidas: false,
};

// ═══════════════════════════════════════════════════════════
// Transform helpers — API response → UI shapes
// ═══════════════════════════════════════════════════════════

function apiUnitToUI(u: ApiSelectableUnit): UIUnit {
  return {
    id: u.sincoId,
    hubspotId: u.hubspotId,
    sincoId: u.sincoId,
    nombre: u.nombre,
    piso: u.piso,
    numero: u.numero,
    pos: u.pos,
    tipologia: u.tipologia,
    area: u.area,
    habs: u.habs,
    banos: u.banos,
    precio: u.precio,
    estado: u.estado,
    tipo_inmueble: u.tipo_inmueble,
    esPrincipal: u.esPrincipal,
  };
}

function transformResponse(res: ApiInventoryResponse): InventoryData {
  // ── Macros ──
  const macros: UIMacro[] = res.macros.map((m) => ({
    id: m.sincoId,
    nombre: m.nombre,
    ciudad: m.ciudad,
    zona: m.zona,
    estado: m.estado,
    tipo: m.tipo,
  }));

  // ── Torres by macro + units/parking/storage/config by torre ──
  const torresByMacro: Record<number, UITorre[]> = {};
  const unitsByTorre: Record<number, UIUnit[]> = {};
  const parkingByTorre: Record<number, UIUnit[]> = {};
  const storageByTorre: Record<number, UIUnit[]> = {};
  const configByTorre: Record<number, UIConfig> = {};

  for (const m of res.macros) {
    const torres: UITorre[] = [];

    for (const p of m.proyectos) {
      const torreId = p.sincoId;

      // Torre shape
      torres.push({
        id: torreId,
        nombre: p.nombre,
        tipo: p.tipo,
        areaDesde: p.areaDesde,
        areaHasta: p.areaHasta,
        codigo: p.codigo,
        precioDesde: p.precioDesde,
      });

      // selectableItems → units (APTs del cotizador)
      // Estos son los items pre-resueltos por el backend.
      // En modo agrupacion: precio = valor_total_neto de la agrupación.
      // En modo unidad: precio = precio_lista de la unidad.
      unitsByTorre[torreId] = p.selectableItems.map(apiUnitToUI);

      // Parking y storage del dict top-level del response
      // La key en el JSON es string (por serialización JSON de Record<number, ...>)
      const pKey = String(torreId);
      parkingByTorre[torreId] = (res.parking[pKey] ?? []).map(apiUnitToUI);
      storageByTorre[torreId] = (res.storage[pKey] ?? []).map(apiUnitToUI);

      // Config
      configByTorre[torreId] = {
        separacion_pct: p.config.separacion_pct,
        cuota_inicial_pct: p.config.cuota_inicial_pct,
        cuotas_default: p.config.cuotas_default,
        financiacion_pct: p.config.financiacion_pct,
        dias_bloqueo: p.config.dias_bloqueo,
        vigencia_cotizacion: p.config.vigencia_cotizacion,
        agrupaciones_preestablecidas: p.config.agrupaciones_preestablecidas,
      };
    }

    torresByMacro[m.sincoId] = torres;
  }

  // ── Canales ──
  const canalesAtribucion: UICanal[] = res.canalesAtribucion.map((c) => ({
    label: c.label,
    value: c.value,
  }));

  return {
    macros,
    torresByMacro,
    /**
     * Getters devuelven [] para torres sin datos (caso válido).
     * Ejemplo: proyecto 360 (PSR) no tiene unidades sincronizadas hoy.
     * El QuoterClient debe manejar torres con 0 items sin error.
     */
    getUnits: (torreId: number) => unitsByTorre[torreId] ?? [],
    getParking: (torreId: number) => parkingByTorre[torreId] ?? [],
    getStorage: (torreId: number) => storageByTorre[torreId] ?? [],
    getConfig: (torreId: number) => {
      const cfg = configByTorre[torreId];
      if (!cfg) {
        console.error(
          `[useInventoryData] getConfig(${torreId}): torre no encontrada en configByTorre. ` +
          `Usando DEFAULT_CONFIG (agrupaciones_preestablecidas=false). Esto es un bug de wiring.`,
        );
        return DEFAULT_CONFIG;
      }
      return cfg;
    },
    canalesAtribucion,
    warnings: res.warnings,
  };
}

// ═══════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════

export function useInventoryData(clientId: string = 'jimenez_demo'): UseInventoryDataResult {
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track mount state to avoid setting state on unmounted component
  const mountedRef = useRef(true);
  // Track fetch count to ignore stale responses
  const fetchCountRef = useRef(0);

  const fetchInventory = useCallback(async () => {
    const thisFetch = ++fetchCountRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/engine/inventory?clientId=${encodeURIComponent(clientId)}`,
        { cache: 'no-store' },
      );

      // Ignore stale responses
      if (thisFetch !== fetchCountRef.current || !mountedRef.current) return;

      if (!res.ok) {
        let errMsg = `Error ${res.status}`;
        try {
          const errBody: ApiErrorResponse = await res.json();
          errMsg = `${errBody.error}: ${errBody.message}`;
        } catch {
          // If we can't parse error body, use status text
          errMsg = `Error ${res.status}: ${res.statusText}`;
        }
        setError(errMsg);
        setLoading(false);
        return;
      }

      const body: ApiInventoryResponse = await res.json();

      if (thisFetch !== fetchCountRef.current || !mountedRef.current) return;

      const transformed = transformResponse(body);
      setData(transformed);
      setLoading(false);
    } catch (err) {
      if (thisFetch !== fetchCountRef.current || !mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Error desconocido al cargar inventario';
      setError(msg);
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchInventory();
    return () => { mountedRef.current = false; };
  }, [fetchInventory]);

  return { data, loading, error, refetch: fetchInventory };
}
