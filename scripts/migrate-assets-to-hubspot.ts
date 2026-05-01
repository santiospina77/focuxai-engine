/**
 * Migrate Assets to HubSpot File Manager
 *
 * One-time script per client onboarding.
 * Uploads all PDF-referenced assets (renders, planos, logo, sello)
 * to HubSpot File Manager as PUBLIC_NOT_INDEXABLE.
 *
 * Usage:
 *   npx tsx scripts/migrate-assets-to-hubspot.ts
 *
 * Requires env:
 *   HUBSPOT_TOKEN — HubSpot Private App token with files scope
 *   CLIENT_SLUG   — e.g. "jimenez" (folder name in HubSpot)
 *
 * Output:
 *   Writes JSON to scripts/output/asset-migration-{clientSlug}-{timestamp}.json
 *   with assetBaseUrl and per-file mapping (fileId, url).
 *
 * Idempotent: uses duplicateValidationStrategy: RETURN_EXISTING.
 *
 * FocuxAI Engine™ — Fase B.0 Step 6
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ═══════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════

const HUBSPOT_FILES_API = 'https://api.hubapi.com/files/v3/files';

const TOKEN = process.env.HUBSPOT_TOKEN;
const CLIENT_SLUG = process.env.CLIENT_SLUG || 'jimenez';

// ── MEDIUM 8: Validate CLIENT_SLUG ──
const SLUG_REGEX = /^[a-z0-9-]+$/;
if (!SLUG_REGEX.test(CLIENT_SLUG)) {
  console.error(`ERROR: CLIENT_SLUG "${CLIENT_SLUG}" is invalid. Only lowercase alphanumeric and hyphens allowed (regex: ${SLUG_REGEX}).`);
  process.exit(1);
}

if (!TOKEN) {
  console.error('ERROR: Set HUBSPOT_TOKEN env var');
  process.exit(1);
}

// Assets directory (relative to project root)
const ASSETS_DIR = path.resolve(__dirname, '..', 'public', 'assets');
const OUTPUT_DIR = path.resolve(__dirname, 'output');

// HubSpot folder path — matches cotizaciones pattern
const HUBSPOT_FOLDER = `/assets/${CLIENT_SLUG}`;

// Files to upload — only those referenced by pdfBuilder
const ASSET_FILES = [
  // Branding
  'logo-jimenez-horizontal.png',
  'sello-40-anos.png',
  // Renders (17 tipologías)
  'render-A1.png', 'render-A2.png', 'render-A3.png',
  'render-B1.png', 'render-B2.png', 'render-B3.png', 'render-B4.png',
  'render-C1.png', 'render-C2.png', 'render-C3.png', 'render-C4.png',
  'render-D1.png', 'render-D2.png', 'render-D3.png', 'render-D4.png', 'render-D5.png',
  'render-E1.png',
  // Planos (17 tipologías)
  'plano-A1.png', 'plano-A2.png', 'plano-A3.png',
  'plano-B1.png', 'plano-B2.png', 'plano-B3.png', 'plano-B4.png',
  'plano-C1.png', 'plano-C2.png', 'plano-C3.png', 'plano-C4.png',
  'plano-D1.png', 'plano-D2.png', 'plano-D3.png', 'plano-D4.png', 'plano-D5.png',
  'plano-E1.png',
];

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface AssetUploadResult {
  fileName: string;
  fileId: string;
  url: string | null;
  sizeBytes: number;
  sha256: string;
  status: 'uploaded' | 'existing' | 'failed';
  error?: string;
}

interface MigrationOutput {
  clientSlug: string;
  hubspotFolder: string;
  assetBaseUrl: string | null;
  /** Hostname extracted from assetBaseUrl — use for allowedHosts config */
  assetHost: string | null;
  timestamp: string;
  totalFiles: number;
  uploaded: number;
  existing: number;
  failed: number;
  assets: Record<string, { fileId: string; url: string | null; sha256: string; sizeBytes: number }>;
  errors: Array<{ fileName: string; error: string }>;
}

// ═══════════════════════════════════════════════════════════
// Upload function
// ═══════════════════════════════════════════════════════════

