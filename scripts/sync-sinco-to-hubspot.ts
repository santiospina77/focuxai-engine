#!/usr/bin/env node
/**
 * DATA-1 Sync v2: Discovery JSON → HubSpot Custom Objects (Full 4-object sync)
 *
 * Consume el JSON generado por discover-sinco-projects.ts y escribe
 * los registros a HubSpot Custom Objects (macroproyecto, proyecto,
 * unidad, agrupacion) + crea las 4 asociaciones jerárquicas.
 *
 * REGLA: Este script NUNCA llama a Sinco. Solo lee el JSON de discovery.
 *
 * Uso:
 *   # Dry-run (por defecto) — solo muestra qué haría
 *   node --env-file=.env.local --import tsx scripts/sync-sinco-to-hubspot.ts --portal=demo
 *
 *   # Aplicar cambios
 *   node --env-file=.env.local --import tsx scripts/sync-sinco-to-hubspot.ts --portal=demo --apply
 *
 *   # Con archivo específico
 *   node --env-file=.env.local --import tsx scripts/sync-sinco-to-hubspot.ts --portal=demo --file=scripts/output/sinco-discovery-jimenez_demo-2026-05-12.json
 *
 * Flags:
 *   --portal=demo       Apunta a portal DEMO 51256354 (obligatorio)
 *   --portal=prod       Apunta a portal PROD 51059324 (bloqueado por ahora)
 *   --apply             Ejecuta escritura real. Sin este flag = dry-run
 *   --file=<path>       Usa un archivo de discovery específico
 *   --skip-associations No crea asociaciones (útil para debug)
 *   --skip-phase0       Salta validación de schema HubSpot (solo para debug)
 *   --only-macros=58,54 Solo sincroniza macros específicos (por sincoId)
 *
 * Output:
 *   scripts/output/sync-audit-<portal>-<timestamp>.json
 *
 * Fases:
 *   Phase 0: Validar schema HubSpot (props existen)
 *   Fase 1: Macroproyectos upsert
 *   Fase 2: Proyectos upsert (torres)
 *   Fase 3: Unidades upsert
 *   Fase 4: Agrupaciones upsert
 *   Fase 5: Asociaciones (macro→proy, proy→unidad, proy→agrupacion, agrupacion→unidad)
 *
 * FocuxAI Engine™ — Focux Digital Group S.A.S.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { z } from 'zod';

import { HubSpotAdapter } from '@/engine/connectors/crm/hubspot/HubSpotAdapter';
import type { HubSpotCustomObjectTypeIds } from '@/engine/connectors/crm/hubspot/types';
import type {
  CrmRecordInput,
  CrmRecordUpdate,
  CrmAssociation,
  CrmObjectType,
} from '@/engine/interfaces/ICrmAdapter';
import { ConsoleLogger } from '@/engine/core/logging/Logger';

// ════════════════════════════════════════════════════════════════
// Portal configs
// ════════════════════════════════════════════════════════════════

interface PortalConfig {
  name: string;
  portalId: string;
  tokenEnvVar: string;
  objectTypeIds: HubSpotCustomObjectTypeIds;
  blocked: boolean;
}

const PORTALS: Record<string, PortalConfig> = {
  demo: {
    name: 'Jiménez DEMO (Focux)',
    portalId: '51256354',
    tokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
    objectTypeIds: {
      macroproyecto: '2-60986238',
      proyecto: '2-60987399',
      unidad: '2-60987403',
      agrupacion: '2-60987404',
    },
    blocked: false,
  },
  prod: {
    name: 'Jiménez PRODUCCIÓN',
    portalId: '51059324',
    tokenEnvVar: 'HUBSPOT_JIMENEZ_PROD_PRIVATE_APP_TOKEN',
    objectTypeIds: {
      macroproyecto: '2-61560827',
      proyecto: '2-61560828',
      unidad: '2-61560829',
      agrupacion: '2-61560831',
    },
    blocked: true, // NO usar todavía
  },
};

// ════════════════════════════════════════════════════════════════
// CLI args
// ════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const portalKey = args.find(a => a.startsWith('--portal='))?.split('=')[1];
const applyMode = args.includes('--apply');
const skipAssociations = args.includes('--skip-associations');
const skipPhase0 = args.includes('--skip-phase0');
const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1];
const onlyMacrosArg = args.find(a => a.startsWith('--only-macros='))?.split('=')[1];
const onlyMacros = onlyMacrosArg ? onlyMacrosArg.split(',').map(Number) : null;

if (!portalKey || !PORTALS[portalKey]) {
  console.error('❌ --portal=demo o --portal=prod es obligatorio');
  console.error('   Ejemplo: node --env-file=.env.local --import tsx scripts/sync-sinco-to-hubspot.ts --portal=demo');
  process.exit(1);
}

const portal = PORTALS[portalKey]!;

if (portal.blocked) {
  console.error(`❌ Portal "${portal.name}" está BLOQUEADO. No se permite escribir todavía.`);
  process.exit(1);
}

// ════════════════════════════════════════════════════════════════
// Property maps — EXACTOS de InventorySync.ts PROPS constant
// Fuente: src/engine/core/sync/InventorySync.ts líneas 67-144
//
// discovery field → HubSpot property name
// critical = abort if missing en HubSpot
// ════════════════════════════════════════════════════════════════

interface PropMapping {
  discoveryField: string;
  hubspotProp: string;
  critical: boolean;
}

const MACRO_PROPS: PropMapping[] = [
  { discoveryField: 'idSinco', hubspotProp: 'id_sinco_fx', critical: true },
  { discoveryField: 'nombre', hubspotProp: 'nombre_fx', critical: true },
  { discoveryField: 'estado', hubspotProp: 'estado_fx', critical: false },
];

const PROYECTO_PROPS: PropMapping[] = [
  { discoveryField: 'idSinco', hubspotProp: 'id_sinco_fx', critical: true },
  { discoveryField: 'nombre', hubspotProp: 'nombre_fx', critical: true },
  { discoveryField: 'idMacroSinco', hubspotProp: 'id_macro_sinco_fx', critical: false },
  { discoveryField: 'estado', hubspotProp: 'estado_fx', critical: false },
  { discoveryField: 'estrato', hubspotProp: 'estrato_fx', critical: false },
  { discoveryField: 'valorSeparacion', hubspotProp: 'valor_separacion_fx', critical: false },
  { discoveryField: 'porcentajeFinanciacion', hubspotProp: 'porcentaje_financiacion_fx', critical: false },
  { discoveryField: 'fechaEntrega', hubspotProp: 'fecha_entrega_fx', critical: false },
  { discoveryField: 'numeroDiasReserva', hubspotProp: 'dias_bloqueo_fx', critical: false },
];

const UNIDAD_PROPS: PropMapping[] = [
  { discoveryField: 'idSinco', hubspotProp: 'id_sinco_fx', critical: true },
  { discoveryField: 'nombre', hubspotProp: 'nombre_fx', critical: true },
  { discoveryField: 'idProyectoSinco', hubspotProp: 'id_proyecto_sinco_fx', critical: true },
  { discoveryField: 'tipoUnidadSinco', hubspotProp: 'tipo_unidad_sinco_fx', critical: false },
  { discoveryField: 'tipoUnidad', hubspotProp: 'tipo_unidad_fx', critical: false },
  { discoveryField: 'clasificacion', hubspotProp: 'clasificacion_fx', critical: false },
  { discoveryField: 'esPrincipal', hubspotProp: 'es_principal_fx', critical: false },
  { discoveryField: 'estado', hubspotProp: 'estado_fx', critical: false },
  { discoveryField: 'precioLista', hubspotProp: 'precio_lista_fx', critical: false },
  { discoveryField: 'areaConstruida', hubspotProp: 'area_construida_fx', critical: false },
  { discoveryField: 'areaPrivada', hubspotProp: 'area_privada_fx', critical: false },
  { discoveryField: 'areaTotal', hubspotProp: 'area_total_fx', critical: false },
  { discoveryField: 'piso', hubspotProp: 'piso_fx', critical: false },
  { discoveryField: 'alcobas', hubspotProp: 'alcobas_fx', critical: false },
  { discoveryField: 'banos', hubspotProp: 'banos_fx', critical: false },
  { discoveryField: 'bloqueadoEnErp', hubspotProp: 'est_bloq_sinco_fx', critical: false },
  { discoveryField: 'tipoInmuebleId', hubspotProp: 'id_tipo_inmueble_sinco_fx', critical: false },
];

const AGRUPACION_PROPS: PropMapping[] = [
  { discoveryField: 'idSinco', hubspotProp: 'id_sinco_fx', critical: true },
  { discoveryField: 'nombre', hubspotProp: 'nombre_fx', critical: true },
  { discoveryField: 'idProyectoSinco', hubspotProp: 'id_proyecto_sinco_fx', critical: true },
  { discoveryField: 'estado', hubspotProp: 'estado_fx', critical: false },
  { discoveryField: 'valorSubtotal', hubspotProp: 'valor_subtotal_fx', critical: false },
  { discoveryField: 'valorDescuento', hubspotProp: 'valor_descuento_fx', critical: false },
  { discoveryField: 'valorDescuentoFinanciero', hubspotProp: 'valor_descuento_financiero_fx', critical: false },
  { discoveryField: 'valorTotalNeto', hubspotProp: 'valor_total_neto_fx', critical: false },
  { discoveryField: 'valorSeparacion', hubspotProp: 'valor_separacion_fx', critical: false },
  { discoveryField: 'idUnidadPrincipalSinco', hubspotProp: 'id_unidad_principal_sinco_fx', critical: false },
  { discoveryField: 'idCompradorSinco', hubspotProp: 'id_comprador_sinco_fx', critical: false },
  { discoveryField: 'idVendedorSinco', hubspotProp: 'id_vendedor_sinco_fx', critical: false },
  { discoveryField: 'tipoVentaCodigo', hubspotProp: 'tipo_venta_fx', critical: false },
  { discoveryField: 'fechaVenta', hubspotProp: 'fecha_venta_fx', critical: false },
  { discoveryField: 'observaciones', hubspotProp: 'observaciones_fx', critical: false },
  { discoveryField: 'numeroEncargo', hubspotProp: 'numero_encargo_fx', critical: false },
  { discoveryField: 'fechaSeparacion', hubspotProp: 'fecha_separacion_fx', critical: false },
  { discoveryField: 'fechaCreacionErp', hubspotProp: 'fecha_creacion_sinco_fx', critical: false },
  { discoveryField: 'idMedioPublicitario', hubspotProp: 'id_medio_publicitario_sinco_fx', critical: false },
  { discoveryField: 'ventaExterior', hubspotProp: 'venta_exterior_fx', critical: false },
  { discoveryField: 'valorAdicionales', hubspotProp: 'valor_adicionales_fx', critical: false },
  { discoveryField: 'valorExclusiones', hubspotProp: 'valor_exclusiones_fx', critical: false },
  { discoveryField: 'valorSobrecosto', hubspotProp: 'valor_sobrecosto_fx', critical: false },
  { discoveryField: 'compradorNumeroIdentificacion', hubspotProp: 'numero_identificacion_comprador_fx', critical: false },
];

// ════════════════════════════════════════════════════════════════
// Zod schemas — Validación del discovery JSON (v2 — full arrays)
// ════════════════════════════════════════════════════════════════

const TypologySchema = z.object({
  tipologia: z.string(),
  areaConstruida: z.number(),
  habs: z.number(),
  banos: z.number(),
  count: z.number(),
});

const ProjectSchema = z.object({
  sincoId: z.number().positive(),
  nombre: z.string().min(1),
  activo: z.boolean(),
  macroproyectoId: z.number().positive(),
  macroproyectoNombre: z.string(),
  totalAgrupaciones: z.number(),
  agrupacionesPorEstado: z.record(z.string(), z.number()),
  totalUnidades: z.number(),
  unidadesPorTipo: z.record(z.string(), z.number()),
  unidadesPorEstado: z.record(z.string(), z.number()),
  disponibles: z.number(),
  tipologiasUnicas: z.array(TypologySchema),
  precioMin: z.number(),
  precioMax: z.number(),
  areaMin: z.number(),
  areaMax: z.number(),
  camposFaltantes: z.array(z.string()),
  quoterReady: z.enum(['ready', 'needs_typology_rules', 'needs_review', 'blocked']),
  quoterReadyReason: z.string(),
  riesgos: z.array(z.string()),
  yaConfigurado: z.boolean(),
});

// ── New v2 schemas for individual records ──

const MacroRecordSchema = z.object({
  idSinco: z.number().positive(),
  nombre: z.string().min(1),
  estado: z.string().nullable(),
  activo: z.boolean(),
});

const ProyectoDetalleSchema = z.object({
  idSinco: z.number().positive(),
  idMacroSinco: z.number().positive(),
  nombre: z.string().min(1),
  estado: z.string().nullable(),
  activo: z.boolean(),
  esEntregada: z.boolean(),
  estrato: z.number().nullable(),
  valorSeparacion: z.number().nullable(),
  porcentajeFinanciacion: z.number().nullable(),
  fechaEntrega: z.string().nullable(),
  numeroDiasReserva: z.number().nullable(),
});

const UnidadRecordSchema = z.object({
  idSinco: z.number().positive(),
  idProyectoSinco: z.number().positive(),
  nombre: z.string().min(1),
  estado: z.string(),
  tipoUnidadSinco: z.number().nullable(),
  tipoUnidad: z.string(),
  esPrincipal: z.boolean(),
  precioLista: z.number(),
  areaConstruida: z.number().nullable(),
  areaPrivada: z.number().nullable(),
  areaTotal: z.number().nullable(),
  piso: z.number().nullable(),
  alcobas: z.number().nullable(),
  banos: z.number().nullable(),
  clasificacion: z.string().nullable(),
  bloqueadoEnErp: z.boolean().nullable(),
  tipoInmuebleId: z.number().nullable(),
});

const AgrupacionRecordSchema = z.object({
  idSinco: z.number().positive(),
  idProyectoSinco: z.number().positive(),
  nombre: z.string().min(1),
  estado: z.string(),
  valorSubtotal: z.number().nullable(),
  valorDescuento: z.number().nullable(),
  valorDescuentoFinanciero: z.number().nullable(),
  valorTotalNeto: z.number().nullable(),
  valorSeparacion: z.number().nullable(),
  idUnidadPrincipalSinco: z.number().nullable(),
  unidadesSincoIds: z.array(z.number()),
  idCompradorSinco: z.number().nullable(),
  idVendedorSinco: z.number().nullable(),
  tipoVentaCodigo: z.number().nullable(),
  fechaVenta: z.string().nullable(),
  observaciones: z.string().nullable(),
  numeroEncargo: z.string().nullable(),
  fechaSeparacion: z.string().nullable(),
  fechaCreacionErp: z.string().nullable(),
  idMedioPublicitario: z.number().nullable(),
  ventaExterior: z.boolean().nullable(),
  valorAdicionales: z.number().nullable(),
  valorExclusiones: z.number().nullable(),
  valorSobrecosto: z.number().nullable(),
  compradorNumeroIdentificacion: z.string().nullable(),
});

const DiscoverySchema = z.object({
  clientId: z.string(),
  generatedAt: z.string(),
  duration: z.string(),
  totalMacroproyectos: z.number(),
  totalProyectos: z.number(),
  totalAgrupaciones: z.number(),
  totalUnidades: z.number().optional(),
  totalUnidadesDisponibles: z.number().optional(),
  summary: z.object({
    ready: z.number(),
    needsTypologyRules: z.number(),
    needsReview: z.number(),
    blocked: z.number(),
  }),
  // ── v2: Individual records for sync ──
  macroproyectos: z.array(MacroRecordSchema),
  proyectosDetalle: z.array(ProyectoDetalleSchema),
  unidades: z.array(UnidadRecordSchema),
  agrupaciones: z.array(AgrupacionRecordSchema),
  warnings: z.array(z.string()).optional(),
  // ── Legacy stats (compatibilidad) ──
  proyectos: z.array(ProjectSchema),
  errors: z.array(z.string()),
});

type DiscoveryResult = z.infer<typeof DiscoverySchema>;

// ════════════════════════════════════════════════════════════════
// Torres entregadas — NO sincar como cotizables
// Fuente: reference_jimenez_inventory_full.md
// ════════════════════════════════════════════════════════════════

const TORRES_ENTREGADAS_SINCO_IDS = new Set([
  296,  // CORALINA SUITES TORRE 1
  313,  // CORALINA SUITES TORRE 2
  321,  // CORALINA CARIBE T 1
  329,  // CORALINA CARIBE T2
]);

// Torres "EN ENTREGAS" — sincar pero marcar
const TORRES_EN_ENTREGAS_SINCO_IDS = new Set([
  325,  // CORALINA DEL SOL T1
]);

// ════════════════════════════════════════════════════════════════
// Property helpers
// ════════════════════════════════════════════════════════════════

/**
 * clean() — replica exacta de InventorySync behavior:
 * - Remueve nulls, undefineds, empty strings, NaN
 * - Stringify todo
 * - Lowercase enums
 * - Dates → YYYY-MM-DD
 */
