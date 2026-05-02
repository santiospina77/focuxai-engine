/**
 * Migrate Assets to HubSpot File Manager
 *
 * One-time script per client/project onboarding.
 * Uploads PDF-referenced assets (renders, planos, logo, sello)
 * to HubSpot File Manager as PUBLIC_NOT_INDEXABLE.
 *
 * Uses an explicit ASSET_MANIFEST — never globs. Each entry maps:
 *   sourcePath (local)  →  hubspotFileName (canonical Engine name)
 *
 * Usage:
 *   HUBSPOT_TOKEN=pat-na1-xxx CLIENT_SLUG=jimenez PROJECT_SLUG=porto-sabbia \
 *     npx tsx scripts/migrate-assets-to-hubspot.ts
 *
 * Requires env:
 *   HUBSPOT_TOKEN  — HubSpot Private App token with files scope
 *   CLIENT_SLUG    — e.g. "jimenez" (client folder in HubSpot)
 *   PROJECT_SLUG   — e.g. "porto-sabbia" (project subfolder)
 *
 * Output:
 *   scripts/output/asset-migration-{clientSlug}-{projectSlug}-{timestamp}.json
 *
 * Hybrid duplicate validation strategy (Architect-approved):
 *   - Renders: NONE — forces HubSpot to create the file with the exact requested name.
 *     Required when hubspotFileName differs from any existing file (e.g. render.png
 *     when the content already exists as render-A1.png). RETURN_EXISTING would silently
 *     return the existing file's URL without materializing the new name.
 *   - Planos/Branding: RETURN_EXISTING — safe because hubspotFileName matches the
 *     uploaded filename (no rename), so dedup returns the correct URL.
 *
 * Post-upload validation checks CONSTRUCTED runtime URLs (assetBaseUrl + hubspotFileName),
 * NOT the URLs HubSpot returns. Hard-fail if any runtime URL is not accessible.
 * Post-upload: validates every expected runtime URL returns 200.
 *
 * FocuxAI Engine™ — Fase B.0 Step 6
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ═══════════════════════════════════════════════════════════
// Config & Validation
// ═══════════════════════════════════════════════════════════

const HUBSPOT_FILES_API = 'https://api.hubapi.com/files/v3/files';

const TOKEN = process.env.HUBSPOT_TOKEN;
const CLIENT_SLUG = process.env.CLIENT_SLUG || 'jimenez';
const PROJECT_SLUG = process.env.PROJECT_SLUG || 'porto-sabbia';

const SLUG_REGEX = /^[a-z0-9-]+$/;
if (!SLUG_REGEX.test(CLIENT_SLUG)) {
  console.error(`ERROR: CLIENT_SLUG "${CLIENT_SLUG}" is invalid. Only [a-z0-9-] allowed.`);
  process.exit(1);
}
if (!SLUG_REGEX.test(PROJECT_SLUG)) {
  console.error(`ERROR: PROJECT_SLUG "${PROJECT_SLUG}" is invalid. Only [a-z0-9-] allowed.`);
  process.exit(1);
}
if (!TOKEN) {
  console.error('ERROR: Set HUBSPOT_TOKEN env var');
  process.exit(1);
}

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.resolve(__dirname, 'output');

// HubSpot folder: /assets/{client}/{project}/
const HUBSPOT_FOLDER = `/assets/${CLIENT_SLUG}/${PROJECT_SLUG}`;

// ═══════════════════════════════════════════════════════════
// Asset Manifest — explicit, never glob
// ═══════════════════════════════════════════════════════════

interface AssetManifestEntry {
  /** Local path relative to project root */
  readonly sourcePath: string;
  /** Canonical filename uploaded to HubSpot (what pdfBuilder resolves) */
  readonly hubspotFileName: string;
  /** Asset category */
  readonly kind: 'render' | 'floorplan' | 'branding';
  /** Typology code (null for branding/render) */
  readonly typology: string | null;
  /** Original filename from client delivery (audit trail) */
  readonly originalSourceName: string | null;
  /**
   * HubSpot duplicate validation strategy per entry.
   * - NONE: force-create file with exact hubspotFileName (use when renaming).
   * - RETURN_EXISTING: reuse existing file if content matches (use when name matches).
   */
  readonly duplicateValidationStrategy: 'NONE' | 'RETURN_EXISTING';
}

