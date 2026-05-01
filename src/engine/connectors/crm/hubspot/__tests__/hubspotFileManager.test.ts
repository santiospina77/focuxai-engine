/**
 * Tests for hubspotFileManager.ts
 *
 * Uses node:test + node:assert (built-in, zero dependencies).
 * Mocks global fetch to simulate HubSpot API responses.
 *
 * Run: npm run test:hubspot-files
 *   (resolves to: node --import tsx --test <this file>)
 *
 * Requires: tsx as devDependency (resolves @/ aliases via tsconfig paths).
 *
 * @since v3.0.0 — Fase B.0
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { uploadFileToHubSpot, attachFileToRecord } from '../hubspotFileManager';
import type { HubSpotFileUploadOptions, HubSpotAttachFileOptions } from '../hubspotFileManager';

// ═══════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════

const FAKE_TOKEN = 'pat-test-fake-token-12345';

function validUploadOptions(overrides: Partial<HubSpotFileUploadOptions> = {}): HubSpotFileUploadOptions {
  return {
    fileName: 'test.pdf',
    folderPath: '/focux-quoter/test/cotizaciones/2026-05',
    contentType: 'application/pdf',
    access: 'PRIVATE',
    timeoutMs: 5_000,
    ...overrides,
  };
}

function validAttachOptions(overrides: Partial<HubSpotAttachFileOptions> = {}): HubSpotAttachFileOptions {
  return {
    objectType: 'deals',
    objectId: '12345678',
    noteBody: 'Test note body',
    timeoutMs: 5_000,
    ...overrides,
  };
}

function fakeBuffer(sizeBytes: number = 1024): Buffer {
  return Buffer.alloc(sizeBytes, 0x41); // 'A' repeated
}

/** Create a mock Response object */
function mockResponse(body: unknown, status: number = 200, headers: Record<string, string> = {}): Response {
  const responseHeaders = new Headers(headers);
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: responseHeaders,
  });
}

// ═══════════════════════════════════════════════════════════
// uploadFileToHubSpot tests
// ═══════════════════════════════════════════════════════════