const ENUM_FIELDS = new Set(['estado_fx', 'clasificacion_fx', 'tipo_fx', 'tipo_venta_fx', 'tipo_unidad_fx']);
const DATE_FIELDS_PREFIX = 'fecha_';

function clean(props: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value))) {
      continue;
    }
    // Date fields
    if (key.startsWith(DATE_FIELDS_PREFIX) && typeof value === 'string' && value.includes('T')) {
      result[key] = value.slice(0, 10); // YYYY-MM-DD
      continue;
    }
    // Enum fields — lowercase
    if (ENUM_FIELDS.has(key) && typeof value === 'string') {
      result[key] = value.toLowerCase();
      continue;
    }
    // Booleans
    if (typeof value === 'boolean') {
      result[key] = value ? 'true' : 'false';
      continue;
    }
    result[key] = String(value);
  }
  return result;
}

/**
 * Builds HubSpot properties from a discovery record using a property map.
 * Only includes properties that exist in HubSpot (validated in Phase 0).
 */
function buildProps(
  record: Record<string, unknown>,
  propMap: PropMapping[],
  validatedProps: Set<string>,
): Record<string, string> {
  const raw: Record<string, unknown> = {};
  for (const mapping of propMap) {
    if (!validatedProps.has(mapping.hubspotProp)) continue; // Skip missing HubSpot props
    const value = record[mapping.discoveryField];
    if (value !== undefined) {
      raw[mapping.hubspotProp] = value;
    }
  }
  return clean(raw);
}

