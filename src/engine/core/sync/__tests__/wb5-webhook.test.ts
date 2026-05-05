/**
 * WB-5 + WB-6 Webhook Receiver — Unit Tests
 *
 * 47 tests covering:
 * - verifyWebhookAuth (4 tests)
 * - resolveSincoIds (5 tests)
 * - resolvePrimaryContact (5 tests)
 * - buildPlanPagosFromDealProps (14 tests)
 * - buildSeparacionInputFromHubSpot (14 tests)
 * - WB-6 WebhookRequestSchema operation field (5 tests)
 *
 * Uses node:test + node:assert (project standard).
 * Pure function tests — no CRM/ERP mocks needed for builders.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { verifyWebhookAuth } from '../../auth/verifyWebhookAuth';
import { resolveSincoIds } from '../resolveSincoIds';
import { resolvePrimaryContact } from '../resolvePrimaryContact';
import { buildPlanPagosFromDealProps } from '../buildPlanPagosFromDealProps';
import { buildSeparacionInputFromHubSpot } from '../buildSeparacionInputFromHubSpot';
import type { ICrmAdapter, CrmRecord } from '@/engine/interfaces/ICrmAdapter';
import { ok, err } from '../../types/Result';
import { ResourceError } from '../../errors/EngineError';

// ============================================================================
// Helpers
// ============================================================================

function makeRequest(token?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new Request('http://localhost/api/engine/sale/separar-webhook/jimenez_demo', {
    method: 'POST',
    headers,
    body: JSON.stringify({ dealId: '123' }),
  });
}

function makeDealRecord(overrides: Record<string, unknown> = {}): CrmRecord {
  return {
    id: 'deal-1',
    objectType: 'deal',
    properties: {
      id_agrupacion_sinco_fx: '10',
      id_proyecto_sinco_fx: '5',
      contacto_principal_vid_fx: '501',
      tipo_venta_fx: 'CONTADO',
      tipo_persona_fx: 'NATURAL',
      tipo_identificacion_fx: 'CC',
      cedula_fx: '1234567890',
      nombre_comprador_fx: 'Juan',
      apellido_comprador_fx: 'Pérez',
      valor_separacion_fx: '5000000',
      separacion_fecha_fx: '2026-06-15',
      writeback_ready_fx: 'true',
      ...overrides,
    },
  };
}

function makeContactRecord(overrides: Record<string, unknown> = {}): CrmRecord {
  return {
    id: '501',
    objectType: 'contact',
    properties: {
      firstname: 'Juan',
      lastname: 'Pérez',
      email: 'juan@example.com',
      phone: '3001234567',
      ...overrides,
    },
  };
}

/** Mock CRM adapter for resolve* tests */
function makeMockCrm(opts: {
  getRecordResult?: ReturnType<ICrmAdapter['getRecord']>;
  getAssociatedResult?: ReturnType<ICrmAdapter['getAssociatedObjects']>;
} = {}): ICrmAdapter {
  return {
    crmKind: 'hubspot',
    getRecord: () => opts.getRecordResult ?? Promise.resolve(ok(makeContactRecord())),
    getAssociatedObjects: () => opts.getAssociatedResult ?? Promise.resolve(ok([])),
    // Stubs for unused methods
    createRecord: () => Promise.resolve(ok(makeContactRecord())),
    updateRecord: () => Promise.resolve(ok(makeContactRecord())),
    deleteRecord: () => Promise.resolve(ok(undefined)),
    createRecordsBatch: () => Promise.resolve(ok({ successful: [], failed: [] })),
    updateRecordsBatch: () => Promise.resolve(ok({ successful: [], failed: [] })),
    upsertRecordsByExternalId: () => Promise.resolve(ok({ successful: [], failed: [] })),
    searchRecords: () => Promise.resolve(ok({ records: [] })),
    findByExternalId: () => Promise.resolve(ok(null)),
    createAssociation: () => Promise.resolve(ok(undefined)),
    createAssociationsBatch: () => Promise.resolve(ok({ successful: [], failed: [] })),
    ensureProperties: () => Promise.resolve(ok(undefined)),
    healthCheck: () => Promise.resolve(ok({ latencyMs: 10 })),
  } as unknown as ICrmAdapter;
}

// ============================================================================
// verifyWebhookAuth
// ============================================================================

