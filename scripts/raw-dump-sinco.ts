#!/usr/bin/env node
/**
 * Raw Dump Sinco — Escaneo profundo de TODOS los campos que el API devuelve.
 *
 * Objetivo: Ver exactamente qué data manda Sinco en cada capa
 * (macro, proyecto, agrupación, unidad) SIN filtrar por nuestros schemas.
 *
 * Uso:
 *   npm run dump:sinco
 *   npm run dump:sinco -- --macroId=58 --projectId=361
 *   npm run dump:sinco -- --macroId=58 --projectId=361 --maxUnits=3 --maxAgrup=3
 *
 * Output:
 *   scripts/output/sinco-raw-dump-{date}.json
 *
 * FocuxAI Engine™ — Focux Digital Group S.A.S.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

import {
  InMemoryClientConfigStore,
  EnvSecretStore,
  type ClientConfig,
} from '@/engine/config/ClientConfigStore';
import { ConnectorFactory } from '@/engine/config/ConnectorFactory';
import { ConsoleLogger } from '@/engine/core/logging/Logger';
import { SincoAuthManager } from '@/engine/connectors/erp/sinco/SincoAuthManager';
import { SincoHttpClient } from '@/engine/connectors/erp/sinco/SincoHttpClient';

// ── Config ──────────────────────────────────────────────────

const CLIENT_ID = 'jimenez_demo';
const CBR_API_BASE = '/CBRClientes/API';

const MACRO_ID = Number(process.argv.find((a) => a.startsWith('--macroId='))?.split('=')[1] ?? '0');
const PROJECT_ID = Number(process.argv.find((a) => a.startsWith('--projectId='))?.split('=')[1] ?? '0');
const MAX_UNITS = Number(process.argv.find((a) => a.startsWith('--maxUnits='))?.split('=')[1] ?? '5');
const MAX_AGRUP = Number(process.argv.find((a) => a.startsWith('--maxAgrup='))?.split('=')[1] ?? '5');
const MAX_MACROS = Number(process.argv.find((a) => a.startsWith('--maxMacros='))?.split('=')[1] ?? '3');
const MAX_PROJECTS = Number(process.argv.find((a) => a.startsWith('--maxProjects='))?.split('=')[1] ?? '2');

const THROTTLE_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Client config — same as Engine
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
    crm: { kind: 'hubspot', customObjectTypeIds: { macroproyecto: '', proyecto: '', unidad: '', agrupacion: '' } },
    features: { agrupacionesPreestablecidas: true, diasBloqueo: 4, syncIntervalHours: 2 },
  },
];

// ── Helpers ─────────────────────────────────────────────────

function extractFieldNames(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

function summarizeField(key: string, value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value.length > 80 ? `"${value.slice(0, 80)}..." (${value.length} chars)` : `"${value}"`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `Array[${value.length}]`;
  if (typeof value === 'object') return `Object{${Object.keys(value as object).length} keys}`;
  return String(value);
}

function printAllFields(label: string, obj: Record<string, unknown>) {
  const keys = extractFieldNames(obj);
  console.log(`\n   ${label} — ${keys.length} campos:`);
  console.log('   ' + '─'.repeat(76));
  for (const key of keys) {
    const val = summarizeField(key, obj[key]);
    console.log(`   ${key.padEnd(35)} ${val}`);
  }
  console.log('   ' + '─'.repeat(76));
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FocuxAI Engine™ — Raw Dump Sinco (escaneo profundo)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Bootstrap auth
  const logger = new ConsoleLogger({ service: 'raw-dump' }, 'info');
  const configStore = new InMemoryClientConfigStore(CLIENTS);
  const secretStore = new EnvSecretStore();
  const factory = new ConnectorFactory({ configStore, secretStore, logger });

  // Get the raw HTTP client + auth (we want raw responses, not mapped ones)
  const config = CLIENTS[0]!;
  const username = process.env.SINCO_JIMENEZ_DEMO_USERNAME;
  const password = process.env.SINCO_JIMENEZ_DEMO_PASSWORD;
  if (!username || !password) {
    console.error('❌ Faltan env vars SINCO_JIMENEZ_DEMO_USERNAME / PASSWORD');
    process.exit(1);
  }

  const http = new SincoHttpClient(logger, {
    baseUrl: config.erp.baseUrl,
    clientId: CLIENT_ID,
  });

  const auth = new SincoAuthManager(http, {
    baseUrl: config.erp.baseUrl,
    username,
    password,
    idOrigen: config.erp.idOrigen,
    idEmpresa: config.erp.idEmpresa,
    idSucursal: config.erp.idSucursal,
  }, logger);

  // Auth
  const tokenResult = await auth.getToken();
  if (tokenResult.isErr()) {
    console.error('❌ Auth failed:', tokenResult.error.message);
    process.exit(1);
  }
  const token = tokenResult.value;
  console.log('✅ Autenticado\n');

  // Helper para GET crudo
  async function rawGet(subpath: string): Promise<unknown> {
    const result = await http.request({
      method: 'GET',
      path: `${CBR_API_BASE}${subpath}`,
      token,
      operation: `raw.${subpath}`,
    });
    if (result.isErr()) {
      console.error(`   ❌ GET ${subpath}: ${result.error.message}`);
      return null;
    }
    return result.value.body;
  }

  const dump: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    clientId: CLIENT_ID,
  };

  // ═══════════════════════════════════════════════════════════
  // CAPA 1: MACROPROYECTOS
  // ═══════════════════════════════════════════════════════════
  console.log('📡 CAPA 1: MACROPROYECTOS (/Macroproyectos/Basica)');
  const macrosRaw = await rawGet('/Macroproyectos/Basica') as any[] | null;

  if (!macrosRaw) {
    console.error('❌ No se pudieron obtener macroproyectos');
    process.exit(1);
  }

  console.log(`   ${macrosRaw.length} macroproyectos totales`);

  // Mostrar campos del primer macro
  if (macrosRaw.length > 0) {
    printAllFields('EJEMPLO MACRO (primer registro)', macrosRaw[0]);
  }

  // Si se especificó un macro, filtramos
  let targetMacros = macrosRaw;
  if (MACRO_ID > 0) {
    targetMacros = macrosRaw.filter((m: any) => m.id === MACRO_ID);
    console.log(`\n   Filtrado a macro id=${MACRO_ID}: ${targetMacros.length} encontrado(s)`);
  } else {
    targetMacros = macrosRaw.slice(0, MAX_MACROS);
    console.log(`\n   Tomando primeros ${MAX_MACROS} macros (usa --macroId=N para uno específico)`);
  }

  dump.macroproyectos = {
    totalCount: macrosRaw.length,
    fieldNames: macrosRaw.length > 0 ? extractFieldNames(macrosRaw[0]) : [],
    samples: targetMacros,
  };

  // ═══════════════════════════════════════════════════════════
  // CAPA 2: PROYECTOS
  // ═══════════════════════════════════════════════════════════
  const allProjectsDump: any[] = [];

  for (const macro of targetMacros) {
    const macroId = (macro as any).id;
    const macroName = (macro as any).nombre;
    console.log(`\n📂 CAPA 2: PROYECTOS de macro ${macroId} (${macroName})`);

    await sleep(THROTTLE_MS);
    const projectsRaw = await rawGet(`/Proyectos/${macroId}`) as any[] | null;
    if (!projectsRaw) continue;

    console.log(`   ${projectsRaw.length} proyecto(s)`);

    if (projectsRaw.length > 0) {
      printAllFields(`EJEMPLO PROYECTO (primer registro de ${macroName})`, projectsRaw[0]);
    }

    let targetProjects = projectsRaw;
    if (PROJECT_ID > 0) {
      targetProjects = projectsRaw.filter((p: any) => p.id === PROJECT_ID);
    } else {
      targetProjects = projectsRaw.slice(0, MAX_PROJECTS);
    }

    for (const project of targetProjects) {
      const projId = (project as any).id;
      const projName = (project as any).nombre;

      const projectDump: Record<string, unknown> = {
        raw: project,
        fieldNames: extractFieldNames(project),
      };

      // ═══════════════════════════════════════════════════════════
      // CAPA 3: AGRUPACIONES
      // ═══════════════════════════════════════════════════════════
      console.log(`\n   📋 CAPA 3: AGRUPACIONES de proyecto ${projId} (${projName})`);

      await sleep(THROTTLE_MS);
      const agrupRaw = await rawGet(`/Agrupaciones/IdProyecto/${projId}`) as any[] | null;

      if (agrupRaw && agrupRaw.length > 0) {
        console.log(`      ${agrupRaw.length} agrupación(es)`);

        // Mostrar campos de la primera agrupación (sin unidades anidadas para no saturar)
        const sampleAgrup = { ...agrupRaw[0] };
        const unidadesInAgrup = sampleAgrup.unidades;
        if (Array.isArray(unidadesInAgrup)) {
          sampleAgrup.unidades = `[Array de ${unidadesInAgrup.length} unidades — ver detalle abajo]`;
        }
        printAllFields(`EJEMPLO AGRUPACIÓN (primera de ${projName})`, sampleAgrup);

        // Si la agrupación trae unidades anidadas, mostrar campos de la primera
        if (Array.isArray(unidadesInAgrup) && unidadesInAgrup.length > 0) {
          printAllFields('EJEMPLO UNIDAD DENTRO DE AGRUPACIÓN', unidadesInAgrup[0]);
        }

        projectDump.agrupaciones = {
          totalCount: agrupRaw.length,
          fieldNames: extractFieldNames(agrupRaw[0]),
          unidadFieldNames: Array.isArray(unidadesInAgrup) && unidadesInAgrup.length > 0
            ? extractFieldNames(unidadesInAgrup[0])
            : [],
          samples: agrupRaw.slice(0, MAX_AGRUP).map((a: any) => {
            const copy = { ...a };
            if (Array.isArray(copy.unidades)) {
              copy.unidades = copy.unidades.slice(0, 2); // Solo 2 unidades por agrupación en el dump
            }
            return copy;
          }),
        };
      } else {
        console.log(`      ${agrupRaw ? '0' : 'ERROR'} agrupación(es)`);
        projectDump.agrupaciones = { totalCount: 0, error: agrupRaw === null ? 'API error' : 'empty' };
      }

      // ═══════════════════════════════════════════════════════════
      // CAPA 4: UNIDADES (endpoint directo, sin agrupaciones)
      // ═══════════════════════════════════════════════════════════
      console.log(`\n   📋 CAPA 4: UNIDADES de proyecto ${projId} (${projName})`);

      await sleep(THROTTLE_MS);
      const unitsRaw = await rawGet(`/Unidades/PorProyecto/${projId}`) as any[] | null;

      if (unitsRaw && unitsRaw.length > 0) {
        console.log(`      ${unitsRaw.length} unidad(es)`);
        printAllFields(`EJEMPLO UNIDAD (primera de ${projName})`, unitsRaw[0]);

        // Buscar una unidad tipo APARTAMENTO para ver sus campos
        const aptoSample = unitsRaw.find((u: any) =>
          u.idTipoUnidad === 2 || (u.tipoUnidad && String(u.tipoUnidad).toUpperCase().includes('APART'))
        );
        if (aptoSample && aptoSample !== unitsRaw[0]) {
          printAllFields('EJEMPLO APARTAMENTO', aptoSample);
        }

        // Valores únicos de campos clave para entender nomenclatura
        const uniqueTipoUnidad = [...new Set(unitsRaw.map((u: any) => u.tipoUnidad).filter(Boolean))];
        const uniqueTipoInmueble = [...new Set(unitsRaw.map((u: any) => u.tipoInmueble).filter(Boolean))];
        const uniqueEstado = [...new Set(unitsRaw.map((u: any) => u.estado).filter(Boolean))];
        const uniqueClasificacion = [...new Set(unitsRaw.map((u: any) => u.clasificacion).filter(Boolean))];

        console.log(`\n   VALORES ÚNICOS en ${projName}:`);
        console.log(`   tipoUnidad:     ${uniqueTipoUnidad.join(', ') || '(vacío)'}`);
        console.log(`   tipoInmueble:   ${uniqueTipoInmueble.join(', ') || '(vacío)'}`);
        console.log(`   estado:         ${uniqueEstado.join(', ') || '(vacío)'}`);
        console.log(`   clasificacion:  ${uniqueClasificacion.join(', ') || '(vacío)'}`);

        // Buscar CUALQUIER campo que suene a tipología
        const firstUnit = unitsRaw[0];
        const tipologyCandidate = Object.keys(firstUnit).filter((k) => {
          const lower = k.toLowerCase();
          return lower.includes('tipo') || lower.includes('clasif') || lower.includes('categ') ||
                 lower.includes('model') || lower.includes('refer') || lower.includes('grupo') ||
                 lower.includes('nomencla') || lower.includes('esquema');
        });
        if (tipologyCandidate.length > 0) {
          console.log(`\n   🔍 CAMPOS QUE PODRÍAN SER TIPOLOGÍA:`);
          for (const k of tipologyCandidate) {
            const uniqueVals = [...new Set(unitsRaw.map((u: any) => u[k]).filter((v: any) => v !== null && v !== undefined))];
            console.log(`   ${k.padEnd(30)} ${uniqueVals.length} valores únicos: ${uniqueVals.slice(0, 10).join(', ')}`);
          }
        }

        projectDump.unidades = {
          totalCount: unitsRaw.length,
          fieldNames: extractFieldNames(unitsRaw[0]),
          uniqueValues: {
            tipoUnidad: uniqueTipoUnidad,
            tipoInmueble: uniqueTipoInmueble,
            estado: uniqueEstado,
            clasificacion: uniqueClasificacion,
          },
          tipologyCandidates: Object.fromEntries(
            (tipologyCandidate || []).map((k) => [
              k,
              [...new Set(unitsRaw.map((u: any) => u[k]).filter((v: any) => v !== null && v !== undefined))],
            ])
          ),
          samples: unitsRaw.slice(0, MAX_UNITS),
        };
      } else {
        console.log(`      ${unitsRaw ? '0' : 'ERROR'} unidad(es)`);
        projectDump.unidades = { totalCount: 0, error: unitsRaw === null ? 'API error' : 'empty' };
      }

      allProjectsDump.push(projectDump);
    }
  }

  dump.proyectos = allProjectsDump;

  // ── Write output ──
  const today = new Date().toISOString().slice(0, 10);
  const outputDir = resolve(dirname(new URL(import.meta.url).pathname), 'output');
  const outputPath = resolve(outputDir, `sinco-raw-dump-${today}.json`);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(dump, null, 2), 'utf-8');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  ✅ Dump completo → ${outputPath}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
