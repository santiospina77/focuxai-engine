/**
 * GET /api/engine/quoter/session — Read current quoter session + contact + owner.
 *
 * Returns session data (clientId, portalId, contactId, userEmail) if a valid
 * session cookie exists. The frontend calls this on mount instead of reading
 * session data from query params (Architect HIGH-2: clean redirect URL).
 *
 * When authenticated, also fetches:
 *   - Contact properties from HubSpot (buyer data to pre-fill form)
 *   - Contact owner from HubSpot Owners API (asesor identity)
 *
 * Responses:
 *   200 → { authenticated: true, session: {...}, contact?: {...}, owner?: {...} }
 *   200 → { authenticated: false } (no session, direct access mode)
 *   401 → session required but missing or invalid
 *
 * FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
 * Focux Digital Group S.A.S.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateQuoterSession } from '@/engine/core/auth/quoterSession';
import { resolveHubSpotToken } from '@/engine/core/config/clientRegistry';

// ═══════════════════════════════════════════════════════════
// HubSpot properties to fetch for the contact
// ═══════════════════════════════════════════════════════════

const CONTACT_PROPERTIES = [
  'firstname',
  'lastname',
  'phone',
  'email',
  'cedula_fx',
  'tipo_documento_fx',
  'tipo_persona_fx',
  'canal_atribucion_fx',
  'lista_proyectos_fx',
  'proyecto_activo_fx',
  'hubspot_owner_id',
] as const;

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface ContactData {
  hubspotId: string;
  firstname: string;
  lastname: string;
  phone: string;
  email: string;
  cedula: string;
  tipoDocumento: string;
  tipoPersona: string;
  canal: string;
  listaProyectos: string;
  proyectoActivo: string;
}

interface OwnerData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

// ═══════════════════════════════════════════════════════════
// HubSpot fetch helpers
// ═══════════════════════════════════════════════════════════

async function fetchContactById(
  contactId: string,
  token: string,
): Promise<{ contact: ContactData; ownerId: string | null } | null> {
  try {
    const propsParam = CONTACT_PROPERTIES.join(',');
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=${propsParam}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 0 }, // no cache
      },
    );

    if (!res.ok) {
      console.error(`[quoter/session] HubSpot contact fetch failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const props = data.properties ?? {};

    return {
      contact: {
        hubspotId: data.id,
        firstname: props.firstname ?? '',
        lastname: props.lastname ?? '',
        phone: props.phone ?? '',
        email: props.email ?? '',
        cedula: props.cedula_fx ?? '',
        tipoDocumento: props.tipo_documento_fx ?? '',
        tipoPersona: props.tipo_persona_fx ?? '',
        canal: props.canal_atribucion_fx ?? '',
        listaProyectos: props.lista_proyectos_fx ?? '',
        proyectoActivo: props.proyecto_activo_fx ?? '',
      },
      ownerId: props.hubspot_owner_id || null,
    };
  } catch (err) {
    console.error('[quoter/session] Contact fetch error:', err);
    return null;
  }
}

async function fetchOwnerById(
  ownerId: string,
  token: string,
): Promise<OwnerData | null> {
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/owners/${ownerId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 0 },
      },
    );

    if (!res.ok) {
      console.error(`[quoter/session] HubSpot owner fetch failed: ${res.status}`);
      return null;
    }

    const data = await res.json();

    return {
      id: data.id,
      firstName: data.firstName ?? '',
      lastName: data.lastName ?? '',
      email: data.email ?? '',
    };
  } catch (err) {
    console.error('[quoter/session] Owner fetch error:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// GET handler
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionOrError = validateQuoterSession(request);

  // Auth error (401) — forward it
  if (sessionOrError instanceof NextResponse) return sessionOrError;

  // null = direct access / bypass mode
  if (!sessionOrError) {
    return NextResponse.json(
      { authenticated: false },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // ── Valid session — enrich with HubSpot data ──
  const { clientId, portalId, contactId, userEmail } = sessionOrError;

  const responseData: Record<string, unknown> = {
    authenticated: true,
    session: { clientId, portalId, contactId, userEmail },
  };

  // Try to fetch contact + owner from HubSpot (non-blocking: failure = no prefill)
  const hsToken = resolveHubSpotToken(clientId);

  if (hsToken && contactId) {
    const result = await fetchContactById(contactId, hsToken);

    if (result) {
      responseData.contact = result.contact;

      // Fetch owner if contact has one
      if (result.ownerId) {
        const owner = await fetchOwnerById(result.ownerId, hsToken);
        if (owner) {
          responseData.owner = owner;
        }
      }
    }
  }

  // If no owner resolved, provide fallback from session userEmail
  if (!responseData.owner) {
    responseData.ownerFallback = { email: userEmail };
  }

  return NextResponse.json(responseData, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