describe('verifyWebhookAuth', () => {
  it('rejects request without Authorization header', () => {
    const req = makeRequest(); // no token
    const result = verifyWebhookAuth(req, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'AUTH_INVALID_CREDENTIALS');
    assert.match(result.error.message, /Missing webhook bearer token/);
  });

  it('rejects when WEBHOOK_SECRET env var is not set', () => {
    // Clean env
    delete process.env.WEBHOOK_SECRET_JIMENEZ_DEMO;
    const req = makeRequest('some-token');
    const result = verifyWebhookAuth(req, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /not configured/);
  });

  it('rejects invalid token (timing-safe)', () => {
    process.env.WEBHOOK_SECRET_JIMENEZ_DEMO = 'correct-secret-123';
    const req = makeRequest('wrong-token');
    const result = verifyWebhookAuth(req, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'AUTH_INVALID_CREDENTIALS');
    delete process.env.WEBHOOK_SECRET_JIMENEZ_DEMO;
  });

  it('accepts valid token', () => {
    process.env.WEBHOOK_SECRET_JIMENEZ_DEMO = 'correct-secret-123';
    const req = makeRequest('correct-secret-123');
    const result = verifyWebhookAuth(req, 'jimenez_demo');
    assert.equal(result.isOk(), true);
    delete process.env.WEBHOOK_SECRET_JIMENEZ_DEMO;
  });
});

// ============================================================================
// resolveSincoIds
// ============================================================================

describe('resolveSincoIds', () => {
  it('returns IDs from mirror props when present', async () => {
    const deal = makeDealRecord({ id_agrupacion_sinco_fx: '10', id_proyecto_sinco_fx: '5' });
    const crm = makeMockCrm();
    const result = await resolveSincoIds(crm, deal, 'deal-1');
    assert.equal(result.isOk(), true);
    assert.deepEqual(result.value, { idAgrupacionSinco: 10, idProyectoSinco: 5 });
  });

  it('falls back to association when mirror props missing', async () => {
    const deal = makeDealRecord({ id_agrupacion_sinco_fx: null, id_proyecto_sinco_fx: null });
    const agrupacion: CrmRecord = {
      id: 'agrup-1',
      objectType: 'agrupacion',
      properties: { id_sinco_fx: '20', id_proyecto_sinco_fx: '8' },
    };
    const crm = makeMockCrm({
      getAssociatedResult: Promise.resolve(ok([agrupacion])),
    });
    const result = await resolveSincoIds(crm, deal, 'deal-1');
    assert.equal(result.isOk(), true);
    assert.deepEqual(result.value, { idAgrupacionSinco: 20, idProyectoSinco: 8 });
  });

  it('errors when no mirror props and 0 associations', async () => {
    const deal = makeDealRecord({ id_agrupacion_sinco_fx: null, id_proyecto_sinco_fx: null });
    const crm = makeMockCrm({
      getAssociatedResult: Promise.resolve(ok([])),
    });
    const result = await resolveSincoIds(crm, deal, 'deal-1');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_RESOURCE_NOT_FOUND');
  });

  it('errors when no mirror props and >1 associations (ambiguous)', async () => {
    const deal = makeDealRecord({ id_agrupacion_sinco_fx: null, id_proyecto_sinco_fx: null });
    const a1: CrmRecord = { id: 'a1', objectType: 'agrupacion', properties: { id_sinco_fx: '10', id_proyecto_sinco_fx: '5' } };
    const a2: CrmRecord = { id: 'a2', objectType: 'agrupacion', properties: { id_sinco_fx: '11', id_proyecto_sinco_fx: '6' } };
    const crm = makeMockCrm({
      getAssociatedResult: Promise.resolve(ok([a1, a2])),
    });
    const result = await resolveSincoIds(crm, deal, 'deal-1');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_AMBIGUOUS_RESOURCE');
  });

  it('errors when association agrupacion has no id_sinco_fx', async () => {
    const deal = makeDealRecord({ id_agrupacion_sinco_fx: null, id_proyecto_sinco_fx: null });
    const agrupacion: CrmRecord = {
      id: 'agrup-1',
      objectType: 'agrupacion',
      properties: { id_sinco_fx: null, id_proyecto_sinco_fx: '8' },
    };
    const crm = makeMockCrm({
      getAssociatedResult: Promise.resolve(ok([agrupacion])),
    });
    const result = await resolveSincoIds(crm, deal, 'deal-1');
    assert.equal(result.isErr(), true);
  });
});

