# ADR-003: Advisor = HubSpot Contact Owner — No Advisor Table

**Status:** Accepted (permanent — CEO decision)
**Date:** 2026-05-25
**Decision makers:** Santiago Ospina (CEO)

---

## Context

The cotizador needs to show which sales advisor is creating the quotation. The initial design considered a lookup table of advisors maintained by the client, or a dropdown in the UI.

## Decision

The advisor is resolved from the **Owner of the HubSpot contact** via the Owners API (`GET /crm/v3/owners/{ownerId}`). No advisor table, no dropdown, no hardcoded list.

Santiago rejected the advisor table approach explicitly: *"eso cambia mucho y nadie va a actualizar eso después"*.

## Implementation

1. `GET /api/engine/quoter/session` fetches the contact from HubSpot, reads `hubspot_owner_id`, then calls Owners API to get `firstName`, `lastName`, `email`.
2. Session response includes `owner: { id, firstName, lastName, email }`.
3. Frontend (`QuoterClient.tsx`) displays the owner as the advisor — read-only, not editable.
4. When creating a quotation, advisor payload is: `{ id: null, name: "FirstName LastName", email: "owner@client.com" }`.
5. DB stores `advisor_id` as the email (TEXT NOT NULL), not a numeric ID.

## Fallback

If the contact has no owner assigned in HubSpot, the session returns `owner: null`. The cotizador shows the `userEmail` from the launch token as fallback.

## Consequences

**Positive:**
- Single source of truth (HubSpot) — no sync drift
- Zero maintenance for the client — advisor list stays current when they reassign contacts
- Works automatically for any new advisor added to the HubSpot team

**Negative:**
- Depends on clients maintaining owner assignments in HubSpot (which they already do for their CRM workflow)
- Cannot override advisor in the cotizador UI (by design — prevents misattribution)
- If HubSpot Owners API is down, advisor shows as empty (graceful degradation)

## ⚠️ Permanent Decision

This is a permanent architectural decision. The removed mock `ASESORES` array must NEVER be restored. Any future request to add an advisor dropdown should be redirected to "assign the correct Owner in HubSpot."

---

*Focux | www.focux.co | Documento confidencial*
