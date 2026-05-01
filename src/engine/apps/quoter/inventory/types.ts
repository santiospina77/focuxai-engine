/**
 * FocuxAI Engine™ — Inventory DTO Types
 *
 * FROZEN CONTRACT: These interfaces define the exact shape of
 * GET /api/engine/inventory response. All helpers, mappers,
 * and frontend hooks must conform to these types.
 *
 * Source of truth: JSON v17 + Spec v2 (abril 19, 2026)
 */

// ═══════════════════════════════════════════════════════════
// Response envelope
// ═══════════════════════════════════════════════════════════

export interface InventoryResponse {
  readonly clientId: string;
  readonly timestamp: string; // ISO 8601
  readonly macros: readonly MacroDto[];
  /** Apartamentos indexados por sincoId del proyecto */
  readonly unidades: Readonly<Record<number, readonly SelectableUnit[]>>;
  /** Parqueaderos indexados por sincoId del proyecto */
  readonly parking: Readonly<Record<number, readonly SelectableUnit[]>>;
  /** Depósitos indexados por sincoId del proyecto */
  readonly storage: Readonly<Record<number, readonly SelectableUnit[]>>;
  /** Agrupaciones indexadas por sincoId del proyecto */
  readonly agrupaciones: Readonly<Record<number, readonly GroupingRecord[]>>;
  /** Canales de atribución dinámicos de HubSpot */
  readonly canalesAtribucion: readonly CanalOption[];
  /**
   * Unidades y agrupaciones excluidas dinámicamente durante el mapping.
   * Motivos: área sin regla de tipología, tipo no reconocido, datos inválidos.
   * Diferente de excludedUnits en overlay (cuarentena estática por config).
   */
  readonly quarantinedItems: readonly QuarantinedInventoryItem[];
  /** Counters de fallbacks y diagnóstico */
  readonly warnings: WarningsDto;
}

export interface InventoryErrorResponse {
  readonly error: string;
  readonly message: string;
  readonly timestamp: string;
}

// ═══════════════════════════════════════════════════════════
// Quarantine — Items excluidos dinámicamente durante mapping
// ═══════════════════════════════════════════════════════════

export type QuarantineEntityType = 'unit' | 'grouping';

export type QuarantineCode =
  | 'UNMAPPED_AREA'
  | 'INVALID_TYPE'
  | 'FALLBACK_ERROR'
  | 'INVALID_VALUE'
  | 'MISSING_FIELD';

/**
 * Item excluido dinámicamente durante el mapping de inventario.
 * Diferente de ExcludedUnit (cuarentena estática por config en overlay).
 */
export interface QuarantinedInventoryItem {
  readonly entityType: QuarantineEntityType;
  readonly sincoId: number;
  readonly projectId: number;
  readonly nombre: string;
  readonly code: QuarantineCode;
  readonly reason: string;
  readonly area?: number;
  readonly source: 'typology_resolution' | 'inventory_validation' | 'grouping_validation';
}

// ═══════════════════════════════════════════════════════════
// Macro (Macroproyecto)
// ═══════════════════════════════════════════════════════════

export interface MacroDto {
  readonly hubspotId: string;
  readonly sincoId: number;
  readonly nombre: string;
  readonly ciudad: string;
  /** Viene explícita del Ops JSON. NO se parsea de ciudad_fx. "" si no existe. */
  readonly zona: string;
  readonly estado: string;
  readonly tipo: string;
  readonly proyectos: readonly ProjectDto[];
}

// ═══════════════════════════════════════════════════════════
// Proyecto (Torre / Etapa)
// ═══════════════════════════════════════════════════════════

export interface ProjectDto {
  readonly hubspotId: string;
  readonly sincoId: number;
  readonly nombre: string;
  /** Viene explícito del Ops JSON. NO se infiere del macro ni del nombre. "" si no existe. */
  readonly tipo: string;
  /** CALCULADO: min area_construida_fx de TODOS los apartamentos del proyecto */
  readonly areaDesde: number;
  /** CALCULADO: max area_construida_fx de TODOS los apartamentos del proyecto */
  readonly areaHasta: number;
  /** CALCULADO: min precio de selectableItems DISPONIBLES */
  readonly precioDesde: number;
  /** OBLIGATORIO del Ops JSON. Se usa en COT number. Si no existe → fail hard del proyecto. */
  readonly codigo: string;
  /** Determina si la lista seleccionable viene de agrupaciones o de unidades */
  readonly selectionMode: 'agrupacion' | 'unidad';
  /**
   * Lista seleccionable PRE-RESUELTA para el frontend.
   *
   * Cuando selectionMode='agrupacion': items vienen de agrupaciones,
   * enriquecidos con datos de la unidad principal via JOIN.
   * Precio = valor_total_neto_fx de la agrupación.
   *
   * Cuando selectionMode='unidad': items vienen de unidades directamente.
   * Precio = precio_lista_fx de la unidad.
   *
   * El frontend SIEMPRE usa este array para la lista de selección.
   * NUNCA decide por su cuenta si leer de unidades o agrupaciones.
   */
  readonly selectableItems: readonly SelectableUnit[];
  readonly config: ProjectConfig;
}