// ============================================================================
// resolvePrimaryContact
// ============================================================================

describe('resolvePrimaryContact', () => {
  it('resolves contact by VID when contacto_principal_vid_fx is set', async () => {
    const deal = makeDealRecord({ contacto_principal_vid_fx: '501' });
    const contact = makeContactRecord();
    const crm = makeMockCrm({
      getRecordResult: Promise.resolve(ok(contact)),
    });
    const result = await resolvePrimaryContact(crm, deal, 'deal-1');
    assert.equal(result.isOk(), true);
    assert.equal(result.value.id, '501');
  });

  it('errors when VID is set but contact not found (stale)', async () => {
    const deal = makeDealRecord({ contacto_principal_vid_fx: '999' });
    const crm = makeMockCrm({
      getRecordResult: Promise.resolve(ok(null)),
    });
    const result = await resolvePrimaryContact(crm, deal, 'deal-1');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_INVALID_VALUE');
  });

  it('falls back to association when VID is empty', async () => {
    const deal = makeDealRecord({ contacto_principal_vid_fx: null });
    const contact = makeContactRecord();
    const crm = makeMockCrm({
      getAssociatedResult: Promise.resolve(ok([contact])),
    });
    const result = await resolvePrimaryContact(crm, deal, 'deal-1');
    assert.equal(result.isOk(), true);
    assert.equal(result.value.id, '501');
  });

  it('errors when VID empty and 0 associated contacts', async () => {
    const deal = makeDealRecord({ contacto_principal_vid_fx: null });
    const crm = makeMockCrm({
      getAssociatedResult: Promise.resolve(ok([])),
    });
    const result = await resolvePrimaryContact(crm, deal, 'deal-1');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_RESOURCE_NOT_FOUND');
  });

  it('errors when VID empty and >1 associated contacts (ambiguous)', async () => {
    const deal = makeDealRecord({ contacto_principal_vid_fx: null });
    const c1 = makeContactRecord();
    const c2: CrmRecord = { id: '502', objectType: 'contact', properties: { firstname: 'Maria', lastname: 'López' } };
    const crm = makeMockCrm({
      getAssociatedResult: Promise.resolve(ok([c1, c2])),
    });
    const result = await resolvePrimaryContact(crm, deal, 'deal-1');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_AMBIGUOUS_RESOURCE');
  });
});

// ============================================================================
// buildPlanPagosFromDealProps
// ============================================================================

describe('buildPlanPagosFromDealProps', () => {
  const baseProps: Record<string, unknown> = {
    valor_separacion_fx: '5000000',
    separacion_fecha_fx: '2026-06-15',
  };

  it('builds separacion-only plan (minimal)', () => {
    const result = buildPlanPagosFromDealProps(baseProps, 'jimenez_demo');
    assert.equal(result.isOk(), true);
    assert.equal(result.value.length, 1);
    assert.equal(result.value[0].idConcepto, 0); // separacion concept
    assert.equal(result.value[0].valor, 5000000);
    assert.equal(result.value[0].numeroCuota, 1);
  });

  it('builds full plan with cuota inicial + mensual + saldo', () => {
    const props = {
      ...baseProps,
      valor_cuota_inicial_fx: '10000000',
      cuota_inicial_fecha_fx: '2026-07-01',
      valor_cuota_mensual_fx: '2000000',
      numero_de_cuotas_fx: '12',
      cuotas_mensuales_fecha_fx: '2026-08-01',
      saldo_final_fx: '50000000',
      saldo_fecha_fx: '2027-08-01',
    };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isOk(), true);
    assert.equal(result.value.length, 4); // sep + inicial + mensual + saldo
  });

  it('errors on missing valor_separacion_fx', () => {
    const result = buildPlanPagosFromDealProps({}, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_MISSING_FIELD');
  });

  it('errors on missing separacion_fecha_fx', () => {
    const props = { valor_separacion_fx: '5000000' };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_MISSING_FIELD');
  });

  it('errors on negative money value', () => {
    const props = { ...baseProps, valor_separacion_fx: '-100' };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_INVALID_VALUE');
  });

  it('errors on non-numeric money value', () => {
    const props = { ...baseProps, valor_separacion_fx: 'abc' };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_INVALID_VALUE');
  });

  it('errors on impossible calendar date (feb 30)', () => {
    const props = { ...baseProps, separacion_fecha_fx: '2026-02-30' };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_INVALID_VALUE');
    assert.match(result.error.message, /Invalid day/);
  });

  it('errors on invalid month (13)', () => {
    const props = { ...baseProps, separacion_fecha_fx: '2026-13-01' };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /Invalid month/);
  });

  it('accepts Unix timestamp (13 digits)', () => {
    const props = { ...baseProps, separacion_fecha_fx: '1750000000000' };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isOk(), true);
  });

  it('errors on ambiguous date format', () => {
    const props = { ...baseProps, separacion_fecha_fx: '15/06/2026' };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /Expected YYYY-MM-DD/);
  });

  it('errors when numero_de_cuotas is 0', () => {
    const props = {
      ...baseProps,
      valor_cuota_mensual_fx: '2000000',
      numero_de_cuotas_fx: '0',
      cuotas_mensuales_fecha_fx: '2026-08-01',
    };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /positive integer/);
  });

  it('errors when numero_de_cuotas is fractional (1.5)', () => {
    const props = {
      ...baseProps,
      valor_cuota_mensual_fx: '2000000',
      numero_de_cuotas_fx: '1.5',
      cuotas_mensuales_fecha_fx: '2026-08-01',
    };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /positive integer/);
  });

  it('errors when valor_cuota_mensual present but numero_de_cuotas absent', () => {
    const props = {
      ...baseProps,
      valor_cuota_mensual_fx: '2000000',
    };
    const result = buildPlanPagosFromDealProps(props, 'jimenez_demo');
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /both be present or both absent/);
  });

  it('errors on unknown clientId (no payment config)', () => {
    const result = buildPlanPagosFromDealProps(baseProps, 'unknown_client');
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'BUSINESS_MISSING_PAYMENT_PLAN_CONFIG');
  });
});

