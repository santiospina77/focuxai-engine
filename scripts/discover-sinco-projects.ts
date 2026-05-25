#!/usr/bin/env node
/**
 * A.1 Discovery Sinco — Script operacional (one-time)
 *
 * Lista TODOS los proyectos activos del ERP Sinco, infiere tipologías,
 * evalúa quoterReady status, y genera un JSON auditable.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/discover-sinco-projects.ts
 *
 * O con npm script (agregar al package.json):
 *   npm run discover:sinco
 *
 * Output:
 *   scripts/output/sinco-discovery-jimenez_demo-YYYY-MM-DD.json
 *
 * Controles de seguridad (Architect-approved):
 *   ✓ Throttling entre llamadas (200ms)
 *   ✓ Partial results — un proyecto fallido no rompe el discovery
 *   ✓ Timeout por llamada (15s)
 *   ✓ No credenciales en output
 *   ✓ Result<T, EngineError> — cero throw
 *   ✓ Logs sin data sensible
 *   ✓ Output versionable y auditable
 *
 * FocuxAI Engine™ — Focux Digital Group S.A.S.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

// ── Engine imports ──────────────────────────────────────────
// We bootstrap the Engine manually (no Next.js runtime).
// tsx resolves @/ paths via tsconfig.json.
import {
  InMemoryClientConfigStore,
  EnvSecretStore,
  type ClientConfig,
} from '@/engine/config/ClientConfigStore';
import { ConnectorFactory } from '@/engine/config/ConnectorFactory';
import { ConsoleLogger } from '@/engine/core/logging/Logger';
import type { IErpConnector, Agrupacion, Unidad } from '@/engine/interfaces/IErpConnector';
import { JIMENEZ_DEMO_CONFIG } from '@/engine/apps/quoter/inventory/clientConfigs/jimenez_demo';

// ── Config ──────────────────────────────────────────────────

const CLIENT_ID = process.argv.find((a) => a.startsWith('--clientId='))?.split('=')[1] ?? 'jimenez_demo';
const THROTTLE_MS = 200; // ms entre llamadas a Sinco
const MAX_PROJECTS = Number(process.argv.find((a) => a.startsWith('--maxProjects='))?.split('=')[1] ?? '100');
const SUMMARY_ONLY = process.argv.includes('--summary');
const SKIP_FILTER = process.argv.includes('--all'); // --all = traer los 37 macros, no solo activos

// ═══════════════════════════════════════════════════════════
// Whitelist de macroproyectos activos
// Fuente: --listMacros contra Sinco producción 12-mayo-2026
//
// REGLA: Usar IDs exactos (confiable) + nombres como fallback.
// Los nombres en Sinco no siempre coinciden con los del JSON v17.
// Ejemplo: JSON v17 lista "Coralina Sunset/Del Sol/Caribe" como macros
// separados, pero en Sinco son proyectos dentro del macro 38 "CORALINA".
// ═══════════════════════════════════════════════════════════
const ACTIVE_MACRO_IDS = new Set([
  38,   // CORALINA — contiene Sunset(274,288,303), entregadas(296,313,321,329), y más
  46,   // VENECIA DEL SOL
  47,   // VENECIA DE LA SIERRA
  54,   // MARENA
  58,   // PORTO SABBIA — contiene Suites(361) + Residencial(360)
  59,   // RODADERO LIVING
]);

// Fallback por nombre — solo si el ID no matcheó
const ACTIVE_MACRO_NAMES: readonly string[] = [
  'VENECIA DEL SOL',
  'VENECIA DE LA SIERRA',
  'CORALINA',
  'MARENA',
  'RODADERO LIVING',
  'PORTO SABBIA',
];

function isActiveMacro(id: number, nombre: string): boolean {
  if (SKIP_FILTER) return true;
  if (ACTIVE_MACRO_IDS.has(id)) return true;
  const normalized = nombre.trim().toUpperCase();
  return ACTIVE_MACRO_NAMES.some((active) => normalized.includes(active));
}

// Client configs — same as src/engine/index.ts
const CLIENTS: ClientConfig[] = [
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
];

// ── Torres entregadas — marcadas en output pero NO excluidas ──
const TORRES_ENTREGADAS_SINCO_IDS = new Set([
  296,  // CORALINA SUITES TORRE 1
  313,  // CORALINA SUITES TORRE 2
  321,  // CORALINA CARIBE T 1
  329,  // CORALINA CARIBE T2
]);

// ── Types ───────────────────────────────────────────────────

interface DiscoveredTypology {
  tipologia: string;
  areaConstruida: number;
  habs: number;
  banos: number;
  count: number;
}

// ── Registros individuales para sync (Architect-approved fields) ──

interface DiscoveredMacro {
  idSinco: number;
  nombre: string;
  estado: string | null;          // raw de Sinco
  activo: boolean;
}

interface DiscoveredProyectoRecord {
  idSinco: number;
  idMacroSinco: number;
  nombre: string;
  estado: string | null;
  activo: boolean;
  esEntregada: boolean;           // true si sincoId in TORRES_ENTREGADAS
  estrato: number | null;
  valorSeparacion: number | null;
  porcentajeFinanciacion: number | null;
  fechaEntrega: string | null;
  numeroDiasReserva: number | null;
}

interface DiscoveredUnidadRecord {
  idSinco: number;
  idProyectoSinco: number;
  nombre: string;
  estado: string;                  // DISPONIBLE | BLOQUEADA | RESERVADA | VENDIDA | ESCRITURADA
  tipoUnidadSinco: number | null;  // tipoCodigo del ERP
  tipoUnidad: string;              // APARTAMENTO | PARQUEADERO | DEPOSITO | OTRO
  esPrincipal: boolean;
  precioLista: number;
  areaConstruida: number | null;
  areaPrivada: number | null;
  areaTotal: number | null;
  piso: number | null;
  alcobas: number | null;
  banos: number | null;
  clasificacion: string | null;
  bloqueadoEnErp: boolean | null;
  tipoInmuebleId: number | null;
}

interface DiscoveredAgrupacionRecord {
  idSinco: number;
  idProyectoSinco: number;
  nombre: string;
  estado: string;                  // DISPONIBLE | COTIZADA | BLOQUEADA | SEPARADA | VENDIDA
  valorSubtotal: number | null;
  valorDescuento: number | null;
  valorDescuentoFinanciero: number | null;
  valorTotalNeto: number | null;
  valorSeparacion: number | null;
  idUnidadPrincipalSinco: number | null;
  unidadesSincoIds: number[];      // IDs de unidades que componen esta agrupación
  idCompradorSinco: number | null;
  idVendedorSinco: number | null;
  tipoVentaCodigo: number | null;
  fechaVenta: string | null;
  observaciones: string | null;
  numeroEncargo: string | null;
  fechaSeparacion: string | null;
  fechaCreacionErp: string | null;
  idMedioPublicitario: number | null;
  ventaExterior: boolean | null;
  valorAdicionales: number | null;
  valorExclusiones: number | null;
  valorSobrecosto: number | null;
  compradorNumeroIdentificacion: string | null;
}

interface DiscoveredProject {
  sincoId: number;
  nombre: string;
  activo: boolean;
  macroproyectoId: number;
  macroproyectoNombre: string;
  totalAgrupaciones: number;
  agrupacionesPorEstado: Record<string, number>;
  totalUnidades: number;
  unidadesPorTipo: Record<string, number>;
  unidadesPorEstado: Record<string, number>;
  disponibles: number;
  tipologiasUnicas: DiscoveredTypology[];
  precioMin: number;
  precioMax: number;
  areaMin: number;
  areaMax: number;
  camposFaltantes: string[];
  quoterReady: 'ready' | 'needs_typology_rules' | 'needs_review' | 'blocked';
  quoterReadyReason: string;
  riesgos: string[];
  yaConfigurado: boolean;
}

interface DiscoveryResult {
  clientId: string;
  generatedAt: string;
  duration: string;
  totalMacroproyectos: number;
  totalProyectos: number;
  totalAgrupaciones: number;
  totalUnidades: number;
  totalUnidadesDisponibles: number;
  summary: {
    ready: number;
    needsTypologyRules: number;
    needsReview: number;
    blocked: number;
  };
  // ── Registros individuales para sync ──
  macroproyectos: DiscoveredMacro[];
  proyectosDetalle: DiscoveredProyectoRecord[];
  unidades: DiscoveredUnidadRecord[];
  agrupaciones: DiscoveredAgrupacionRecord[];
  // ── Stats legacy (compatibilidad) ──
  proyectos: DiscoveredProject[];
  errors: string[];
  warnings: string[];
}

// ── Helpers ─────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isAlreadyConfigured(sincoId: number): boolean {
  return sincoId in JIMENEZ_DEMO_CONFIG.overlay.projects;
}

function inferTypologies(units: readonly Unidad[]): DiscoveredTypology[] {
  const aptos = units.filter(
    (u) => u.tipo === 'APARTAMENTO' && u.areaConstruida && u.areaConstruida > 0
  );

  const map = new Map<string, { area: number; habs: number; banos: number; count: number }>();

  for (const u of aptos) {
    const area = Math.round((u.areaConstruida ?? 0) * 100) / 100;
    const habs = u.cantidadAlcobas ?? 0;
    const banos = u.cantidadBanos ?? 0;
    const key = `${area}|${habs}|${banos}`;

    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, { area, habs, banos, count: 1 });
    }
  }

  const sorted = [...map.values()].sort((a, b) => a.area - b.area);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  return sorted.map((entry, i) => {
    const letterIdx = Math.floor(i / 9);
    const numIdx = (i % 9) + 1;
    const tipologia = `${letters[letterIdx] ?? 'Z'}${numIdx}`;

    return {
      tipologia,
      areaConstruida: entry.area,
      habs: entry.habs,
      banos: entry.banos,
      count: entry.count,
    };
  });
}

function assessQuoterReady(
  project: { sincoId: number; nombre: string; activo: boolean },
  agrupacionCount: number,
  disponibles: number,
  typologies: DiscoveredTypology[],
  risks: string[],
  alreadyConfigured: boolean
): { status: DiscoveredProject['quoterReady']; reason: string } {
  if (!project.activo) {
    return { status: 'blocked', reason: 'Proyecto inactivo en Sinco' };
  }
  if (agrupacionCount === 0) {
    return { status: 'blocked', reason: 'Sin agrupaciones en Sinco' };
  }
  if (disponibles === 0) {
    return { status: 'needs_review', reason: 'Sin unidades disponibles — posiblemente vendido' };
  }
  if (typologies.length === 0) {
    return { status: 'blocked', reason: 'Sin tipologías inferibles (sin apartamentos con área)' };
  }
  const hasAreaZero = risks.some((r) => r.includes('area_construida=0'));
  if (hasAreaZero && typologies.length < 2) {
    return { status: 'needs_review', reason: 'Datos de área incompletos — pocas tipologías' };
  }
  if (alreadyConfigured) {
    return { status: 'ready', reason: 'Ya configurado en cotizador' };
  }
  return {
    status: 'needs_typology_rules',
    reason: `${typologies.length} tipologías detectadas — necesita archivo typologyRules`,
  };
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FocuxAI Engine™ — A.1 Discovery Sinco');
  console.log(`  Client: ${CLIENT_ID}`);
  console.log(`  Max projects: ${MAX_PROJECTS}`);
  console.log(`  Mode: ${SUMMARY_ONLY ? 'summary' : 'full'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  // ── Bootstrap Engine (manual, no Next.js) ──
  const logger = new ConsoleLogger({ service: 'discovery' }, 'info');
  const configStore = new InMemoryClientConfigStore(CLIENTS);
  const secretStore = new EnvSecretStore();
  const factory = new ConnectorFactory({ configStore, secretStore, logger });

  const erpResult = factory.getErpConnector(CLIENT_ID);
  if (erpResult.isErr()) {
    console.error(`❌ No se pudo obtener connector para "${CLIENT_ID}":`, erpResult.error.message);
    console.error('   ¿Están configuradas las env vars SINCO_JIMENEZ_DEMO_USERNAME y _PASSWORD?');
    process.exit(1);
  }
  const erp = erpResult.value;

  const errors: string[] = [];
  const warnings: string[] = [];
  const allProjects: DiscoveredProject[] = [];
  const allMacros: DiscoveredMacro[] = [];
  const allProyectosDetalle: DiscoveredProyectoRecord[] = [];
  const allUnidades: DiscoveredUnidadRecord[] = [];
  const allAgrupaciones: DiscoveredAgrupacionRecord[] = [];
  let projectCount = 0;

  // ── Step 1: List macroproyectos ──
  console.log('📡 Obteniendo macroproyectos...');
  const macrosResult = await erp.getMacroproyectos();
  if (macrosResult.isErr()) {
    console.error('❌ Error obteniendo macroproyectos:', macrosResult.error.message);
    process.exit(1);
  }
  const macros = macrosResult.value;
  console.log(`   ✅ ${macros.length} macroproyectos encontrados\n`);

  // ── List ALL macro names (always, for diagnostics) ──
  const LIST_MACROS = process.argv.includes('--listMacros');
  if (LIST_MACROS) {
    console.log('TODOS LOS MACROPROYECTOS EN SINCO:');
    console.log('─'.repeat(80));
    console.log('Id'.padEnd(8) + 'Nombre'.padEnd(45) + 'Activo'.padEnd(10) + 'Match');
    console.log('─'.repeat(80));
    for (const m of macros) {
      const matches = isActiveMacro(m.externalId, m.nombre);
      console.log(
        String(m.externalId).padEnd(8) +
        m.nombre.slice(0, 43).padEnd(45) +
        String(m.activo).padEnd(10) +
        (matches ? '✅' : '—')
      );
    }
    console.log('─'.repeat(80));
    console.log(`\nTotal: ${macros.length} | Matchean filtro: ${macros.filter(m => isActiveMacro(m.externalId, m.nombre)).length}`);
    process.exit(0);
  }

  // ── Step 2: For each macro, list projects (only active from JSON v17) ──
  const activeMacros = macros.filter((m) => isActiveMacro(m.externalId, m.nombre));
  const skippedMacros = macros.length - activeMacros.length;
  if (skippedMacros > 0) {
    console.log(`   ⏭️  ${skippedMacros} macros históricos filtrados (usa --all para ver todos)\n`);
  }

  for (const macro of activeMacros) {
    console.log(`📂 Macro ${macro.externalId}: ${macro.nombre} (activo=${macro.activo})`);

    // ── Recolectar macro record ──
    allMacros.push({
      idSinco: macro.externalId,
      nombre: macro.nombre,
      estado: macro.estado ?? null,
      activo: macro.activo,
    });

    await sleep(THROTTLE_MS);
    const projectsResult = await erp.getProyectosByMacroproyecto(macro.externalId);

    if (projectsResult.isErr()) {
      const msg = `Error listando proyectos de macro ${macro.externalId} (${macro.nombre}): ${projectsResult.error.message}`;
      console.error(`   ❌ ${msg}`);
      errors.push(msg);
      continue;
    }

    const projects = projectsResult.value;
    console.log(`   ${projects.length} proyecto(s)`);

    for (const project of projects) {
      if (projectCount >= MAX_PROJECTS) {
        console.log(`\n⚠️  Límite de ${MAX_PROJECTS} proyectos alcanzado. Usa --maxProjects=N para aumentar.`);
        break;
      }
      projectCount++;

      const configured = isAlreadyConfigured(project.externalId);
      const tag = configured ? ' [YA CONFIGURADO]' : '';
      console.log(`   📋 Proyecto ${project.externalId}: ${project.nombre}${tag}`);

      // ── Step 3: Get agrupaciones ──
      await sleep(THROTTLE_MS);
      let agrupaciones: readonly Agrupacion[] = [];
      const agrupResult = await erp.getAgrupacionesByProyecto(project.externalId);
      if (agrupResult.isErr()) {
        const msg = `Error agrupaciones proyecto ${project.externalId}: ${agrupResult.error.message}`;
        console.error(`      ❌ ${msg}`);
        errors.push(msg);
      } else {
        agrupaciones = agrupResult.value;
      }

      // ── Step 4: Get units ──
      await sleep(THROTTLE_MS);
      let units: readonly Unidad[] = [];
      const unitsResult = await erp.getUnidadesByProyecto(project.externalId);
      if (unitsResult.isErr()) {
        const msg = `Error unidades proyecto ${project.externalId}: ${unitsResult.error.message}`;
        console.error(`      ❌ ${msg}`);
        errors.push(msg);
      } else {
        units = unitsResult.value;
      }

      // ── Recolectar proyecto detalle ──
      const esEntregada = TORRES_ENTREGADAS_SINCO_IDS.has(project.externalId);
      allProyectosDetalle.push({
        idSinco: project.externalId,
        idMacroSinco: macro.externalId,
        nombre: project.nombre,
        estado: project.estado ?? null,
        activo: project.activo,
        esEntregada,
        estrato: project.estrato ?? null,
        valorSeparacion: project.valorSeparacion ?? null,
        porcentajeFinanciacion: project.porcentajeFinanciacion ?? null,
        fechaEntrega: project.fechaEntrega ?? null,
        numeroDiasReserva: project.numeroDiasReservaOpcionVenta ?? null,
      });
      if (esEntregada) {
        warnings.push(`Proyecto ${project.externalId} (${project.nombre}) marcado como ENTREGADO`);
      }

      // ── Recolectar unidades individuales ──
      for (const u of units) {
        allUnidades.push({
          idSinco: u.externalId,
          idProyectoSinco: project.externalId,
          nombre: u.nombre,
          estado: u.estado,
          tipoUnidadSinco: u.tipoCodigo ?? null,
          tipoUnidad: u.tipo,
          esPrincipal: u.esPrincipal,
          precioLista: u.precio,
          areaConstruida: u.areaConstruida ?? null,
          areaPrivada: u.areaPrivada ?? null,
          areaTotal: u.areaTotal ?? null,
          piso: u.piso ?? null,
          alcobas: u.cantidadAlcobas ?? null,
          banos: u.cantidadBanos ?? null,
          clasificacion: u.clasificacion ?? null,
          bloqueadoEnErp: u.bloqueadoEnErp ?? null,
          tipoInmuebleId: u.tipoInmuebleId ?? null,
        });
      }

      // ── Recolectar agrupaciones individuales ──
      for (const a of agrupaciones) {
        allAgrupaciones.push({
          idSinco: a.externalId,
          idProyectoSinco: project.externalId,
          nombre: a.nombre,
          estado: a.estado,
          valorSubtotal: a.valorSubtotal ?? null,
          valorDescuento: a.valorDescuento ?? null,
          valorDescuentoFinanciero: a.valorDescuentoFinanciero ?? null,
          valorTotalNeto: a.valorTotalNeto ?? null,
          valorSeparacion: a.valorSeparacion ?? null,
          idUnidadPrincipalSinco: a.idUnidadPrincipalExternalId ?? null,
          unidadesSincoIds: a.unidades.map(u => u.externalId),
          idCompradorSinco: a.compradorExternalId ?? null,
          idVendedorSinco: a.vendedorExternalId ?? null,
          tipoVentaCodigo: a.tipoVentaCodigo ?? null,
          fechaVenta: a.fechaVenta ?? null,
          observaciones: a.observaciones ?? null,
          numeroEncargo: a.numeroEncargo ?? null,
          fechaSeparacion: a.fechaSeparacion ?? null,
          fechaCreacionErp: a.fechaCreacionErp ?? null,
          idMedioPublicitario: a.idMedioPublicitario ?? null,
          ventaExterior: a.ventaExterior ?? null,
          valorAdicionales: a.valorAdicionales ?? null,
          valorExclusiones: a.valorExclusiones ?? null,
          valorSobrecosto: a.valorSobrecosto ?? null,
          compradorNumeroIdentificacion: a.compradorNumeroIdentificacion ?? null,
        });
      }

      // ── Compute stats ──
      const agrupPorEstado: Record<string, number> = {};
      for (const a of agrupaciones) {
        agrupPorEstado[a.estado] = (agrupPorEstado[a.estado] ?? 0) + 1;
      }

      const unidsPorTipo: Record<string, number> = {};
      const unidsPorEstado: Record<string, number> = {};
      const risksForProject: string[] = [];
      const missingFields: string[] = [];

      for (const u of units) {
        unidsPorTipo[u.tipo] = (unidsPorTipo[u.tipo] ?? 0) + 1;
        unidsPorEstado[u.estado] = (unidsPorEstado[u.estado] ?? 0) + 1;

        if (u.tipo === 'APARTAMENTO') {
          if (!u.areaConstruida || u.areaConstruida === 0) {
            risksForProject.push(`Unidad ${u.externalId} (${u.nombre}): area_construida=0`);
          }
          if (u.precio <= 0) {
            risksForProject.push(`Unidad ${u.externalId} (${u.nombre}): precio<=0`);
          }
        }
      }

      // Missing fields (sample from first apto)
      const aptos = units.filter((u) => u.tipo === 'APARTAMENTO');
      if (aptos.length > 0) {
        const sample = aptos[0]!;
        if (sample.areaConstruida === undefined) missingFields.push('areaConstruida');
        if (sample.cantidadAlcobas === undefined) missingFields.push('cantidadAlcobas');
        if (sample.cantidadBanos === undefined) missingFields.push('cantidadBanos');
        if (sample.piso === undefined) missingFields.push('piso');
      }

      // Typologies
      const typologies = inferTypologies(units);

      // Price/area ranges
      const aptoPrices = aptos.map((u) => u.precio).filter((p) => p > 0);
      const aptoAreas = aptos.map((u) => u.areaConstruida ?? 0).filter((a) => a > 0);

      const disponibles = agrupPorEstado['DISPONIBLE'] ?? 0;

      const { status, reason } = assessQuoterReady(
        project, agrupaciones.length, disponibles, typologies, risksForProject, configured
      );

      const statusEmoji = {
        ready: '🟢',
        needs_typology_rules: '🟡',
        needs_review: '🟠',
        blocked: '🔴',
      }[status];

      console.log(`      ${statusEmoji} ${status}: ${reason}`);
      console.log(`      Agrupaciones: ${agrupaciones.length} | Unidades: ${units.length} | Disponibles: ${disponibles} | Tipologías: ${typologies.length}`);
      if (risksForProject.length > 0) {
        console.log(`      ⚠️  ${risksForProject.length} riesgo(s) de datos`);
      }

      allProjects.push({
        sincoId: project.externalId,
        nombre: project.nombre,
        activo: project.activo,
        macroproyectoId: macro.externalId,
        macroproyectoNombre: macro.nombre,
        totalAgrupaciones: agrupaciones.length,
        agrupacionesPorEstado: agrupPorEstado,
        totalUnidades: units.length,
        unidadesPorTipo: unidsPorTipo,
        unidadesPorEstado: unidsPorEstado,
        disponibles,
        tipologiasUnicas: typologies, // Always include — needed for table display
        precioMin: aptoPrices.length > 0 ? Math.min(...aptoPrices) : 0,
        precioMax: aptoPrices.length > 0 ? Math.max(...aptoPrices) : 0,
        areaMin: aptoAreas.length > 0 ? Math.min(...aptoAreas) : 0,
        areaMax: aptoAreas.length > 0 ? Math.max(...aptoAreas) : 0,
        camposFaltantes: missingFields,
        quoterReady: status,
        quoterReadyReason: reason,
        riesgos: risksForProject.length > 10
          ? [...risksForProject.slice(0, 10), `... y ${risksForProject.length - 10} más`]
          : risksForProject,
        yaConfigurado: configured,
      });
    }

    if (projectCount >= MAX_PROJECTS) break;
  }

  // ── Build result ──
  const durationMs = Date.now() - startTime;
  const result: DiscoveryResult = {
    clientId: CLIENT_ID,
    generatedAt: new Date().toISOString(),
    duration: `${(durationMs / 1000).toFixed(1)}s`,
    totalMacroproyectos: allMacros.length,
    totalProyectos: allProyectosDetalle.length,
    totalAgrupaciones: allAgrupaciones.length,
    totalUnidades: allUnidades.length,
    totalUnidadesDisponibles: allProjects.reduce((sum, p) => sum + p.disponibles, 0),
    summary: {
      ready: allProjects.filter((p) => p.quoterReady === 'ready').length,
      needsTypologyRules: allProjects.filter((p) => p.quoterReady === 'needs_typology_rules').length,
      needsReview: allProjects.filter((p) => p.quoterReady === 'needs_review').length,
      blocked: allProjects.filter((p) => p.quoterReady === 'blocked').length,
    },
    // ── Registros individuales para sync ──
    macroproyectos: allMacros,
    proyectosDetalle: allProyectosDetalle,
    unidades: allUnidades,
    agrupaciones: allAgrupaciones,
    // ── Stats legacy ──
    proyectos: allProjects,
    errors,
    warnings,
  };

  // ── Write output ──
  const today = new Date().toISOString().slice(0, 10);
  const outputDir = resolve(dirname(new URL(import.meta.url).pathname), 'output');
  const outputPath = resolve(outputDir, `sinco-discovery-${CLIENT_ID}-${today}.json`);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  // ── Print summary ──
  const torresEntregadas = allProyectosDetalle.filter(p => p.esEntregada).length;
  const torresActivas = allProyectosDetalle.length - torresEntregadas;
  const unidadesDisponibles = allUnidades.filter(u => u.estado === 'DISPONIBLE').length;
  const agrupacionesDisponibles = allAgrupaciones.filter(a => a.estado === 'DISPONIBLE').length;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  RESUMEN DISCOVERY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Macroproyectos:           ${result.totalMacroproyectos}`);
  console.log(`  Proyectos (torres):       ${result.totalProyectos} (${torresActivas} activas, ${torresEntregadas} entregadas)`);
  console.log(`  Agrupaciones individuales: ${result.totalAgrupaciones} (${agrupacionesDisponibles} disponibles)`);
  console.log(`  Unidades individuales:     ${result.totalUnidades} (${unidadesDisponibles} disponibles)`);
  console.log();
  console.log(`  🟢 Ready:                ${result.summary.ready}`);
  console.log(`  🟡 Needs typology rules: ${result.summary.needsTypologyRules}`);
  console.log(`  🟠 Needs review:         ${result.summary.needsReview}`);
  console.log(`  🔴 Blocked:              ${result.summary.blocked}`);
  console.log();
  if (errors.length > 0) {
    console.log(`  ❌ ${errors.length} error(es) parciales (ver JSON)`);
  }
  if (warnings.length > 0) {
    console.log(`  ⚠️  ${warnings.length} warning(s):`);
    for (const w of warnings.slice(0, 10)) {
      console.log(`     ${w}`);
    }
  }
  console.log(`  Duración: ${result.duration}`);
  console.log(`  Output: ${outputPath}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Quick table for CEO ──
  console.log('MATRIZ RÁPIDA:');
  console.log('─'.repeat(120));
  console.log(
    'SincoId'.padEnd(10) +
    'Proyecto'.padEnd(35) +
    'Macro'.padEnd(25) +
    'Agr'.padEnd(6) +
    'Disp'.padEnd(6) +
    'Tips'.padEnd(6) +
    'Status'.padEnd(22) +
    'Config'
  );
  console.log('─'.repeat(120));
  for (const p of allProjects) {
    console.log(
      String(p.sincoId).padEnd(10) +
      p.nombre.slice(0, 33).padEnd(35) +
      p.macroproyectoNombre.slice(0, 23).padEnd(25) +
      String(p.totalAgrupaciones).padEnd(6) +
      String(p.disponibles).padEnd(6) +
      String(p.tipologiasUnicas.length).padEnd(6) +
      p.quoterReady.padEnd(22) +
      (p.yaConfigurado ? '✅' : '—')
    );
  }
  console.log('─'.repeat(120));
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
