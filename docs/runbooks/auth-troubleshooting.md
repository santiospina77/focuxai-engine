# Runbook: Auth Troubleshooting

> **When:** Users can't access the cotizador, tokens fail, cookies expire.
> **Who:** Any engineer.
> **Confidential** — Focux Digital Group S.A.S.

---

## AUTH-1 Flow Recap

```
App Card → App Function (launchQuoter.js)
  → POST /api/engine/quoter/launch-token (Bearer: HUBSPOT_CARD_LAUNCH_SECRET_<CLIENT>)
  → { token, expiresIn: 300 }

App Card opens: /quoter/launch?token=...
  → Validate HMAC → Set cookie quoter_session (HttpOnly, 8hrs) → 302 /quoter?clientId=X

Cotizador loads → GET /api/engine/quoter/session (cookie)
  → { contact, owner } from HubSpot APIs
```

---

## Common Issues

### 1. "INVALID_LAUNCH_SECRET" (401 on launch-token)

**Causa más probable:** Trailing `\n` en la env var.

```bash
# Verificar longitud del secret
vercel env pull .env.check
wc -c <<< "$(grep HUBSPOT_CARD_LAUNCH_SECRET .env.check | cut -d= -f2)"
# Debe ser 64 chars (hex de 32 bytes). Si es 65, hay un \n.

# Fix: re-setear con printf
vercel env rm HUBSPOT_CARD_LAUNCH_SECRET_JIMENEZ_DEMO production
printf "$(openssl rand -hex 32)" | vercel env add HUBSPOT_CARD_LAUNCH_SECRET_JIMENEZ_DEMO production
# ⚠️ También actualizar el secret en la App Function (launchQuoter.js)
```

**Otra causa:** Secret en App Function no coincide con el de Vercel. Ambos deben ser idénticos.

### 2. "UNKNOWN_PORTAL" (403 on launch-token)

El `portalId` enviado por la App Function no está en `PORTAL_CLIENT_MAP`.

**File:** `src/engine/core/auth/quoterSession.ts`

```typescript
const PORTAL_CLIENT_MAP: Record<string, string> = {
  '51256354': 'jimenez_demo',
  '51059324': 'jimenez_prod',
  // ¿Falta el portal?
};
```

Verificar que el portalId del App Function coincide con una entrada.

### 3. Token expirado (redirect a ?error=invalid_token)

El launch token tiene **5 minutos de TTL**. Si el usuario tarda más en hacer click, expira.

**No es un bug** — es by design para seguridad. El usuario simplemente debe volver a hacer click en "Abrir Cotizador" desde HubSpot.

### 4. Cookie no se setea (cotizador abre sin sesión)

Posibles causas:
- **Mixed content:** El Engine está en HTTPS pero el launch se hizo desde HTTP. Cookie `Secure` no se setea.
- **Third-party cookie blocking:** Algunos browsers bloquean cookies cross-site. La cookie es `SameSite=Lax`, lo cual debería funcionar para navigation requests (top-level).
- **Safari ITP:** Safari es más restrictivo. Verificar que el dominio del Engine es el mismo que aparece en la barra de direcciones.

### 5. Session retorna `{ authenticated: false }`

La cookie `quoter_session` no está presente o expiró (8hrs TTL).

```bash
# Verificar cookie en browser:
# DevTools → Application → Cookies → buscar "quoter_session"
```

Si la cookie existe pero session retorna false:
- Cookie corrupta o firmada con un `QUOTER_SESSION_SECRET` diferente
- `QUOTER_SESSION_SECRET` cambió en Vercel después del login

### 6. Owner/asesor vacío en sesión

El contacto no tiene Owner asignado en HubSpot.

```bash
# Verificar owner del contacto
curl "https://api.hubapi.com/crm/v3/objects/contacts/CONTACT_ID?properties=hubspot_owner_id" \
  -H "Authorization: Bearer $HUBSPOT_TOKEN" | jq '.properties.hubspot_owner_id'
```

Si es `null`, asignar Owner en HubSpot antes de usar el cotizador.

---

## NextAuth (Dashboard Interno)

### "Access Denied" al login

Solo emails `@focux.co` y `@focuxdigital.com` están permitidos. Verificar en `src/app/api/auth/[...nextauth]/route.ts`.

### Session expira constantemente

Verificar que `NEXTAUTH_SECRET` es consistente entre deploys. Si cambia, todas las sesiones se invalidan.

---

## Bearer Token Auth (Cron/Admin/Webhook)

### Sync retorna 401

```bash
# Verificar que CRON_SECRET coincide
curl "https://engine.focux.co/api/engine/sync/inventory?clientId=jimenez_demo" \
  -H "Authorization: Bearer $CRON_SECRET" -v
# Buscar en output: "401" o "403"
```

Si falla, verificar que la variable en Vercel no tiene trailing `\n` (printf fix).

### Webhook retorna 401

Mismo patrón — `WEBHOOK_SECRET_<CLIENT>` debe coincidir entre HubSpot workflow y Vercel.

---

*Focux | www.focux.co | Documento confidencial*