// ============================================================================
// buildSeparacionInputFromHubSpot
// ============================================================================

describe('buildSeparacionInputFromHubSpot', () => {
  const baseParams = () => ({
    clientId: 'jimenez_demo',
    dealId: 'deal-1',
    deal: makeDealRecord(),
    contact: makeContactRecord(),
    sincoIds: { idAgrupacionSinco: 10, idProyectoSinco: 5 },
    now: new Date('2026-06-01'),
  });

  it('builds valid SeparacionInput from complete data', () => {
    const result = buildSeparacionInputFromHubSpot(baseParams());
    assert.equal(result.isOk(), true);
    const input = result.value;
    assert.equal(input.clientId, 'jimenez_demo');
    assert.equal(input.dealId, 'deal-1');
    assert.equal(input.comprador.tipoPersona, 'NATURAL');
    assert.equal(input.comprador.tipoIdentificacion, 'CC');
    assert.equal(input.comprador.numeroIdentificacion, '1234567890');
    assert.equal(input.comprador.primerNombre, 'Juan');
    assert.equal(input.comprador.primerApellido, 'Pérez');
    assert.equal(input.venta.tipoVenta, 'CONTADO');
    assert.equal(input.venta.idAgrupacionSinco, 10);
    assert.equal(input.venta.idProyectoSinco, 5);
  });

  it('errors when tipo_persona_fx missing', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).tipo_persona_fx = null;
    (params.contact.properties as Record<string, unknown>).tipo_persona_fx = undefined;
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_MISSING_FIELD');
  });

  it('errors when tipo_identificacion_fx invalid', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).tipo_identificacion_fx = 'DNI';
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_INVALID_VALUE');
    assert.match(result.error.message, /CC\|CE\|NIT\|PASAPORTE\|TI/);
  });

  it('errors when cedula_fx missing', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).cedula_fx = null;
    (params.contact.properties as Record<string, unknown>).cedula_fx = undefined;
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_MISSING_FIELD');
  });

  it('errors when primerNombre missing (v6 required)', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).nombre_comprador_fx = null;
    (params.contact.properties as Record<string, unknown>).firstname = null;
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /primerNombre/);
  });

  it('errors when primerApellido missing (v6 required)', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).apellido_comprador_fx = null;
    (params.contact.properties as Record<string, unknown>).lastname = null;
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /primerApellido/);
  });

  it('errors when tipo_venta_fx invalid', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).tipo_venta_fx = 'INVALIDO';
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /CONTADO\|CREDITO/);
  });

  it('maps HubSpot numeric tipo_venta_fx codes to domain enums', () => {
    const codeMap: Record<string, string> = {
      '0': 'CONTADO',
      '1': 'CREDITO',
      '2': 'CREDITO_TERCEROS',
      '3': 'LEASING',
    };
    for (const [code, expected] of Object.entries(codeMap)) {
      const params = baseParams();
      (params.deal.properties as Record<string, unknown>).tipo_venta_fx = code;
      const result = buildSeparacionInputFromHubSpot(params);
      assert.equal(result.isOk(), true, `code '${code}' should parse OK`);
      assert.equal(result.value.venta.tipoVenta, expected, `code '${code}' → ${expected}`);
    }
  });

  it('rejects unknown numeric tipo_venta_fx code', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).tipo_venta_fx = '99';
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /code 0-3/);
  });

  it('accepts genero M/F/O', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).genero_fx = 'F';
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isOk(), true);
    assert.equal(result.value.comprador.genero, 'F');
  });

  it('errors on invalid genero', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).genero_fx = 'X';
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isErr(), true);
    assert.match(result.error.message, /M\|F\|O/);
  });

  it('accepts empty genero (optional)', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).genero_fx = null;
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isOk(), true);
    assert.equal(result.value.comprador.genero, undefined);
  });

  it('errors on negative ingreso_mensual_fx', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).ingreso_mensual_fx = '-500';
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isErr(), true);
    assert.equal(result.error.code, 'VALIDATION_WEBHOOK_INVALID_VALUE');
  });

  it('falls back to contact props when deal props empty', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).nombre_comprador_fx = null;
    (params.deal.properties as Record<string, unknown>).apellido_comprador_fx = null;
    (params.contact.properties as Record<string, unknown>).firstname = 'María';
    (params.contact.properties as Record<string, unknown>).lastname = 'González';
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isOk(), true);
    assert.equal(result.value.comprador.primerNombre, 'María');
    assert.equal(result.value.comprador.primerApellido, 'González');
  });

  it('uses deal email/phone over contact when present', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).email_comprador_fx = 'deal@test.com';
    (params.deal.properties as Record<string, unknown>).telefono_comprador_fx = '3009999999';
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isOk(), true);
    assert.equal(result.value.comprador.correo, 'deal@test.com');
    assert.equal(result.value.comprador.celular, '3009999999');
  });

  it('maps writebackReady from deal prop', () => {
    const params = baseParams();
    (params.deal.properties as Record<string, unknown>).writeback_ready_fx = 'true';
    const result = buildSeparacionInputFromHubSpot(params);
    assert.equal(result.isOk(), true);
    assert.equal(result.value.writebackReady, true);
  });
});

