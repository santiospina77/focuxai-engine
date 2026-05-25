#!/usr/bin/env node
/**
 * retry-failed-agrupaciones.ts
 *
 * Script quirúrgico de recuperación: detecta agrupaciones faltantes en HubSpot DEMO
 * y las crea via API directa (bypasea adapter).
 *
 * Flujo:
 *   1. Leer discovery JSON (mismo del sync principal)
 *   2. Validar schema HubSpot para agrupacion (Phase 0 mínimo)
 *   3. Prefetch agrupaciones existentes por id_sinco_fx
 *   4. Calcular missing = discovery.agrupaciones - existing
 *   5. Dry-run summary
 *   6. En apply: batch create 10 + fallback individual + error exacto
 *   7. Crear asociaciones solo para agrupaciones creadas
 *   8. Escribir audit JSON
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/retry-failed-agrupaciones.ts --portal=demo
 *   node --env-file=.env.local --import tsx scripts/retry-failed-agrupaciones.ts --portal=demo --apply
 *
 * Scope:
 *   - Solo agrupaciones faltantes
 *   - No toca records existentes
 *   - No updates
 *   - No prod
 *   - Dry-run por defecto
 *
 * FocuxAI Engine™ — Focux Digital Group S.A.S.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

// ════════════════════════════════════════════════════════════════
// Portal config (solo DEMO)
// ════════════════════════════════════════════════════════════════

interface PortalConfig {
  name: string;
  portalId: string;
  tokenEnvVar: string;
  objectTypeIds: Record<string, string>;
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
    tokenEnvVar: 'HUBSPOT_JIMENEZ_PRIVATE_APP_TOKEN',
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
const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1];

if (!portalKey || !PORTALS[portalKey]) {
  console.error('❌ --portal=demo es obligatorio');
  console.error('   Ejemplo: node --env-file=.env.local --import tsx scripts/retry-failed-agrupaciones.ts --portal=demo');
  process.exit(1);
}

const portal = PORTALS[portalKey]!;

if (portal.blocked) {
  console.error(`❌ Portal "${portal.name}" está BLOQUEADO.`);
  process.exit(1);
}

const token = process.env[portal.tokenEnvVar];
if (!token) {
  console.error(`❌ Token no encontrado: ${portal.tokenEnvVar}`);
  process.exit(1);
}

const AGRUPACION_TYPE_ID = portal.objectTypeIds.agrupacion!;

// ════════════════════════════════════════════════════════════════
// Torres entregadas — NO sincronizar
// ════════════════════════════════════════════════════════════════

const TORRES_ENTREGADAS_SINCO_IDS = new Set([296, 313, 321, 329]);

// ════════════════════════════════════════════════════════════════
// Property mapping (exacto del sync principal)
// ════════════════════════════════════════════════════════════════

interface PropMapping {
  discoveryField: string;
  hubspotProp: string;
  critical: boolean;
}

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

const CRITICAL_PROPS = AGRUPACION_PROPS.filter(p => p.critical).map(p => p.hubspotProp);

// ════════════════════════════════════════════════════════════════
// Association configs (USER_DEFINED, direct API)
// ════════════════════════════════════════════════════════════════

interface AssociationTypeConfig {
  fromTypeId: string;
  toTypeId: string;
  typeId: number;
  category: 'USER_DEFINED';
  label: string;
}

const ASSOCIATION_TYPES: Record<string, AssociationTypeConfig> = {
  proyectoAgrupacion: {
    fromTypeId: portal.objectTypeIds.proyecto!,
    toTypeId: portal.objectTypeIds.agrupacion!,
    typeId: 185,
    category: 'USER_DEFINED',
    label: 'Proyecto a Agrupación',
  },
  agrupacionUnidad: {
    fromTypeId: portal.objectTypeIds.agrupacion!,
    toTypeId: portal.objectTypeIds.unidad!,
    typeId: 189,
    category: 'USER_DEFINED',
    label: 'Agrupación a Unidad',
  },
};

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const ENUM_FIELDS = new Set(['estado_fx', 'clasificacion_fx', 'tipo_fx', 'tipo_venta_fx', 'tipo_unidad_fx']);

function clean(props: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === '' || (typeof value === 'number' && isNaN(value))) {
      continue;
    }
    if (key.startsWith('fecha_') && typeof value === 'string' && value.includes('T')) {
      result[key] = value.slice(0, 10);
      continue;
    }
    if (ENUM_FIELDS.has(key) && typeof value === 'string') {
      result[key] = value.toLowerCase();
      continue;
    }
    if (typeof value === 'boolean') {
      result[key] = value ? 'true' : 'false';
      continue;
    }
    result[key] = String(value);
  }
  return result;
}

function buildProps(
  record: Record<string, unknown>,
  propMap: PropMapping[],
  validatedProps: Set<string>,
): Record<string, string> {
  const raw: Record<string, unknown> = {};
  for (const mapping of propMap) {
    if (!validatedProps.has(mapping.hubspotProp)) continue;
    const value = record[mapping.discoveryField];
    if (value !== undefined) {
      raw[mapping.hubspotProp] = value;
    }
  }
  return clean(raw);
}

// ════════════════════════════════════════════════════════════════
// HubSpot API helpers (direct, no adapter)
// ════════════════════════════════════════════════════════════════

async function hubspotGet(url: string): Promise<any> {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GET ${url}: HTTP ${resp.status} — ${body.slice(0, 300)}`);
  }
  return resp.json();
}

async function hubspotPost(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// ── Phase 0: Validate schema ──

async function validateSchema(validatedProps: Set<string>): Promise<{ missing: string[]; criticalMissing: string[] }> {
  console.log('\n━━━ Phase 0: Validar schema HubSpot para agrupacion ━━━');

  const data = await hubspotGet(
    `https://api.hubapi.com/crm/v3/properties/${AGRUPACION_TYPE_ID}`
  );
  const existingProps = new Set((data.results as any[]).map((p: any) => p.name));

  const missing: string[] = [];
  const criticalMissing: string[] = [];

  for (const mapping of AGRUPACION_PROPS) {
    if (existingProps.has(mapping.hubspotProp)) {
      validatedProps.add(mapping.hubspotProp);
    } else {
      missing.push(mapping.hubspotProp);
      if (mapping.critical) {
        criticalMissing.push(mapping.hubspotProp);
      }
    }
  }

  console.log(`   Props validadas: ${validatedProps.size}/${AGRUPACION_PROPS.length}`);
  if (missing.length > 0) console.log(`   Missing: ${missing.join(', ')}`);
  if (criticalMissing.length > 0) console.error(`   ❌ CRITICAL MISSING: ${criticalMissing.join(', ')}`);

  return { missing, criticalMissing };
}

// ── Prefetch existing agrupaciones ──

async function prefetchExistingAgrupaciones(): Promise<Map<number, { id: string; properties: Record<string, string> }>> {
  console.log('\n━━━ Prefetch: Agrupaciones existentes en HubSpot ━━━');
  const map = new Map<number, { id: string; properties: Record<string, string> }>();
  let after: string | undefined;
  let pageCount = 0;

  do {
    const body: any = {
      filterGroups: [{ filters: [{ propertyName: 'id_sinco_fx', operator: 'GTE', value: '1' }] }],
      properties: ['id_sinco_fx', 'nombre_fx', 'id_proyecto_sinco_fx'],
      limit: 100,
    };
    if (after) body.after = after;

    const resp = await hubspotPost(
      `https://api.hubapi.com/crm/v3/objects/${AGRUPACION_TYPE_ID}/search`,
      body,
    );

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.error(`   ⚠️ Error prefetch page ${pageCount + 1}: HTTP ${resp.status} — ${errBody.slice(0, 200)}`);
      break;
    }

    const data = await resp.json() as any;

    for (const record of data.results ?? []) {
      const sincoId = parseInt(record.properties?.id_sinco_fx);
      if (!isNaN(sincoId)) {
        map.set(sincoId, {
          id: record.id,
          properties: record.properties ?? {},
        });
      }
    }

    after = data.paging?.next?.after;
    pageCount++;

    if (after) await sleep(260); // rate limit: search = 4 req/s
  } while (after && pageCount < 120);

  console.log(`   Total agrupaciones en HubSpot: ${map.size}`);
  return map;
}

// ── Prefetch existing proyectos (for association lookup) ──

async function prefetchExistingProyectos(): Promise<Map<number, string>> {
  console.log('\n━━━ Prefetch: Proyectos existentes en HubSpot ━━━');
  const map = new Map<number, string>();
  let after: string | undefined;
  let pageCount = 0;

  do {
    const body: any = {
      filterGroups: [{ filters: [{ propertyName: 'id_sinco_fx', operator: 'GTE', value: '1' }] }],
      properties: ['id_sinco_fx'],
      limit: 100,
    };
    if (after) body.after = after;

    const resp = await hubspotPost(
      `https://api.hubapi.com/crm/v3/objects/${portal.objectTypeIds.proyecto}/search`,
      body,
    );

    if (!resp.ok) break;
    const data = await resp.json() as any;

    for (const record of data.results ?? []) {
      const sincoId = parseInt(record.properties?.id_sinco_fx);
      if (!isNaN(sincoId)) map.set(sincoId, record.id);
    }

    after = data.paging?.next?.after;
    pageCount++;
    if (after) await sleep(260);
  } while (after && pageCount < 20);

  console.log(`   Total proyectos en HubSpot: ${map.size}`);
  return map;
}

// ── Prefetch existing unidades (for agrupacion→unidad associations) ──

async function prefetchExistingUnidades(): Promise<Map<number, string>> {
  console.log('\n━━━ Prefetch: Unidades existentes en HubSpot ━━━');
  const map = new Map<number, string>();
  let after: string | undefined;
  let pageCount = 0;

  do {
    const body: any = {
      filterGroups: [{ filters: [{ propertyName: 'id_sinco_fx', operator: 'GTE', value: '1' }] }],
      properties: ['id_sinco_fx'],
      limit: 100,
    };
    if (after) body.after = after;

    const resp = await hubspotPost(
      `https://api.hubapi.com/crm/v3/objects/${portal.objectTypeIds.unidad}/search`,
      body,
    );

    if (!resp.ok) break;
    const data = await resp.json() as any;

    for (const record of data.results ?? []) {
      const sincoId = parseInt(record.properties?.id_sinco_fx);
      if (!isNaN(sincoId)) map.set(sincoId, record.id);
    }

    after = data.paging?.next?.after;
    pageCount++;
    if (after) await sleep(260);
  } while (after && pageCount < 120);

  console.log(`   Total unidades en HubSpot: ${map.size}`);
  return map;
}

// ── Batch create agrupaciones (direct API, chunks of 10) ──

interface FailedDetail {
  idSinco: number;
  nombre: string;
  hubspotStatus: number;
  hubspotMessage: string;
  propertiesAttempted: string[];
}

async function batchCreateAgrupaciones(
  records: Array<{ sincoId: number; nombre: string; properties: Record<string, string> }>,
): Promise<{ created: Map<number, string>; failed: FailedDetail[] }> {
  const created = new Map<number, string>(); // sincoId → hubspotId
  const failed: FailedDetail[] = [];
  const BATCH_SIZE = 10;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const chunkNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalChunks = Math.ceil(records.length / BATCH_SIZE);

    console.log(`   📦 Chunk ${chunkNum}/${totalChunks} (${chunk.length} records)...`);

    const inputs = chunk.map(r => ({ properties: r.properties }));

    const resp = await hubspotPost(
      `https://api.hubapi.com/crm/v3/objects/${AGRUPACION_TYPE_ID}/batch/create`,
      { inputs },
    );

    if (resp.ok) {
      const data = await resp.json() as any;
      const results = data.results ?? [];

      for (const result of results) {
        const sincoId = parseInt(result.properties?.id_sinco_fx);
        if (!isNaN(sincoId)) {
          created.set(sincoId, result.id);
        }
      }

      // Check for partial failures in response
      if (data.errors?.length > 0) {
        console.warn(`      ⚠️ Chunk ${chunkNum}: ${data.errors.length} errores parciales`);
        // Partial errors don't tell us which specific records failed easily
        // Log what we can
        for (const err of data.errors) {
          console.warn(`         ${JSON.stringify(err).slice(0, 200)}`);
        }
      }

      console.log(`      ✅ ${results.length} creados`);
    } else {
      // ── Batch failed — fallback individual ──
      const errBody = await resp.text().catch(() => '');
      console.warn(`      ❌ Chunk ${chunkNum} falló (HTTP ${resp.status}). Fallback individual...`);
      console.warn(`         Response: ${errBody.slice(0, 200)}`);

      for (const record of chunk) {
        const singleResp = await hubspotPost(
          `https://api.hubapi.com/crm/v3/objects/${AGRUPACION_TYPE_ID}`,
          { properties: record.properties },
        );

        if (singleResp.ok) {
          const singleData = await singleResp.json() as any;
          created.set(record.sincoId, singleData.id);
          console.log(`         ✅ ${record.nombre} (idSinco=${record.sincoId}) → ${singleData.id}`);
        } else {
          const singleErr = await singleResp.text().catch(() => '');
          let hubspotMessage = singleErr.slice(0, 500);
          try {
            const parsed = JSON.parse(singleErr);
            hubspotMessage = parsed.message || parsed.errors?.[0]?.message || singleErr.slice(0, 500);
          } catch {}

          failed.push({
            idSinco: record.sincoId,
            nombre: record.nombre,
            hubspotStatus: singleResp.status,
            hubspotMessage,
            propertiesAttempted: Object.keys(record.properties),
          });
          console.error(`         ❌ ${record.nombre} (idSinco=${record.sincoId}): HTTP ${singleResp.status} — ${hubspotMessage.slice(0, 150)}`);
        }

        await sleep(120); // rate limit individual creates
      }
    }

    await sleep(300); // rate limit between chunks
  }

  return { created, failed };
}

// ── Create associations (direct API) ──

async function createAssociations(
  config: AssociationTypeConfig,
  pairs: Array<{ fromId: string; toId: string }>,
  label: string,
): Promise<{ successful: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let successful = 0;
  let failed = 0;

  if (pairs.length === 0) return { successful, failed, errors };

  console.log(`   📦 ${label}: ${pairs.length} asociaciones...`);

  // Chunks of 100 for associations
  for (let i = 0; i < pairs.length; i += 100) {
    const chunk = pairs.slice(i, i + 100);
    const body = {
      inputs: chunk.map(p => ({
        from: { id: p.fromId },
        to: { id: p.toId },
        types: [{ associationCategory: config.category, associationTypeId: config.typeId }],
      })),
    };

    const resp = await hubspotPost(
      `https://api.hubapi.com/crm/v4/associations/${config.fromTypeId}/${config.toTypeId}/batch/create`,
      body,
    );

    if (resp.status === 200 || resp.status === 201) {
      successful += chunk.length;
    } else {
      const data = await resp.json().catch(() => ({}));
      failed += chunk.length;
      errors.push(`Batch ${Math.floor(i / 100) + 1}: HTTP ${resp.status} — ${JSON.stringify(data).slice(0, 300)}`);
    }

    await sleep(200);
  }

  console.log(`      ✅ ${successful} creadas, ${failed} fallaron`);
  return { successful, failed, errors };
}

// ════════════════════════════════════════════════════════════════
// Discovery JSON loader
// ════════════════════════════════════════════════════════════════

function resolveDiscoveryFile(): string {
  if (fileArg) return resolve(fileArg);

  const outputDir = resolve(dirname(new URL(import.meta.url).pathname), 'output');
  const files = readdirSync(outputDir)
    .filter(f => f.startsWith('sinco-discovery-') && f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('❌ No se encontró archivo de discovery en scripts/output/');
    process.exit(1);
  }

  return resolve(outputDir, files[0]!);
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FocuxAI Engine™ — Retry Agrupaciones Faltantes');
  console.log(`  Portal:  ${portal.name} (${portal.portalId})`);
  console.log(`  Mode:    ${applyMode ? '⚡ APPLY' : '🔍 DRY-RUN'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Load discovery JSON ──
  const discoveryPath = resolveDiscoveryFile();
  console.log(`📂 Discovery: ${discoveryPath}`);
  const rawJson = readFileSync(discoveryPath, 'utf-8');
  const discovery = JSON.parse(rawJson);

  const allAgrupaciones: any[] = discovery.agrupaciones ?? [];
  console.log(`   Total agrupaciones en discovery: ${allAgrupaciones.length}`);

  // Build project entregada set
  const entregadaProjectIds = new Set(
    (discovery.proyectosDetalle ?? [])
      .filter((p: any) => p.esEntregada)
      .map((p: any) => p.idSinco)
  );
  console.log(`   Torres entregadas: ${[...entregadaProjectIds].join(', ')} (${entregadaProjectIds.size})`);

  // Filter: only non-entregada agrupaciones
  const syncableAgrupaciones = allAgrupaciones.filter(
    (a: any) => !entregadaProjectIds.has(a.idProyectoSinco)
  );
  console.log(`   Agrupaciones sincronizables (excl. entregadas): ${syncableAgrupaciones.length}`);

  // ── 2. Phase 0: Validate schema ──
  const validatedProps = new Set<string>();
  const schema = await validateSchema(validatedProps);

  if (schema.criticalMissing.length > 0) {
    console.error('\n❌ ABORT: Propiedades críticas faltan en HubSpot. No se puede continuar.');
    process.exit(1);
  }

  // ── 3. Prefetch existing ──
  const existingAgrupaciones = await prefetchExistingAgrupaciones();
  const existingProyectos = await prefetchExistingProyectos();
  const existingUnidades = await prefetchExistingUnidades();

  // ── 4. Calculate missing ──
  const missingAgrupaciones: any[] = [];
  const alreadyExists: number[] = [];

  for (const agrup of syncableAgrupaciones) {
    if (existingAgrupaciones.has(agrup.idSinco)) {
      alreadyExists.push(agrup.idSinco);
    } else {
      missingAgrupaciones.push(agrup);
    }
  }

  console.log('\n━━━ Análisis de faltantes ━━━');
  console.log(`   Esperadas (sincronizables): ${syncableAgrupaciones.length}`);
  console.log(`   Existentes en HubSpot:      ${alreadyExists.length}`);
  console.log(`   ❌ Faltantes:               ${missingAgrupaciones.length}`);

  if (missingAgrupaciones.length === 0) {
    console.log('\n✅ No hay agrupaciones faltantes. Nada que hacer.');
    process.exit(0);
  }

  // Show distribution by project
  const byProject = new Map<number, number>();
  for (const a of missingAgrupaciones) {
    byProject.set(a.idProyectoSinco, (byProject.get(a.idProyectoSinco) ?? 0) + 1);
  }
  console.log('\n   Faltantes por proyecto:');
  for (const [projId, count] of [...byProject.entries()].sort((a, b) => b[1] - a[1])) {
    const projName = (discovery.proyectosDetalle ?? []).find((p: any) => p.idSinco === projId)?.nombre ?? '?';
    const hsId = existingProyectos.get(projId) ?? '❌ NO EXISTE';
    console.log(`      Proyecto ${projId} (${projName}) → ${count} faltantes [HubSpot: ${hsId}]`);
  }

  // ── Build props for missing ──
  const createQueue: Array<{ sincoId: number; nombre: string; properties: Record<string, string> }> = [];

  for (const agrup of missingAgrupaciones) {
    const props = buildProps(agrup, AGRUPACION_PROPS, validatedProps);
    createQueue.push({
      sincoId: agrup.idSinco,
      nombre: agrup.nombre,
      properties: props,
    });
  }

  // ── Associations prep ──
  // Discovery agrupaciones have unidadesSincoIds[]
  const proyAgrupPairs: Array<{ sincoId: number; fromSincoId: number }> = [];
  const agrupUnidadPairs: Array<{ agrupSincoId: number; unidadSincoIds: number[] }> = [];

  for (const agrup of missingAgrupaciones) {
    proyAgrupPairs.push({ sincoId: agrup.idSinco, fromSincoId: agrup.idProyectoSinco });
    if (agrup.unidadesSincoIds?.length > 0) {
      agrupUnidadPairs.push({ agrupSincoId: agrup.idSinco, unidadSincoIds: agrup.unidadesSincoIds });
    }
  }

  console.log(`\n   Asociaciones planeadas:`);
  console.log(`      proyecto→agrupacion: ${proyAgrupPairs.length}`);
  console.log(`      agrupacion→unidad:   ${agrupUnidadPairs.reduce((sum, a) => sum + a.unidadSincoIds.length, 0)}`);

  // ── Dry-run summary ──
  if (!applyMode) {
    console.log('\n════════════════════════════════════════════════════');
    console.log('  🔍 DRY-RUN SUMMARY');
    console.log('════════════════════════════════════════════════════');
    console.log(`  Agrupaciones a crear:        ${createQueue.length}`);
    console.log(`  Batch size:                  10 (con fallback individual)`);
    console.log(`  Asociaciones proy→agrup:     ${proyAgrupPairs.length}`);
    console.log(`  Asociaciones agrup→unidad:   ${agrupUnidadPairs.reduce((sum, a) => sum + a.unidadSincoIds.length, 0)}`);
    console.log(`\n  ℹ️  Para aplicar: agregar --apply`);
    process.exit(0);
  }

  // ══════════════════════════════════════════════
  // APPLY MODE
  // ══════════════════════════════════════════════

  console.log('\n━━━ APPLY: Creando agrupaciones faltantes ━━━');

  const { created, failed } = await batchCreateAgrupaciones(createQueue);

  console.log(`\n   Resultado:`);
  console.log(`      Creadas:  ${created.size}`);
  console.log(`      Fallaron: ${failed.length}`);

  // ── Associations ──
  if (created.size > 0) {
    console.log('\n━━━ APPLY: Creando asociaciones ━━━');

    // proyecto→agrupacion
    const proyAgrupHsPairs: Array<{ fromId: string; toId: string }> = [];
    let proyAgrupSkipped = 0;

    for (const pair of proyAgrupPairs) {
      const agrupHsId = created.get(pair.sincoId);
      const proyHsId = existingProyectos.get(pair.fromSincoId);

      if (!agrupHsId) continue; // Not created (failed)
      if (!proyHsId) {
        console.warn(`      ⚠️ Skip proyecto→agrup: proyecto ${pair.fromSincoId} no existe en HubSpot`);
        proyAgrupSkipped++;
        continue;
      }

      proyAgrupHsPairs.push({ fromId: proyHsId, toId: agrupHsId });
    }

    const proyAgrupResult = await createAssociations(
      ASSOCIATION_TYPES.proyectoAgrupacion!,
      proyAgrupHsPairs,
      'proyecto→agrupacion',
    );

    // agrupacion→unidad
    const agrupUnidadHsPairs: Array<{ fromId: string; toId: string }> = [];
    let agrupUnidadSkipped = 0;

    for (const pair of agrupUnidadPairs) {
      const agrupHsId = created.get(pair.agrupSincoId);
      if (!agrupHsId) continue; // Not created

      for (const unidadSincoId of pair.unidadSincoIds) {
        const unidadHsId = existingUnidades.get(unidadSincoId);
        if (!unidadHsId) {
          console.warn(`      ⚠️ Skip agrup→unidad: unidad ${unidadSincoId} no existe en HubSpot`);
          agrupUnidadSkipped++;
          continue;
        }
        agrupUnidadHsPairs.push({ fromId: agrupHsId, toId: unidadHsId });
      }
    }

    const agrupUnidadResult = await createAssociations(
      ASSOCIATION_TYPES.agrupacionUnidad!,
      agrupUnidadHsPairs,
      'agrupacion→unidad',
    );

    console.log(`\n   Asociaciones resumen:`);
    console.log(`      proyecto→agrupacion: ${proyAgrupResult.successful} ok, ${proyAgrupResult.failed} failed, ${proyAgrupSkipped} skipped`);
    console.log(`      agrupacion→unidad:   ${agrupUnidadResult.successful} ok, ${agrupUnidadResult.failed} failed, ${agrupUnidadSkipped} skipped`);

    // ── Audit JSON ──
    const audit = {
      script: 'retry-failed-agrupaciones.ts',
      portal: portalKey,
      portalId: portal.portalId,
      executedAt: new Date().toISOString(),
      discoveryFile: discoveryPath,
      expected: syncableAgrupaciones.length,
      existing: alreadyExists.length,
      missing: missingAgrupaciones.length,
      created: created.size,
      failed: failed.length,
      failedDetails: failed,
      associations: {
        proyectoAgrupacion: {
          created: proyAgrupResult.successful,
          failed: proyAgrupResult.failed,
          skipped: proyAgrupSkipped,
          errors: proyAgrupResult.errors,
        },
        agrupacionUnidad: {
          created: agrupUnidadResult.successful,
          failed: agrupUnidadResult.failed,
          skipped: agrupUnidadSkipped,
          errors: agrupUnidadResult.errors,
        },
      },
      createdRecords: [...created.entries()].map(([sincoId, hsId]) => ({ sincoId, hubspotId: hsId })),
    };

    const outputDir = resolve(dirname(new URL(import.meta.url).pathname), 'output');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    const auditPath = resolve(outputDir, `retry-agrupaciones-${portalKey}-${Date.now()}.json`);
    writeFileSync(auditPath, JSON.stringify(audit, null, 2));
    console.log(`\n📄 Audit JSON: ${auditPath}`);
  } else {
    console.log('\n⚠️ No se crearon agrupaciones, no se crean asociaciones.');

    // Still write audit for failed
    const audit = {
      script: 'retry-failed-agrupaciones.ts',
      portal: portalKey,
      portalId: portal.portalId,
      executedAt: new Date().toISOString(),
      discoveryFile: discoveryPath,
      expected: syncableAgrupaciones.length,
      existing: alreadyExists.length,
      missing: missingAgrupaciones.length,
      created: 0,
      failed: failed.length,
      failedDetails: failed,
      associations: {},
      createdRecords: [],
    };

    const outputDir = resolve(dirname(new URL(import.meta.url).pathname), 'output');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    const auditPath = resolve(outputDir, `retry-agrupaciones-${portalKey}-${Date.now()}.json`);
    writeFileSync(auditPath, JSON.stringify(audit, null, 2));
    console.log(`\n📄 Audit JSON: ${auditPath}`);
  }

  console.log('\n✅ Completado.');
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