export interface ProjectConfig {
  /** PORCENTAJE (ej: 5 = 5%). Fuente: Ops JSON pctSep. NUNCA de valor_separacion_fx (monto COP). */
  readonly separacion_pct: number;
  /** PORCENTAJE. Fuente: Ops JSON pctCI. */
  readonly cuota_inicial_pct: number;
  /** PORCENTAJE. Fuente: porcentaje_financiacion_fx de HubSpot. */
  readonly financiacion_pct: number;
  /** Cantidad. Fuente: numero_cuotas_fx de HubSpot o Ops JSON. */
  readonly cuotas_default: number;
  /** Días. Fuente: dias_bloqueo_fx de HubSpot. */
  readonly dias_bloqueo: number;
  /** Días. Fuente: vigencia_cotizacion_fx de HubSpot. */
  readonly vigencia_cotizacion: number;
  /**
   * OBLIGATORIO — no tiene default.
   * Fuente: ProjectOverlay.agrupacionesPreestablecidas (config operativa, NO de HubSpot).
   * Si no viene → fail hard del proyecto.
   * Cambia la semántica del subtotal y la fuente seleccionable.
   */
  readonly agrupaciones_preestablecidas: boolean;
}

// ═══════════════════════════════════════════════════════════
// Unidad seleccionable (APT, PARQ, DEP)
// ═══════════════════════════════════════════════════════════

export interface SelectableUnit {
  readonly hubspotId: string;
  readonly sincoId: number;
  readonly nombre: string;
  /** Parseado de nombre_fx: APT-918 → "918" */
  readonly numero: string;
  /** Parseado de nombre o piso_fx. 918 → piso 9. 1302 → piso 13. */
  readonly piso: number;
  /** Últimos 2 dígitos del numero: "18" */
  readonly pos: string;
  /** Fallback: AREA_TIPOLOGIA[area] si HubSpot no lo tiene */
  readonly tipologia: string;
  /** area_construida_fx */
  readonly area: number;
  /** alcobas_fx con fallback AREA_HABS[area] */
  readonly habs: number;
  /** banos_fx con fallback AREA_BANOS[area] */
  readonly banos: number;
  /**
   * Cuando selectionMode='agrupacion': valor_total_neto_fx de la AGRUPACIÓN
   * Cuando selectionMode='unidad': precio_lista_fx de la UNIDAD
   */
  readonly precio: number;
  /** disponible / vendida / bloqueada / separada / cotizada */
  readonly estado: string;
  /** Normalizado: APT / PARQ / DEP */
  readonly tipo_inmueble: string;
  readonly esPrincipal: boolean;
}

// ═══════════════════════════════════════════════════════════
// Agrupación
// ═══════════════════════════════════════════════════════════

export interface GroupingRecord {
  readonly hubspotId: string;
  readonly sincoId: number;
  readonly nombre: string;
  readonly estado: string;
  readonly valorSubtotal: number;
  readonly valorDescuento: number;
  readonly valorTotalNeto: number;
  /** FK a unidad principal. Para preestablecidas + disponible: FAIL HARD si no matchea. */
  readonly idUnidadPrincipal: number;
  readonly idProyecto: number;
}

// ═══════════════════════════════════════════════════════════
// Canales y Warnings
// ═══════════════════════════════════════════════════════════

export interface CanalOption {
  readonly label: string;
  readonly value: string;
}

export interface WarningsDto {
  readonly fallbackTipologia: number;
  readonly fallbackHabs: number;
  readonly fallbackBanos: number;
  readonly fallbackPiso: number;
  /**
   * CORRECCIÓN GPT #2: Contador de unidades cuya área NO está en las tablas de fallback.
   * Si unmappedAreas > 0 en un proyecto con agrupaciones_preestablecidas=true,
   * mapInventoryToDto DEBE hacer fail hard del proyecto.
   * El contrato lo fuerza — no depende de que el caller "se acuerde".
   */
  readonly unmappedAreas: number;
  readonly totalUnidades: number;
  readonly totalAgrupaciones: number;
  readonly pagesConsumed: number;
  readonly joinsFK: number;
  readonly joinsNombre: number;
  /** Unidades excluidas por cuarentena (dato maestro inválido en fuente) */
  readonly excludedUnits: number;
  /** Agrupaciones excluidas en cascada (unidad principal en cuarentena) */
  readonly excludedGroupings: number;
}