/**
 * Compare desired props vs existing. Returns true if any prop differs.
 */
function hasChanges(desired: Record<string, string>, existing: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(desired)) {
    if (key === 'id_sinco_fx') continue; // ID never changes
    if ((existing[key] ?? '') !== value) return true;
  }
  return false;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ════════════════════════════════════════════════════════════════
// Association Type IDs — REALES del portal demo 51256354
// Fuente: GET /crm/v4/associations/{from}/{to}/labels  (12-mayo-2026)
//
// CRITICAL: Todos son USER_DEFINED, NO HUBSPOT_DEFINED.
// El adapter.createAssociationsBatch hardcodea HUBSPOT_DEFINED → NO usar.
// Usamos fetch directo con los typeIds correctos.
// ════════════════════════════════════════════════════════════════

interface AssociationTypeConfig {
  fromTypeId: string;
  toTypeId: string;
  typeId: number;
  category: 'USER_DEFINED';
  label: string;
}

const ASSOCIATION_TYPES: Record<string, AssociationTypeConfig> = {
  macroProyecto: {
    fromTypeId: '2-60986238', // macroproyecto
    toTypeId: '2-60987399',   // proyecto
    typeId: 177,
    category: 'USER_DEFINED',
    label: 'Macroproyecto a Proyecto',
  },
  proyectoUnidad: {
    fromTypeId: '2-60987399', // proyecto
    toTypeId: '2-60987403',   // unidad
    typeId: 181,
    category: 'USER_DEFINED',
    label: 'Proyecto a Unidad',
  },
  proyectoAgrupacion: {
    fromTypeId: '2-60987399', // proyecto
    toTypeId: '2-60987404',   // agrupacion
    typeId: 185,
    category: 'USER_DEFINED',
    label: 'Proyecto a Agrupación',
  },
  agrupacionUnidad: {
    fromTypeId: '2-60987404', // agrupacion
    toTypeId: '2-60987403',   // unidad
    typeId: 189,
    category: 'USER_DEFINED',
    label: 'Agrupación a Unidad',
  },
};

/**
 * Batch create associations via HubSpot v4 API directly.
 * Bypasses adapter because adapter hardcodes HUBSPOT_DEFINED category.
 * Our custom object associations are USER_DEFINED.
 */
async function batchCreateAssociationsDirect(
  token: string,
  config: AssociationTypeConfig,
  pairs: Array<{ fromId: string; toId: string }>,
): Promise<{ successful: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < pairs.length; i += 100) {
    const chunk = pairs.slice(i, i + 100);
    const body = {
      inputs: chunk.map(p => ({
        from: { id: p.fromId },
        to: { id: p.toId },
        types: [{ associationCategory: config.category, associationTypeId: config.typeId }],
      })),
    };

    const resp = await fetch(
      `https://api.hubapi.com/crm/v4/associations/${config.fromTypeId}/${config.toTypeId}/batch/create`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (resp.status === 200 || resp.status === 201) {
      successful += chunk.length;
    } else {
      const data = await resp.json().catch(() => ({}));
      failed += chunk.length;
      errors.push(`Batch ${Math.floor(i / 100) + 1}: HTTP ${resp.status} — ${JSON.stringify(data).slice(0, 300)}`);
    }

    console.log(`      ... chunk ${Math.floor(i / 100) + 1}/${Math.ceil(pairs.length / 100)}`);
    await sleep(150); // Rate limit buffer
  }

  return { successful, failed, errors };
}

// ════════════════════════════════════════════════════════════════
// Audit types
// ════════════════════════════════════════════════════════════════

interface AuditRecord {
  objectType: string;
  sincoId: number;
  nombre: string;
  action: 'create' | 'update' | 'skip' | 'skip_entregado' | 'skip_filtered' | 'quarantine';
  reason?: string;
  hubspotId?: string;
  properties?: Record<string, string>;
}

interface AuditAssociation {
  fromType: string;
  fromSincoId: number;
  toType: string;
  toSincoId: number;
  action: 'create' | 'skip_exists' | 'error';
  reason?: string;
}

interface ObjectCounts {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  skippedEntregado: number;
  failed: number;
}

interface AssociationCounts {
  macroProyecto: { created: number; skipped: number; failed: number };
  proyectoUnidad: { created: number; skipped: number; failed: number };
  proyectoAgrupacion: { created: number; skipped: number; failed: number };
  agrupacionUnidad: { created: number; skipped: number; failed: number };
}

interface SchemaValidation {
  objectType: string;
  missingCritical: string[];
  missingOptional: string[];
  validated: string[];
}

interface SyncAudit {
  portal: string;
  portalId: string;
  mode: 'dry-run' | 'apply';
  startedAt: string;
  completedAt: string;
  duration: string;
  discoveryFile: string;
  schemaValidation: SchemaValidation[];
  counts: {
    macroproyectos: ObjectCounts;
    proyectos: ObjectCounts;
    unidades: ObjectCounts;
    agrupaciones: ObjectCounts;
    associations: AssociationCounts;
  };
  records: AuditRecord[];
  associations: AuditAssociation[];
  errors: string[];
  warnings: string[];
}

function newObjectCounts(): ObjectCounts {
  return { created: 0, updated: 0, unchanged: 0, skipped: 0, skippedEntregado: 0, failed: 0 };
}

function newAssocCounts() {
  return { created: 0, skipped: 0, failed: 0 };
}

// ════════════════════════════════════════════════════════════════
// Phase 0 — HubSpot Schema Validation
// Calls HubSpot API directly to verify properties exist
// ════════════════════════════════════════════════════════════════