/**
 * Porto Sabbia — 20 assets.
 * sourcePath points to porto-sabbia/ subdirectory (canonical local structure).
 * hubspotFileName = what the Engine runtime resolves (flat name, no subdirs).
 *
 * Renders: ONE per project (all tipologías share the same facade render).
 *          When a project has multiple towers with distinct renders,
 *          use render-torre-1.png, render-torre-2.png, etc.
 * Planos:  ONE per tipología (each has unique floor plan).
 */
const ASSET_MANIFEST: readonly AssetManifestEntry[] = [
  // ── Branding (2) — RETURN_EXISTING: name matches, safe to dedup ──
  { sourcePath: 'public/assets/logo-jimenez-horizontal.png', hubspotFileName: 'logo-jimenez-horizontal.png', kind: 'branding', typology: null, originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/sello-40-anos.png', hubspotFileName: 'sello-40-anos.png', kind: 'branding', typology: null, originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },

  // ── Render (1) — NONE: hubspotFileName differs from source, must force-create ──
  { sourcePath: 'public/assets/porto-sabbia/render-A1.png', hubspotFileName: 'render.png', kind: 'render', typology: null, originalSourceName: 'render-A1.png', duplicateValidationStrategy: 'NONE' },

  // ── Planos (17) — RETURN_EXISTING: name matches source, safe to dedup ──
  { sourcePath: 'public/assets/porto-sabbia/plano-A1.png', hubspotFileName: 'plano-A1.png', kind: 'floorplan', typology: 'A1', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-A2.png', hubspotFileName: 'plano-A2.png', kind: 'floorplan', typology: 'A2', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-A3.png', hubspotFileName: 'plano-A3.png', kind: 'floorplan', typology: 'A3', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-B1.png', hubspotFileName: 'plano-B1.png', kind: 'floorplan', typology: 'B1', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-B2.png', hubspotFileName: 'plano-B2.png', kind: 'floorplan', typology: 'B2', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-B3.png', hubspotFileName: 'plano-B3.png', kind: 'floorplan', typology: 'B3', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-B4.png', hubspotFileName: 'plano-B4.png', kind: 'floorplan', typology: 'B4', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-C1.png', hubspotFileName: 'plano-C1.png', kind: 'floorplan', typology: 'C1', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-C2.png', hubspotFileName: 'plano-C2.png', kind: 'floorplan', typology: 'C2', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-C3.png', hubspotFileName: 'plano-C3.png', kind: 'floorplan', typology: 'C3', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-C4.png', hubspotFileName: 'plano-C4.png', kind: 'floorplan', typology: 'C4', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-D1.png', hubspotFileName: 'plano-D1.png', kind: 'floorplan', typology: 'D1', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-D2.png', hubspotFileName: 'plano-D2.png', kind: 'floorplan', typology: 'D2', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-D3.png', hubspotFileName: 'plano-D3.png', kind: 'floorplan', typology: 'D3', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-D4.png', hubspotFileName: 'plano-D4.png', kind: 'floorplan', typology: 'D4', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-D5.png', hubspotFileName: 'plano-D5.png', kind: 'floorplan', typology: 'D5', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
  { sourcePath: 'public/assets/porto-sabbia/plano-E1.png', hubspotFileName: 'plano-E1.png', kind: 'floorplan', typology: 'E1', originalSourceName: null, duplicateValidationStrategy: 'RETURN_EXISTING' },
];

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface AssetUploadResult {
  hubspotFileName: string;
  sourcePath: string;
  kind: string;
  typology: string | null;
  originalSourceName: string | null;
  fileId: string;
  url: string | null;
  sizeBytes: number;
  sha256: string;
  status: 'uploaded' | 'existing' | 'failed';
  error?: string;
}

interface MigrationOutput {
  clientSlug: string;
  projectSlug: string;
  hubspotFolder: string;
  assetBaseUrl: string | null;
  /** Hostname extracted from assetBaseUrl — use for allowedHosts config */
  assetHost: string | null;
  timestamp: string;
  totalFiles: number;
  uploaded: number;
  existing: number;
  failed: number;
  assets: Record<string, {
    sourcePath: string;
    kind: string;
    typology: string | null;
    originalSourceName: string | null;
    fileId: string;
    url: string | null;
    sha256: string;
    sizeBytes: number;
  }>;
  errors: Array<{ hubspotFileName: string; error: string }>;
}

// ═══════════════════════════════════════════════════════════
// Upload function
// ═══════════════════════════════════════════════════════════

async function uploadAsset(
  entry: AssetManifestEntry,
): Promise<AssetUploadResult> {
  const fullPath = path.resolve(PROJECT_ROOT, entry.sourcePath);
  const buffer = fs.readFileSync(fullPath);
  const sizeBytes = buffer.byteLength;
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // Build FormData — upload with canonical Engine name, not source filename
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: 'image/png' }), entry.hubspotFileName);
  formData.append('options', JSON.stringify({
    access: 'PUBLIC_NOT_INDEXABLE',
    overwrite: false,
    duplicateValidationStrategy: entry.duplicateValidationStrategy,
    duplicateValidationScope: 'EXACT_FOLDER',
  }));
  formData.append('folderPath', HUBSPOT_FOLDER);

  // Timeout: 10s base + 5s per MB, max 60s
  const timeoutMs = Math.min(10_000 + Math.ceil(sizeBytes / 1_048_576) * 5_000, 60_000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const base = {
    hubspotFileName: entry.hubspotFileName,
    sourcePath: entry.sourcePath,
    kind: entry.kind,
    typology: entry.typology,
    originalSourceName: entry.originalSourceName,
    sizeBytes,
    sha256,
  };

  try {
    const response = await fetch(HUBSPOT_FILES_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      return { ...base, fileId: '', url: null, status: 'failed', error: `HTTP ${response.status}: ${errorBody.slice(0, 500)}` };
    }

    const data = await response.json();
    const fileId = String(data.id || '');
    const url = data.url || data.defaultHostingUrl || null;

    return { ...base, fileId, url, status: fileId ? 'uploaded' : 'failed' };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const msg = error instanceof Error ? error.message : String(error);
    return { ...base, fileId: '', url: null, status: 'failed', error: msg };
  }
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log(`\n═══ Asset Migration to HubSpot ═══`);
  console.log(`Client:  ${CLIENT_SLUG}`);
  console.log(`Project: ${PROJECT_SLUG}`);
  console.log(`Folder:  ${HUBSPOT_FOLDER}`);
  console.log(`Assets:  ${ASSET_MANIFEST.length} files\n`);

  // Verify all source files exist before starting
  const missing: string[] = [];
  for (const entry of ASSET_MANIFEST) {
    const fullPath = path.resolve(PROJECT_ROOT, entry.sourcePath);
    if (!fs.existsSync(fullPath)) missing.push(entry.sourcePath);
  }
  if (missing.length > 0) {
    console.error(`ABORT: Missing source files:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }

  // Check for duplicate hubspotFileNames in manifest
  const names = ASSET_MANIFEST.map(e => e.hubspotFileName);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) {
    console.error(`ABORT: Duplicate hubspotFileNames in manifest: ${[...new Set(dupes)].join(', ')}`);
    process.exit(1);
  }

  // Upload sequentially to respect rate limits
  const results: AssetUploadResult[] = [];
  for (let i = 0; i < ASSET_MANIFEST.length; i++) {
    const entry = ASSET_MANIFEST[i];
    const fullPath = path.resolve(PROJECT_ROOT, entry.sourcePath);
    const sizeMB = (fs.statSync(fullPath).size / 1_048_576).toFixed(2);

    const strategyTag = entry.duplicateValidationStrategy === 'NONE' ? ' [NONE]' : '';
    process.stdout.write(`  [${i + 1}/${ASSET_MANIFEST.length}] ${entry.hubspotFileName} (${sizeMB}MB, ${entry.kind}${strategyTag})... `);
    const result = await uploadAsset(entry);
    results.push(result);

    if (result.status === 'failed') {
      console.log(`FAIL ${result.error}`);
    } else {
      console.log(`OK ${result.status} → ${result.fileId}`);
    }

    // 300ms delay between uploads to be nice to HubSpot
    if (i < ASSET_MANIFEST.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ── Derive assetBaseUrl + validate all URLs share same base ──
  const successfulResults = results.filter(r => r.url);
  const basePaths = new Set<string>();

  for (const r of successfulResults) {
    if (r.url) {
      const lastSlash = r.url.lastIndexOf('/');
      basePaths.add(r.url.substring(0, lastSlash));
    }
  }

  if (basePaths.size > 1) {
    console.error(`\nABORT: ASSET_BASE_URL_NOT_STABLE — URLs resolve to ${basePaths.size} different bases:`);
    for (const base of basePaths) console.error(`  - ${base}`);
    console.error('All assets must share the same base URL. Check HubSpot folder config.');
    process.exit(1);
  }

  const assetBaseUrl = basePaths.size === 1 ? [...basePaths][0] : null;

  // Extract hostname for allowedHosts config
  let assetHost: string | null = null;
  if (assetBaseUrl) {
    try {
      assetHost = new URL(assetBaseUrl).hostname;
    } catch {
      console.error(`WARNING: Could not parse hostname from assetBaseUrl: ${assetBaseUrl}`);
    }
  }

  // Build output
  const output: MigrationOutput = {
    clientSlug: CLIENT_SLUG,
    projectSlug: PROJECT_SLUG,
    hubspotFolder: HUBSPOT_FOLDER,
    assetBaseUrl,
    assetHost,
    timestamp: new Date().toISOString(),
    totalFiles: results.length,
    uploaded: results.filter(r => r.status === 'uploaded').length,
    existing: results.filter(r => r.status === 'existing').length,
    failed: results.filter(r => r.status === 'failed').length,
    assets: {},
    errors: [],
  };

  for (const r of results) {
    if (r.status !== 'failed') {
      output.assets[r.hubspotFileName] = {
        sourcePath: r.sourcePath,
        kind: r.kind,
        typology: r.typology,
        originalSourceName: r.originalSourceName,
        fileId: r.fileId,
        url: r.url,
        sha256: r.sha256,
        sizeBytes: r.sizeBytes,
      };
    } else {
      output.errors.push({ hubspotFileName: r.hubspotFileName, error: r.error || 'unknown' });
    }
  }

  // Write output JSON
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputFile = path.join(OUTPUT_DIR, `asset-migration-${CLIENT_SLUG}-${PROJECT_SLUG}-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

  // ── Detect deduplication (same fileId, different hubspotFileName) ──
  const fileIdToNames = new Map<string, string[]>();
  for (const r of results) {
    if (r.status !== 'failed' && r.fileId) {
      const existing = fileIdToNames.get(r.fileId) || [];
      existing.push(r.hubspotFileName);
      fileIdToNames.set(r.fileId, existing);
    }
  }
  const deduplicatedGroups = [...fileIdToNames.entries()]
    .filter(([, names]) => names.length > 1);

  if (deduplicatedGroups.length > 0) {
    console.error(`\n⚠ WARNING: ASSETS_DEDUPLICATED — ${deduplicatedGroups.length} fileId(s) shared by multiple filenames:`);
    for (const [fileId, names] of deduplicatedGroups) {
      console.error(`  fileId ${fileId}: ${names.join(', ')}`);
    }
    console.error('  These filenames may not resolve to unique URLs. Verify runtime URL validation below.');
  }

  // ── Runtime URL validation ──
  // CRITICAL: Validate the CONSTRUCTED URL (assetBaseUrl + hubspotFileName),
  // NOT the URL HubSpot returned. RETURN_EXISTING can return a URL with a
  // different filename (e.g. render-A1.png when we asked for render.png).
  // The pdfBuilder constructs URLs from assetBaseUrl + hubspotFileName,
  // so that's the contract we must validate.
  console.log(`\n═══ Runtime URL Validation (constructed URLs) ═══`);
  let urlsChecked = 0;
  let urlsOk = 0;
  let urlsFailed = 0;
  const urlErrors: Array<{ hubspotFileName: string; hubspotReturnedUrl: string; runtimeExpectedUrl: string; status: number }> = [];

  if (!assetBaseUrl) {
    console.error('  SKIP: No assetBaseUrl derived — cannot validate constructed URLs.');
  } else {
    for (const r of results) {
      if (r.status === 'failed') continue;
      urlsChecked++;

      // This is the URL pdfBuilder will construct at runtime
      const runtimeUrl = `${assetBaseUrl}/${r.hubspotFileName}`;
      const hubspotUrl = r.url || '(none)';

      try {
        const headRes = await fetch(runtimeUrl, { method: 'HEAD' });
        if (headRes.ok) {
          urlsOk++;
          process.stdout.write('.');
        } else {
          urlsFailed++;
          urlErrors.push({ hubspotFileName: r.hubspotFileName, hubspotReturnedUrl: hubspotUrl, runtimeExpectedUrl: runtimeUrl, status: headRes.status });
          process.stdout.write('✗');
        }
      } catch {
        urlsFailed++;
        urlErrors.push({ hubspotFileName: r.hubspotFileName, hubspotReturnedUrl: hubspotUrl, runtimeExpectedUrl: runtimeUrl, status: 0 });
        process.stdout.write('✗');
      }
      // Small delay between HEAD requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log(`\n  Checked: ${urlsChecked}  OK: ${urlsOk}  Failed: ${urlsFailed}`);

    if (urlsFailed > 0) {
      console.error(`\n  RUNTIME_ASSET_URL_NOT_ACCESSIBLE:`);
      for (const e of urlErrors) {
        console.error(`    ${e.hubspotFileName}`);
        console.error(`      HubSpot returned: ${e.hubspotReturnedUrl}`);
        console.error(`      Runtime expects:  ${e.runtimeExpectedUrl} → HTTP ${e.status}`);
      }
    }
  }

  // Add validation results to output (with both URLs for audit)
  (output as any).runtimeUrlValidation = { checked: urlsChecked, ok: urlsOk, failed: urlsFailed };
  (output as any).deduplicatedAssets = deduplicatedGroups.map(([fileId, names]) => ({ fileId, filenames: names }));

  // Enrich asset records with both URLs for audit trail
  if (assetBaseUrl) {
    for (const r of results) {
      if (r.status !== 'failed' && output.assets[r.hubspotFileName]) {
        (output.assets[r.hubspotFileName] as any).hubspotReturnedUrl = r.url;
        (output.assets[r.hubspotFileName] as any).runtimeExpectedUrl = `${assetBaseUrl}/${r.hubspotFileName}`;
      }
    }
  }

  if (urlErrors.length > 0) {
    output.errors.push(...urlErrors.map(e => ({
      hubspotFileName: e.hubspotFileName,
      error: `RUNTIME_ASSET_URL_NOT_ACCESSIBLE: HTTP ${e.status} at ${e.runtimeExpectedUrl} (HubSpot returned: ${e.hubspotReturnedUrl})`,
    })));
  }

  // Re-write output JSON with validation results
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

  // Summary
  console.log(`\n═══ Summary ═══`);
  console.log(`  Uploaded:  ${output.uploaded}`);
  console.log(`  Existing:  ${output.existing}`);
  console.log(`  Failed:    ${output.failed}`);
  console.log(`  URLs OK:   ${urlsOk}/${urlsChecked}`);
  console.log(`  Base URL:  ${assetBaseUrl || '(none — all failed)'}`);
  console.log(`  Host:      ${assetHost || '(none)'}`);
  console.log(`  Output:    ${outputFile}\n`);

  if (output.failed > 0 || urlsFailed > 0) {
    console.error(`  ${output.failed} uploads failed, ${urlsFailed} runtime URLs not accessible.`);
    console.error('  DO NOT use this assetBaseUrl in production until all URLs return 200.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