// ═══════════════════════════════════════════════════════════
// Ops JSON Config (fuente para zona, tipo, codigo, pctSep, pctCI)
// ═══════════════════════════════════════════════════════════

/**
 * Client Overlay Config — Metadata/config que NO viene de HubSpot.
 *
 * DECISIÓN ARQUITECTÓNICA (abril 19, 2026):
 *   - La estructura canónica del inventario es HubSpot (macros, proyectos, joins, conteos).
 *   - Ops JSON NO es fuente estructural. Es solo overlay de metadata/config.
 *   - El overlay se indexa por sincoId (macroSincoId / projectSincoId), NUNCA por nombre.
 *   - Si un campo obligatorio no existe en el overlay → fail hard del proyecto.
 *   - Para el piloto Jiménez demo, esta config se define explícitamente y tipada.
 *   - En producción, vendrá del Ops JSON transformado con IDs explícitos.
 */

export interface ClientOverlayConfig {
  readonly clientId: string;
  readonly macros: Readonly<Record<number, MacroOverlay>>;
  readonly projects: Readonly<Record<number, ProjectOverlay>>;
  /**
   * Unidades excluidas por dato maestro inválido (ej: area=0).
   * Indexadas por sincoId. Excluidas de selectableItems, logueadas con motivo.
   * NO se les infiere ni inventa data. Corrección debe hacerse en la fuente.
   */
  readonly excludedUnits?: readonly ExcludedUnit[];
}

export interface ExcludedUnit {
  readonly sincoId: number;
  readonly reason: string;
}

export interface MacroOverlay {
  /** Zona explícita. Opcional, default "". NO se parsea de ciudad_fx. */
  readonly zona?: string;
}

export interface ProjectOverlay {
  /**
   * OBLIGATORIO — código corto para COT number (ej: "PSS", "PSR", "MAR1").
   * Si no existe → fail hard del proyecto.
   * NO se genera del nombre. Configuración explícita.
   */
  readonly codigo: string;
  /** Porcentaje separación default para sliders (ej: 5 = 5%). Opcional, default 5. */
  readonly pctSep?: number;
  /** Porcentaje cuota inicial default para sliders (ej: 30 = 30%). Opcional, default 30. */
  readonly pctCI?: number;
  /** Tipo del proyecto para UI (ej: "Apartasuite", "Apartamento"). Opcional, default "". */
  readonly tipo?: string;
  /**
   * Config operativa del cotizador, NO dato de Sinco.
   * OBLIGATORIO — sin default. Determina selectionMode y semántica del subtotal.
   * Vive en el overlay porque es decisión operativa, no dato maestro.
   */
  readonly agrupacionesPreestablecidas: boolean;
}

// ═══════════════════════════════════════════════════════════
// Normalización de tipo de unidad
// ═══════════════════════════════════════════════════════════

/**
 * Tabla congelada para clasificar tipo_unidad_fx / idTipoUnidad de Sinco
 * en las 3 categorías del cotizador.
 *
 * REGLA: si no matchea con ninguna entrada → FAIL HARD del registro.
 */
export type NormalizedUnitType = 'APT' | 'PARQ' | 'DEP';

export const UNIT_TYPE_NORMALIZATION: ReadonlyMap<string, NormalizedUnitType> = new Map([
  // Por texto (tipo_unidad_fx de HubSpot, case-insensitive match)
  ['apartamento', 'APT'],
  ['apto', 'APT'],
  ['apartment', 'APT'],
  ['parqueadero', 'PARQ'],
  ['parking', 'PARQ'],
  ['deposito', 'DEP'],
  ['depósito', 'DEP'],
  ['deposito', 'DEP'],
  ['storage', 'DEP'],
  ['útil', 'DEP'],
  ['util', 'DEP'],
]);

export const UNIT_TYPE_BY_SINCO_ID: ReadonlyMap<number, NormalizedUnitType> = new Map([
  // Por idTipoUnidad de Sinco (tipo_unidad_sinco_fx)
  [2, 'APT'],
  [28, 'PARQ'],
  [3, 'DEP'],
]);