async function getHubSpotProperties(objectTypeId: string, token: string): Promise<Set<string>> {
  const resp = await fetch(`https://api.hubapi.com/crm/v3/properties/${objectTypeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    throw new Error(`Failed to get properties for ${objectTypeId}: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as { results: Array<{ name: string }> };
  return new Set(data.results.map(p => p.name));
}

async function validateSchema(
  objectTypeName: string,
  objectTypeId: string,
  propMap: PropMapping[],
  token: string,
): Promise<{ validation: SchemaValidation; validatedProps: Set<string>; abort: boolean }> {
  console.log(`   Validando ${objectTypeName} (${objectTypeId})...`);

  const existingProps = await getHubSpotProperties(objectTypeId, token);
  const missingCritical: string[] = [];
  const missingOptional: string[] = [];
  const validated: string[] = [];

  for (const mapping of propMap) {
    if (existingProps.has(mapping.hubspotProp)) {
      validated.push(mapping.hubspotProp);
    } else if (mapping.critical) {
      missingCritical.push(mapping.hubspotProp);
    } else {
      missingOptional.push(mapping.hubspotProp);
    }
  }

  const abort = missingCritical.length > 0;

  if (missingCritical.length > 0) {
    console.error(`   ❌ CRITICAL props faltantes en ${objectTypeName}: ${missingCritical.join(', ')}`);
  }
  if (missingOptional.length > 0) {
    console.warn(`   ⚠️  Optional props faltantes en ${objectTypeName}: ${missingOptional.join(', ')}`);
  }
  if (missingCritical.length === 0 && missingOptional.length === 0) {
    console.log(`   ✅ ${objectTypeName}: ${validated.length} props confirmadas`);
  } else if (!abort) {
    console.log(`   ✅ ${objectTypeName}: ${validated.length} props confirmadas, ${missingOptional.length} opcionales omitidas`);
  }

  return {
    validation: { objectType: objectTypeName, missingCritical, missingOptional, validated },
    validatedProps: new Set(validated),
    abort,
  };
}

// ════════════════════════════════════════════════════════════════
// Prefetch — bulk load existing records for a type
// Uses paginated search instead of individual lookups
// ════════════════════════════════════════════════════════════════

interface ExistingRecord {
  id: string;
  properties: Record<string, string>;
}

async function prefetchExisting(
  adapter: HubSpotAdapter,
  objectType: CrmObjectType,
  propsToFetch: string[],
): Promise<Map<number, ExistingRecord>> {
  const map = new Map<number, ExistingRecord>();
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    const result = await adapter.searchRecords({
      objectType,
      filters: [{ property: 'id_sinco_fx', operator: 'gte', value: '1' }],
      properties: ['id_sinco_fx', ...propsToFetch],
      limit: 100,
      after: cursor,
    });

    if (result.isErr()) {
      console.warn(`   ⚠️  Error en prefetch de ${objectType}: ${result.error.message}`);
      break;
    }

    for (const record of result.value.records) {
      const sincoId = parseInt(record.properties.id_sinco_fx as string);
      if (!isNaN(sincoId)) {
        map.set(sincoId, {
          id: record.id,
          properties: record.properties as Record<string, string>,
        });
      }
    }

    cursor = result.value.nextCursor;
    pageCount++;

    // Rate limit: search API = 4 req/s
    if (cursor) await sleep(260);

  } while (cursor && pageCount < 120); // Safety: max 12,000 records

  return map;
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════

async function main() {
  const startTime = Date.now();
  const MODE = applyMode ? 'apply' : 'dry-run';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FocuxAI Engine™ — DATA-1 Sync v2: Discovery → HubSpot');
  console.log(`  Portal:  ${portal.name} (${portal.portalId})`);
  console.log(`  Mode:    ${MODE === 'dry-run' ? '🔍 DRY-RUN (no escribe)' : '⚡ APPLY (escritura real)'}`);
  if (onlyMacros) console.log(`  Filter:  Solo macros ${onlyMacros.join(', ')}`);
  if (skipAssociations) console.log(`  Skip:    Asociaciones deshabilitadas`);
  if (skipPhase0) console.log(`  Skip:    Phase 0 schema validation deshabilitada`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Load discovery JSON ──
  const discoveryPath = resolveDiscoveryFile();
  console.log(`📂 Cargando discovery: ${discoveryPath}`);
  const rawJson = readFileSync(discoveryPath, 'utf-8');
  const parsed = JSON.parse(rawJson);

  // ── 2. Validate with Zod ──
  console.log('🔍 Validando JSON con Zod...');
  const validation = DiscoverySchema.safeParse(parsed);
  if (!validation.success) {
    console.error('❌ Discovery JSON no pasa validación Zod:');
    for (const issue of validation.error.issues) {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  const discovery = validation.data;
  console.log(`   ✅ Válido. Macros: ${discovery.macroproyectos.length}, Proyectos: ${discovery.proyectosDetalle.length}, Unidades: ${discovery.unidades.length}, Agrupaciones: ${discovery.agrupaciones.length}`);
  console.log(`   Generado: ${discovery.generatedAt}\n`);

  // ── 3. Check staleness ──
  const ageHours = (Date.now() - new Date(discovery.generatedAt).getTime()) / 3600000;
  if (ageHours > 24) {
    console.warn(`⚠️  Discovery tiene ${ageHours.toFixed(0)}h de antigüedad. Considera re-correr el discovery.\n`);
  }

  // ── 4. Build filter sets ──
  // Entregada projects → exclude their unidades and agrupaciones
  const entregadaProjectIds = new Set(
    discovery.proyectosDetalle.filter(p => p.esEntregada).map(p => p.idSinco)
  );
  console.log(`🚫 Torres entregadas: ${[...entregadaProjectIds].join(', ')} (${entregadaProjectIds.size} total)\n`);

  // Macro filter for --only-macros cascade
  const proyectoToMacro = new Map<number, number>();
  for (const p of discovery.proyectosDetalle) {
    proyectoToMacro.set(p.idSinco, p.idMacroSinco);
  }

  // Helper: should this record be synced?
  function shouldSyncProyecto(proyectoSincoId: number): boolean {
    if (entregadaProjectIds.has(proyectoSincoId)) return false;
    if (onlyMacros) {
      const macroId = proyectoToMacro.get(proyectoSincoId);
      if (macroId && !onlyMacros.includes(macroId)) return false;
    }
    return true;
  }

  function shouldSyncMacro(macroSincoId: number): boolean {
    if (onlyMacros && !onlyMacros.includes(macroSincoId)) return false;
    return true;
  }

  // ── 5. Init HubSpot ──
  const token = process.env[portal.tokenEnvVar];
  if (!token) {
    console.error(`❌ Env var ${portal.tokenEnvVar} no está configurada.`);
    process.exit(1);
  }

  // ════════════════════════════════════════════════════
  // PHASE 0: Schema Validation
  // ════════════════════════════════════════════════════

  const schemaResults: SchemaValidation[] = [];
  const validatedPropsMap = new Map<string, Set<string>>(); // objectType → validated props

  if (!skipPhase0) {
    console.log('━━━ PHASE 0: Validar schema HubSpot ━━━');

    const checks = [
      { name: 'macroproyecto', typeId: portal.objectTypeIds.macroproyecto, map: MACRO_PROPS },
      { name: 'proyecto', typeId: portal.objectTypeIds.proyecto, map: PROYECTO_PROPS },
      { name: 'unidad', typeId: portal.objectTypeIds.unidad, map: UNIDAD_PROPS },
      { name: 'agrupacion', typeId: portal.objectTypeIds.agrupacion, map: AGRUPACION_PROPS },
    ];

    let anyAbort = false;
    for (const check of checks) {
      const result = await validateSchema(check.name, check.typeId, check.map, token);
      schemaResults.push(result.validation);
      validatedPropsMap.set(check.name, result.validatedProps);
      if (result.abort) anyAbort = true;
      await sleep(200); // Rate limit
    }

    if (anyAbort) {
      console.error('\n❌ ABORTANDO: Faltan propiedades CRITICAL en HubSpot. Crea las propiedades faltantes antes de continuar.');
      process.exit(1);
    }

    console.log('   ✅ Schema validation passed\n');
  } else {
    // Skip phase 0 — assume all props exist
    validatedPropsMap.set('macroproyecto', new Set(MACRO_PROPS.map(p => p.hubspotProp)));
    validatedPropsMap.set('proyecto', new Set(PROYECTO_PROPS.map(p => p.hubspotProp)));
    validatedPropsMap.set('unidad', new Set(UNIDAD_PROPS.map(p => p.hubspotProp)));
    validatedPropsMap.set('agrupacion', new Set(AGRUPACION_PROPS.map(p => p.hubspotProp)));
  }

  // ── Init adapter ──
  const logger = new ConsoleLogger({ service: 'sync-v2' }, 'warn');
  const adapter = new HubSpotAdapter({
    clientId: 'jimenez_sync',
    privateAppToken: token,
    customObjectTypeIds: portal.objectTypeIds,
  }, logger);

  // ── Build audit ──
  const audit: SyncAudit = {
    portal: portalKey!,
    portalId: portal.portalId,
    mode: MODE,
    startedAt: new Date().toISOString(),
    completedAt: '',
    duration: '',
    discoveryFile: discoveryPath,
    schemaValidation: schemaResults,
    counts: {
      macroproyectos: newObjectCounts(),
      proyectos: newObjectCounts(),
      unidades: newObjectCounts(),
      agrupaciones: newObjectCounts(),
      associations: {
        macroProyecto: newAssocCounts(),
        proyectoUnidad: newAssocCounts(),
        proyectoAgrupacion: newAssocCounts(),
        agrupacionUnidad: newAssocCounts(),
      },
    },
    records: [],
    associations: [],
    errors: [],
    warnings: discovery.warnings ?? [],
  };

  // ════════════════════════════════════════════════════
  // PREFETCH: Cargar registros existentes por tipo
  // ════════════════════════════════════════════════════

  console.log('━━━ PREFETCH: Cargar registros existentes ━━━');

  const existingMacros = await prefetchExisting(
    adapter, 'macroproyecto',
    [...(validatedPropsMap.get('macroproyecto') ?? [])],
  );
  console.log(`   Macros existentes en HubSpot: ${existingMacros.size}`);

  const existingProyectos = await prefetchExisting(
    adapter, 'proyecto',
    [...(validatedPropsMap.get('proyecto') ?? [])],
  );
  console.log(`   Proyectos existentes en HubSpot: ${existingProyectos.size}`);

  const existingUnidades = await prefetchExisting(
    adapter, 'unidad',
    [...(validatedPropsMap.get('unidad') ?? [])],
  );
  console.log(`   Unidades existentes en HubSpot: ${existingUnidades.size}`);

  const existingAgrupaciones = await prefetchExisting(
    adapter, 'agrupacion',
    [...(validatedPropsMap.get('agrupacion') ?? [])],
  );
  console.log(`   Agrupaciones existentes en HubSpot: ${existingAgrupaciones.size}\n`);

  // ── HubSpot ID maps (sincoId → hubspotId) for associations ──
  const macroHubSpotIds = new Map<number, string>();
  const proyectoHubSpotIds = new Map<number, string>();
  const unidadHubSpotIds = new Map<number, string>();
  const agrupacionHubSpotIds = new Map<number, string>();

  // Seed from prefetch
  for (const [sincoId, rec] of existingMacros) macroHubSpotIds.set(sincoId, rec.id);
  for (const [sincoId, rec] of existingProyectos) proyectoHubSpotIds.set(sincoId, rec.id);
  for (const [sincoId, rec] of existingUnidades) unidadHubSpotIds.set(sincoId, rec.id);
  for (const [sincoId, rec] of existingAgrupaciones) agrupacionHubSpotIds.set(sincoId, rec.id);

  // ════════════════════════════════════════════════════
  // FASE 1: Macroproyectos
  // ════════════════════════════════════════════════════
  console.log('━━━ FASE 1: Macroproyectos ━━━');

  const macroCreateQueue: CrmRecordInput[] = [];
  const macroUpdateQueue: CrmRecordUpdate[] = [];
  const macroValidatedProps = validatedPropsMap.get('macroproyecto')!;

  for (const macro of discovery.macroproyectos) {
    if (!shouldSyncMacro(macro.idSinco)) {
      audit.counts.macroproyectos.skipped++;
      audit.records.push({ objectType: 'macroproyecto', sincoId: macro.idSinco, nombre: macro.nombre, action: 'skip_filtered', reason: '--only-macros filter' });
      continue;
    }

    const props = buildProps(macro as unknown as Record<string, unknown>, MACRO_PROPS, macroValidatedProps);
    const existing = existingMacros.get(macro.idSinco);

    if (existing) {
      macroHubSpotIds.set(macro.idSinco, existing.id);
      if (hasChanges(props, existing.properties)) {
        console.log(`   🔄 Macro ${macro.idSinco} (${macro.nombre}) — actualizar`);
        macroUpdateQueue.push({ id: existing.id, objectType: 'macroproyecto', properties: props });
        audit.counts.macroproyectos.updated++;
        audit.records.push({ objectType: 'macroproyecto', sincoId: macro.idSinco, nombre: macro.nombre, action: 'update', hubspotId: existing.id, properties: props });
      } else {
        console.log(`   ⏭️  Macro ${macro.idSinco} (${macro.nombre}) — sin cambios`);
        audit.counts.macroproyectos.unchanged++;
        audit.records.push({ objectType: 'macroproyecto', sincoId: macro.idSinco, nombre: macro.nombre, action: 'skip', hubspotId: existing.id, reason: 'Sin cambios' });
      }
    } else {
      console.log(`   ➕ Macro ${macro.idSinco} (${macro.nombre}) — crear`);
      macroCreateQueue.push({ objectType: 'macroproyecto', properties: props });
      audit.counts.macroproyectos.created++;
      audit.records.push({ objectType: 'macroproyecto', sincoId: macro.idSinco, nombre: macro.nombre, action: 'create', properties: props });
      if (MODE === 'dry-run') {
        macroHubSpotIds.set(macro.idSinco, `dry-run-macro-${macro.idSinco}`);
      }
    }
  }

  // Execute batch operations
  if (MODE === 'apply' && macroCreateQueue.length > 0) {
    console.log(`   📦 Batch create: ${macroCreateQueue.length} macros...`);
    const result = await adapter.createRecordsBatch(macroCreateQueue);
    if (result.isOk()) {
      for (const created of result.value.successful) {
        const sincoId = parseInt(created.properties.id_sinco_fx as string);
        if (!isNaN(sincoId)) macroHubSpotIds.set(sincoId, created.id);
      }
      if (result.value.failed.length > 0) {
        const failCount = result.value.failed.length;
        audit.counts.macroproyectos.failed += failCount;
        audit.counts.macroproyectos.created -= failCount;
        audit.errors.push(`Macro batch create: ${failCount} failed`);
      }
    } else {
      audit.errors.push(`Macro batch create error: ${result.error.message}`);
      audit.counts.macroproyectos.failed += macroCreateQueue.length;
      audit.counts.macroproyectos.created = 0;
    }
  }

  if (MODE === 'apply' && macroUpdateQueue.length > 0) {
    console.log(`   📦 Batch update: ${macroUpdateQueue.length} macros...`);
    const result = await adapter.updateRecordsBatch(macroUpdateQueue);
    if (result.isErr()) {
      audit.errors.push(`Macro batch update error: ${result.error.message}`);
    }
  }

  // ════════════════════════════════════════════════════
  // FASE 2: Proyectos (torres)
  // ════════════════════════════════════════════════════
  console.log('\n━━━ FASE 2: Proyectos ━━━');

  const proyCreateQueue: CrmRecordInput[] = [];
  const proyUpdateQueue: CrmRecordUpdate[] = [];
  const proyValidatedProps = validatedPropsMap.get('proyecto')!;

  for (const proy of discovery.proyectosDetalle) {
    if (proy.esEntregada) {
      console.log(`   🚫 Proyecto ${proy.idSinco} (${proy.nombre}) — ENTREGADO`);
      audit.counts.proyectos.skippedEntregado++;
      audit.records.push({ objectType: 'proyecto', sincoId: proy.idSinco, nombre: proy.nombre, action: 'skip_entregado', reason: 'Torre entregada' });
      continue;
    }

    if (!shouldSyncMacro(proy.idMacroSinco)) {
      audit.counts.proyectos.skipped++;
      audit.records.push({ objectType: 'proyecto', sincoId: proy.idSinco, nombre: proy.nombre, action: 'skip_filtered', reason: '--only-macros filter' });
      continue;
    }

    const props = buildProps(proy as unknown as Record<string, unknown>, PROYECTO_PROPS, proyValidatedProps);
    const existing = existingProyectos.get(proy.idSinco);

    if (existing) {
      proyectoHubSpotIds.set(proy.idSinco, existing.id);
      if (hasChanges(props, existing.properties)) {
        console.log(`   🔄 Proyecto ${proy.idSinco} (${proy.nombre}) — actualizar`);
        proyUpdateQueue.push({ id: existing.id, objectType: 'proyecto', properties: props });
        audit.counts.proyectos.updated++;
        audit.records.push({ objectType: 'proyecto', sincoId: proy.idSinco, nombre: proy.nombre, action: 'update', hubspotId: existing.id, properties: props });
      } else {
        console.log(`   ⏭️  Proyecto ${proy.idSinco} (${proy.nombre}) — sin cambios`);
        audit.counts.proyectos.unchanged++;
        audit.records.push({ objectType: 'proyecto', sincoId: proy.idSinco, nombre: proy.nombre, action: 'skip', hubspotId: existing.id, reason: 'Sin cambios' });
      }
    } else {
      console.log(`   ➕ Proyecto ${proy.idSinco} (${proy.nombre}) — crear`);
      proyCreateQueue.push({ objectType: 'proyecto', properties: props });
      audit.counts.proyectos.created++;
      audit.records.push({ objectType: 'proyecto', sincoId: proy.idSinco, nombre: proy.nombre, action: 'create', properties: props });
      if (MODE === 'dry-run') {
        proyectoHubSpotIds.set(proy.idSinco, `dry-run-proy-${proy.idSinco}`);
      }
    }
  }

  // Execute batch operations
  if (MODE === 'apply' && proyCreateQueue.length > 0) {
    console.log(`   📦 Batch create: ${proyCreateQueue.length} proyectos...`);
    const result = await adapter.createRecordsBatch(proyCreateQueue);
    if (result.isOk()) {
      for (const created of result.value.successful) {
        const sincoId = parseInt(created.properties.id_sinco_fx as string);
        if (!isNaN(sincoId)) proyectoHubSpotIds.set(sincoId, created.id);
      }
      if (result.value.failed.length > 0) {
        const failCount = result.value.failed.length;
        audit.counts.proyectos.failed += failCount;
        audit.counts.proyectos.created -= failCount;
        audit.errors.push(`Proyecto batch create: ${failCount} failed`);
      }
    } else {
      audit.errors.push(`Proyecto batch create error: ${result.error.message}`);
    }
  }

  if (MODE === 'apply' && proyUpdateQueue.length > 0) {
    console.log(`   📦 Batch update: ${proyUpdateQueue.length} proyectos...`);
    const result = await adapter.updateRecordsBatch(proyUpdateQueue);
    if (result.isErr()) {
      audit.errors.push(`Proyecto batch update error: ${result.error.message}`);
    }
  }

  // ════════════════════════════════════════════════════
  // FASE 3: Unidades
  // ════════════════════════════════════════════════════
  console.log('\n━━━ FASE 3: Unidades ━━━');

  const unidadCreateQueue: CrmRecordInput[] = [];
  const unidadUpdateQueue: CrmRecordUpdate[] = [];
  const unidadValidatedProps = validatedPropsMap.get('unidad')!;

  // Filter unidades: exclude entregadas + only-macros cascade
  const unidadesToSync = discovery.unidades.filter(u => shouldSyncProyecto(u.idProyectoSinco));
  const unidadesSkippedEntregado = discovery.unidades.filter(u => entregadaProjectIds.has(u.idProyectoSinco)).length;
  const unidadesSkippedFilter = discovery.unidades.length - unidadesToSync.length - unidadesSkippedEntregado;

  console.log(`   Total unidades: ${discovery.unidades.length}`);
  console.log(`   A sincronizar: ${unidadesToSync.length}`);
  if (unidadesSkippedEntregado > 0) console.log(`   Excluidas (entregadas): ${unidadesSkippedEntregado}`);
  if (unidadesSkippedFilter > 0) console.log(`   Excluidas (filtro macro): ${unidadesSkippedFilter}`);
  audit.counts.unidades.skippedEntregado = unidadesSkippedEntregado;
  audit.counts.unidades.skipped = unidadesSkippedFilter;

  for (const unidad of unidadesToSync) {
    const props = buildProps(unidad as unknown as Record<string, unknown>, UNIDAD_PROPS, unidadValidatedProps);
    const existing = existingUnidades.get(unidad.idSinco);

    if (existing) {
      unidadHubSpotIds.set(unidad.idSinco, existing.id);
      if (hasChanges(props, existing.properties)) {
        unidadUpdateQueue.push({ id: existing.id, objectType: 'unidad', properties: props });
        audit.counts.unidades.updated++;
      } else {
        audit.counts.unidades.unchanged++;
      }
    } else {
      unidadCreateQueue.push({ objectType: 'unidad', properties: props });
      audit.counts.unidades.created++;
      if (MODE === 'dry-run') {
        unidadHubSpotIds.set(unidad.idSinco, `dry-run-unidad-${unidad.idSinco}`);
      }
    }
  }

  console.log(`   Crear: ${unidadCreateQueue.length} | Actualizar: ${unidadUpdateQueue.length} | Sin cambios: ${audit.counts.unidades.unchanged}`);

  // Execute batch operations (chunks of 100)
  if (MODE === 'apply' && unidadCreateQueue.length > 0) {
    console.log(`   📦 Batch create: ${unidadCreateQueue.length} unidades en chunks de 100...`);
    for (let i = 0; i < unidadCreateQueue.length; i += 100) {
      const chunk = unidadCreateQueue.slice(i, i + 100);
      const result = await adapter.createRecordsBatch(chunk);
      if (result.isOk()) {
        for (const created of result.value.successful) {
          const sincoId = parseInt(created.properties.id_sinco_fx as string);
          if (!isNaN(sincoId)) unidadHubSpotIds.set(sincoId, created.id);
        }
        if (result.value.failed.length > 0) {
          audit.counts.unidades.failed += result.value.failed.length;
          audit.counts.unidades.created -= result.value.failed.length;
          audit.errors.push(`Unidad batch create chunk ${Math.floor(i / 100) + 1}: ${result.value.failed.length} failed`);
        }
      } else {
        audit.errors.push(`Unidad batch create chunk ${Math.floor(i / 100) + 1} error: ${result.error.message}`);
        audit.counts.unidades.failed += chunk.length;
        audit.counts.unidades.created -= chunk.length;
      }
      console.log(`   ... chunk ${Math.floor(i / 100) + 1}/${Math.ceil(unidadCreateQueue.length / 100)} done`);
      await sleep(300); // Rate limit buffer
    }
  }

  if (MODE === 'apply' && unidadUpdateQueue.length > 0) {
    console.log(`   📦 Batch update: ${unidadUpdateQueue.length} unidades en chunks de 100...`);
    for (let i = 0; i < unidadUpdateQueue.length; i += 100) {
      const chunk = unidadUpdateQueue.slice(i, i + 100);
      const result = await adapter.updateRecordsBatch(chunk);
      if (result.isErr()) {
        audit.errors.push(`Unidad batch update chunk ${Math.floor(i / 100) + 1} error: ${result.error.message}`);
      }
      await sleep(150);
    }
  }

  // ════════════════════════════════════════════════════
  // FASE 4: Agrupaciones
  // ════════════════════════════════════════════════════
  console.log('\n━━━ FASE 4: Agrupaciones ━━━');

  const agrupCreateQueue: CrmRecordInput[] = [];
  const agrupUpdateQueue: CrmRecordUpdate[] = [];
  const agrupValidatedProps = validatedPropsMap.get('agrupacion')!;

  // Filter agrupaciones: exclude entregadas + only-macros cascade
  const agrupacionesToSync = discovery.agrupaciones.filter(a => shouldSyncProyecto(a.idProyectoSinco));
  const agrupSkippedEntregado = discovery.agrupaciones.filter(a => entregadaProjectIds.has(a.idProyectoSinco)).length;
  const agrupSkippedFilter = discovery.agrupaciones.length - agrupacionesToSync.length - agrupSkippedEntregado;

  console.log(`   Total agrupaciones: ${discovery.agrupaciones.length}`);
  console.log(`   A sincronizar: ${agrupacionesToSync.length}`);
  if (agrupSkippedEntregado > 0) console.log(`   Excluidas (entregadas): ${agrupSkippedEntregado}`);
  if (agrupSkippedFilter > 0) console.log(`   Excluidas (filtro macro): ${agrupSkippedFilter}`);
  audit.counts.agrupaciones.skippedEntregado = agrupSkippedEntregado;
  audit.counts.agrupaciones.skipped = agrupSkippedFilter;

  for (const agrup of agrupacionesToSync) {
    const props = buildProps(agrup as unknown as Record<string, unknown>, AGRUPACION_PROPS, agrupValidatedProps);
    const existing = existingAgrupaciones.get(agrup.idSinco);

    if (existing) {
      agrupacionHubSpotIds.set(agrup.idSinco, existing.id);
      if (hasChanges(props, existing.properties)) {
        agrupUpdateQueue.push({ id: existing.id, objectType: 'agrupacion', properties: props });
        audit.counts.agrupaciones.updated++;
      } else {
        audit.counts.agrupaciones.unchanged++;
      }
    } else {
      agrupCreateQueue.push({ objectType: 'agrupacion', properties: props });
      audit.counts.agrupaciones.created++;
      if (MODE === 'dry-run') {
        agrupacionHubSpotIds.set(agrup.idSinco, `dry-run-agrup-${agrup.idSinco}`);
      }
    }
  }

  console.log(`   Crear: ${agrupCreateQueue.length} | Actualizar: ${agrupUpdateQueue.length} | Sin cambios: ${audit.counts.agrupaciones.unchanged}`);

  // Execute batch operations
  if (MODE === 'apply' && agrupCreateQueue.length > 0) {
    console.log(`   📦 Batch create: ${agrupCreateQueue.length} agrupaciones en chunks de 100...`);
    for (let i = 0; i < agrupCreateQueue.length; i += 100) {
      const chunk = agrupCreateQueue.slice(i, i + 100);
      const result = await adapter.createRecordsBatch(chunk);
      if (result.isOk()) {
        for (const created of result.value.successful) {
          const sincoId = parseInt(created.properties.id_sinco_fx as string);
          if (!isNaN(sincoId)) agrupacionHubSpotIds.set(sincoId, created.id);
        }
        if (result.value.failed.length > 0) {
          audit.counts.agrupaciones.failed += result.value.failed.length;
          audit.counts.agrupaciones.created -= result.value.failed.length;
          audit.errors.push(`Agrupacion batch create chunk ${Math.floor(i / 100) + 1}: ${result.value.failed.length} failed`);
        }
      } else {
        audit.errors.push(`Agrupacion batch create chunk ${Math.floor(i / 100) + 1} error: ${result.error.message}`);
        audit.counts.agrupaciones.failed += chunk.length;
        audit.counts.agrupaciones.created -= chunk.length;
      }
      console.log(`   ... chunk ${Math.floor(i / 100) + 1}/${Math.ceil(agrupCreateQueue.length / 100)} done`);
      await sleep(150);
    }
  }

  if (MODE === 'apply' && agrupUpdateQueue.length > 0) {
    console.log(`   📦 Batch update: ${agrupUpdateQueue.length} agrupaciones en chunks de 100...`);
    for (let i = 0; i < agrupUpdateQueue.length; i += 100) {
      const chunk = agrupUpdateQueue.slice(i, i + 100);
      const result = await adapter.updateRecordsBatch(chunk);
      if (result.isErr()) {
        audit.errors.push(`Agrupacion batch update chunk ${Math.floor(i / 100) + 1} error: ${result.error.message}`);
      }
      await sleep(150);
    }
  }

  // ════════════════════════════════════════════════════
  // FASE 5: Asociaciones (4 tipos)
  // ════════════════════════════════════════════════════
  if (!skipAssociations) {
    console.log('\n━━━ FASE 5: Asociaciones ━━━');

    // ── 5a: macro → proyecto ──
    console.log('   5a: macro → proyecto');
    const macroProyAssocs: CrmAssociation[] = [];

    for (const proy of discovery.proyectosDetalle) {
      if (!shouldSyncProyecto(proy.idSinco)) continue;
      if (!shouldSyncMacro(proy.idMacroSinco)) continue;

      const macroHsId = macroHubSpotIds.get(proy.idMacroSinco);
      const proyHsId = proyectoHubSpotIds.get(proy.idSinco);

      if (!macroHsId || !proyHsId) {
        audit.associations.push({
          fromType: 'macroproyecto', fromSincoId: proy.idMacroSinco,
          toType: 'proyecto', toSincoId: proy.idSinco,
          action: 'error', reason: `IDs faltantes: macro=${macroHsId ?? 'N/A'}, proy=${proyHsId ?? 'N/A'}`,
        });
        audit.counts.associations.macroProyecto.failed++;
        continue;
      }

      macroProyAssocs.push({
        fromObjectType: 'macroproyecto',
        fromId: macroHsId,
        toObjectType: 'proyecto',
        toId: proyHsId,
      });
      audit.counts.associations.macroProyecto.created++;
      audit.associations.push({
        fromType: 'macroproyecto', fromSincoId: proy.idMacroSinco,
        toType: 'proyecto', toSincoId: proy.idSinco,
        action: 'create',
      });
    }
    console.log(`      ${macroProyAssocs.length} asociaciones`);

    // ── 5b: proyecto → unidad ──
    console.log('   5b: proyecto → unidad');
    const proyUnidadAssocs: CrmAssociation[] = [];

    for (const unidad of unidadesToSync) {
      const proyHsId = proyectoHubSpotIds.get(unidad.idProyectoSinco);
      const unidadHsId = unidadHubSpotIds.get(unidad.idSinco);

      if (!proyHsId || !unidadHsId) {
        audit.counts.associations.proyectoUnidad.failed++;
        continue;
      }

      proyUnidadAssocs.push({
        fromObjectType: 'proyecto',
        fromId: proyHsId,
        toObjectType: 'unidad',
        toId: unidadHsId,
      });
      audit.counts.associations.proyectoUnidad.created++;
    }
    console.log(`      ${proyUnidadAssocs.length} asociaciones`);

    // ── 5c: proyecto → agrupacion ──
    console.log('   5c: proyecto → agrupación');
    const proyAgrupAssocs: CrmAssociation[] = [];

    for (const agrup of agrupacionesToSync) {
      const proyHsId = proyectoHubSpotIds.get(agrup.idProyectoSinco);
      const agrupHsId = agrupacionHubSpotIds.get(agrup.idSinco);

      if (!proyHsId || !agrupHsId) {
        audit.counts.associations.proyectoAgrupacion.failed++;
        continue;
      }

      proyAgrupAssocs.push({
        fromObjectType: 'proyecto',
        fromId: proyHsId,
        toObjectType: 'agrupacion',
        toId: agrupHsId,
      });
      audit.counts.associations.proyectoAgrupacion.created++;
    }
    console.log(`      ${proyAgrupAssocs.length} asociaciones`);

    // ── 5d: agrupacion → unidad ──
    console.log('   5d: agrupación → unidad');
    const agrupUnidadAssocs: CrmAssociation[] = [];

    for (const agrup of agrupacionesToSync) {
      if (agrup.unidadesSincoIds.length === 0) {
        audit.warnings.push(`Agrupacion ${agrup.idSinco} (${agrup.nombre}): unidadesSincoIds vacío, no se crean asociaciones agrup→unidad`);
        continue;
      }

      const agrupHsId = agrupacionHubSpotIds.get(agrup.idSinco);
      if (!agrupHsId) continue;

      for (const unidadSincoId of agrup.unidadesSincoIds) {
        const unidadHsId = unidadHubSpotIds.get(unidadSincoId);
        if (!unidadHsId) {
          audit.counts.associations.agrupacionUnidad.failed++;
          continue;
        }

        agrupUnidadAssocs.push({
          fromObjectType: 'agrupacion',
          fromId: agrupHsId,
          toObjectType: 'unidad',
          toId: unidadHsId,
        });
        audit.counts.associations.agrupacionUnidad.created++;
      }
    }
    console.log(`      ${agrupUnidadAssocs.length} asociaciones`);

    // ── Execute all associations (direct API, USER_DEFINED) ──
    if (MODE === 'apply') {

      const assocGroups: Array<{ key: string; label: string; pairs: Array<{ fromId: string; toId: string }> }> = [
        {
          key: 'macroProyecto',
          label: 'macro→proyecto',
          pairs: macroProyAssocs.map(a => ({ fromId: a.fromId, toId: a.toId })),
        },
        {
          key: 'proyectoUnidad',
          label: 'proyecto→unidad',
          pairs: proyUnidadAssocs.map(a => ({ fromId: a.fromId, toId: a.toId })),
        },
        {
          key: 'proyectoAgrupacion',
          label: 'proyecto→agrupación',
          pairs: proyAgrupAssocs.map(a => ({ fromId: a.fromId, toId: a.toId })),
        },
        {
          key: 'agrupacionUnidad',
          label: 'agrupación→unidad',
          pairs: agrupUnidadAssocs.map(a => ({ fromId: a.fromId, toId: a.toId })),
        },
      ];

      for (const group of assocGroups) {
        if (group.pairs.length === 0) continue;
        const config = ASSOCIATION_TYPES[group.key]!;
        console.log(`\n   📦 ${group.label}: ${group.pairs.length} (typeId=${config.typeId}, ${config.category})`);
        const result = await batchCreateAssociationsDirect(token, config, group.pairs);
        if (result.failed > 0) {
          console.warn(`   ⚠️  ${result.failed} fallaron`);
          for (const e of result.errors) audit.errors.push(`Assoc ${group.label}: ${e}`);
        }
        console.log(`   ✅ ${result.successful} asociaciones creadas`);
      }
    }
  }

  // ── Finalize audit ──
  const durationMs = Date.now() - startTime;
  audit.completedAt = new Date().toISOString();
  audit.duration = `${(durationMs / 1000).toFixed(1)}s`;

  // ── Write audit ──
  const outputDir = resolve(dirname(new URL(import.meta.url).pathname), 'output');
  mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const auditPath = resolve(outputDir, `sync-audit-${portalKey}-${timestamp}.json`);
  writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf-8');

  // ════════════════════════════════════════════════════
  // SUMMARY — Formato aprobado por Architect
  // ════════════════════════════════════════════════════

  const c = audit.counts;
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  DRY-RUN HubSpot ${portal.name} ${portal.portalId}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Mode:     ${MODE}`);
  console.log(`  Duration: ${audit.duration}`);

  console.log('\n  Macros:');
  console.log(`    create:     ${c.macroproyectos.created}`);
  console.log(`    update:     ${c.macroproyectos.updated}`);
  console.log(`    unchanged:  ${c.macroproyectos.unchanged}`);
  console.log(`    skipped:    ${c.macroproyectos.skipped}`);
  console.log(`    errors:     ${c.macroproyectos.failed}`);

  console.log('\n  Proyectos:');
  console.log(`    create:            ${c.proyectos.created}`);
  console.log(`    update:            ${c.proyectos.updated}`);
  console.log(`    unchanged:         ${c.proyectos.unchanged}`);
  console.log(`    skipped entregadas:${c.proyectos.skippedEntregado}`);
  console.log(`    skipped filter:    ${c.proyectos.skipped}`);
  console.log(`    errors:            ${c.proyectos.failed}`);

  console.log('\n  Unidades:');
  console.log(`    create:            ${c.unidades.created}`);
  console.log(`    update:            ${c.unidades.updated}`);
  console.log(`    unchanged:         ${c.unidades.unchanged}`);
  console.log(`    skipped entregadas:${c.unidades.skippedEntregado}`);
  console.log(`    skipped filter:    ${c.unidades.skipped}`);
  console.log(`    errors:            ${c.unidades.failed}`);

  console.log('\n  Agrupaciones:');
  console.log(`    create:            ${c.agrupaciones.created}`);
  console.log(`    update:            ${c.agrupaciones.updated}`);
  console.log(`    unchanged:         ${c.agrupaciones.unchanged}`);
  console.log(`    skipped entregadas:${c.agrupaciones.skippedEntregado}`);
  console.log(`    skipped filter:    ${c.agrupaciones.skipped}`);
  console.log(`    errors:            ${c.agrupaciones.failed}`);

  console.log('\n  Asociaciones (USER_DEFINED, direct API):');
  console.log(`    macro→proyecto:       ${c.associations.macroProyecto.created} planned, ${c.associations.macroProyecto.failed} errors  [typeId=${ASSOCIATION_TYPES.macroProyecto.typeId}]`);
  console.log(`    proyecto→unidad:      ${c.associations.proyectoUnidad.created} planned, ${c.associations.proyectoUnidad.failed} errors  [typeId=${ASSOCIATION_TYPES.proyectoUnidad.typeId}]`);
  console.log(`    proyecto→agrupación:  ${c.associations.proyectoAgrupacion.created} planned, ${c.associations.proyectoAgrupacion.failed} errors  [typeId=${ASSOCIATION_TYPES.proyectoAgrupacion.typeId}]`);
  console.log(`    agrupación→unidad:    ${c.associations.agrupacionUnidad.created} planned, ${c.associations.agrupacionUnidad.failed} errors  [typeId=${ASSOCIATION_TYPES.agrupacionUnidad.typeId}]`);

  // ── Schema validation summary ──
  if (schemaResults.length > 0) {
    console.log('\n  Schema:');
    const totalMissingCrit = schemaResults.reduce((sum, s) => sum + s.missingCritical.length, 0);
    const totalMissingOpt = schemaResults.reduce((sum, s) => sum + s.missingOptional.length, 0);
    console.log(`    missing critical props: ${totalMissingCrit}`);
    console.log(`    missing optional props: ${totalMissingOpt}`);
    if (totalMissingOpt > 0) {
      for (const sv of schemaResults) {
        if (sv.missingOptional.length > 0) {
          console.log(`      ${sv.objectType}: ${sv.missingOptional.join(', ')}`);
        }
      }
    }
  }

  // ── Errors and warnings ──
  if (audit.errors.length > 0) {
    console.log(`\n  ❌ ${audit.errors.length} error(es):`);
    for (const e of audit.errors.slice(0, 10)) {
      console.log(`     ${e}`);
    }
  }
  if (audit.warnings.length > 0) {
    console.log(`\n  ⚠️  ${audit.warnings.length} warning(s):`);
    for (const w of audit.warnings.slice(0, 5)) {
      console.log(`     ${w}`);
    }
  }

  console.log(`\n  Audit report: ${auditPath}`);

  if (MODE === 'dry-run') {
    console.log('\n  ℹ️  Modo dry-run. Para aplicar:');
    console.log(`     node --env-file=.env.local --import tsx scripts/sync-sinco-to-hubspot.ts --portal=${portalKey} --apply`);
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');
}

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════

function resolveDiscoveryFile(): string {
  if (fileArg) {
    return resolve(fileArg);
  }

  // Find latest discovery JSON
  const outputDir = resolve(dirname(new URL(import.meta.url).pathname), 'output');
  const files = readdirSync(outputDir)
    .filter(f => f.startsWith('sinco-discovery-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('❌ No se encontró archivo de discovery en scripts/output/');
    console.error('   Primero corre: node --env-file=.env.local --import tsx scripts/discover-sinco-projects.ts');
    process.exit(1);
  }

  return resolve(outputDir, files[0]!);
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