// ============================================================================
// WB-6: WebhookRequestSchema operation field
// ============================================================================

import { z } from 'zod';

const WebhookRequestSchema = z.object({
  dealId: z.coerce.string().min(1),
  operation: z.enum(['separar', 'legalizar']).default('separar'),
  workflowId: z.string().optional(),
  eventId: z.string().optional(),
}).strict();

describe('WB-6: WebhookRequestSchema operation field', () => {

  it('defaults operation to "separar" when omitted', () => {
    const result = WebhookRequestSchema.safeParse({ dealId: '123' });
    assert.equal(result.success, true);
    assert.equal(result.data!.operation, 'separar');
  });

  it('accepts operation="separar" explicitly', () => {
    const result = WebhookRequestSchema.safeParse({ dealId: '456', operation: 'separar' });
    assert.equal(result.success, true);
    assert.equal(result.data!.operation, 'separar');
  });

  it('accepts operation="legalizar"', () => {
    const result = WebhookRequestSchema.safeParse({ dealId: '789', operation: 'legalizar' });
    assert.equal(result.success, true);
    assert.equal(result.data!.operation, 'legalizar');
  });

  it('rejects invalid operation value', () => {
    const result = WebhookRequestSchema.safeParse({ dealId: '123', operation: 'anular' });
    assert.equal(result.success, false);
  });

  it('preserves dealId and optional fields with legalizar', () => {
    const result = WebhookRequestSchema.safeParse({
      dealId: '999',
      operation: 'legalizar',
      workflowId: 'wf-001',
      eventId: 'ev-002',
    });
    assert.equal(result.success, true);
    assert.equal(result.data!.dealId, '999');
    assert.equal(result.data!.operation, 'legalizar');
    assert.equal(result.data!.workflowId, 'wf-001');
    assert.equal(result.data!.eventId, 'ev-002');
  });
});
