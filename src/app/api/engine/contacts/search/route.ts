/**
 * POST /api/engine/contacts/search — Búsqueda de contactos en HubSpot por email.
 *
 * Recibe { clientId, email } → busca en HubSpot Search API → retorna contacto o not found.
 *
 * Multi-cliente: resuelve token desde env via CLIENT_REGISTRY (mismo patrón que inventory route).
 *
 * Propiedades retornadas (todas _fx del JSON v17):
 *   - firstname, lastname, phone, email
 *   - cedula_fx, tipo_documento_fx, canal_atribucion_fx, lista_proyectos_fx, proyecto_activo_fx
 *
 * Responses:
 *   200 → { found: true, contact: {...} }
 *   200 → { found: false }
 *   400 → clientId o email faltante / email inválido
 *   404 → clientId no configurado
 *   500 → token no configurada
 *   502 → error de HubSpot
 *
 * Headers: Cache-Control: no-store
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 * Focux Digital Group S.A.S. — Abril 22, 2026
 */

import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════════════════════
// Client registry — misma fuente que inventory route
// En producción: importar desde un módulo compartido
// ═══════════════════════════════════════════════════════════

interface ClientContactConfig {
  readonly hubspotTokenEnvVar: string;
}

const CLIENT_REGISTRY: Record<string, ClientContactConfig> = {
  jimenez_demo: {
    hubspotTokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',
  },
  // Agregar más clientes aquí (Urbansa, etc.)
};

// ═══════════════════════════════════════════════════════════
// Propiedades que pedimos a HubSpot
// ═══════════════════════════════════════════════════════════

const CONTACT_PROPERTIES = [
  'firstname',
  'lastname',
  'phone',
  'email',
  'cedula_fx',
  'tipo_documento_fx',
  'canal_atribucion_fx',
  'lista_proyectos_fx',
  'proyecto_activo_fx',
] as const;

// ═══════════════════════════════════════════════════════════
// Tipos
// ═══════════════════════════════════════════════════════════

interface ContactSearchRequest {
  clientId: string;
  email: string;
}

interface ContactFound {
  found: true;
  contact: {
    hubspotId: string;
    firstname: string;
    lastname: string;
    phone: string;
    email: string;
    cedula: string;
    tipoDocumento: string;
    canal: string;
    listaProyectos: string;
    proyectoActivo: string;
  };
}

interface ContactNotFound {
  found: false;
}

type ContactSearchResponse = ContactFound | ContactNotFound;

interface ErrorResponse {
  error: string;
  message: string;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function errorResponse(status: number, error: string, message: string): NextResponse<ErrorResponse> {
  return NextResponse.json(
    { error, message, timestamp: new Date().toISOString() },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ═══════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Parse body ──
  let body: ContactSearchRequest;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_BODY', 'Body debe ser JSON válido con { clientId, email }.');
  }

  const clientId = (body.clientId ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();

  // ── Validate inputs ──
  if (clientId.length === 0) {
    return errorResponse(400, 'MISSING_CLIENT_ID', 'clientId es obligatorio.');
  }

  if (email.length === 0) {
    return errorResponse(400, 'MISSING_EMAIL', 'email es obligatorio.');
  }

  if (!isValidEmail(email)) {
    return errorResponse(400, 'INVALID_EMAIL', `"${email}" no es un email válido.`);
  }

  // ── Resolve client config ──
  const clientConfig = CLIENT_REGISTRY[clientId];
  if (!clientConfig) {
    return errorResponse(404, 'CLIENT_NOT_FOUND', `clientId="${clientId}" no está configurado.`);
  }

  // ── Resolve HubSpot token ──
  const token = process.env[clientConfig.hubspotTokenEnvVar];
  if (!token || token.trim().length === 0) {
    return errorResponse(
      500,
      'MISSING_TOKEN',
      `Env var ${clientConfig.hubspotTokenEnvVar} no está configurada.`,
    );
  }

  // ── Call HubSpot Search API ──
  try {
    const hsResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email,
              },
            ],
          },
        ],
        properties: [...CONTACT_PROPERTIES],
        limit: 1,
      }),
    });

    if (!hsResponse.ok) {
      const errorBody = await hsResponse.text();
      console.error(
        `[contacts/search] HubSpot API error: ${hsResponse.status} — ${errorBody}`,
      );
      return errorResponse(
        502,
        'HUBSPOT_API_ERROR',
        `HubSpot respondió ${hsResponse.status}. Revisar logs del servidor.`,
      );
    }

    const hsData = await hsResponse.json();

    // ── No results ──
    if (!hsData.results || hsData.results.length === 0) {
      return NextResponse.json(
        { found: false } satisfies ContactNotFound,
        { status: 200, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // ── Contact found ──
    const contact = hsData.results[0];
    const props = contact.properties ?? {};

    const result: ContactFound = {
      found: true,
      contact: {
        hubspotId: contact.id,
        firstname: props.firstname ?? '',
        lastname: props.lastname ?? '',
        phone: props.phone ?? '',
        email: props.email ?? email,
        cedula: props.cedula_fx ?? '',
        tipoDocumento: props.tipo_documento_fx ?? '',
        canal: props.canal_atribucion_fx ?? '',
        listaProyectos: props.lista_proyectos_fx ?? '',
        proyectoActivo: props.proyecto_activo_fx ?? '',
      },
    };

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[contacts/search] Unexpected error: ${message}`);
    return errorResponse(500, 'INTERNAL_ERROR', message);
  }
}
