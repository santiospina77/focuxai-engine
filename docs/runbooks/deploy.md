# Runbook: Deploy to Production

> **When:** After merging feature branches or hotfixes.
> **Who:** Any engineer with Vercel and HubSpot CLI access.
> **Confidential** — Focux Digital Group S.A.S.

---

## Engine Deploy (Vercel)

El Engine se deploya automáticamente vía Git push. **NUNCA ejecutar `npx vercel --prod`.**

### Standard deploy

```bash
# 1. Asegurar que estás en main actualizado
git checkout main
git pull origin main

# 2. Merge tu feature branch
git merge feature/your-branch

# 3. Build local para verificar
npm run build

# 4. Push — Vercel deploya automáticamente
git push origin main
```

### Verificar deploy

```bash
# Health check
curl "https://engine.focux.co/api/engine/health?clientId=jimenez_demo"

# Ver último deployment en Vercel
# Dashboard: https://vercel.com/focux-digital/focuxai-engine/deployments
```

### Rollback

Si el deploy falla o hay regresión:

1. Ir a Vercel Dashboard → Deployments
2. Encontrar el último deployment exitoso
3. Click "..." → "Promote to Production"

---

## App Card Deploy (HubSpot)

Los archivos de App Card viven en SpaceCommander, NO en el repo Git.

### Paso a paso

```bash
# 1. Copiar archivos actualizados al proyecto HubSpot
# Los archivos fuente están en:
#   SpaceCommander/04-cotizador-jimenez/focuxai-engine/_hubspot-app/

# 2. Navegar al proyecto HubSpot
cd focux-quoter-card

# 3. Deploy al portal
npx hs project upload --account=51256354    # demo
# npx hs project upload --account=51059324  # producción
```

### Verificar

1. Abrir un contacto en HubSpot
2. Verificar que el App Card aparece en el sidebar derecho
3. Click "Abrir Cotizador" — debe abrir nueva pestaña

### Build numbers

Cada deploy incrementa el build number. Anotar en STATE.md:
```
App Card build #N desplegada en portal XXXXX
```

---

## Environment Variables

Para agregar o modificar env vars en Vercel:

```bash
# SIEMPRE printf, NUNCA echo
printf 'valor' | vercel env add NOMBRE production

# Para actualizar una existente: remove + add
vercel env rm NOMBRE production
printf 'nuevo_valor' | vercel env add NOMBRE production

# Verificar
vercel env ls
```

**⚠️ Después de cambiar env vars, redeploy necesario:**

```bash
# Trigger redeploy sin cambios de código
vercel deployments ls  # ver último commit
# Ir a Vercel Dashboard → Redeploy
```

---

*Focux | www.focux.co | Documento confidencial*
