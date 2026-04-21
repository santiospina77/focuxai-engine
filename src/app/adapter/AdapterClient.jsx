"use client";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   FOCUXAI ADAPTER v4 — Universal HubSpot Portal Deployer
   100% JSON-driven · No hardcoded schemas · Multi-client
   Reads Focux Ops JSON → Deploys to HubSpot via API
   
   v4 CHANGES from v3:
   - Mirror properties: every _fx property exists in BOTH contacts AND deals
   - Unified motivos_perdida (same property name in both objects)
   - canal_origen_fx replaces canal_atribucion_fx (aligned with JSON v10)
   - proyecto_activo_fx added as core property
   - asesor_anterior_fx added for multi-project logic
   - etapa_lead_fx uses pipeline stages (synced contact↔deal)
   - No workflow creation (API in beta, deferred to SOP)
   ═══════════════════════════════════════════════════════════════ */

/* ═══ DESIGN TOKENS (Focux Design System — same as Ops v7) ═══ */
const font = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";
const tk = {
  navy:"#211968", blue:"#1A4BA8", teal:"#0D7AB5", cyan:"#2099D8",
  bg:"#FAFBFD", card:"#FFFFFF", border:"#E8ECF1", borderLight:"#F1F4F8",
  text:"#1A1D26", textSec:"#6B7280", textTer:"#9CA3AF",
  green:"#10B981", red:"#EF4444", amber:"#F59E0B",
  greenBg:"#ECFDF5", redBg:"#FEF2F2", amberBg:"#FFFBEB",
  accent:"#0D7AB5", accentLight:"#E0F4FD",
};

/* ═══ HUBSPOT API HELPER ═══ */
const HS_PROXY = "/api/hubspot";

