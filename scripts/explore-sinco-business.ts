#!/usr/bin/env node
/**
 * Explore Sinco Business Endpoints — Raw dump de TODA la capa de negocio.
 *
 * Escanea compradores, vendedores, catálogos, medios publicitarios,
 * entidades financieras, tipos de identificación, y todo lo que Sinco
 * tenga en su módulo de ventas/CRM.
 *
 * Uso:
 *   npm run explore:sinco
 *
 * Output:
 *   scripts/output/sinco-business-dump-{date}.json
 *   + imprime todos los campos por entidad en consola
 *
 * FocuxAI Engine™ — Focux Digital Group S.A.S.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import { ConsoleLogger } from '@/engine/core/logging/Logger';
import { SincoAuthManager } from '@/engine/connectors/erp/sinco/SincoAuthManager';
import { SincoHttpClient } from '@/engine/connectors/erp/sinco/SincoHttpClient';

// ── Config ──────────────────────────────────────────────────
const CLIENT_ID = 'jimenez_demo';
const CBR_API_BASE = '/CBRClientes/API';
const THROTTLE_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    console.log(`   ${key.padEnd(40)} ${val}`);
  }
  console.log('   ' + '─'.repeat(76));
}

function printArraySummary(label: string, data: any[]) {
  console.log(`\n   📊 ${label}: ${data.length} registros`);
  if (data.length > 0) {
    printAllFields(`Ejemplo (primer registro)`, data[0]);
    if (data.length <= 20) {
      console.log(`\n   Todos los registros:`);
      for (const item of data) {
        const id = item.id ?? item.Id ?? item.codigo ?? '?';
        const nombre = item.nombre ?? item.Nombre ?? item.descripcion ?? item.Descripcion ?? JSON.stringify(item).slice(0, 80);
        console.log(`   ${String(id).padEnd(8)} ${nombre}`);
      }
    }
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FocuxAI Engine™ — Exploración Endpoints de Negocio Sinco');
  console.log('═══════════════════════════════════════════════════════════\n');

  const logger = new ConsoleLogger({ service: 'explore-business' }, 'info');

  const username = process.env.SINCO_JIMENEZ_DEMO_USERNAME;
  const password = process.env.SINCO_JIMENEZ_DEMO_PASSWORD;
  if (!username || !password) {
    console.error('❌ Faltan env vars SINCO_JIMENEZ_DEMO_USERNAME / PASSWORD');
    process.exit(1);
  }

  const baseUrl = 'https://www3.sincoerp.com/SincoJimenez_Nueva/V3';

  const http = new SincoHttpClient(logger, { baseUrl, clientId: CLIENT_ID });
  const auth = new SincoAuthManager(http, {
    baseUrl, username, password,
    idOrigen: 1, idEmpresa: 1, idSucursal: 0,
  }, logger);

  const tokenResult = await auth.getToken();
  if (tokenResult.isErr()) {
    console.error('❌ Auth failed:', tokenResult.error.message);
    process.exit(1);
  }
  const token = tokenResult.value;
  console.log('✅ Autenticado\n');

  // Helper para GET crudo
  async function rawGet(subpath: string, label: string): Promise<unknown> {
    await sleep(THROTTLE_MS);
    console.log(`\n📡 ${label}`);
    console.log(`   GET ${CBR_API_BASE}${subpath}`);

    const result = await http.request({
      method: 'GET',
      path: `${CBR_API_BASE}${subpath}`,
      token,
      operation: `explore.${label}`,
    });

    if (result.isErr()) {
      const code = result.error.code;
      const status = (result.error as any).context?.httpStatus ?? 'unknown';
      console.log(`   ❌ Error: ${code} (HTTP ${status})`);

      // Intentar extraer body del error
      const errBody = (result.error as any).context?.body;
      if (errBody) {
        const bodyStr = typeof errBody === 'string' ? errBody : JSON.stringify(errBody);
        console.log(`   Body: ${bodyStr.slice(0, 200)}`);
      }
      return null;
    }
    return result.value.body;
  }

  const dump: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    clientId: CLIENT_ID,
    baseUrl,
  };

  // ═══════════════════════════════════════════════════════════
  // 1. VENDEDORES
  // ═══════════════════════════════════════════════════════════
  const vendedores = await rawGet('/SalaVentas/Vendedores', 'VENDEDORES') as any[] | null;
  if (vendedores) {
    printArraySummary('Vendedores', vendedores);
    dump.vendedores = { count: vendedores.length, fieldNames: vendedores.length > 0 ? extractFieldNames(vendedores[0]) : [], data: vendedores };
  }

  // ═══════════════════════════════════════════════════════════
  // 2. CONCEPTOS PLAN DE PAGOS
  // ═══════════════════════════════════════════════════════════
  const conceptos = await rawGet('/Ventas/ConceptoPlanDePagos', 'CONCEPTOS PLAN DE PAGOS') as any[] | null;
  if (conceptos) {
    printArraySummary('Conceptos Plan Pagos', conceptos);
    dump.conceptosPlanPagos = { count: conceptos.length, fieldNames: conceptos.length > 0 ? extractFieldNames(conceptos[0]) : [], data: conceptos };
  }

  // ═══════════════════════════════════════════════════════════
  // 3. TIPOS DE IDENTIFICACIÓN
  // ═══════════════════════════════════════════════════════════
  const tiposId = await rawGet('/TiposIdentificacion', 'TIPOS DE IDENTIFICACIÓN') as any[] | null;
  if (tiposId) {
    printArraySummary('Tipos Identificación', tiposId);
    dump.tiposIdentificacion = { count: tiposId.length, data: tiposId };
  }

  // ═══════════════════════════════════════════════════════════
  // 4. MEDIOS PUBLICITARIOS
  // ═══════════════════════════════════════════════════════════
  const medios = await rawGet('/SalaVentas/MediosPublicitarios', 'MEDIOS PUBLICITARIOS') as any[] | null;
  if (medios) {
    printArraySummary('Medios Publicitarios', medios);
    dump.mediosPublicitarios = { count: medios.length, data: medios };
  }

  // ═══════════════════════════════════════════════════════════
  // 5. ENTIDADES FINANCIERAS
  // ═══════════════════════════════════════════════════════════
  const entidades = await rawGet('/EntidadesFinancieras', 'ENTIDADES FINANCIERAS') as any[] | null;
  if (entidades) {
    printArraySummary('Entidades Financieras', entidades);
    dump.entidadesFinancieras = { count: entidades.length, data: entidades };
  }

  // ═══════════════════════════════════════════════════════════
  // 6. ESTADOS CIVILES
  // ═══════════════════════════════════════════════════════════
  const estadosCiviles = await rawGet('/EstadosCiviles', 'ESTADOS CIVILES') as any[] | null;
  if (estadosCiviles) {
    printArraySummary('Estados Civiles', estadosCiviles);
    dump.estadosCiviles = { count: estadosCiviles.length, data: estadosCiviles };
  }

  // ═══════════════════════════════════════════════════════════
  // 7. TIPO INMUEBLE (global)
  // ═══════════════════════════════════════════════════════════
  const tipoInmueble = await rawGet('/TipoInmueble', 'TIPO INMUEBLE (global)') as any[] | null;
  if (tipoInmueble) {
    printArraySummary('Tipo Inmueble', tipoInmueble);
    dump.tipoInmueble = { count: tipoInmueble.length, data: tipoInmueble };
  }

  // ═══════════════════════════════════════════════════════════
  // 7b. TIPO INMUEBLE por proyecto (Porto Sabbia Suite = 361)
  // ═══════════════════════════════════════════════════════════
  const tipoInmuebleProy = await rawGet('/TipoInmueble/IdProyecto/361', 'TIPO INMUEBLE (Proyecto 361)') as any[] | null;
  if (tipoInmuebleProy) {
    printArraySummary('Tipo Inmueble Proyecto 361', tipoInmuebleProy);
    dump.tipoInmuebleProyecto361 = { count: tipoInmuebleProy.length, data: tipoInmuebleProy };
  }

  // ═══════════════════════════════════════════════════════════
  // 8. TIPO UNIDAD
  // ═══════════════════════════════════════════════════════════
  const tipoUnidad = await rawGet('/TipoUnidad', 'TIPO UNIDAD') as any[] | null;
  if (tipoUnidad) {
    printArraySummary('Tipo Unidad', tipoUnidad);
    dump.tipoUnidad = { count: tipoUnidad.length, data: tipoUnidad };
  }

  // ═══════════════════════════════════════════════════════════
  // 9. PAISES
  // ═══════════════════════════════════════════════════════════
  const paises = await rawGet('/Paises', 'PAISES') as any[] | null;
  if (paises) {
    printArraySummary('Paises', paises);
    dump.paises = { count: paises.length, data: paises.slice(0, 10) }; // solo primeros 10
  }

  // ═══════════════════════════════════════════════════════════
  // 10. CIUDADES (solo Colombia = probable ID 1)
  // ═══════════════════════════════════════════════════════════
  const ciudades = await rawGet('/Ciudades', 'CIUDADES') as any[] | null;
  if (ciudades) {
    console.log(`   📊 Ciudades: ${ciudades.length} registros`);
    if (ciudades.length > 0) {
      printAllFields('Ejemplo ciudad', ciudades[0]);
      // Buscar Santa Marta
      const staMarta = ciudades.find((c: any) =>
        (c.nombre ?? c.Nombre ?? '').toLowerCase().includes('santa marta') ||
        (c.nombre ?? c.Nombre ?? '').toLowerCase().includes('santamarta')
      );
      if (staMarta) console.log(`   🎯 Santa Marta encontrada: ${JSON.stringify(staMarta)}`);
    }
    dump.ciudades = { count: ciudades.length, sample: ciudades.slice(0, 5) };
  }

  // ═══════════════════════════════════════════════════════════
  // 11. OCUPACIONES
  // ═══════════════════════════════════════════════════════════
  const ocupaciones = await rawGet('/Ocupaciones', 'OCUPACIONES') as any[] | null;
  if (ocupaciones) {
    printArraySummary('Ocupaciones', ocupaciones);
    dump.ocupaciones = { count: ocupaciones.length, data: ocupaciones };
  }

  // ═══════════════════════════════════════════════════════════
  // 12. PROFESIONES
  // ═══════════════════════════════════════════════════════════
  const profesiones = await rawGet('/Profesiones', 'PROFESIONES') as any[] | null;
  if (profesiones) {
    printArraySummary('Profesiones', profesiones);
    dump.profesiones = { count: profesiones.length, data: profesiones };
  }

  // ═══════════════════════════════════════════════════════════
  // 13. RESPONSABLE
  // ═══════════════════════════════════════════════════════════
  const responsables = await rawGet('/Responsable', 'RESPONSABLE') as any[] | null;
  if (responsables) {
    printArraySummary('Responsables', responsables);
    dump.responsables = { count: responsables.length, data: responsables };
  }

  // ═══════════════════════════════════════════════════════════
  // 14. COMPRADORES — buscar uno de ejemplo (por agrupación conocida)
  // ═══════════════════════════════════════════════════════════
  // Primero traemos una agrupación vendida para sacar el idComprador
  const agrupaciones = await rawGet('/Agrupaciones/IdProyecto/361', 'AGRUPACIONES Proy 361 (para encontrar comprador)') as any[] | null;
  if (agrupaciones) {
    const vendida = agrupaciones.find((a: any) => a.idComprador && a.idComprador > 0);
    if (vendida) {
      console.log(`\n   🎯 Agrupación vendida encontrada: id=${vendida.id}, idComprador=${vendida.idComprador}, numId="${vendida.numeroIdentificacionComprador}"`);

      // Buscar comprador por cédula
      if (vendida.numeroIdentificacionComprador) {
        const comprador = await rawGet(
          `/Compradores/NumeroIdentificacion/${encodeURIComponent(vendida.numeroIdentificacionComprador)}`,
          `COMPRADOR (cédula ${vendida.numeroIdentificacionComprador})`
        ) as any | null;
        if (comprador) {
          printAllFields('Comprador real de Sinco', comprador);
          dump.compradorEjemplo = { fieldNames: extractFieldNames(comprador), data: comprador };
        }
      }
    } else {
      console.log('\n   ⚠️ No se encontró agrupación vendida en proyecto 361 — intentando proyecto 306');
      const agrup306 = await rawGet('/Agrupaciones/IdProyecto/306', 'AGRUPACIONES Proy 306') as any[] | null;
      if (agrup306) {
        const vendida306 = agrup306.find((a: any) => a.idComprador && a.idComprador > 0);
        if (vendida306 && vendida306.numeroIdentificacionComprador) {
          console.log(`   🎯 Agrupación vendida: id=${vendida306.id}, numId="${vendida306.numeroIdentificacionComprador}"`);
          const comprador = await rawGet(
            `/Compradores/NumeroIdentificacion/${encodeURIComponent(vendida306.numeroIdentificacionComprador)}`,
            `COMPRADOR (cédula ${vendida306.numeroIdentificacionComprador})`
          ) as any | null;
          if (comprador) {
            printAllFields('Comprador real de Sinco', comprador);
            dump.compradorEjemplo = { fieldNames: extractFieldNames(comprador), data: comprador };
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 15. ENDPOINTS EXPLORATORIOS — probar rutas que podrían existir
  // ═══════════════════════════════════════════════════════════
  console.log('\n\n🔍 EXPLORACIÓN DE ENDPOINTS NO DOCUMENTADOS');
  console.log('═══════════════════════════════════════════════════════════');

  const explorePaths = [
    // Ventas
    '/Ventas',
    '/Ventas/EstadosVenta',
    '/Ventas/TiposVenta',

    // Oportunidades
    '/Oportunidades',
    '/Oportunidades/IdProyecto/361',

    // Desistimientos
    '/Desistimientos',
    '/Ventas/Desistimientos',

    // Recaudos / Cartera
    '/Recaudos',
    '/Recaudos/IdProyecto/361',
    '/Cartera',
    '/Cartera/IdProyecto/361',

    // Plan de pagos de una agrupación
    '/Ventas/PlanDePagos/IdAgrupacion/16561',

    // Bancos / cuentas
    '/Bancos',
    '/CuentasBancarias',

    // Sala de ventas extras
    '/SalaVentas',
    '/SalaVentas/Asesores',
    '/SalaVentas/Equipos',

    // Unidades — ActualizarUnidad info
    '/Unidades/Estados',
    '/EstadosUnidad',

    // Compradores — listar todos?
    '/Compradores',
    '/Compradores/IdProyecto/361',

    // Escrituras / Notarial
    '/Escrituras',
    '/Escrituracion',

    // Periodos de venta
    '/PeriodosVenta',
    '/PeriodosVenta/IdProyecto/361',
    '/Ventas/PeriodosVenta',

    // Facturación
    '/Facturas',
    '/Facturas/IdProyecto/361',

    // Genéricos
    '/Generos',
    '/Parentescos',

    // Barrios
    '/Barrios',

    // Configuraciones
    '/Configuracion',
    '/Parametros',
  ];

  const discovered: Record<string, { status: string; count?: number; fields?: string[] }> = {};

  for (const path of explorePaths) {
    await sleep(THROTTLE_MS);
    console.log(`\n   🔎 ${path}`);

    const result = await http.request({
      method: 'GET',
      path: `${CBR_API_BASE}${path}`,
      token,
      operation: `explore.${path}`,
    });

    if (result.isErr()) {
      const status = (result.error as any).context?.httpStatus ?? 'error';
      console.log(`      ❌ HTTP ${status}`);
      discovered[path] = { status: `error_${status}` };
    } else {
      const body = result.value.body;
      if (Array.isArray(body)) {
        console.log(`      ✅ Array[${body.length}]`);
        if (body.length > 0) {
          const fields = extractFieldNames(body[0]);
          console.log(`      Fields: ${fields.join(', ')}`);
          discovered[path] = { status: 'ok_array', count: body.length, fields };

          // Si es algo interesante, imprimir primer registro
          if (body.length > 0 && body.length <= 50) {
            printAllFields(`${path} — primer registro`, body[0]);
          }
        } else {
          discovered[path] = { status: 'ok_empty_array', count: 0 };
        }
      } else if (body && typeof body === 'object') {
        const fields = extractFieldNames(body as Record<string, unknown>);
        console.log(`      ✅ Object{${fields.length} keys}: ${fields.join(', ')}`);
        discovered[path] = { status: 'ok_object', fields };
        printAllFields(`${path}`, body as Record<string, unknown>);
      } else {
        console.log(`      ✅ Primitive: ${summarizeField('value', body)}`);
        discovered[path] = { status: 'ok_primitive' };
      }
    }
  }

  dump.exploredEndpoints = discovered;

  // ═══════════════════════════════════════════════════════════
  // SAVE JSON
  // ═══════════════════════════════════════════════════════════
  const outputDir = resolve(import.meta.dirname ?? '.', 'output');
  mkdirSync(outputDir, { recursive: true });
  const now = new Date().toISOString().slice(0, 10);
  const outputPath = resolve(outputDir, `sinco-business-dump-${now}.json`);
  writeFileSync(outputPath, JSON.stringify(dump, null, 2));
  console.log(`\n\n✅ Dump guardado en: ${outputPath}`);

  // ═══════════════════════════════════════════════════════════
  // RESUMEN
  // ═══════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  RESUMEN DE EXPLORACIÓN');
  console.log('═══════════════════════════════════════════════════════════');

  const okPaths = Object.entries(discovered).filter(([_, v]) => v.status.startsWith('ok'));
  const errPaths = Object.entries(discovered).filter(([_, v]) => !v.status.startsWith('ok'));

  console.log(`\n  ✅ Endpoints que respondieron (${okPaths.length}):`);
  for (const [path, info] of okPaths) {
    console.log(`     ${path.padEnd(45)} ${info.status} ${info.count != null ? `(${info.count})` : ''}`);
  }

  console.log(`\n  ❌ Endpoints que fallaron (${errPaths.length}):`);
  for (const [path, info] of errPaths) {
    console.log(`     ${path.padEnd(45)} ${info.status}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('💥 Error fatal:', e);
  process.exit(1);
});
