"use client";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   FOCUXAI ADAPTER v2 — HubSpot Portal Deployer
   Custom Objects + Properties + Pipeline + Associations
   Reads Focux Config JSON → Deploys to HubSpot via API
   ═══════════════════════════════════════════════════════════════ */

/* ═══ DESIGN TOKENS (same as Ops v7) ═══ */
const font = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
const tk = {
  navy:"#211968", blue:"#1A4BA8", teal:"#0D7AB5", cyan:"#2099D8",
  bg:"#FAFBFD", card:"#FFFFFF", border:"#E8ECF1", borderLight:"#F1F4F8",
  text:"#1A1D26", textSec:"#6B7280", textTer:"#9CA3AF",
  green:"#10B981", red:"#EF4444", amber:"#F59E0B",
  greenBg:"#ECFDF5", redBg:"#FEF2F2", amberBg:"#FFFBEB",
  accent:"#0D7AB5", accentLight:"#E0F4FD",
};

/* ═══ REQUIRED HUBSPOT SCOPES ═══ */
const REQUIRED_SCOPES = [
  { scope: "crm.objects.contacts.read", category: "CRM", purpose: "Leer contactos existentes" },
  { scope: "crm.objects.contacts.write", category: "CRM", purpose: "Crear/actualizar contactos" },
  { scope: "crm.objects.companies.read", category: "CRM", purpose: "Leer empresas" },
  { scope: "crm.objects.companies.write", category: "CRM", purpose: "Crear/actualizar empresas" },
  { scope: "crm.objects.deals.read", category: "CRM", purpose: "Leer negocios y pipeline" },
  { scope: "crm.objects.deals.write", category: "CRM", purpose: "Crear/actualizar negocios" },
  { scope: "crm.objects.custom.read", category: "Custom Objects", purpose: "Leer registros de Custom Objects" },
  { scope: "crm.objects.custom.write", category: "Custom Objects", purpose: "Crear/actualizar registros de Custom Objects" },
  { scope: "crm.schemas.custom.read", category: "Schemas", purpose: "Leer definiciones de Custom Objects" },
  { scope: "crm.schemas.custom.write", category: "Schemas", purpose: "Crear Custom Objects y propiedades" },
  { scope: "crm.schemas.contacts.read", category: "Schemas", purpose: "Leer schema de contactos" },
  { scope: "crm.schemas.contacts.write", category: "Schemas", purpose: "Crear propiedades de contacto" },
  { scope: "crm.schemas.companies.read", category: "Schemas", purpose: "Leer schema de empresas" },
  { scope: "crm.schemas.companies.write", category: "Schemas", purpose: "Crear propiedades de empresa" },
  { scope: "crm.schemas.deals.read", category: "Schemas", purpose: "Leer schema de negocios" },
  { scope: "crm.schemas.deals.write", category: "Schemas", purpose: "Crear propiedades de negocio" },
  { scope: "crm.objects.owners.read", category: "Owners", purpose: "Leer owners/asesores del portal" },
  { scope: "settings.users.read", category: "Settings", purpose: "Mapear usuarios a asesores" },
];

/* ═══ PIPELINE DEFINITION (integrated Engine + Jiménez) ═══ */
const PIPELINE_STAGES = [
  { n: "Cotización Enviada", p: 20, sinco: "Nada", internal: "cotizacion_enviada" },
  { n: "Unidad Bloqueada", p: 40, sinco: "Nada (timer 4 días)", internal: "unidad_bloqueada" },
  { n: "Opcionó", p: 60, sinco: "Nada", internal: "opciono" },
  { n: "Entregó Documentos", p: 70, sinco: "Nada", internal: "entrego_documentos" },
  { n: "Unidad Separada", p: 80, sinco: "POST Comprador + PUT ConfirmacionVenta", internal: "unidad_separada" },
  { n: "Se vinculó a Fiducia", p: 90, sinco: "Nada", internal: "vinculo_fiducia" },
  { n: "Consignó", p: 95, sinco: "Nada", internal: "consigno" },
  { n: "Firmó Documentos", p: 98, sinco: "Nada", internal: "firmo_documentos" },
  { n: "Negocio Legalizado", p: 100, sinco: "PUT ConfirmacionVenta final", internal: "negocio_legalizado" },
  { n: "En Cartera", p: 100, sinco: "Sync pagos (Fase 2)", internal: "en_cartera" },
  { n: "Escriturado", p: 100, sinco: "POST Agrupaciones/Actualizar", internal: "escriturado" },
  { n: "Entregado", p: 100, sinco: "Nada", internal: "entregado" },
  { n: "Venta Perdida", p: 0, sinco: "Liberar agrupación", internal: "venta_perdida" },
];

