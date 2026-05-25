/**
 * add-estado-enum-options.ts
 *
 * Agrega opciones faltantes (reservada, escriturada) a la propiedad estado_fx
 * en los 4 Custom Objects de Jiménez, en ambos portales (DEMO + PROD).
 *
 * La API de HubSpot PATCH /properties/{objectType}/{propertyName} permite
 * enviar el array completo de options — las existentes se mantienen, las nuevas se agregan.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/add-estado-enum-options.ts --portal=demo
 *   node --env-file=.env.local --import tsx scripts/add-estado-enum-options.ts --portal=prod
 *   node --env-file=.env.local --import tsx scripts/add-estado-enum-options.ts --portal=both
 *
 * Dry-run por defecto. Agregar --apply para ejecutar.
 */

// ── Config ──
const PORTALS: Record<string, { name: string; portalId: string; tokenEnv: string; objectTypeIds: Record<string, string> }> = {
  demo: {
    name: 'Jiménez DEMO (Focux)',
    portalId: '51256354',
    tokenEnv: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
    objectTypeIds: {
      macroproyecto: '2-60986238',
      proyecto: '2-60987399',
      unidad: '2-60987403',
      agrupacion: '2-60987404',
    },
  },
  prod: {
    name: 'Jiménez PRODUCCIÓN',
    portalId: '51059324',
    tokenEnv: 'HUBSPOT_JIMENEZ_PRIVATE_APP_TOKEN',
    objectTypeIds: {
      macroproyecto: '2-61560827',
      proyecto: '2-61560828',
      unidad: '2-61560829',
      agrupacion: '2-61560831',
    },
  },
};

// Opciones que DEBEN existir en estado_fx de los 4 objetos
const REQUIRED_OPTIONS = [
  { label: 'Disponible', value: 'disponible', displayOrder: 1 },
  { label: 'Cotizada', value: 'cotizada', displayOrder: 2 },
  { label: 'Bloqueada', value: 'bloqueada', displayOrder: 3 },
  { label: 'Separada', value: 'separada', displayOrder: 4 },
  { label: 'Reservada', value: 'reservada', displayOrder: 5 },
  { label: 'Vendida', value: 'vendida', displayOrder: 6 },
  { label: 'Escriturada', value: 'escriturada', displayOrder: 7 },
];

// ── Parse args ──
const args = process.argv.slice(2);
const portalArg = args.find(a => a.startsWith('--portal='))?.split('=')[1];
const applyMode = args.includes('--apply');

if (!portalArg || !['demo', 'prod', 'both'].includes(portalArg)) {
  console.error('Uso: node --env-file=.env.local --import tsx scripts/add-estado-enum-options.ts --portal=demo|prod|both [--apply]');
  process.exit(1);
}

const portalsToProcess = portalArg === 'both' ? ['demo', 'prod'] : [portalArg];

// Solo unidad y agrupación — macro/proyecto usan activo/inactivo por diseño
const objectsArg = args.find(a => a.startsWith('--objects='))?.split('=')[1];
const objectsFilter = objectsArg ? objectsArg.split(',') : ['unidad', 'agrupacion'];

// ── Helpers ──
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function getProperty(token: string, objectTypeId: string, propName: string): Promise<any> {
  const resp = await fetch(
    `https://api.hubapi.com/crm/v3/properties/${objectTypeId}/${propName}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (resp.status !== 200) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(`GET property ${propName} on ${objectTypeId}: HTTP ${resp.status} — ${JSON.stringify(data).slice(0, 300)}`);
  }
  return resp.json();
}

async function updatePropertyOptions(
  token: string,
  objectTypeId: string,
  propName: string,
  options: Array<{ label: string; value: string; displayOrder: number }>,
): Promise<void> {
  const resp = await fetch(
    `https://api.hubapi.com/crm/v3/properties/${objectTypeId}/${propName}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ options }),
    }
  );
  if (resp.status !== 200) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(`PATCH property ${propName} on ${objectTypeId}: HTTP ${resp.status} — ${JSON.stringify(data).slice(0, 300)}`);
  }
}

// ── Main ──
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FocuxAI Engine™ — Agregar opciones estado_fx');
  console.log(`  Mode: ${applyMode ? '⚡ APPLY' : '🔍 DRY-RUN'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const portalKey of portalsToProcess) {
    const portal = PORTALS[portalKey]!;
    const token = process.env[portal.tokenEnv];

    if (!token) {
      console.error(`❌ Token no encontrado: ${portal.tokenEnv}`);
      continue;
    }

    console.log(`━━━ Portal: ${portal.name} (${portal.portalId}) ━━━`);

    for (const [objectName, objectTypeId] of Object.entries(portal.objectTypeIds)) {
      if (!objectsFilter.includes(objectName)) {
        console.log(`\n  ⏭️  ${objectName} — skipped (no en filtro)`);
        continue;
      }
      console.log(`\n  📦 ${objectName} (${objectTypeId}) → estado_fx`);

      try {
        // 1. GET current property
        const prop = await getProperty(token, objectTypeId, 'estado_fx');
        const currentOptions: Array<{ value: string; label: string; displayOrder?: number }> = prop.options || [];
        const currentValues = new Set(currentOptions.map((o: any) => o.value));

        console.log(`     Tipo: ${prop.type} | fieldType: ${prop.fieldType}`);
        console.log(`     Opciones actuales (${currentOptions.length}):`);
        for (const o of currentOptions) {
          console.log(`       ${o.value} → ${o.label}`);
        }

        // 2. Find missing
        const missing = REQUIRED_OPTIONS.filter(o => !currentValues.has(o.value));

        if (missing.length === 0) {
          console.log('     ✅ Todas las opciones ya existen');
          continue;
        }

        console.log(`     ⚠️  Faltan ${missing.length}: ${missing.map(m => m.value).join(', ')}`);

        // 3. Build merged options array (preserve existing + add missing)
        const mergedOptions = [
          ...currentOptions.map((o: any, idx: number) => ({
            label: o.label,
            value: o.value,
            displayOrder: o.displayOrder ?? idx + 1,
            hidden: o.hidden ?? false,
          })),
          ...missing.map(m => ({
            label: m.label,
            value: m.value,
            displayOrder: m.displayOrder,
            hidden: false,
          })),
        ];

        if (applyMode) {
          await updatePropertyOptions(token, objectTypeId, 'estado_fx', mergedOptions);
          console.log(`     ✅ Actualizado: ${mergedOptions.length} opciones totales`);
        } else {
          console.log(`     🔍 DRY-RUN: agregaría → ${missing.map(m => m.value).join(', ')}`);
          console.log(`     Total después: ${mergedOptions.length} opciones`);
        }

        await sleep(200);
      } catch (err: any) {
        console.error(`     ❌ Error: ${err.message}`);
      }
    }

    console.log('');
  }

  if (!applyMode) {
    console.log('ℹ️  Modo dry-run. Para aplicar, agregar --apply');
  } else {
    console.log('✅ Completado.');
  }
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