async function hsCall(token, method, path, body = null) {
  const url = `${HS_PROXY}${path}`;
  const opts = {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

/* ═══════════════════════════════════════════════════════════════
   HELPER: Normalize string to HubSpot-safe value
   ═══════════════════════════════════════════════════════════════ */
const toVal = (s) => s.toLowerCase().replace(/\s+/g, "_").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/* ═══════════════════════════════════════════════════════════════
   JSON → DEPLOY PLAN BUILDER
   v4 CORE: Mirror properties across contacts & deals.
   Every _fx property is created in BOTH objects.
   ═══════════════════════════════════════════════════════════════ */

function buildDeployPlan(config) {
  const plan = {
    clientName: config.nombreConst || "Sin nombre",
    hasCustomObjects: false,
    hasCotizador: config.tieneCotizador === true,
    hasSinco: config.tieneCotizador === true,
    scopes: [],
    propertyGroups: [],
    mirrorProperties: [],    // v4: shared props for BOTH contacts and deals
    contactOnlyProperties: [], // v4: props only in contacts (Sinco-specific)
    dealOnlyProperties: [],    // v4: props only in deals (Sinco-specific, financial)
    pipeline: null,
    customObjects: [],
    associations: [],
  };

  // ─── Determine if Custom Objects are needed ───
  if (config.customObjects && config.customObjects.length > 0) {
    plan.hasCustomObjects = true;
    plan.customObjects = config.customObjects;
  } else if (config.tieneCotizador === true) {
    plan.hasCustomObjects = true;
    plan.customObjects = buildCotizadorCustomObjects(config);
  }

  // ─── Scopes ───
  plan.scopes = buildScopes(plan.hasCustomObjects);

  // ─── Property Groups ───
  plan.propertyGroups = [
    { objectType: "contacts", name: "focux", label: "Focux Engine" },
    { objectType: "deals", name: "focux", label: "Focux Engine" },
    { objectType: "companies", name: "focux", label: "Focux Engine" },
  ];

  // ─── Dynamic Options from JSON ───
  const opts = buildDynamicOptions(config);

  // ─── v4: Mirror Properties (created in BOTH contacts and deals) ───
  plan.mirrorProperties = buildMirrorProperties(config, opts);

  // ─── v4: Object-specific properties (only if cotizador/sinco) ───
  if (config.tieneCotizador === true) {
    plan.contactOnlyProperties = buildContactOnlyProperties(config);
    plan.dealOnlyProperties = buildDealOnlyProperties(config);
  }

  // ─── Pipeline ───
  if (config.pipeline && config.pipeline.length > 0) {
    plan.pipeline = {
      label: config.nombrePipeline || `Pipeline de Ventas ${config.nombreConst}`,
      stages: config.pipeline.map((s, i) => ({
        label: s.n,
        displayOrder: i,
        probability: s.p,
        metadata: { probability: (s.p / 100).toFixed(2) },
      })),
    };
  }

  // ─── Associations (only if Custom Objects) ───
  if (plan.hasCustomObjects && plan.customObjects.length > 0) {
    plan.associations = buildAssociations(plan.customObjects);
  }

  return plan;
}

/* ─── Build dynamic options from config ─── */
function buildDynamicOptions(config) {
  const macroNames = (config.macros || []).map(m => ({
    label: m.nombre,
    value: toVal(m.nombre),
  }));

  // v4: Combine all active channels (std + custom + traditional active)
  const allChannels = [
    ...(config.chStd || []).filter(c => c.a).map(c => ({ label: c.n, value: toVal(c.n) })),
    ...(config.chTr || []).filter(c => c.a).map(c => ({ label: c.n, value: toVal(c.n) })),
    ...(config.chCu || []).map(c => ({ label: c, value: toVal(c) })),
  ];

  const rangos = (config.rangos || []).map(r => ({ label: r, value: toVal(r) }));
  const niveles = (config.niveles || []).map(n => ({ label: n, value: n }));

  // v4: Unified motivos (same for contact and deal)
  const motivosPerdida = (config.motivosPerdida || config.moD || []).map(m => ({
    label: m, value: toVal(m),
  }));

  // v4: Etapas from pipeline (contact etapas = deal pipeline stages)
  const etapas = (config.etP || config.pipeline?.map(p => p.n) || []).map(e => ({
    label: e.trim(), value: toVal(e.trim()),
  }));

  return { macroNames, allChannels, rangos, niveles, motivosPerdida, etapas };
}

/* ═══════════════════════════════════════════════════════════════
   v4 MIRROR PROPERTIES
   These are created in BOTH contacts AND deals with identical
   name, label, type, fieldType, and options.
   ═══════════════════════════════════════════════════════════════ */
function buildMirrorProperties(config, opts) {
  const props = [];

  // ── Proyecto e interés ──
  if (opts.macroNames.length > 0) {
    props.push({ name: "proyecto_activo_fx", label: "Proyecto Activo", type: "enumeration", fieldType: "select", group: "focux", options: opts.macroNames });
    props.push({ name: "lista_proyectos_fx", label: "Lista de Proyectos", type: "enumeration", fieldType: "checkbox", group: "focux", options: opts.macroNames });
  }

  // ── Canales de atribución (v4: unified, includes FB+IG separated) ──
  if (opts.allChannels.length > 0) {
    props.push({ name: "canal_origen_fx", label: "Canal de Origen", type: "enumeration", fieldType: "select", group: "focux", options: opts.allChannels });
  }

  // ── Etapas del lead (v4: same as pipeline stages) ──
  if (opts.etapas.length > 0) {
    props.push({ name: "etapa_lead_fx", label: "Etapa del Lead", type: "enumeration", fieldType: "select", group: "focux", options: opts.etapas });
  }

  // ── Calificación ──
  if (opts.rangos.length > 0) {
    props.push({ name: "rango_ingresos_fx", label: "Rango de Ingresos", type: "enumeration", fieldType: "select", group: "focux", options: opts.rangos });
  }

  if (opts.niveles.length > 0) {
    props.push({ name: "categoria_calificacion_fx", label: "Categoría de Calificación", type: "enumeration", fieldType: "select", group: "focux", options: opts.niveles });
  }

  // ── Conditional varsCalif ──
  const varsCalif = config.varsCalif || [];
  if (varsCalif.find(v => v.id === "interes_proyecto" && v.on)) {
    props.push({ name: "interes_proyecto_fx", label: "Interesa en el Proyecto", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Sí", value: "si" }, { label: "No", value: "no" }] });
  }
  if (varsCalif.find(v => v.id === "ahorros" && v.on)) {
    props.push({ name: "tiene_ahorros_fx", label: "Tiene Ahorros o Cesantías", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Sí", value: "si" }, { label: "No", value: "no" }] });
  }
  if (varsCalif.find(v => v.id === "proposito" && v.on)) {
    props.push({ name: "proposito_compra_fx", label: "Propósito de Compra", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Vivienda", value: "vivienda" }, { label: "Inversión", value: "inversion" }] });
  }
  if (varsCalif.find(v => v.id === "credito" && v.on)) {
    props.push({ name: "credito_preaprobado_fx", label: "Crédito Preaprobado", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Sí", value: "si" }, { label: "No", value: "no" }, { label: "En trámite", value: "en_tramite" }] });
  }
  if (varsCalif.find(v => v.id === "subsidios" && v.on)) {
    props.push({ name: "aplica_subsidios_fx", label: "Aplica a Subsidios", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Sí", value: "si" }, { label: "No", value: "no" }, { label: "No sabe", value: "no_sabe" }] });
  }

  // ── Motivos de pérdida (v4: UNIFIED — same name in contact and deal) ──
  if (opts.motivosPerdida.length > 0) {
    props.push({ name: "motivo_perdida_fx", label: "Motivo de Pérdida", type: "enumeration", fieldType: "select", group: "focux", options: opts.motivosPerdida });
  }

  // ── Identificación ──
  props.push({ name: "cedula_fx", label: "Cédula / Identificación", type: "string", fieldType: "text", group: "focux" });
  props.push({ name: "tipo_identificacion_fx", label: "Tipo de Identificación", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "CC", value: "CC" }, { label: "CE", value: "CE" }, { label: "NIT", value: "NIT" }, { label: "Pasaporte", value: "PAS" }] });

  // ── Gestión comercial ──
  props.push({ name: "asesor_anterior_fx", label: "Asesor Anterior", type: "string", fieldType: "text", group: "focux" });
  props.push({ name: "fecha_primer_contacto_fx", label: "Fecha Primer Contacto", type: "date", fieldType: "date", group: "focux" });
  props.push({ name: "fecha_ultimo_contacto_fx", label: "Fecha Último Contacto", type: "date", fieldType: "date", group: "focux" });
  props.push({ name: "numero_intentos_contacto_fx", label: "Número de Intentos de Contacto", type: "number", fieldType: "number", group: "focux" });

  // ── Uso del inmueble ──
  props.push({ name: "uso_inmueble_fx", label: "Uso del Inmueble", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Vivienda", value: "vivienda" }, { label: "Inversión", value: "inversion" }, { label: "Arriendo", value: "arriendo" }] });

  // ── Tipología de interés ──
  props.push({ name: "tipologia_interes_fx", label: "Tipología de Interés", type: "string", fieldType: "text", group: "focux" });

  // ── Datos financieros del deal (v4: also mirrored to contact for copy-back) ──
  props.push({ name: "valor_inmueble_fx", label: "Valor del Inmueble", type: "number", fieldType: "number", group: "focux" });
  props.push({ name: "porcentaje_separacion_fx", label: "% Separación", type: "number", fieldType: "number", group: "focux" });
  props.push({ name: "valor_separacion_fx", label: "Valor Separación", type: "number", fieldType: "number", group: "focux" });
  props.push({ name: "porcentaje_cuota_inicial_fx", label: "% Cuota Inicial", type: "number", fieldType: "number", group: "focux" });
  props.push({ name: "valor_cuota_inicial_fx", label: "Valor Cuota Inicial", type: "number", fieldType: "number", group: "focux" });
  props.push({ name: "numero_cuotas_fx", label: "Número de Cuotas", type: "number", fieldType: "number", group: "focux" });

  // ── Fechas de gestión ──
  props.push({ name: "fecha_opcion_fx", label: "Fecha de Opción", type: "date", fieldType: "date", group: "focux" });
  props.push({ name: "fecha_separacion_fx", label: "Fecha de Separación", type: "date", fieldType: "date", group: "focux" });
  props.push({ name: "fecha_formalizacion_fx", label: "Fecha de Formalización", type: "date", fieldType: "date", group: "focux" });

  // ── Origen lead ──
  props.push({ name: "origen_lead_fx", label: "Origen del Lead", type: "enumeration", fieldType: "select", group: "focux", options: [
    { label: "Orgánico", value: "organico" },
    { label: "Pauta", value: "pauta" },
    { label: "Referido", value: "referido" },
    { label: "Sala de Ventas", value: "sala" },
    ...(config.tieneAgente ? [{ label: "Agente IA", value: "agente_ia" }] : []),
  ]});

  // ── Lead scoring ──
  props.push({ name: "lead_scoring_fx", label: "Lead Scoring Focux", type: "number", fieldType: "number", group: "focux" });

  return props;
}

/* ═══════════════════════════════════════════════════════════════
   CONTACT-ONLY Properties (Sinco/cotizador specific)
   Only created when tieneCotizador === true
   ═══════════════════════════════════════════════════════════════ */
function buildContactOnlyProperties(config) {
  return [
    { name: "cotizacion_solicitada_fx", label: "Cotización Solicitada", type: "enumeration", fieldType: "booleancheckbox", group: "focux", options: [{ label: "Sí", value: "true" }, { label: "No", value: "false" }] },
    { name: "id_sinco_comprador_fx", label: "ID Comprador Sinco", type: "number", fieldType: "number", group: "focux" },
  ];
}

/* ═══════════════════════════════════════════════════════════════
   DEAL-ONLY Properties (Sinco/cotizador specific)
   Only created when tieneCotizador === true
   ═══════════════════════════════════════════════════════════════ */
function buildDealOnlyProperties(config) {
  return [
    { name: "id_venta_sinco_fx", label: "ID Venta Sinco", type: "number", fieldType: "number", group: "focux" },
    { name: "id_agrupacion_sinco_fx", label: "ID Agrupación Sinco", type: "number", fieldType: "number", group: "focux" },
    { name: "id_sinco_comprador_fx", label: "ID Comprador Sinco", type: "number", fieldType: "number", group: "focux" },
    { name: "cuota_inicial_fx", label: "Cuota Inicial Total (Sinco)", type: "number", fieldType: "number", group: "focux" },
    { name: "valor_cuota_fx", label: "Valor Cuota Mensual", type: "number", fieldType: "number", group: "focux" },
    { name: "valor_credito_fx", label: "Valor Crédito / Saldo Final", type: "number", fieldType: "number", group: "focux" },
    { name: "porcentaje_financiacion_fx", label: "% Financiación", type: "number", fieldType: "number", group: "focux" },
    { name: "precio_cotizado_fx", label: "Precio Cotizado (snapshot)", type: "number", fieldType: "number", group: "focux" },
    { name: "tipo_venta_fx", label: "Tipo de Venta", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Contado", value: "contado" }, { label: "Crédito", value: "credito" }, { label: "Leasing", value: "leasing" }] },
    { name: "fecha_bloqueo_fx", label: "Fecha de Bloqueo", type: "date", fieldType: "date", group: "focux" },
    { name: "dias_bloqueo_fx", label: "Días de Bloqueo", type: "number", fieldType: "number", group: "focux" },
    { name: "writeback_status_fx", label: "Estado Write-back Sinco", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Pendiente", value: "pending" }, { label: "Exitoso", value: "success" }, { label: "Fallido", value: "failed" }] },
    { name: "origen_fx", label: "Origen de la Cotización", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Cotizador", value: "cotizador" }, { label: "Import", value: "import" }, { label: "Manual", value: "manual" }] },
    { name: "descuento_fx", label: "Descuento Aplicado", type: "number", fieldType: "number", group: "focux" },
    { name: "vigencia_cotizacion_fx", label: "Vigencia Cotización (días)", type: "number", fieldType: "number", group: "focux" },
  ];
}

/* ─── Scopes: conditional on Custom Objects ─── */
function buildScopes(hasCustomObjects) {
  const base = [
    { scope: "crm.objects.contacts.read", category: "CRM", purpose: "Leer contactos existentes" },
    { scope: "crm.objects.contacts.write", category: "CRM", purpose: "Crear/actualizar contactos" },
    { scope: "crm.objects.companies.read", category: "CRM", purpose: "Leer empresas" },
    { scope: "crm.objects.companies.write", category: "CRM", purpose: "Crear/actualizar empresas" },
    { scope: "crm.objects.deals.read", category: "CRM", purpose: "Leer negocios y pipeline" },
    { scope: "crm.objects.deals.write", category: "CRM", purpose: "Crear/actualizar negocios" },
    { scope: "crm.schemas.contacts.read", category: "Schemas", purpose: "Leer schema de contactos" },
    { scope: "crm.schemas.contacts.write", category: "Schemas", purpose: "Crear propiedades de contacto" },
    { scope: "crm.schemas.companies.read", category: "Schemas", purpose: "Leer schema de empresas" },
    { scope: "crm.schemas.companies.write", category: "Schemas", purpose: "Crear propiedades de empresa" },
    { scope: "crm.schemas.deals.read", category: "Schemas", purpose: "Leer schema de negocios" },
    { scope: "crm.schemas.deals.write", category: "Schemas", purpose: "Crear propiedades de negocio" },
    { scope: "crm.objects.owners.read", category: "Owners", purpose: "Leer owners/asesores del portal" },
    { scope: "settings.users.read", category: "Settings", purpose: "Mapear usuarios a asesores" },
  ];

  if (hasCustomObjects) {
    base.push(
      { scope: "crm.objects.custom.read", category: "Custom Objects", purpose: "Leer registros de Custom Objects" },
      { scope: "crm.objects.custom.write", category: "Custom Objects", purpose: "Crear/actualizar registros de Custom Objects" },
      { scope: "crm.schemas.custom.read", category: "Schemas", purpose: "Leer definiciones de Custom Objects" },
      { scope: "crm.schemas.custom.write", category: "Schemas", purpose: "Crear Custom Objects y propiedades" },
    );
  }

  return base;
}

/* ─── Custom Objects for Cotizador model (Jiménez-style) ─── */
function buildCotizadorCustomObjects(config) {
  return [
    {
      name: "macroproyecto",
      labels: { singular: "Macroproyecto", plural: "Macroproyectos" },
      primaryDisplayProperty: "nombre_fx",
      associatedObjects: ["CONTACT", "DEAL"],
      properties: [
        { name: "nombre_fx", label: "Nombre", type: "string", fieldType: "text", isPrimary: true },
        { name: "id_sinco_fx", label: "ID Sinco", type: "number", fieldType: "number" },
        { name: "ciudad_fx", label: "Ciudad", type: "string", fieldType: "text" },
        { name: "tipo_fx", label: "Tipo (VIS/No VIS)", type: "enumeration", fieldType: "select", options: [{ label: "VIS", value: "VIS" }, { label: "VIP", value: "VIP" }, { label: "No VIS", value: "No VIS" }] },
        { name: "precio_desde_fx", label: "Precio Desde", type: "number", fieldType: "number" },
        { name: "precio_hasta_fx", label: "Precio Hasta", type: "number", fieldType: "number" },
        { name: "estado_fx", label: "Estado", type: "enumeration", fieldType: "select", options: [{ label: "Activo", value: "Activo" }, { label: "Inactivo", value: "Inactivo" }, { label: "Entregado", value: "Entregado" }] },
        { name: "id_origen_sinco_fx", label: "ID Empresa Sinco", type: "number", fieldType: "number" },
        { name: "numero_pisos_fx", label: "Número de Pisos", type: "number", fieldType: "number" },
      ],
    },
    {
      name: "proyecto",
      labels: { singular: "Proyecto", plural: "Proyectos" },
      primaryDisplayProperty: "nombre_fx",
      associatedObjects: ["CONTACT", "DEAL"],
      properties: [
        { name: "nombre_fx", label: "Nombre", type: "string", fieldType: "text", isPrimary: true },
        { name: "id_sinco_fx", label: "ID Sinco", type: "number", fieldType: "number" },
        { name: "id_macro_sinco_fx", label: "ID Macroproyecto Sinco", type: "number", fieldType: "number" },
        { name: "estrato_fx", label: "Estrato", type: "number", fieldType: "number" },
        { name: "valor_separacion_fx", label: "Valor Separación Default", type: "number", fieldType: "number" },
        { name: "porcentaje_cuota_inicial_fx", label: "% Cuota Inicial", type: "number", fieldType: "number" },
        { name: "porcentaje_financiacion_fx", label: "% Financiación", type: "number", fieldType: "number" },
        { name: "numero_cuotas_fx", label: "Número Cuotas Default", type: "number", fieldType: "number" },
        { name: "fecha_entrega_fx", label: "Fecha de Entrega", type: "date", fieldType: "date" },
        { name: "dias_bloqueo_fx", label: "Días de Bloqueo", type: "number", fieldType: "number" },
        { name: "vigencia_cotizacion_fx", label: "Vigencia Cotización (días)", type: "number", fieldType: "number" },
        { name: "total_unidades_fx", label: "Total Unidades", type: "number", fieldType: "number" },
        { name: "unidades_disponibles_fx", label: "Unidades Disponibles", type: "number", fieldType: "number" },
        { name: "estado_fx", label: "Estado", type: "enumeration", fieldType: "select", options: [{ label: "Activo", value: "Activo" }, { label: "Inactivo", value: "Inactivo" }, { label: "Entregado", value: "Entregado" }] },
      ],
    },
    {
      name: "unidad",
      labels: { singular: "Unidad", plural: "Unidades" },
      primaryDisplayProperty: "nombre_fx",
      associatedObjects: ["CONTACT", "DEAL"],
      properties: [
        { name: "nombre_fx", label: "Nombre", type: "string", fieldType: "text", isPrimary: true },
        { name: "id_sinco_fx", label: "ID Sinco", type: "number", fieldType: "number" },
        { name: "id_proyecto_sinco_fx", label: "ID Proyecto Sinco", type: "number", fieldType: "number" },
        { name: "tipo_unidad_fx", label: "Tipo de Unidad", type: "string", fieldType: "text" },
        { name: "clasificacion_fx", label: "Clasificación", type: "enumeration", fieldType: "select", options: [{ label: "Apartamento", value: "Apartamento" }, { label: "Parqueadero", value: "Parqueadero" }, { label: "Depósito", value: "Deposito" }] },
        { name: "es_principal_fx", label: "Es Principal", type: "enumeration", fieldType: "booleancheckbox", options: [{ label: "Sí", value: "true" }, { label: "No", value: "false" }] },
        { name: "precio_lista_fx", label: "Precio Lista", type: "number", fieldType: "number" },
        { name: "estado_fx", label: "Estado", type: "enumeration", fieldType: "select", options: [{ label: "Disponible", value: "Disponible" }, { label: "Bloqueada", value: "Bloqueada" }, { label: "Separada", value: "Separada" }, { label: "Vendida", value: "Vendida" }] },
        { name: "area_construida_fx", label: "Área Construida (m²)", type: "number", fieldType: "number" },
        { name: "area_total_fx", label: "Área Total (m²)", type: "number", fieldType: "number" },
        { name: "piso_fx", label: "Piso", type: "number", fieldType: "number" },
        { name: "alcobas_fx", label: "Alcobas", type: "number", fieldType: "number" },
        { name: "fecha_sync_fx", label: "Fecha Último Sync", type: "datetime", fieldType: "date" },
      ],
    },
    {
      name: "agrupacion",
      labels: { singular: "Agrupación", plural: "Agrupaciones" },
      primaryDisplayProperty: "nombre_fx",
      associatedObjects: ["CONTACT", "DEAL"],
      properties: [
        { name: "nombre_fx", label: "Nombre", type: "string", fieldType: "text", isPrimary: true },
        { name: "id_sinco_fx", label: "ID Sinco", type: "number", fieldType: "number" },
        { name: "id_proyecto_sinco_fx", label: "ID Proyecto Sinco", type: "number", fieldType: "number" },
        { name: "valor_subtotal_fx", label: "Valor Subtotal", type: "number", fieldType: "number" },
        { name: "valor_descuento_fx", label: "Valor Descuento", type: "number", fieldType: "number" },
        { name: "valor_total_neto_fx", label: "Valor Total Neto", type: "number", fieldType: "number" },
        { name: "estado_fx", label: "Estado", type: "enumeration", fieldType: "select", options: [{ label: "Disponible", value: "Disponible" }, { label: "Cotizado", value: "Cotizado" }, { label: "Bloqueado", value: "Bloqueado" }, { label: "Separado", value: "Separado" }, { label: "Vendido", value: "Vendido" }] },
        { name: "id_comprador_sinco_fx", label: "ID Comprador Sinco", type: "number", fieldType: "number" },
        { name: "id_vendedor_sinco_fx", label: "ID Vendedor Sinco", type: "number", fieldType: "number" },
        { name: "id_hubspot_deal_fx", label: "ID Deal HubSpot", type: "string", fieldType: "text" },
        { name: "tipo_venta_fx", label: "Tipo de Venta", type: "enumeration", fieldType: "select", options: [{ label: "Contado", value: "0" }, { label: "Crédito", value: "1" }, { label: "Exterior", value: "3" }] },
        { name: "fecha_venta_fx", label: "Fecha de Venta", type: "date", fieldType: "date" },
      ],
    },
  ];
}

/* ─── Associations between Custom Objects ─── */
function buildAssociations(customObjects) {
  const names = customObjects.map(co => co.name);
  const assocs = [];
  if (names.includes("macroproyecto") && names.includes("proyecto")) {
    assocs.push({ from: "macroproyecto", to: "proyecto", label: "Macroproyecto a Proyecto" });
  }
  if (names.includes("proyecto") && names.includes("unidad")) {
    assocs.push({ from: "proyecto", to: "unidad", label: "Proyecto a Unidad" });
  }
  if (names.includes("proyecto") && names.includes("agrupacion")) {
    assocs.push({ from: "proyecto", to: "agrupacion", label: "Proyecto a Agrupación" });
  }
  if (names.includes("agrupacion") && names.includes("unidad")) {
    assocs.push({ from: "agrupacion", to: "unidad", label: "Agrupación a Unidad" });
  }
  if (names.includes("agrupacion")) {
    assocs.push({ from: "agrupacion", to: "deals", label: "Agrupación a Deal" });
  }
  return assocs;
}

/* ═══ STYLES ═══ */
const ss = {
  label: { display:"block", fontSize:12, fontWeight:600, color:tk.text, marginBottom:4 },
  input: { width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${tk.border}`, fontSize:13, color:tk.text, outline:"none", boxSizing:"border-box", fontFamily:font },
  textarea: { width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${tk.border}`, fontSize:12, color:tk.text, outline:"none", boxSizing:"border-box", fontFamily:mono, minHeight:200, resize:"vertical" },
  card: { border:`1px solid ${tk.border}`, borderRadius:12, padding:20, marginBottom:14, background:tk.card },
  btn: (bg, color) => ({ padding:"10px 20px", borderRadius:8, border:"none", background:bg, color, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:font }),
  badge: (bg, color) => ({ display:"inline-flex", padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, background:bg, color, border:`1px solid ${color}25` }),
  logLine: (type) => ({
    padding:"4px 8px", fontSize:12, fontFamily:mono,
    borderLeft:`3px solid ${type === "ok" ? tk.green : type === "err" ? tk.red : type === "skip" ? tk.amber : tk.accent}`,
    background: type === "ok" ? tk.greenBg : type === "err" ? tk.redBg : type === "skip" ? tk.amberBg : tk.accentLight,
    marginBottom:2, borderRadius:"0 4px 4px 0",
  }),
  section: { marginBottom:20 },
  sectionTitle: { fontSize:14, fontWeight:700, margin:"0 0 10px", display:"flex", alignItems:"center", gap:8 },
};

/* ═══ MAIN COMPONENT ═══ */
export default function FocuxAdapter() {
  const [view, setView] = useState("home");
  const [token, setToken] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [config, setConfig] = useState(null);
  const [parseError, setParseError] = useState("");
  const [logs, setLogs] = useState([]);
  const [deploying, setDeploying] = useState(false);
  const [deployDone, setDeployDone] = useState(false);
  const [deployStats, setDeployStats] = useState({ total: 0, ok: 0, skip: 0, err: 0 });
  const logRef = useRef(null);
  const cancelRef = useRef(false);
  const fileInputRef = useRef(null);

  const addLog = useCallback((type, msg) => {
    setLogs(prev => [...prev, { type, msg, ts: new Date().toLocaleTimeString() }]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  }, []);

  const plan = useMemo(() => config ? buildDeployPlan(config) : null, [config]);

  // ─── JSON parsing ───
  const handleParseJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.nombreConst) throw new Error("JSON inválido: falta 'nombreConst'");
      if (!parsed.pipeline || parsed.pipeline.length === 0) throw new Error("JSON inválido: falta 'pipeline' con etapas");
      setConfig(parsed);
      setParseError("");
      setView("preview");
    } catch (e) {
      setParseError(e.message);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      setJsonText(text);
      try {
        const parsed = JSON.parse(text);
        if (!parsed.nombreConst) throw new Error("JSON inválido: falta 'nombreConst'");
        setConfig(parsed);
        setParseError("");
        setView("preview");
      } catch (err) {
        setParseError(err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = tk.border;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result;
        setJsonText(text);
        try {
          const parsed = JSON.parse(text);
          if (!parsed.nombreConst) throw new Error("JSON inválido: falta 'nombreConst'");
          setConfig(parsed);
          setParseError("");
          setView("preview");
        } catch (err) { setParseError(err.message); }
      };
      reader.readAsText(file);
    }
  };

  /* ═══ DEPLOY ENGINE v4 ═══ */
  const runDeploy = async () => {
    if (!token || !plan) return;
    setDeploying(true);
    setDeployDone(false);
    setLogs([]);
    cancelRef.current = false;
    const stats = { total: 0, ok: 0, skip: 0, err: 0 };
    const createdObjects = {};

    const log = (type, msg) => {
      stats.total++;
      if (type === "ok") stats.ok++;
      else if (type === "skip") stats.skip++;
      else if (type === "err") stats.err++;
      addLog(type, msg);
      setDeployStats({ ...stats });
    };

    const createGroup = async (objectType, groupName, groupLabel) => {
      if (cancelRef.current) return;
      const r = await hsCall(token, "POST", `/crm/v3/properties/${objectType}/groups`, { name: groupName, label: groupLabel });
      if (r.ok) log("ok", `Grupo '${groupName}' creado en ${objectType}`);
      else if (r.status === 409) log("skip", `Grupo '${groupName}' ya existe en ${objectType}`);
      else log("err", `Error grupo '${groupName}' en ${objectType}: ${JSON.stringify(r.data)}`);
    };

    const createProp = async (objectType, prop) => {
      if (cancelRef.current) return;
      const body = {
        name: prop.name, label: prop.label, type: prop.type, fieldType: prop.fieldType,
        groupName: prop.group || "focux",
      };
      if (prop.options && prop.options.length > 0) {
        body.options = prop.options.map((o, i) => ({ label: o.label, value: o.value, displayOrder: i }));
      }
      const r = await hsCall(token, "POST", `/crm/v3/properties/${objectType}`, body);
      if (r.ok) log("ok", `Propiedad '${prop.name}' creada en ${objectType}`);
      else if (r.status === 409) log("skip", `Propiedad '${prop.name}' ya existe en ${objectType}`);
      else log("err", `Error '${prop.name}' en ${objectType}: ${r.data?.message || JSON.stringify(r.data)}`);
    };

    try {
      addLog("info", `═══ FOCUXAI ADAPTER v4 — Deploying: ${plan.clientName} ═══`);
      addLog("info", `Modo: ${plan.hasCotizador ? "Cotizador + Sinco + Custom Objects" : "HubSpot Nativo (sin Custom Objects)"}`);
      addLog("info", `v4: Propiedades espejo activadas — toda _fx se crea en contacto Y deal`);

      // PHASE 1: Property Groups
      addLog("info", "── Fase 1: Grupos de propiedades ──");
      for (const g of plan.propertyGroups) {
        if (cancelRef.current) break;
        await createGroup(g.objectType, g.name, g.label);
      }

      // PHASE 2: Mirror Properties (BOTH contacts AND deals)
      if (!cancelRef.current) {
        addLog("info", `── Fase 2: Propiedades Espejo (${plan.mirrorProperties.length} × 2 objetos = ${plan.mirrorProperties.length * 2} operaciones) ──`);
        for (const prop of plan.mirrorProperties) {
          if (cancelRef.current) break;
          await createProp("contacts", prop);
          await createProp("deals", prop);
        }
      }

      // PHASE 3: Contact-Only Properties (Sinco)
      if (!cancelRef.current && plan.contactOnlyProperties.length > 0) {
        addLog("info", `── Fase 3: Propiedades solo Contacto — Sinco (${plan.contactOnlyProperties.length}) ──`);
        for (const prop of plan.contactOnlyProperties) {
          if (cancelRef.current) break;
          await createProp("contacts", prop);
        }
      } else if (plan.contactOnlyProperties.length === 0) {
        addLog("info", "── Fase 3: Propiedades solo Contacto — SKIPPED (sin cotizador) ──");
      }

      // PHASE 4: Deal-Only Properties (Sinco)
      if (!cancelRef.current && plan.dealOnlyProperties.length > 0) {
        addLog("info", `── Fase 4: Propiedades solo Deal — Sinco (${plan.dealOnlyProperties.length}) ──`);
        for (const prop of plan.dealOnlyProperties) {
          if (cancelRef.current) break;
          await createProp("deals", prop);
        }
      } else if (plan.dealOnlyProperties.length === 0) {
        addLog("info", "── Fase 4: Propiedades solo Deal — SKIPPED (sin cotizador) ──");
      }

      // PHASE 5: Pipeline
      if (!cancelRef.current && plan.pipeline) {
        addLog("info", `── Fase 5: Pipeline '${plan.pipeline.label}' (${plan.pipeline.stages.length} etapas) ──`);
        const pipelineBody = {
          label: plan.pipeline.label,
          displayOrder: 0,
          stages: plan.pipeline.stages.map((s, i) => ({
            label: s.label,
            displayOrder: i,
            metadata: { probability: s.metadata.probability },
          })),
        };
        const r = await hsCall(token, "POST", "/crm/v3/pipelines/deals", pipelineBody);
        if (r.ok) log("ok", `Pipeline '${pipelineBody.label}' creado con ${plan.pipeline.stages.length} etapas`);
        else if (r.status === 409) log("skip", "Pipeline ya existe (409)");
        else log("err", `Error pipeline: ${r.data?.message || JSON.stringify(r.data)}`);
      }

      // PHASE 6: Custom Objects (only if plan says so)
      if (!cancelRef.current && plan.hasCustomObjects && plan.customObjects.length > 0) {
        addLog("info", `── Fase 6: Custom Objects (${plan.customObjects.length}) ──`);
        for (const schema of plan.customObjects) {
          if (cancelRef.current) break;
          const schemaBody = {
            name: schema.name,
            labels: schema.labels,
            primaryDisplayProperty: schema.primaryDisplayProperty,
            requiredProperties: [schema.primaryDisplayProperty],
            properties: schema.properties.map(p => {
              const prop = { name: p.name, label: p.label, type: p.type, fieldType: p.fieldType };
              if (p.options) prop.options = p.options.map((o, i) => ({ label: o.label, value: o.value, displayOrder: i }));
              return prop;
            }),
            associatedObjects: schema.associatedObjects || ["CONTACT", "DEAL"],
          };

          const r = await hsCall(token, "POST", "/crm/v3/schemas", schemaBody);
          if (r.ok) {
            log("ok", `Custom Object '${schema.labels.singular}' creado (${schema.properties.length} props)`);
            createdObjects[schema.name] = r.data;
          } else if (r.status === 409) {
            log("skip", `Custom Object '${schema.labels.singular}' ya existe`);
          } else {
            log("err", `Error CO '${schema.labels.singular}': ${r.data?.message || JSON.stringify(r.data)}`);
          }
        }
      } else if (!plan.hasCustomObjects) {
        addLog("info", "── Fase 6: Custom Objects — SKIPPED (cliente sin cotizador/Custom Objects) ──");
      }

      // PHASE 7: Associations (only if Custom Objects were created)
      if (!cancelRef.current && plan.associations.length > 0) {
        addLog("info", `── Fase 7: Asociaciones (${plan.associations.length}) ──`);
        for (const assoc of plan.associations) {
          if (cancelRef.current) break;
          const fromObj = createdObjects[assoc.from];
          const toObj = createdObjects[assoc.to];
          if (fromObj && toObj) {
            const r = await hsCall(token, "POST", `/crm/v4/associations/${fromObj.objectTypeId}/${toObj.objectTypeId}/labels`, {
              label: assoc.label, name: assoc.label.toLowerCase().replace(/\s+/g, "_"),
            });
            if (r.ok) log("ok", `Asociación '${assoc.label}' creada`);
            else if (r.status === 409) log("skip", `Asociación '${assoc.label}' ya existe`);
            else log("err", `Error asociación '${assoc.label}': ${r.data?.message || JSON.stringify(r.data)}`);
          } else {
            log("info", `Asociación '${assoc.label}' pendiente — COs no creados en esta sesión`);
          }
        }
      } else if (plan.associations.length === 0) {
        addLog("info", "── Fase 7: Asociaciones — SKIPPED (sin Custom Objects) ──");
      }

      // v4: Summary
      const totalMirror = plan.mirrorProperties.length * 2;
      const totalContactOnly = plan.contactOnlyProperties.length;
      const totalDealOnly = plan.dealOnlyProperties.length;
      addLog("info", `═══ DEPLOY COMPLETO — ${stats.ok} creados, ${stats.skip} existentes, ${stats.err} errores ═══`);
      addLog("info", `v4 Resumen: ${plan.mirrorProperties.length} props espejo (×2 = ${totalMirror} ops) + ${totalContactOnly} solo contacto + ${totalDealOnly} solo deal`);
    } catch (e) {
      addLog("err", `Error fatal: ${e.message}`);
    }

    setDeploying(false);
    setDeployDone(true);
    setDeployStats({ ...stats });
  };

  /* ═══ DOWNLOAD PERMISSIONS GUIDE ═══ */
  const downloadPermissions = () => {
    if (!plan) return;
    const content = `# FocuxAI Engine™ — Permisos de Private App en HubSpot
# ═══════════════════════════════════════════════════════════
# Generado automáticamente por FocuxAI Adapter v4
# Cliente: ${plan.clientName}
# Fecha: ${new Date().toLocaleDateString("es-CO")}
# Custom Objects: ${plan.hasCustomObjects ? "SÍ" : "NO"}
# Cotizador/Sinco: ${plan.hasCotizador ? "SÍ" : "NO"}
# Propiedades espejo: SÍ (v4)
#
# ═══════════════════════════════════════════════════════════
# INSTRUCCIONES:
# 1. Settings → Integrations → Private Apps → Create a private app
# 2. Nombre: "FocuxAI Engine"
# 3. Pestaña "Scopes" → Activar todos los siguientes:
# ═══════════════════════════════════════════════════════════

SCOPES REQUERIDOS:
${"=".repeat(60)}

${plan.scopes.map(s => `[${s.category.padEnd(16)}]  ${s.scope.padEnd(40)}  →  ${s.purpose}`).join("\n")}

${"=".repeat(60)}
Total: ${plan.scopes.length} scopes

NOTAS:
${plan.hasCustomObjects
  ? "- Este portal REQUIERE al menos 1 Hub Enterprise para Custom Objects"
  : "- Este portal NO necesita Hub Enterprise (sin Custom Objects)"}
- El token es de tipo Bearer y no expira
- Se recomienda crear una Private App por constructora/cliente
- v4: Propiedades espejo — toda _fx existe en contacto Y deal

# FocuxAI Engine™ v4 — Deterministic. Auditable. Unstoppable.
# Focux Digital Group S.A.S.
`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FocuxAI_Permisos_${(plan.clientName || "cliente").replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ═══ DOWNLOAD DEPLOY MANIFEST ═══ */
  const downloadManifest = () => {
    if (!plan) return;
    const manifest = {
      generatedAt: new Date().toISOString(),
      generatedBy: "FocuxAI Adapter v4",
      client: plan.clientName,
      mode: plan.hasCotizador ? "cotizador_sinco" : "hubspot_nativo",
      mirrorProperties: true,
      summary: {
        mirrorProperties: plan.mirrorProperties.length,
        contactOnlyProperties: plan.contactOnlyProperties.length,
        dealOnlyProperties: plan.dealOnlyProperties.length,
        totalApiCalls: (plan.mirrorProperties.length * 2) + plan.contactOnlyProperties.length + plan.dealOnlyProperties.length + plan.propertyGroups.length + (plan.pipeline ? 1 : 0) + plan.customObjects.length + plan.associations.length,
        pipelineStages: plan.pipeline?.stages.length || 0,
        customObjects: plan.customObjects.length,
        associations: plan.associations.length,
        scopes: plan.scopes.length,
      },
      mirrorPropertyNames: plan.mirrorProperties.map(p => p.name),
      contactOnlyPropertyNames: plan.contactOnlyProperties.map(p => p.name),
      dealOnlyPropertyNames: plan.dealOnlyProperties.map(p => p.name),
      pipeline: plan.pipeline,
      customObjects: plan.customObjects.map(co => ({ name: co.name, label: co.labels.singular, properties: co.properties.length })),
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FocuxAI_Manifest_${(plan.clientName || "cliente").replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ═══ VIEWS ═══ */

  // HOME
  const HomeView = () => (
    <div>
      <div style={ss.card}>
        <h2 style={{ margin:"0 0 8px", fontSize:20, fontWeight:700 }}>
          FocuxAI Adapter <span style={{ color:tk.accent }}>v4</span>
          <span style={{ fontSize:12, fontWeight:400, color:tk.textTer, marginLeft:8 }}>Mirror Properties</span>
        </h2>
        <p style={{ color:tk.textSec, fontSize:14, margin:"0 0 16px", lineHeight:1.5 }}>
          Despliega el portal HubSpot completo desde el JSON del Ops.
          v4: Propiedades espejo — toda _fx se crea en contacto Y deal automáticamente.
        </p>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <span style={ss.badge(tk.accentLight, tk.accent)}>JSON-driven</span>
          <span style={ss.badge(tk.greenBg, tk.green)}>Idempotente (409=skip)</span>
          <span style={ss.badge(tk.amberBg, tk.amber)}>Propiedades Espejo v4</span>
          <span style={ss.badge(tk.accentLight, tk.accent)}>Multi-client</span>
        </div>
      </div>

      <div style={ss.card}>
        <h3 style={{ margin:"0 0 12px", fontSize:16, fontWeight:700 }}>Comenzar</h3>
        <div style={{ marginBottom:16 }}>
          <label style={ss.label}>Private App Token *</label>
          <input
            style={ss.input}
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="pat-na1-xxxx-xxxx-xxxx-xxxx"
          />
          <div style={{ fontSize:11, color:tk.textTer, marginTop:4 }}>
            Settings → Integrations → Private Apps → Create → Copiar token
          </div>
        </div>
        <button
          style={{ ...ss.btn(tk.accent, "#fff"), opacity: token ? 1 : 0.5 }}
          disabled={!token}
          onClick={() => setView("config")}
        >
          Continuar → Cargar JSON
        </button>
      </div>

      <div style={{ ...ss.card, borderColor:tk.accent, borderWidth:2 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16 }}>
          <div>
            <h3 style={{ margin:"0 0 6px", fontSize:16, fontWeight:700 }}>Guía de Permisos</h3>
            <p style={{ color:tk.textSec, fontSize:13, margin:0 }}>
              Los scopes se calculan según el JSON. Carga primero el JSON para la guía exacta.
            </p>
          </div>
          <button style={ss.btn(tk.accent, "#fff")} onClick={downloadPermissions}>↓ Descargar</button>
        </div>
      </div>
    </div>
  );

  // CONFIG
  const ConfigView = () => (
    <div>
      <div style={ss.card}>
        <h3 style={{ margin:"0 0 8px", fontSize:16, fontWeight:700 }}>Cargar Config JSON</h3>
        <p style={{ color:tk.textSec, fontSize:13, margin:"0 0 16px" }}>
          Sube el archivo .json exportado desde Focux Ops (v10+), o pégalo directamente.
        </p>
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border:`2px dashed ${tk.border}`, borderRadius:12, padding:"32px 20px", textAlign:"center",
            cursor:"pointer", background:tk.bg, marginBottom:16, transition:"border-color 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = tk.accent}
          onMouseLeave={e => e.currentTarget.style.borderColor = tk.border}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = tk.accent; }}
          onDragLeave={e => { e.currentTarget.style.borderColor = tk.border; }}
          onDrop={handleDrop}
        >
          <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
          <div style={{ fontSize:14, fontWeight:600, color:tk.text, marginBottom:4 }}>
            Arrastra el archivo .json aquí o haz click para seleccionar
          </div>
          <div style={{ fontSize:12, color:tk.textTer }}>
            Ej: Nivel_Propiedad_Raiz_focuxai_v10.json, Constructora_Jimenez_focuxai_v15.json
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} style={{ display:"none" }} />

        <div style={{ display:"flex", alignItems:"center", gap:12, margin:"16px 0" }}>
          <div style={{ flex:1, height:1, background:tk.border }} />
          <span style={{ fontSize:12, color:tk.textTer, fontWeight:600 }}>O PEGA EL JSON</span>
          <div style={{ flex:1, height:1, background:tk.border }} />
        </div>

        <textarea
          style={ss.textarea}
          value={jsonText}
          onChange={e => setJsonText(e.target.value)}
          placeholder='{ "nombreConst": "...", "pipeline": [...], "macros": [...] }'
        />
        {parseError && <div style={{ color:tk.red, fontSize:12, marginTop:6 }}>{parseError}</div>}
        {jsonText && config && (
          <div style={{ ...ss.badge(tk.greenBg, tk.green), marginTop:8 }}>
            ✓ {config.nombreConst} — {config.macros?.length || 0} proyectos · {config.pipeline?.length || 0} etapas · {config.tieneCotizador ? "con Cotizador" : "sin Cotizador"}
          </div>
        )}
        <div style={{ display:"flex", gap:12, marginTop:12 }}>
          <button style={{ ...ss.btn(tk.accent, "#fff"), opacity: jsonText ? 1 : 0.5 }} onClick={handleParseJson} disabled={!jsonText}>
            Validar y previsualizar →
          </button>
          <button style={ss.btn("transparent", tk.textSec)} onClick={() => setView("home")}>← Atrás</button>
        </div>
      </div>
    </div>
  );

  // PREVIEW
  const PreviewView = () => {
    if (!plan) return null;
    const totalMirror = plan.mirrorProperties.length;
    const totalContactOnly = plan.contactOnlyProperties.length;
    const totalDealOnly = plan.dealOnlyProperties.length;
    const totalCOProps = plan.customObjects.reduce((s, co) => s + co.properties.length, 0);
    const totalApiCalls = (totalMirror * 2) + totalContactOnly + totalDealOnly + plan.propertyGroups.length + (plan.pipeline ? 1 : 0) + plan.customObjects.length + plan.associations.length;

    return (
      <div>
        <div style={ss.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <h3 style={{ margin:0, fontSize:18, fontWeight:700 }}>{plan.clientName}</h3>
              <p style={{ margin:"4px 0 0", color:tk.textSec, fontSize:13 }}>
                {config.macros?.length || 0} proyectos · ~{totalApiCalls} operaciones API · v4 Mirror
              </p>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button style={ss.btn("transparent", tk.textSec)} onClick={() => setView("config")}>← JSON</button>
              <button style={{ ...ss.btn("transparent", tk.accent), border:`1px solid ${tk.border}` }} onClick={downloadManifest}>↓ Manifest</button>
              <button style={ss.btn(tk.green, "#fff")} onClick={() => setView("deploy")}>Desplegar →</button>
            </div>
          </div>
        </div>

        <div style={{ ...ss.card, background: plan.hasCotizador ? tk.amberBg : tk.greenBg, borderColor: plan.hasCotizador ? tk.amber : tk.green }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:24 }}>{plan.hasCotizador ? "🏗️" : "📋"}</span>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>
                Modo: {plan.hasCotizador ? "Cotizador + Sinco + Custom Objects" : "HubSpot Nativo"}
              </div>
              <div style={{ fontSize:12, color:tk.textSec, marginTop:2 }}>
                {plan.hasCotizador
                  ? `${plan.customObjects.length} Custom Objects · ${totalCOProps} propiedades CO · Propiedades Sinco incluidas`
                  : "Sin Custom Objects · Sin propiedades Sinco · Solo objetos nativos de HubSpot"
                }
              </div>
            </div>
          </div>
        </div>

        <div style={ss.card}>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
            <span style={ss.badge(tk.accentLight, tk.accent)}>{totalMirror} Props Espejo (×2)</span>
            {totalContactOnly > 0 && <span style={ss.badge(tk.accentLight, tk.accent)}>{totalContactOnly} Solo Contacto</span>}
            {totalDealOnly > 0 && <span style={ss.badge(tk.accentLight, tk.accent)}>{totalDealOnly} Solo Deal</span>}
            <span style={ss.badge(tk.amberBg, tk.amber)}>{plan.pipeline?.stages.length || 0} Etapas Pipeline</span>
            {plan.hasCustomObjects && <span style={ss.badge(tk.greenBg, tk.green)}>{plan.customObjects.length} Custom Objects</span>}
            {plan.associations.length > 0 && <span style={ss.badge(tk.greenBg, tk.green)}>{plan.associations.length} Asociaciones</span>}
            <span style={ss.badge(tk.accentLight, tk.accent)}>{plan.scopes.length} Scopes</span>
          </div>
        </div>

        {plan.pipeline && (
          <div style={ss.card}>
            <h4 style={ss.sectionTitle}>Pipeline: {plan.pipeline.label} ({plan.pipeline.stages.length} etapas)</h4>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {plan.pipeline.stages.map((s, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{
                    ...ss.badge(
                      s.probability === 0 ? tk.redBg : s.probability === 100 ? tk.greenBg : tk.accentLight,
                      s.probability === 0 ? tk.red : s.probability === 100 ? tk.green : tk.accent
                    ), fontSize:10,
                  }}>
                    {s.label} ({s.probability}%)
                  </span>
                  {i < plan.pipeline.stages.length - 1 && <span style={{ color:tk.textTer, fontSize:10 }}>→</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {plan.hasCustomObjects && plan.customObjects.length > 0 && (
          <div style={ss.card}>
            <h4 style={ss.sectionTitle}>Custom Objects ({plan.customObjects.length}) — {totalCOProps} propiedades</h4>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {plan.customObjects.map(co => (
                <div key={co.name} style={{ background:tk.bg, borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{co.labels.singular}</div>
                  <div style={{ fontSize:11, color:tk.textSec }}>{co.properties.map(p => p.name).join(", ")}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={ss.card}>
          <h4 style={ss.sectionTitle}>Propiedades Espejo — Contacto + Deal ({totalMirror})</h4>
          <p style={{ fontSize:11, color:tk.textSec, margin:"0 0 8px" }}>Cada propiedad se crea en AMBOS objetos con el mismo nombre, tipo y opciones.</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {plan.mirrorProperties.map(p => (
              <div key={p.name} style={{ background:tk.bg, borderRadius:6, padding:8, fontSize:11 }}>
                <span style={{ fontWeight:700, fontFamily:mono }}>{p.name}</span>
                <span style={{ color:tk.textSec, marginLeft:6 }}>{p.type}{p.options ? ` (${p.options.length})` : ""}</span>
              </div>
            ))}
          </div>
        </div>

        {totalContactOnly > 0 && (
          <div style={ss.card}>
            <h4 style={ss.sectionTitle}>Solo Contacto — Sinco ({totalContactOnly})</h4>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {plan.contactOnlyProperties.map(p => (
                <div key={p.name} style={{ background:tk.bg, borderRadius:6, padding:8, fontSize:11 }}>
                  <span style={{ fontWeight:700, fontFamily:mono }}>{p.name}</span>
                  <span style={{ color:tk.textSec, marginLeft:6 }}>{p.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalDealOnly > 0 && (
          <div style={ss.card}>
            <h4 style={ss.sectionTitle}>Solo Deal — Sinco ({totalDealOnly})</h4>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {plan.dealOnlyProperties.map(p => (
                <div key={p.name} style={{ background:tk.bg, borderRadius:6, padding:8, fontSize:11 }}>
                  <span style={{ fontWeight:700, fontFamily:mono }}>{p.name}</span>
                  <span style={{ color:tk.textSec, marginLeft:6 }}>{p.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={ss.card}>
          <h4 style={ss.sectionTitle}>Proyectos del JSON ({config.macros?.length || 0})</h4>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {(config.macros || []).map((m, i) => (
              <div key={i} style={{ background:tk.bg, borderRadius:8, padding:10, fontSize:12 }}>
                <div style={{ fontWeight:700 }}>{m.nombre}</div>
                <div style={{ color:tk.textSec, fontSize:11 }}>
                  {m.ciudad} · {m.tipo} · {m.torres?.length || 0} {m.tipologias === "Lotes" || m.tipologias === "Lotes campestres" || m.tipologias === "Lotes para casas" ? "etapas" : "torres"}
                </div>
                <div style={{ color:tk.textTer, fontSize:10, marginTop:2 }}>
                  {m.asesores?.length || 0} asesores · {m.rangoMinimo || "—"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={ss.card}>
          <h4 style={ss.sectionTitle}>Scopes requeridos ({plan.scopes.length})</h4>
          <div style={{ background:tk.bg, borderRadius:8, padding:12, maxHeight:200, overflowY:"auto" }}>
            {plan.scopes.map((s, i) => (
              <div key={i} style={{ fontSize:11, fontFamily:mono, padding:"2px 0", display:"flex", gap:8 }}>
                <span style={{ color:tk.accent, minWidth:200 }}>{s.scope}</span>
                <span style={{ color:tk.textTer }}>{s.purpose}</span>
              </div>
            ))}
          </div>
          <button
            style={{ ...ss.btn("transparent", tk.accent), marginTop:8, border:`1px solid ${tk.border}`, fontSize:12 }}
            onClick={() => navigator.clipboard.writeText(plan.scopes.map(s => s.scope).join("\n"))}
          >
            Copiar scopes
          </button>
        </div>
      </div>
    );
  };

  // DEPLOY
  const DeployView = () => (
    <div>
      <div style={ss.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div>
            <h3 style={{ margin:0, fontSize:18, fontWeight:700 }}>
              {deployDone ? "Deploy completado" : deploying ? "Desplegando..." : "Listo para desplegar"}
            </h3>
            <p style={{ margin:"4px 0 0", color:tk.textSec, fontSize:13 }}>
              {plan?.clientName} · {plan?.hasCotizador ? "Cotizador + Sinco" : "HubSpot Nativo"} · v4 Mirror
            </p>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {!deploying && !deployDone && (
              <>
                <button style={ss.btn("transparent", tk.textSec)} onClick={() => setView("preview")}>← Preview</button>
                <button style={ss.btn(tk.green, "#fff")} onClick={runDeploy}>▶ Ejecutar deploy</button>
              </>
            )}
            {deploying && (
              <button style={ss.btn(tk.red, "#fff")} onClick={() => { cancelRef.current = true; }}>✕ Cancelar</button>
            )}
            {deployDone && (
              <>
                <button style={ss.btn("transparent", tk.textSec)} onClick={() => { setView("home"); setDeployDone(false); setLogs([]); }}>← Inicio</button>
                <button style={ss.btn(tk.accent, "#fff")} onClick={() => { setDeployDone(false); setLogs([]); runDeploy(); }}>↻ Re-ejecutar</button>
              </>
            )}
          </div>
        </div>

        {(deploying || deployDone) && (
          <div style={{ display:"flex", gap:16, marginBottom:16 }}>
            {[
              { label: "Total", value: deployStats.total, color: tk.text },
              { label: "Creados", value: deployStats.ok, color: tk.green },
              { label: "Existentes", value: deployStats.skip, color: tk.amber },
              { label: "Errores", value: deployStats.err, color: tk.red },
            ].map(s => (
              <div key={s.label} style={{ textAlign:"center" }}>
                <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:11, color:tk.textSec }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div ref={logRef} style={{ background:tk.bg, borderRadius:8, padding:8, maxHeight:500, overflowY:"auto", minHeight:200 }}>
          {logs.length === 0 && (
            <div style={{ padding:40, textAlign:"center", color:tk.textTer, fontSize:13 }}>
              Click "Ejecutar deploy" para comenzar. Todas las operaciones son idempotentes (409 = skip).
            </div>
          )}
          {logs.map((l, i) => (
            <div key={i} style={ss.logLine(l.type)}>
              <span style={{ color:tk.textTer, marginRight:8 }}>{l.ts}</span>
              {l.type === "ok" && <span style={{ color:tk.green, marginRight:6 }}>✓</span>}
              {l.type === "err" && <span style={{ color:tk.red, marginRight:6 }}>✕</span>}
              {l.type === "skip" && <span style={{ color:tk.amber, marginRight:6 }}>⊘</span>}
              {l.type === "info" && <span style={{ color:tk.accent, marginRight:6 }}>▸</span>}
              {l.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  /* ═══ RENDER ═══ */
  return (
    <div style={{ fontFamily:font, background:tk.bg, minHeight:"100vh", color:tk.text }}>
      <div style={{ background:tk.card, borderBottom:`1px solid ${tk.border}`, padding:"14px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg, ${tk.teal}, ${tk.navy})`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:14 }}>F</div>
          <div>
            <div style={{ fontSize:16, fontWeight:700 }}>Focux<span style={{ color:tk.accent }}>AI</span> <span style={{ fontWeight:400, color:tk.textSec }}>Adapter</span></div>
            <div style={{ fontSize:10, color:tk.textTer, letterSpacing:"0.04em" }}>v4 — MIRROR PROPERTIES · JSON-DRIVEN · MULTI-CLIENT</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {token && <span style={ss.badge(tk.greenBg, tk.green)}>Token ✓</span>}
          {plan && <span style={ss.badge(tk.accentLight, tk.accent)}>{plan.clientName}</span>}
          {plan && <span style={ss.badge(plan.hasCotizador ? tk.amberBg : tk.greenBg, plan.hasCotizador ? tk.amber : tk.green)}>
            {plan.hasCotizador ? "Cotizador" : "Nativo"}
          </span>}
        </div>
      </div>

      <div style={{ padding:"8px 24px", borderBottom:`1px solid ${tk.borderLight}`, background:tk.card, display:"flex", gap:4 }}>
        {["home", "config", "preview", "deploy"].map(v => (
          <button
            key={v}
            onClick={() => {
              if ((v === "preview" || v === "deploy") && !config) return;
              setView(v);
            }}
            style={{
              padding:"6px 14px", borderRadius:6, border:"none",
              background: view === v ? tk.accent : "transparent",
              color: view === v ? "#fff" : tk.textSec,
              fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:font,
              opacity: (v === "preview" || v === "deploy") && !config ? 0.4 : 1,
            }}
          >
            {v === "home" ? "Inicio" : v === "config" ? "Config JSON" : v === "preview" ? "Preview" : "Deploy"}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:900, margin:"24px auto", padding:"0 24px" }}>
        {view === "home" && <HomeView />}
        {view === "config" && <ConfigView />}
        {view === "preview" && <PreviewView />}
        {view === "deploy" && <DeployView />}
      </div>

      <div style={{ textAlign:"center", padding:"24px", fontSize:11, color:tk.textTer }}>
        FocuxAI Engine™ v4 · Mirror Properties · JSON-Driven · Unstoppable · Focux Digital Group S.A.S.
      </div>
    </div>
  );
}