async function uploadAsset(
  filePath: string,
  fileName: string,
): Promise<AssetUploadResult> {
  const buffer = fs.readFileSync(filePath);
  const sizeBytes = buffer.byteLength;
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // Build FormData
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: 'image/png' }), fileName);
  formData.append('options', JSON.stringify({
    access: 'PUBLIC_NOT_INDEXABLE',
    overwrite: false,
    duplicateValidationStrategy: 'RETURN_EXISTING',
    duplicateValidationScope: 'EXACT_FOLDER',
  }));
  formData.append('folderPath', HUBSPOT_FOLDER);

  // Timeout: 10s base + 5s per MB
  const timeoutMs = Math.min(10_000 + Math.ceil(sizeBytes / 1_048_576) * 5_000, 60_000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
      return { fileName, fileId: '', url: null, sizeBytes, sha256, status: 'failed', error: `HTTP ${response.status}: ${errorBody.slice(0, 500)}` };
    }

    const data = await response.json();
    const fileId = String(data.id || '');
    const url = data.url || data.defaultHostingUrl || null;

    // HubSpot returns the file even if it already existed (RETURN_EXISTING)
    const status = data.duplicateValidationStrategy === 'RETURN_EXISTING' ? 'existing' : 'uploaded';

    return { fileName, fileId, url, sizeBytes, sha256, status: fileId ? 'uploaded' : 'failed' };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const msg = error instanceof Error ? error.message : String(error);
    return { fileName, fileId: '', url: null, sizeBytes, sha256, status: 'failed', error: msg };
  }
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log(`\n═══ Asset Migration to HubSpot ═══`);
  console.log(`Client: ${CLIENT_SLUG}`);
  console.log(`Folder: ${HUBSPOT_FOLDER}`);
  console.log(`Assets: ${ASSET_FILES.length} files\n`);

  // Verify all files exist before starting
  const missing: string[] = [];
  for (const f of ASSET_FILES) {
    const fullPath = path.join(ASSETS_DIR, f);
    if (!fs.existsSync(fullPath)) missing.push(f);
  }
  if (missing.length > 0) {
    console.error(`ABORT: Missing files:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }

  // Upload sequentially to avoid rate limits
  const results: AssetUploadResult[] = [];
  for (let i = 0; i < ASSET_FILES.length; i++) {
    const fileName = ASSET_FILES[i];
    const fullPath = path.join(ASSETS_DIR, fileName);
    const sizeMB = (fs.statSync(fullPath).size / 1_048_576).toFixed(2);

    process.stdout.write(`  [${i + 1}/${ASSET_FILES.length}] ${fileName} (${sizeMB}MB)... `);
    const result = await uploadAsset(fullPath, fileName);
    results.push(result);

    if (result.status === 'failed') {
      console.log(`❌ ${result.error}`);
    } else {
      console.log(`✅ ${result.status} → ${result.fileId}`);
    }

    // Small delay between uploads to be nice to HubSpot
    if (i < ASSET_FILES.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ── CRITICAL 3 + HIGH 6: Derive assetBaseUrl + validate all URLs share same base ──
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
      output.assets[r.fileName] = { fileId: r.fileId, url: r.url, sha256: r.sha256, sizeBytes: r.sizeBytes };
    } else {
      output.errors.push({ fileName: r.fileName, error: r.error || 'unknown' });
    }
  }

  // Write output JSON
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputFile = path.join(OUTPUT_DIR, `asset-migration-${CLIENT_SLUG}-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

  // Summary
  console.log(`\n═══ Summary ═══`);
  console.log(`  Uploaded:  ${output.uploaded}`);
  console.log(`  Existing:  ${output.existing}`);
  console.log(`  Failed:    ${output.failed}`);
  console.log(`  Base URL:  ${assetBaseUrl || '(none — all failed)'}`);
  console.log(`  Host:      ${assetHost || '(none)'}`);
  console.log(`  Output:    ${outputFile}\n`);

  if (output.failed > 0) {
    console.error(`⚠️  ${output.failed} files failed. Check output JSON for details.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