/* ═══ CONTACT PROPERTIES _fx ═══ */
const CONTACT_PROPERTIES = [
  { name: "lista_proyectos_fx", label: "Lista de Proyectos", type: "enumeration", fieldType: "checkbox", group: "focux", options: [] },
  { name: "etapa_lead_fx", label: "Etapa del Lead", type: "enumeration", fieldType: "select", group: "focux", options: [] },
  { name: "canal_atribucion_fx", label: "Canal de Atribución", type: "enumeration", fieldType: "select", group: "focux", options: [] },
  { name: "canal_tracking_fx", label: "Canal de Tracking", type: "enumeration", fieldType: "select", group: "focux", options: [] },
  { name: "rango_ingresos_fx", label: "Rango de Ingresos", type: "enumeration", fieldType: "select", group: "focux", options: [] },
  { name: "tiene_ahorros_fx", label: "Tiene Ahorros o Cesantías", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Sí", value: "Sí" }, { label: "No", value: "No" }] },
  { name: "proposito_compra_fx", label: "Propósito de Compra", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Vivienda", value: "Vivienda" }, { label: "Inversión", value: "Inversión" }] },
  { name: "nivel_calificacion_fx", label: "Nivel de Calificación", type: "enumeration", fieldType: "select", group: "focux", options: [] },
  { name: "motivo_descarte_fx", label: "Motivo de Descarte", type: "enumeration", fieldType: "select", group: "focux", options: [] },
  { name: "cotizacion_solicitada_fx", label: "Cotización Solicitada", type: "enumeration", fieldType: "booleancheckbox", group: "focux", options: [{ label: "Sí", value: "true" }, { label: "No", value: "false" }] },
  { name: "cedula_fx", label: "Cédula / Identificación", type: "string", fieldType: "text", group: "focux" },
  { name: "tipo_identificacion_fx", label: "Tipo de Identificación", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "CC", value: "CC" }, { label: "CE", value: "CE" }, { label: "NIT", value: "NIT" }, { label: "Pasaporte", value: "PAS" }] },
  { name: "id_sinco_comprador_fx", label: "ID Comprador Sinco", type: "number", fieldType: "number", group: "focux" },
  { name: "origen_lead_fx", label: "Origen del Lead", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Orgánico", value: "organico" }, { label: "Pauta", value: "pauta" }, { label: "Referido", value: "referido" }, { label: "Sala de Ventas", value: "sala" }, { label: "Agente IA", value: "agente_ia" }] },
];

/* ═══ DEAL PROPERTIES _fx ═══ */
const DEAL_PROPERTIES = [
  { name: "id_venta_sinco_fx", label: "ID Venta Sinco", type: "number", fieldType: "number", group: "focux" },
  { name: "id_agrupacion_sinco_fx", label: "ID Agrupación Sinco", type: "number", fieldType: "number", group: "focux" },
  { name: "id_sinco_comprador_fx", label: "ID Comprador Sinco", type: "number", fieldType: "number", group: "focux" },
  { name: "valor_separacion_fx", label: "Valor Separación", type: "number", fieldType: "number", group: "focux" },
  { name: "cuota_inicial_fx", label: "Cuota Inicial Total", type: "number", fieldType: "number", group: "focux" },
  { name: "numero_cuotas_fx", label: "Número de Cuotas", type: "number", fieldType: "number", group: "focux" },
  { name: "valor_cuota_fx", label: "Valor Cuota Mensual", type: "number", fieldType: "number", group: "focux" },
  { name: "valor_credito_fx", label: "Valor Crédito / Saldo Final", type: "number", fieldType: "number", group: "focux" },
  { name: "porcentaje_financiacion_fx", label: "% Financiación", type: "number", fieldType: "number", group: "focux" },
  { name: "precio_cotizado_fx", label: "Precio Cotizado (snapshot)", type: "number", fieldType: "number", group: "focux" },
  { name: "tipo_venta_fx", label: "Tipo de Venta", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Contado", value: "contado" }, { label: "Crédito", value: "credito" }, { label: "Leasing", value: "leasing" }] },
  { name: "fecha_bloqueo_fx", label: "Fecha de Bloqueo", type: "date", fieldType: "date", group: "focux" },
  { name: "dias_bloqueo_fx", label: "Días de Bloqueo", type: "number", fieldType: "number", group: "focux" },
  { name: "writeback_status_fx", label: "Estado Write-back Sinco", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Pendiente", value: "pending" }, { label: "Exitoso", value: "success" }, { label: "Fallido", value: "failed" }] },
  { name: "origen_fx", label: "Origen de la Cotización", type: "enumeration", fieldType: "select", group: "focux", options: [{ label: "Cotizador", value: "cotizador" }, { label: "Import", value: "import" }, { label: "Manual", value: "manual" }] },
  { name: "motivo_perdida_fx", label: "Motivo de Pérdida", type: "enumeration", fieldType: "select", group: "focux", options: [] },
  { name: "lista_proyectos_fx", label: "Proyecto", type: "enumeration", fieldType: "select", group: "focux", options: [] },
  { name: "descuento_fx", label: "Descuento Aplicado", type: "number", fieldType: "number", group: "focux" },
  { name: "vigencia_cotizacion_fx", label: "Vigencia Cotización (días)", type: "number", fieldType: "number", group: "focux" },
];

/* ═══ CUSTOM OBJECTS SCHEMAS ═══ */
const CUSTOM_OBJECT_SCHEMAS = {
  macroproyecto: {
    name: "macroproyecto",
    labels: { singular: "Macroproyecto", plural: "Macroproyectos" },
    primaryDisplayProperty: "nombre_fx",
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
  proyecto: {
    name: "proyecto",
    labels: { singular: "Proyecto", plural: "Proyectos" },
    primaryDisplayProperty: "nombre_fx",
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
      { name: "agrupaciones_preestablecidas_fx", label: "Agrupaciones Preestablecidas", type: "enumeration", fieldType: "booleancheckbox", options: [{ label: "Sí", value: "true" }, { label: "No", value: "false" }] },
      { name: "total_unidades_fx", label: "Total Unidades", type: "number", fieldType: "number" },
      { name: "unidades_disponibles_fx", label: "Unidades Disponibles", type: "number", fieldType: "number" },
      { name: "estado_fx", label: "Estado", type: "enumeration", fieldType: "select", options: [{ label: "Activo", value: "Activo" }, { label: "Inactivo", value: "Inactivo" }, { label: "Entregado", value: "Entregado" }] },
    ],
  },
  unidad: {
    name: "unidad",
    labels: { singular: "Unidad", plural: "Unidades" },
    primaryDisplayProperty: "nombre_fx",
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
  agrupacion: {
    name: "agrupacion",
    labels: { singular: "Agrupación", plural: "Agrupaciones" },
    primaryDisplayProperty: "nombre_fx",
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
};

/* ═══ ASSOCIATIONS ═══ */
const ASSOCIATIONS = [
  { from: "macroproyecto", to: "proyecto", label: "Macroproyecto a Proyecto" },
  { from: "proyecto", to: "unidad", label: "Proyecto a Unidad" },
  { from: "proyecto", to: "agrupacion", label: "Proyecto a Agrupación" },
  { from: "agrupacion", to: "unidad", label: "Agrupación a Unidad" },
  { from: "agrupacion", to: "deals", label: "Agrupación a Deal" },
  { from: "deals", to: "contacts", label: "Deal a Contacto (nativo)" },
];

/* ═══ HUBSPOT API HELPER ═══ */
const HS_PROXY = "/api/hubspot";

async function hsCall(token, method, path, body = null) {
  const url = `${HS_PROXY}${path}`;
  const opts: any = {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

/* ═══ HELPER: Build options from config JSON ═══ */
function buildDynamicOptions(config) {
  const macroNames = (config.macros || []).map(m => ({ label: m.nombre, value: m.nombre.toLowerCase().replace(/\s+/g, "_") }));
  const allChannels = [
    ...(config.chStd || []).filter(c => c.a).map(c => ({ label: c.n, value: c.n.toLowerCase().replace(/\s+/g, "_") })),
    ...(config.chCu || []).map(c => ({ label: c, value: c.toLowerCase().replace(/\s+/g, "_") })),
  ];
  const trackingChannels = (config.chTr || []).filter(c => c.a).map(c => ({ label: c.n, value: c.n.toLowerCase().replace(/\s+/g, "_") }));
  const rangos = (config.rangos || []).map(r => ({ label: r, value: r.toLowerCase().replace(/\s+/g, "_") }));
  const niveles = (config.niveles || []).map(n => ({ label: n, value: n }));
  const motD = (config.moD || []).map(m => ({ label: m, value: m.toLowerCase().replace(/\s+/g, "_") }));
  const motP = (config.moP || []).map(m => ({ label: m, value: m.toLowerCase().replace(/\s+/g, "_") }));
  const etapas = [...(config.etP || []), ...(config.etS || [])].map(e => ({ label: e.trim(), value: e.trim().toLowerCase().replace(/\s+/g, "_") }));
  return { macroNames, allChannels, trackingChannels, rangos, niveles, motD, motP, etapas };
}

/* ═══ STYLES ═══ */
const ss = {
  label: { display:"block", fontSize:12, fontWeight:600, color:tk.text, marginBottom:4 },
  input: { width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${tk.border}`, fontSize:13, color:tk.text, outline:"none", boxSizing:"border-box", fontFamily:font },
  textarea: { width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${tk.border}`, fontSize:12, color:tk.text, outline:"none", boxSizing:"border-box", fontFamily:"'JetBrains Mono', monospace", minHeight:200, resize:"vertical" },
  card: { border:`1px solid ${tk.border}`, borderRadius:12, padding:20, marginBottom:14, background:tk.card },
  btn: (bg, color) => ({ padding:"10px 20px", borderRadius:8, border:"none", background:bg, color, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:font }),
  badge: (bg, color) => ({ display:"inline-flex", padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, background:bg, color, border:`1px solid ${color}25` }),
  logLine: (type) => ({
    padding:"4px 8px", fontSize:12, fontFamily:"'JetBrains Mono', monospace", borderLeft:`3px solid ${type === "ok" ? tk.green : type === "err" ? tk.red : type === "skip" ? tk.amber : tk.accent}`,
    background: type === "ok" ? tk.greenBg : type === "err" ? tk.redBg : type === "skip" ? tk.amberBg : tk.accentLight,
    marginBottom:2, borderRadius:"0 4px 4px 0",
  }),
};

/* ═══ MAIN COMPONENT ═══ */
export default function FocuxAdapter() {
  const [view, setView] = useState("home"); // home | config | preview | deploy
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

  const addLog = useCallback((type, msg) => {
    setLogs(prev => [...prev, { type, msg, ts: new Date().toLocaleTimeString() }]);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  }, []);

  const handleParseJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.nombreConst) throw new Error("JSON inválido: falta nombreConst");
      setConfig(parsed);
      setParseError("");
      setView("preview");
    } catch (e) {
      setParseError(e.message);
    }
  };

  const dynOpts = useMemo(() => config ? buildDynamicOptions(config) : null, [config]);

  /* ═══ DEPLOY ENGINE ═══ */
  const runDeploy = async () => {
    if (!token || !config) return;
    setDeploying(true);
    setDeployDone(false);
    setLogs([]);
    cancelRef.current = false;
    const stats = { total: 0, ok: 0, skip: 0, err: 0 };
    const createdObjects = {};

    const log = (type, msg) => { stats.total++; stats[type === "ok" ? "ok" : type === "skip" ? "skip" : type === "err" ? "err" : "ok"]++; addLog(type, msg); setDeployStats({ ...stats }); };

    // Helper: create property group
    const createGroup = async (objectType, groupName, groupLabel) => {
      if (cancelRef.current) return;
      const r = await hsCall(token, "POST", `/crm/v3/properties/${objectType}/groups`, { name: groupName, label: groupLabel });
      if (r.ok) log("ok", `Grupo '${groupName}' creado en ${objectType}`);
      else if (r.status === 409) log("skip", `Grupo '${groupName}' ya existe en ${objectType}`);
      else log("err", `Error creando grupo '${groupName}' en ${objectType}: ${JSON.stringify(r.data)}`);
    };

    // Helper: create property
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
      else log("err", `Error propiedad '${prop.name}' en ${objectType}: ${r.data?.message || JSON.stringify(r.data)}`);
    };

    try {
      addLog("info", `═══ FOCUXAI ADAPTER v2 — Deploying ${config.nombreConst} ═══`);

      // PHASE 1: Property Groups
      addLog("info", "── Fase 1: Crear grupos de propiedades ──");
      await createGroup("contacts", "focux", "Focux Engine");
      await createGroup("deals", "focux", "Focux Engine");
      await createGroup("companies", "focux", "Focux Engine");

      // PHASE 2: Contact Properties
      addLog("info", "── Fase 2: Propiedades de Contacto ──");
      const contactProps = CONTACT_PROPERTIES.map(p => {
        const prop = { ...p };
        if (p.name === "lista_proyectos_fx") prop.options = dynOpts.macroNames;
        if (p.name === "etapa_lead_fx") prop.options = dynOpts.etapas;
        if (p.name === "canal_atribucion_fx") prop.options = dynOpts.allChannels;
        if (p.name === "canal_tracking_fx") prop.options = dynOpts.trackingChannels;
        if (p.name === "rango_ingresos_fx") prop.options = dynOpts.rangos;
        if (p.name === "nivel_calificacion_fx") prop.options = dynOpts.niveles;
        if (p.name === "motivo_descarte_fx") prop.options = dynOpts.motD;
        return prop;
      });
      for (const prop of contactProps) {
        if (cancelRef.current) break;
        await createProp("contacts", prop);
      }

      // PHASE 3: Deal Properties
      addLog("info", "── Fase 3: Propiedades del Deal (Cotización) ──");
      const dealProps = DEAL_PROPERTIES.map(p => {
        const prop = { ...p };
        if (p.name === "motivo_perdida_fx") prop.options = dynOpts.motP;
        if (p.name === "lista_proyectos_fx") prop.options = dynOpts.macroNames;
        return prop;
      });
      for (const prop of dealProps) {
        if (cancelRef.current) break;
        await createProp("deals", prop);
      }

      // PHASE 4: Pipeline
      if (!cancelRef.current) {
        addLog("info", "── Fase 4: Pipeline de Ventas Integrado ──");
        const pipelineBody = {
          label: config.nombrePipeline || `Ventas ${config.nombreConst}`,
          displayOrder: 0,
          stages: PIPELINE_STAGES.map((s, i) => ({
            label: s.n,
            displayOrder: i,
            metadata: { probability: (s.p / 100).toFixed(2) },
          })),
        };
        const r = await hsCall(token, "POST", "/crm/v3/pipelines/deals", pipelineBody);
        if (r.ok) log("ok", `Pipeline '${pipelineBody.label}' creado con ${PIPELINE_STAGES.length} etapas`);
        else if (r.status === 409) log("skip", "Pipeline ya existe");
        else log("err", `Error pipeline: ${r.data?.message || JSON.stringify(r.data)}`);
      }

      // PHASE 5: Custom Objects
      addLog("info", "── Fase 5: Custom Objects ──");
      for (const [key, schema] of Object.entries(CUSTOM_OBJECT_SCHEMAS)) {
        if (cancelRef.current) break;
        const primaryProp = schema.properties.find(p => p.isPrimary);
        const secondaryProps = schema.properties.filter(p => !p.isPrimary);

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
          associatedObjects: ["CONTACT", "DEAL"],
        };

        const r = await hsCall(token, "POST", "/crm/v3/schemas", schemaBody);
        if (r.ok) {
          log("ok", `Custom Object '${schema.labels.singular}' creado (${schema.properties.length} propiedades)`);
          createdObjects[key] = r.data;
        } else if (r.status === 409) {
          log("skip", `Custom Object '${schema.labels.singular}' ya existe`);
        } else {
          log("err", `Error Custom Object '${schema.labels.singular}': ${r.data?.message || JSON.stringify(r.data)}`);
        }
      }

      // PHASE 6: Associations between Custom Objects
      if (!cancelRef.current) {
        addLog("info", "── Fase 6: Asociaciones entre objetos ──");
        for (const assoc of ASSOCIATIONS) {
          if (cancelRef.current) break;
          // Note: associations between custom objects require objectTypeId which comes from schema creation
          // For now we log what needs to be created - full implementation requires the objectTypeIds from Phase 5
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
            log("info", `Asociación '${assoc.label}' pendiente — requiere objectTypeIds de Custom Objects`);
          }
        }
      }

      addLog("info", `═══ DEPLOY COMPLETO — ${stats.ok} creados, ${stats.skip} existentes, ${stats.err} errores ═══`);
    } catch (e) {
      addLog("err", `Error fatal: ${e.message}`);
    }

    setDeploying(false);
    setDeployDone(true);
    setDeployStats({ ...stats });
  };

  /* ═══ DOWNLOAD PERMISSIONS GUIDE ═══ */
  const downloadPermissions = () => {
    const content = `# FocuxAI Engine™ — Permisos de Private App en HubSpot
# ═══════════════════════════════════════════════════════════
# Generado automáticamente por FocuxAI Adapter v2
# Fecha: ${new Date().toLocaleDateString("es-CO")}
#
# REQUISITO: El portal debe tener al menos 1 Hub Enterprise
# para poder crear Custom Objects por API.
#
# ═══════════════════════════════════════════════════════════
# INSTRUCCIONES:
# 1. Settings → Integrations → Private Apps → Create a private app
# 2. Nombre: "FocuxAI Engine"
# 3. Pestaña "Scopes" → Activar todos los siguientes:
# ═══════════════════════════════════════════════════════════

SCOPES REQUERIDOS:
${"=".repeat(60)}

${REQUIRED_SCOPES.map(s => `[${s.category.padEnd(16)}]  ${s.scope.padEnd(40)}  →  ${s.purpose}`).join("\n")}

${"=".repeat(60)}
Total: ${REQUIRED_SCOPES.length} scopes

NOTAS IMPORTANTES:
- Todos los scopes son necesarios para el deploy completo
- Sin crm.schemas.custom.write no se pueden crear Custom Objects
- Sin crm.objects.custom.write no se pueden crear registros
- El token generado es de tipo Bearer y no expira
- Se recomienda crear una Private App por constructora/cliente

# FocuxAI Engine™ — Deterministic. Auditable. Unstoppable.
# Focux Digital Group S.A.S.
`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "FocuxAI_HubSpot_Permisos_PrivateApp.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ═══ VIEWS ═══ */

  // HOME
  const HomeView = () => (
    <div>
      <div style={ss.card}>
        <h2 style={{ margin:"0 0 8px", fontSize:20, fontWeight:700 }}>FocuxAI Adapter v2</h2>
        <p style={{ color:tk.textSec, fontSize:14, margin:"0 0 16px" }}>
          Despliega el portal HubSpot completo desde el Config JSON de Ops.
          Custom Objects + Propiedades + Pipeline + Asociaciones.
        </p>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <span style={ss.badge(tk.greenBg, tk.green)}>4 Custom Objects</span>
          <span style={ss.badge(tk.accentLight, tk.accent)}>{CONTACT_PROPERTIES.length} Props Contacto</span>
          <span style={ss.badge(tk.accentLight, tk.accent)}>{DEAL_PROPERTIES.length} Props Deal</span>
          <span style={ss.badge(tk.amberBg, tk.amber)}>{PIPELINE_STAGES.length} Etapas Pipeline</span>
          <span style={ss.badge(tk.greenBg, tk.green)}>Idempotente</span>
        </div>
      </div>

      {/* Permissions Guide */}
      <div style={{ ...ss.card, borderColor: tk.accent, borderWidth: 2 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <h3 style={{ margin:"0 0 6px", fontSize:16, fontWeight:700 }}>Permisos de Private App (HubSpot)</h3>
            <p style={{ color:tk.textSec, fontSize:13, margin:"0 0 12px" }}>
              Antes de empezar, crea una Private App en el portal del cliente con estos {REQUIRED_SCOPES.length} scopes.
              El portal debe tener al menos 1 Hub Enterprise.
            </p>
          </div>
          <button style={ss.btn(tk.accent, "#fff")} onClick={downloadPermissions}>
            ↓ Descargar guía
          </button>
        </div>
        <div style={{ background:tk.bg, borderRadius:8, padding:12, maxHeight:260, overflowY:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${tk.border}` }}>
                <th style={{ textAlign:"left", padding:"6px 8px", color:tk.textSec, fontWeight:600 }}>Scope</th>
                <th style={{ textAlign:"left", padding:"6px 8px", color:tk.textSec, fontWeight:600 }}>Categoría</th>
                <th style={{ textAlign:"left", padding:"6px 8px", color:tk.textSec, fontWeight:600 }}>Para qué</th>
              </tr>
            </thead>
            <tbody>
              {REQUIRED_SCOPES.map((s, i) => (
                <tr key={i} style={{ borderBottom:`1px solid ${tk.borderLight}` }}>
                  <td style={{ padding:"5px 8px", fontFamily:"'JetBrains Mono', monospace", fontSize:11 }}>{s.scope}</td>
                  <td style={{ padding:"5px 8px" }}><span style={ss.badge(tk.accentLight, tk.accent)}>{s.category}</span></td>
                  <td style={{ padding:"5px 8px", color:tk.textSec }}>{s.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button style={{ ...ss.btn("transparent", tk.accent), marginTop:10, border:`1px solid ${tk.border}`, fontSize:12 }}
          onClick={() => { navigator.clipboard.writeText(REQUIRED_SCOPES.map(s => s.scope).join("\n")); }}>
          Copiar scopes al portapapeles
        </button>
      </div>

      {/* Start */}
      <div style={ss.card}>
        <h3 style={{ margin:"0 0 12px", fontSize:16, fontWeight:700 }}>Comenzar deploy</h3>
        <div style={{ marginBottom:16 }}>
          <label style={ss.label}>Private App Token *</label>
          <input style={ss.input} type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="pat-na1-xxxx-xxxx-xxxx-xxxx" />
        </div>
        <button style={{ ...ss.btn(tk.accent, "#fff"), opacity: token ? 1 : 0.5 }} disabled={!token} onClick={() => setView("config")}>
          Continuar → Cargar Config JSON
        </button>
      </div>
    </div>
  );

  // CONFIG
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      setJsonText(text);
      // Auto-parse
      try {
        const parsed = JSON.parse(text);
        if (!parsed.nombreConst) throw new Error("JSON inválido: falta nombreConst");
        setConfig(parsed);
        setParseError("");
        setView("preview");
      } catch (err) {
        setParseError(err.message);
      }
    };
    reader.readAsText(file);
  };

  const ConfigView = () => (
    <div>
      <div style={ss.card}>
        <h3 style={{ margin:"0 0 8px", fontSize:16, fontWeight:700 }}>Cargar Config JSON</h3>
        <p style={{ color:tk.textSec, fontSize:13, margin:"0 0 16px" }}>
          Sube el archivo .json exportado desde Focux Ops, o pégalo directamente.
        </p>

        {/* File upload */}
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
          onDrop={e => {
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
                  if (!parsed.nombreConst) throw new Error("JSON inválido: falta nombreConst");
                  setConfig(parsed);
                  setParseError("");
                  setView("preview");
                } catch (err) { setParseError(err.message); }
              };
              reader.readAsText(file);
            }
          }}
        >
          <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
          <div style={{ fontSize:14, fontWeight:600, color:tk.text, marginBottom:4 }}>
            Arrastra el archivo .json aquí o haz click para seleccionar
          </div>
          <div style={{ fontSize:12, color:tk.textTer }}>
            Archivo exportado desde Focux Ops (Ej: Constructora_Jimenez_focuxai.json)
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} style={{ display:"none" }} />

        {/* Or paste */}
        <div style={{ display:"flex", alignItems:"center", gap:12, margin:"16px 0" }}>
          <div style={{ flex:1, height:1, background:tk.border }} />
          <span style={{ fontSize:12, color:tk.textTer, fontWeight:600 }}>O PEGA EL JSON</span>
          <div style={{ flex:1, height:1, background:tk.border }} />
        </div>

        <textarea style={ss.textarea} value={jsonText} onChange={e => setJsonText(e.target.value)} placeholder='{ "nombreConst": "...", "macros": [...], ... }' />
        {parseError && <div style={{ color:tk.red, fontSize:12, marginTop:6 }}>{parseError}</div>}
        {jsonText && config && (
          <div style={{ ...ss.badge(tk.greenBg, tk.green), marginTop:8 }}>
            ✓ JSON válido: {config.nombreConst} — {config.macros?.length || 0} macroproyectos
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
    if (!config || !dynOpts) return null;
    const totalProps = CONTACT_PROPERTIES.length + DEAL_PROPERTIES.length;
    const totalCOProps = Object.values(CUSTOM_OBJECT_SCHEMAS).reduce((s, co) => s + co.properties.length, 0);

    return (
      <div>
        <div style={ss.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <h3 style={{ margin:0, fontSize:18, fontWeight:700 }}>{config.nombreConst}</h3>
              <p style={{ margin:"4px 0 0", color:tk.textSec, fontSize:13 }}>
                {config.macros?.length || 0} macroproyectos · {(config.macros || []).reduce((s, m) => s + (m.torres?.length || 0), 0)} torres · Preview del deploy
              </p>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button style={ss.btn("transparent", tk.textSec)} onClick={() => setView("config")}>← Editar JSON</button>
              <button style={ss.btn(tk.green, "#fff")} onClick={() => setView("deploy")}>Desplegar →</button>
            </div>
          </div>
        </div>

        {/* Pipeline */}
        <div style={ss.card}>
          <h4 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700 }}>Pipeline: {config.nombrePipeline || `Ventas ${config.nombreConst}`} ({PIPELINE_STAGES.length} etapas)</h4>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {PIPELINE_STAGES.map((s, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <span style={{ ...ss.badge(s.p === 0 ? tk.redBg : s.p === 100 ? tk.greenBg : tk.accentLight, s.p === 0 ? tk.red : s.p === 100 ? tk.green : tk.accent), fontSize:10 }}>
                  {s.n} ({s.p}%)
                </span>
                {i < PIPELINE_STAGES.length - 1 && <span style={{ color:tk.textTer, fontSize:10 }}>→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Custom Objects */}
        <div style={ss.card}>
          <h4 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700 }}>4 Custom Objects ({totalCOProps} propiedades)</h4>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {Object.values(CUSTOM_OBJECT_SCHEMAS).map(co => (
              <div key={co.name} style={{ background:tk.bg, borderRadius:8, padding:12 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>{co.labels.singular}</div>
                <div style={{ fontSize:11, color:tk.textSec }}>
                  {co.properties.map(p => p.name).join(", ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Standard Properties */}
        <div style={ss.card}>
          <h4 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700 }}>Propiedades estándar ({totalProps})</h4>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div style={{ background:tk.bg, borderRadius:8, padding:12 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Contacto ({CONTACT_PROPERTIES.length})</div>
              <div style={{ fontSize:11, color:tk.textSec }}>{CONTACT_PROPERTIES.map(p => p.name).join(", ")}</div>
            </div>
            <div style={{ background:tk.bg, borderRadius:8, padding:12 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Deal ({DEAL_PROPERTIES.length})</div>
              <div style={{ fontSize:11, color:tk.textSec }}>{DEAL_PROPERTIES.map(p => p.name).join(", ")}</div>
            </div>
          </div>
        </div>

        {/* Macros from config */}
        <div style={ss.card}>
          <h4 style={{ margin:"0 0 12px", fontSize:14, fontWeight:700 }}>Macroproyectos del JSON ({config.macros?.length || 0})</h4>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            {(config.macros || []).map((m, i) => (
              <div key={i} style={{ background:tk.bg, borderRadius:8, padding:10, fontSize:12 }}>
                <div style={{ fontWeight:700 }}>{m.nombre}</div>
                <div style={{ color:tk.textSec, fontSize:11 }}>{m.ciudad} · {m.tipo} · {m.torres?.length || 0} torres</div>
              </div>
            ))}
          </div>
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
            <p style={{ margin:"4px 0 0", color:tk.textSec, fontSize:13 }}>{config?.nombreConst}</p>
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

        {/* Stats */}
        {(deploying || deployDone) && (
          <div style={{ display:"flex", gap:16, marginBottom:16 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:24, fontWeight:800 }}>{deployStats.total}</div>
              <div style={{ fontSize:11, color:tk.textSec }}>Total</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:24, fontWeight:800, color:tk.green }}>{deployStats.ok}</div>
              <div style={{ fontSize:11, color:tk.textSec }}>Creados</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:24, fontWeight:800, color:tk.amber }}>{deployStats.skip}</div>
              <div style={{ fontSize:11, color:tk.textSec }}>Existentes</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:24, fontWeight:800, color:tk.red }}>{deployStats.err}</div>
              <div style={{ fontSize:11, color:tk.textSec }}>Errores</div>
            </div>
          </div>
        )}

        {/* Log */}
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
      {/* Header */}
      <div style={{ background:tk.card, borderBottom:`1px solid ${tk.border}`, padding:"14px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg, ${tk.teal}, ${tk.navy})`, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:14 }}>F</div>
          <div>
            <div style={{ fontSize:16, fontWeight:700 }}>Focux<span style={{ color:tk.accent }}>AI</span> <span style={{ fontWeight:400, color:tk.textSec }}>Adapter</span></div>
            <div style={{ fontSize:10, color:tk.textTer, letterSpacing:"0.04em" }}>v2 — CUSTOM OBJECTS + PIPELINE + PROPERTIES</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {token && <span style={ss.badge(tk.greenBg, tk.green)}>Token ✓</span>}
          {config && <span style={ss.badge(tk.accentLight, tk.accent)}>{config.nombreConst}</span>}
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding:"8px 24px", borderBottom:`1px solid ${tk.borderLight}`, background:tk.card, display:"flex", gap:4 }}>
        {["home", "config", "preview", "deploy"].map(v => (
          <button key={v} onClick={() => { if (v === "preview" && !config) return; if (v === "deploy" && !config) return; setView(v); }}
            style={{ padding:"6px 14px", borderRadius:6, border:"none", background: view === v ? tk.accent : "transparent", color: view === v ? "#fff" : tk.textSec, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:font, opacity: (v === "preview" || v === "deploy") && !config ? 0.4 : 1 }}>
            {v === "home" ? "Inicio" : v === "config" ? "Config JSON" : v === "preview" ? "Preview" : "Deploy"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth:900, margin:"24px auto", padding:"0 24px" }}>
        {view === "home" && <HomeView />}
        {view === "config" && <ConfigView />}
        {view === "preview" && <PreviewView />}
        {view === "deploy" && <DeployView />}
      </div>

      {/* Footer */}
      <div style={{ textAlign:"center", padding:"24px", fontSize:11, color:tk.textTer }}>
        FocuxAI Engine™ v2 · Deterministic. Auditable. Unstoppable. · Focux Digital Group S.A.S.
      </div>
    </div>
  );
}