describe('uploadFileToHubSpot', () => {

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Input validation ──

  it('rejects empty token', async () => {
    const result = await uploadFileToHubSpot('', fakeBuffer(), validUploadOptions());
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.match(result.error.message, /token must not be empty/);
    }
  });

  it('rejects empty buffer', async () => {
    const result = await uploadFileToHubSpot(FAKE_TOKEN, Buffer.alloc(0), validUploadOptions());
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.match(result.error.message, /buffer is empty/);
    }
  });

  it('rejects fileName with slashes', async () => {
    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions({ fileName: 'path/to/file.pdf' }));
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.match(result.error.message, /invalid characters/);
    }
  });

  it('rejects folderPath not starting with /', async () => {
    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions({ folderPath: 'no-leading-slash' }));
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.match(result.error.message, /folderPath must start with/);
    }
  });

  it('rejects empty contentType', async () => {
    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions({ contentType: '' }));
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.match(result.error.message, /contentType must not be empty/);
    }
  });

  // ── Happy path ──

  it('uploads successfully and returns typed result', async () => {
    globalThis.fetch = async () => mockResponse({
      id: 'file-123',
      url: 'https://f.hubspotusercontent-na1.net/test.pdf',
      defaultHostingUrl: 'https://app.hubspot.com/files/test.pdf',
      size: 1024,
      access: 'PRIVATE',
    });

    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions());
    assert.equal(result.isOk(), true);
    if (result.isOk()) {
      assert.equal(result.value.fileId, 'file-123');
      assert.equal(result.value.access, 'PRIVATE');
      assert.equal(result.value.sizeBytes, 1024);
      assert.equal(typeof result.value.url, 'string');
    }
  });

  it('handles PUBLIC_NOT_INDEXABLE access', async () => {
    globalThis.fetch = async () => mockResponse({
      id: 'file-456',
      url: 'https://f.hubspotusercontent-na1.net/render.png',
      defaultHostingUrl: null,
      size: 2048,
      access: 'PUBLIC_NOT_INDEXABLE',
    });

    const opts = validUploadOptions({ access: 'PUBLIC_NOT_INDEXABLE' });
    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), opts);
    assert.equal(result.isOk(), true);
    if (result.isOk()) {
      assert.equal(result.value.access, 'PUBLIC_NOT_INDEXABLE');
    }
  });

  // ── Access mismatch (security-critical) ──

  it('returns SCHEMA_CRM_FILE_ACCESS_MISMATCH when access differs', async () => {
    globalThis.fetch = async () => mockResponse({
      id: 'file-789',
      url: null,
      defaultHostingUrl: null,
      size: 1024,
      access: 'PUBLIC_INDEXABLE', // requested PRIVATE
    });

    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions({ access: 'PRIVATE' }));
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.equal(result.error.code, 'SCHEMA_CRM_FILE_ACCESS_MISMATCH');
      assert.match(result.error.message, /PUBLIC_INDEXABLE.*PRIVATE/);
    }
  });

  // ── Schema mismatch ──

  it('returns SCHEMA error when response is not valid JSON', async () => {
    globalThis.fetch = async () => new Response('not json', { status: 200 });

    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions());
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.equal(result.error.code, 'SCHEMA_CRM_FILE_RESPONSE_INVALID');
    }
  });

  it('returns SCHEMA error when response misses required fields', async () => {
    globalThis.fetch = async () => mockResponse({ unexpected: true });

    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions());
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.equal(result.error.code, 'SCHEMA_CRM_FILE_RESPONSE_INVALID');
    }
  });

  // ── HTTP errors ──

  it('returns AUTH error on 401', async () => {
    globalThis.fetch = async () => mockResponse({ message: 'Unauthorized', category: 'AUTH' }, 401);

    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions());
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.equal(result.error.code, 'AUTH_CRM_FILE_TOKEN_INVALID');
    }
  });

  it('returns UPLOAD_FAILED on 400 (bad request)', async () => {
    globalThis.fetch = async () => mockResponse({ message: 'Bad request', category: 'VALIDATION' }, 400);

    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions());
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.equal(result.error.code, 'RESOURCE_CRM_FILE_UPLOAD_FAILED');
    }
  });

  // ── Retry behavior ──

  it('retries on 429 and succeeds on second attempt', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({ message: 'Rate limited' }, 429, { 'Retry-After': '0' });
      }
      return mockResponse({
        id: 'file-retry-ok',
        url: null,
        defaultHostingUrl: null,
        size: 1024,
        access: 'PRIVATE',
      });
    };

    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions());
    assert.equal(result.isOk(), true);
    assert.equal(callCount, 2);
  });

  it('retries on 500 and succeeds on second attempt', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({ message: 'Internal error' }, 500);
      }
      return mockResponse({
        id: 'file-500-retry',
        url: null,
        defaultHostingUrl: null,
        size: 512,
        access: 'PRIVATE',
      });
    };

    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions());
    assert.equal(result.isOk(), true);
    assert.equal(callCount, 2);
  });

  // ── FormData rebuild per attempt ──

  it('rebuilds FormData on each retry (fetch receives fresh body each time)', async () => {
    const bodies: unknown[] = [];
    let callCount = 0;

    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      callCount++;
      bodies.push(init?.body);
      if (callCount === 1) {
        return mockResponse({ message: 'Server error' }, 500);
      }
      return mockResponse({
        id: 'file-rebuild',
        url: null,
        defaultHostingUrl: null,
        size: 1024,
        access: 'PRIVATE',
      });
    };

    await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions());

    // Each attempt should have received a different FormData instance
    assert.equal(bodies.length, 2);
    assert.notEqual(bodies[0], bodies[1], 'FormData should be rebuilt per attempt');
  });

  // ── Timeout ──

  it('returns TIMEOUT error when fetch is aborted', async () => {
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      // Simulate abort
      const signal = init?.signal;
      if (signal) {
        return new Promise<Response>((_, reject) => {
          // Wait for the abort signal
          if (signal.aborted) {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          }
          signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      }
      throw new Error('No signal');
    };

    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), validUploadOptions({ timeoutMs: 100 }));
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.equal(result.error.code, 'RESOURCE_CRM_FILE_TIMEOUT');
    }
  });

  // ── Duplicate validation options ──

  it('includes duplicate validation in FormData options', async () => {
    let capturedBody: FormData | null = null;

    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as FormData;
      return mockResponse({
        id: 'file-dup',
        url: null,
        defaultHostingUrl: null,
        size: 1024,
        access: 'PUBLIC_NOT_INDEXABLE',
      });
    };

    const opts = validUploadOptions({
      access: 'PUBLIC_NOT_INDEXABLE',
      duplicateValidationStrategy: 'RETURN_EXISTING',
      duplicateValidationScope: 'EXACT_FOLDER',
    });
    const result = await uploadFileToHubSpot(FAKE_TOKEN, fakeBuffer(), opts);
    assert.equal(result.isOk(), true);

    // Verify the options JSON in FormData includes duplicate validation
    assert.notEqual(capturedBody, null);
    if (capturedBody) {
      const optionsField = (capturedBody as FormData).get('options');
      assert.notEqual(optionsField, null);
      if (optionsField) {
        const parsed = JSON.parse(optionsField.toString());
        assert.equal(parsed.duplicateValidationStrategy, 'RETURN_EXISTING');
        assert.equal(parsed.duplicateValidationScope, 'EXACT_FOLDER');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// attachFileToRecord tests
// ═══════════════════════════════════════════════════════════

describe('attachFileToRecord', () => {

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Input validation ──

  it('rejects empty token', async () => {
    const result = await attachFileToRecord('', 'file-123', validAttachOptions());
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.match(result.error.message, /token must not be empty/);
    }
  });

  it('rejects empty fileId', async () => {
    const result = await attachFileToRecord(FAKE_TOKEN, '', validAttachOptions());
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.match(result.error.message, /fileId must not be empty/);
    }
  });

  it('rejects empty objectId', async () => {
    const result = await attachFileToRecord(FAKE_TOKEN, 'file-123', validAttachOptions({ objectId: '' }));
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.match(result.error.message, /objectId must not be empty/);
    }
  });

  it('rejects unsupported objectType', async () => {
    // @ts-expect-error — testing invalid input
    const result = await attachFileToRecord(FAKE_TOKEN, 'file-123', validAttachOptions({ objectType: 'tickets' }));
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.equal(result.error.code, 'VALIDATION_CRM_FILE_UNSUPPORTED_OBJECT_TYPE');
    }
  });

  // ── Happy path: single POST with inline associations ──

  it('creates note with association in single POST for deals', async () => {
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof url === 'string' ? url : url.toString();
      capturedBody = JSON.parse(init?.body as string);
      return mockResponse({ id: 'note-abc-123', properties: {} });
    };

    const result = await attachFileToRecord(FAKE_TOKEN, 'file-999', validAttachOptions({
      objectType: 'deals',
      objectId: '777',
    }));

    assert.equal(result.isOk(), true);
    if (result.isOk()) {
      assert.equal(result.value.noteId, 'note-abc-123');
      assert.equal(result.value.associatedTo.objectType, 'deals');
      assert.equal(result.value.associatedTo.objectId, '777');
    }

    // Verify single POST to notes API (not v4 associations)
    assert.match(capturedUrl, /crm\/v3\/objects\/notes/);
    assert.ok(!capturedUrl.includes('associations/default'), 'Should NOT call v4 associations endpoint');

    // Verify associations block in body
    const associations = capturedBody.associations as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(associations), 'Body must have associations array');
    assert.equal(associations.length, 1);
    assert.deepEqual((associations[0] as Record<string, unknown>).to, { id: '777' });

    const types = (associations[0] as Record<string, unknown>).types as Array<Record<string, unknown>>;
    assert.equal(types[0].associationCategory, 'HUBSPOT_DEFINED');
    assert.equal(types[0].associationTypeId, 214); // deals → 214
  });

  it('creates note with association for contacts (type 202)', async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return mockResponse({ id: 'note-contact-1', properties: {} });
    };

    const result = await attachFileToRecord(FAKE_TOKEN, 'file-888', validAttachOptions({
      objectType: 'contacts',
      objectId: '555',
    }));

    assert.equal(result.isOk(), true);

    const associations = capturedBody.associations as Array<Record<string, unknown>>;
    const types = (associations[0] as Record<string, unknown>).types as Array<Record<string, unknown>>;
    assert.equal(types[0].associationTypeId, 202); // contacts → 202
  });

  it('includes hs_attachment_ids in note properties', async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return mockResponse({ id: 'note-prop-1', properties: {} });
    };

    await attachFileToRecord(FAKE_TOKEN, 'file-attach-test', validAttachOptions());

    const props = capturedBody.properties as Record<string, string>;
    assert.equal(props.hs_attachment_ids, 'file-attach-test');
    assert.ok(props.hs_timestamp, 'Must include hs_timestamp');
    assert.ok(props.hs_note_body, 'Must include hs_note_body');
  });

  // ── No orphan notes (single POST) ──

  it('makes exactly 1 fetch call (no separate association step)', async () => {
    let callCount = 0;

    globalThis.fetch = async () => {
      callCount++;
      return mockResponse({ id: 'note-single', properties: {} });
    };

    const result = await attachFileToRecord(FAKE_TOKEN, 'file-x', validAttachOptions());
    assert.equal(result.isOk(), true);
    assert.equal(callCount, 1, 'Must be exactly 1 API call (no v4 association step)');
  });

  // ── Error handling ──

  it('returns AUTH error on 401', async () => {
    globalThis.fetch = async () => mockResponse({ message: 'Unauthorized' }, 401);

    const result = await attachFileToRecord(FAKE_TOKEN, 'file-auth', validAttachOptions());
    assert.equal(result.isErr(), true);
    if (result.isErr()) {
      assert.equal(result.error.code, 'AUTH_CRM_FILE_TOKEN_INVALID');
    }
  });

  it('retries on 429 and succeeds', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse({ message: 'Rate limited' }, 429, { 'Retry-After': '0' });
      }
      return mockResponse({ id: 'note-retry-ok', properties: {} });
    };

    const result = await attachFileToRecord(FAKE_TOKEN, 'file-retry', validAttachOptions());
    assert.equal(result.isOk(), true);
    assert.equal(callCount, 2);
  });
});
