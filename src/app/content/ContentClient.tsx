// @ts-nocheck
"use client";
import { useState, useEffect, useCallback } from "react";

/* ═══ STORAGE ═══ */
const SK_IDX = "focuxai-content-clients-idx";
const SK_CL = "focuxai-content-cl:";
const SK_VER = "focuxai-content-ver:";
function loadIdx() { try { return JSON.parse(localStorage.getItem(SK_IDX) || "[]"); } catch { return []; } }
function saveIdx(idx) { localStorage.setItem(SK_IDX, JSON.stringify(idx)); }
function loadClient(id) { try { return JSON.parse(localStorage.getItem(SK_CL + id)); } catch { return null; } }
function saveClient(id, data) { localStorage.setItem(SK_CL + id, JSON.stringify(data)); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ═══ DESIGN TOKENS ═══ */
const font = "'Poppins', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
const tk = {
  navy: "#1F0067", purple: "#6410F7", cyan: "#08C1F5", teal: "#76F6EA", blue: "#4491F6",
  bg: "#FAFBFD", card: "#FFFFFF", border: "#E8ECF1", borderLight: "#F1F4F8",
  text: "#1A1D26", textSec: "#5A5A7A", textTer: "#9CA3AF",
  green: "#10B981", red: "#EF4444", amber: "#F59E0B",
  greenBg: "#ECFDF5", redBg: "#FEF2F2", amberBg: "#FFFBEB",
  accent: "#6410F7", accentLight: "#F0E6FE",
};

/* ═══ STEPS DEFINITION ═══ */
const PHASE0_STEPS = [
  { t: "Setup General", i: "🏢", d: "Datos base, scraping web, identidad corporativa" },
  { t: "Equipo y Gobernanza", i: "👥", d: "Estructura, HubSpot, mercados internacionales" },
  { t: "Contrato y Alcance", i: "📋", d: "Pool mensual, categorías de contenido" },
];
const PROJECT_STEPS = [
  { t: "Datos Base", i: "📍", d: "Scraping del proyecto, ubicación, estado" },
  { t: "Producto", i: "🏠", d: "Tipologías, precios, amenidades" },
  { t: "Identidad y Tono", i: "🎨", d: "Paleta, tipografía, posicionamiento" },
  { t: "Claims y Compliance", i: "⚖️", d: "Permitidos, prohibidos, disclaimers" },
  { t: "Buyer Personas", i: "🎯", d: "IA genera + consultor valida" },
  { t: "Value Proposition", i: "💎", d: "VPC por buyer, diferenciadores" },
  { t: "Segmentación", i: "📊", d: "Nacional + internacional, matriz" },
  { t: "Plan Marketing", i: "📈", d: "Funnel, canales, KPIs" },
  { t: "AutoQA Rúbricas", i: "✅", d: "R1-R8 auto-generadas" },
];

/* ═══ DEFAULT LISTS ═══ */
const DEF_HERRAMIENTAS = ["Meta Business Suite","Google Ads","Google Analytics","Google Tag Manager","HubSpot CRM","WordPress","Canva","Adobe Creative Cloud","ChatGPT / IA Generativa","CapCut","ElevenLabs","Mailchimp","Hootsuite / Buffer","Semrush / Ahrefs","WhatsApp Business","Atria (WhatsApp)","Zoom / Google Meet","Trello / Asana / Monday"];
const DEF_MERCADOS = ["USA","España","Panamá","México","Ecuador","Chile","Costa Rica","Rep. Dominicana","Canadá","Reino Unido","Alemania","Australia"];
const DEF_CIUDADES = ["Miami, FL","Orlando, FL","New York, NY","New Jersey","Houston, TX","Los Angeles, CA","Madrid","Barcelona","Ciudad de Panamá","Ciudad de México","Quito","Santiago de Chile","Toronto","Londres"];
const DEF_FERIAS_INTL = ["Colombia Real Estate Show (Miami)","Gran Salón Inmobiliario (Bogotá)","FIABCI Americas (Variable)","Expo Real Estate (LATAM)"];
const DEF_AMENIDADES = ["Piscina adultos","Piscina niños","Piscina climatizada","Jacuzzi","Turco","Gimnasio","Gimnasio dotado","Coworking","Salón social","Zona BBQ","Zona BBQ Teppanyaki","Juegos infantiles","Ludoteca","Zona mascotas","Zonas verdes","Senderos peatonales","Cancha múltiple","Cancha pádel","Cancha squash","Yogario","Terraza mirador","Mirador","Portería","Car lobby","Lobby","Enfermería","Salón de estudios","Meeting room","Fire garden","Aqua garden","Zona lectura","Zona caminar","Mall comercial","Locales comerciales","Plazoletas","Parqueadero visitantes","Parqueadero bicicletas","Ascensor","Rooftop","Cine"];
const DEF_CLAIMS_PROHIBIDOS = [
  { claim: "Rentabilidad garantizada / Inversión segura", razon: "Compliance legal — nunca prometer rentabilidad", severidad: "CRÍTICA" },
  { claim: "Valorización asegurada", razon: "Compliance legal — valorización pasada no garantiza futuro", severidad: "CRÍTICA" },
  { claim: "Últimas unidades / Se agotan", razon: "Solo si equipo comercial lo confirma en tiempo real", severidad: "ALTA" },
  { claim: "El mejor proyecto de la ciudad", razon: "Superlativo no verificable", severidad: "ALTA" },
  { claim: "Precio más bajo del mercado", razon: "Comparativo no verificable", severidad: "ALTA" },
  { claim: "Entrega inmediata", razon: "Solo si el estado es 'Entrega inmediata'", severidad: "CRÍTICA" },
  { claim: "Inversión sin riesgo", razon: "Compliance legal", severidad: "CRÍTICA" },
];

/* ═══ TEMPLATES ═══ */
const NEW_PROJECT = () => ({
  id: genId(), step: 0,
  url: "", scrapeStatus: "idle", nombre: "", slogan: "", formulaSlogan: "",
  estado: "construccion", ciudad: "", departamento: "", direccion: "", sector: "", estrato: "",
  segmento: "NO_VIS", fiducia: "", subsidio: false, torres: "", totalUnidades: "", fechaEntrega: "", constructoraAliada: "",
  tipo: "Apartamentos", tipologias: [],
  precioDesde: "", precioHasta: "", precioM2: "",
  amenidades: DEF_AMENIDADES.map(n => ({ n, a: false })), amenidadesCu: [], amenidadesNo: [],
  parqueaderos: "", bodegas: false, extras: [], caracteristicas: [],
  paleta: ["", "", "", ""], tipoHeadlines: "", tipoBody: "",
  tono: { warmth: 5, formality: 5, urgency: 3 },
  tuteo: true, emojis: "no", emojisPermitidos: [], posicionamiento: "",
  whatsapp: "", telefono: "", horarioSala: "", disclaimer: "",
  // 1.4 Claims
  claimsPermitidos: [], claimsProhibidos: DEF_CLAIMS_PROHIBIDOS.map(c => ({ ...c })), claimsCondicionales: [],
  disclaimerRenders: "Las imágenes y planos son representación artística del proyecto. Pueden representar diferencias en acabados, especificaciones, elementos, formas, medidas y texturas.",
  disclaimerAreas: "Las áreas presentadas son aproximadas y pueden variar por procesos constructivos.",
  disclaimerValorizacion: "La valorización pasada no garantiza resultados futuros.",
  antiContaminacion: { regla: "NUNCA usar datos, slogans, paleta, ubicación o amenidades de otros proyectos de la constructora.", elementosExclusivos: "" },
  // 1.5 Buyers
  buyers: [], buyersGenStatus: "idle",
  // 1.6 Value Proposition
  vpGenStatus: "idle", vpProposito: "", vpPosicionamiento: "",
  vpCanvasByBuyer: [], vpDiferenciadores: [], vpMensajeUnificado: "",
  // 1.7 Segmentación
  segGenStatus: "idle", segEstrategia: "", segSegmentos: [], segMatrizPrioridad: "",
  // 1.8 Plan Marketing
  pmGenStatus: "idle", pmObjetivo: "", pmEstrategia: "",
  pmCanalesDigitales: [], pmCanalesOffline: [], pmCanalesIntl: [],
  pmContenidoByBuyer: [], pmKpis: [], pmReglas: [],
  // 1.9 AutoQA
  qaGenStatus: "idle", qaRubricas: [],
});

const INIT = {
  step: 0, view: "phase0", activeProjectId: null,
  nombre: "", nit: "", sede: "", anios: "", website: "",
  scrapeStatus: "idle", scrapeData: null,
  slogan: "", certificaciones: [], afiliaciones: [],
  redes: { instagram: "", facebook: "", tiktok: "", linkedin: "", youtube: "" },
  equipo: { aprueba: "", kam: "", dirComercial: "", notas: "" },
  hsHubs: { marketing: false, sales: false, service: false, content: false, operations: false },
  hsPortalId: "", hsAccesoFocux: false,
  herramientas: DEF_HERRAMIENTAS.map(n => ({ n, a: false })), herramientasCu: [],
  aprobacionVentana: 48, aprobacionEscalamiento: "",
  intl: { tieneEquipo: false, micrositio: "",
    mercados: DEF_MERCADOS.map(n => ({ n, a: false })), mercadosCu: [],
    ciudades: DEF_CIUDADES.map(n => ({ n, a: false })), ciudadesCu: [],
    ferias: DEF_FERIAS_INTL.map(n => ({ n, a: false })), feriasCu: [],
  },
  duracion: 12, fechaInicio: "", lanzamientos: 3,
  pool: { postspauta: 0, postsorg: 0, blogs: 0, emails: 0, videoslive: 0, videosia: 0, shorts: 0, sms: 0, whatsapp: 0, infografias: 0, esporadicas: 0, ebooks: 0, descargables: 0, landings: 0 },
  alcance: { web: false, community: false, whatsapp: false, eventos: false, sombrilla: false },
  intlContrato: { presupuestoSep: false, contenidosMes: 0, reunionesSep: false },
  projects: [],
};

/* ═══ UI PRIMITIVES ═══ */
const ss = {
  label: { display: "block", fontSize: 12, fontWeight: 600, color: tk.text, marginBottom: 4, letterSpacing: "0.01em" },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${tk.border}`, fontSize: 13, color: tk.text, outline: "none", boxSizing: "border-box", fontFamily: font, transition: "border-color 0.2s, box-shadow 0.2s" },
};
const focusStyle = (e, on) => { e.target.style.borderColor = on ? tk.accent : tk.border; e.target.style.boxShadow = on ? `0 0 0 3px ${tk.accentLight}` : "none"; };

function Inp({ label, value, onChange, type = "text", placeholder = "", required = false, note = "" }) {
  return (<div style={{ marginBottom: 16 }}>
    {label && <label style={ss.label}>{label}{required && <span style={{ color: tk.red }}> *</span>}</label>}
    <input type={type} value={value || ""} onChange={e => onChange(type === "number" ? (+e.target.value || 0) : e.target.value)} placeholder={placeholder} style={ss.input} onFocus={e => focusStyle(e, true)} onBlur={e => focusStyle(e, false)} />
    {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0", lineHeight: 1.4 }}>{note}</p>}
  </div>);
}
function MoneyInp({ label, value, onChange, placeholder = "$0", note = "" }) {
  const fmt = v => { if (!v && v !== 0) return ""; const n = String(v).replace(/[^0-9]/g, ""); return n ? "$" + parseInt(n).toLocaleString("es-CO") : ""; };
  return (<div style={{ marginBottom: 16 }}>
    {label && <label style={ss.label}>{label}</label>}
    <input type="text" value={fmt(value)} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ""))} placeholder={placeholder} style={ss.input} onFocus={e => focusStyle(e, true)} onBlur={e => focusStyle(e, false)} />
    {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0" }}>{note}</p>}
  </div>);
}
function Sel({ label, value, onChange, options, note = "" }) {
  return (<div style={{ marginBottom: 16 }}>
    {label && <label style={ss.label}>{label}</label>}
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...ss.input, background: tk.card, cursor: "pointer" }}>
      {options.map(o => <option key={typeof o === "string" ? o : o.v} value={typeof o === "string" ? o : o.v}>{typeof o === "string" ? o : o.l}</option>)}
    </select>
    {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0" }}>{note}</p>}
  </div>);
}
function Chk({ label, checked, onChange, desc = "" }) {
  return (<label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, fontSize: 13, color: tk.text, cursor: "pointer", lineHeight: 1.4 }}>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: tk.accent, marginTop: 1, flexShrink: 0 }} />
    <div><span style={{ fontWeight: 500 }}>{label}</span>{desc && <span style={{ display: "block", fontSize: 11, color: tk.textTer, marginTop: 1 }}>{desc}</span>}</div>
  </label>);
}
function SectionHead({ children, sub = "" }) {
  return (<div style={{ marginTop: 20, marginBottom: 12 }}>
    <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: tk.navy, textTransform: "uppercase", letterSpacing: "0.05em" }}>{children}</h3>
    {sub && <p style={{ margin: "2px 0 0", fontSize: 11, color: tk.textTer }}>{sub}</p>}
  </div>);
}
function InfoBox({ children, type = "info" }) {
  const c = { info: { bg: tk.accentLight, border: tk.accent, text: tk.navy }, warn: { bg: tk.amberBg, border: tk.amber, text: "#92400E" }, success: { bg: tk.greenBg, border: tk.green, text: "#065F46" } }[type];
  return (<div style={{ padding: "12px 14px", background: c.bg, borderRadius: 8, borderLeft: `3px solid ${c.border}`, marginBottom: 14 }}><p style={{ margin: 0, fontSize: 12, color: c.text, lineHeight: 1.5 }}>{children}</p></div>);
}
function Pill({ text, onRemove, color = tk.accent }) {
  return (<span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: color + "12", color, border: `1px solid ${color}30` }}>
    {text}{onRemove && <button onClick={onRemove} style={{ background: "none", border: "none", color, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1, fontWeight: 700 }}>×</button>}
  </span>);
}
function ChipEditor({ items, onChange, label, placeholder = "Agregar...", note = "" }) {
  const [val, setVal] = useState("");
  const add = () => { if (val.trim() && !items.includes(val.trim())) { onChange([...items, val.trim()]); setVal(""); } };
  return (<div style={{ marginBottom: 16 }}>
    {label && <label style={ss.label}>{label}</label>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, minHeight: 32 }}>
      {items.map((item, i) => <Pill key={i} text={item} onRemove={() => { const n = [...items]; n.splice(i, 1); onChange(n); }} />)}
      {items.length === 0 && <span style={{ fontSize: 12, color: tk.textTer, fontStyle: "italic", paddingTop: 6 }}>Ninguno definido</span>}
    </div>
    <div style={{ display: "flex", gap: 6 }}>
      <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder} style={{ ...ss.input, flex: 1 }} />
      <button onClick={add} disabled={!val.trim()} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: val.trim() ? tk.accent : tk.border, color: val.trim() ? "#fff" : tk.textTer, fontSize: 13, cursor: val.trim() ? "pointer" : "default", fontWeight: 600, fontFamily: font }}>Agregar</button>
    </div>
    {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0" }}>{note}</p>}
  </div>);
}
function ToggleList({ items, onToggle, customItems, onAddCustom, onRemoveCustom, label, note = "", placeholder = "Agregar otro..." }) {
  const [val, setVal] = useState("");
  const addCu = () => { if (val.trim()) { onAddCustom([...customItems, val.trim()]); setVal(""); } };
  const activeCount = items.filter(i => i.a).length + customItems.length;
  return (<div style={{ marginBottom: 16 }}>
    {label && <label style={ss.label}>{label} <span style={{ fontWeight: 400, color: tk.textTer }}>({activeCount} activos)</span></label>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
      {items.map((item, i) => (
        <button key={i} onClick={() => { const n = [...items]; n[i] = { ...n[i], a: !n[i].a }; onToggle(n); }}
          style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", border: `1.5px solid ${item.a ? tk.accent + "50" : tk.border}`, background: item.a ? tk.accent + "12" : tk.bg, color: item.a ? tk.accent : tk.textSec, transition: "all 0.15s" }}>
          {item.a ? "✓ " : ""}{item.n}</button>
      ))}
      {customItems.map((item, i) => (
        <span key={"cu" + i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: tk.accent + "12", color: tk.accent, border: `1.5px solid ${tk.accent}50` }}>
          ✓ {item}<button onClick={() => { const n = [...customItems]; n.splice(i, 1); onRemoveCustom(n); }} style={{ background: "none", border: "none", color: tk.accent, cursor: "pointer", fontSize: 14, padding: 0, fontWeight: 700 }}>×</button>
        </span>
      ))}
    </div>
    <div style={{ display: "flex", gap: 6 }}>
      <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCu(); } }} placeholder={placeholder} style={{ ...ss.input, flex: 1, maxWidth: 300 }} />
      <button onClick={addCu} disabled={!val.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: val.trim() ? tk.accent : tk.border, color: val.trim() ? "#fff" : tk.textTer, fontSize: 12, cursor: val.trim() ? "pointer" : "default", fontWeight: 600, fontFamily: font }}>+ Agregar</button>
    </div>
    {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0" }}>{note}</p>}
  </div>);
}
function NumInp({ label, value, onChange, min = 0, max = 999, note = "" }) {
  return (<div style={{ marginBottom: 14 }}>
    {label && <label style={{ ...ss.label, marginBottom: 6 }}>{label}</label>}
    <div style={{ display: "flex", alignItems: "center", gap: 0, border: `1.5px solid ${tk.border}`, borderRadius: 8, overflow: "hidden", height: 38 }}>
      <button onClick={() => onChange(Math.max(min, (value || 0) - 1))} style={{ width: 36, height: "100%", border: "none", borderRight: `1px solid ${tk.border}`, background: tk.bg, cursor: "pointer", fontSize: 16, fontWeight: 700, color: tk.textSec, fontFamily: font }}>−</button>
      <span style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 600, color: value > 0 ? tk.text : tk.textTer, background: tk.card }}>{value || 0}</span>
      <button onClick={() => onChange(Math.min(max, (value || 0) + 1))} style={{ width: 36, height: "100%", border: "none", borderLeft: `1px solid ${tk.border}`, background: tk.bg, cursor: "pointer", fontSize: 16, fontWeight: 700, color: tk.textSec, fontFamily: font }}>+</button>
    </div>
    {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0" }}>{note}</p>}
  </div>);
}
function ScrapeBtn({ url, status, onScrape }) {
  const ok = url && url.startsWith("http") && status !== "loading";
  return (<button onClick={onScrape} disabled={!ok} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: ok ? `linear-gradient(135deg, ${tk.cyan}, ${tk.purple})` : tk.border, color: "#fff", fontSize: 13, cursor: ok ? "pointer" : "default", fontWeight: 600, fontFamily: font, boxShadow: ok ? "0 2px 8px rgba(100,16,247,0.3)" : "none", display: "flex", alignItems: "center", gap: 8 }}>
    {status === "loading" ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Scrapeando...</>
      : status === "done" ? <>✅ Re-scrapear</> : <>🔍 Scrapear sitio web</>}
  </button>);
}
function Slider({ label, value, onChange, min = 1, max = 10, labels = [] }) {
  return (<div style={{ marginBottom: 16 }}>
    {label && <label style={ss.label}>{label}</label>}
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {labels[0] && <span style={{ fontSize: 11, color: tk.textTer, minWidth: 70 }}>{labels[0]}</span>}
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(+e.target.value)} style={{ flex: 1, accentColor: tk.accent, height: 6 }} />
      {labels[1] && <span style={{ fontSize: 11, color: tk.textTer, minWidth: 70, textAlign: "right" }}>{labels[1]}</span>}
      <span style={{ fontSize: 14, fontWeight: 700, color: tk.accent, minWidth: 24, textAlign: "center" }}>{value}</span>
    </div>
  </div>);
}
function ColorPicker({ colors, onChange }) {
  return (<div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
    {colors.map((c, i) => (
      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <input type="color" value={c || "#ffffff"} onChange={e => { const n = [...colors]; n[i] = e.target.value; onChange(n); }}
          style={{ width: 48, height: 48, border: `2px solid ${tk.border}`, borderRadius: 8, cursor: "pointer", padding: 2 }} />
        <input type="text" value={c || ""} onChange={e => { const n = [...colors]; n[i] = e.target.value; onChange(n); }} placeholder="#HEX"
          style={{ width: 72, fontSize: 10, textAlign: "center", padding: "3px 4px", border: `1px solid ${tk.border}`, borderRadius: 4, fontFamily: "monospace", color: tk.textSec }} />
      </div>
    ))}
    <button onClick={() => onChange([...colors, ""])} style={{ width: 48, height: 48, border: `2px dashed ${tk.border}`, borderRadius: 8, background: "none", cursor: "pointer", fontSize: 20, color: tk.textTer }}>+</button>
  </div>);
}
function Header({ title, subtitle, right }) {
  return (<div style={{ background: `linear-gradient(135deg, ${tk.navy} 0%, ${tk.purple} 50%, ${tk.cyan} 100%)`, padding: "0 24px", height: 52, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <img src="/logo-focux.png" alt="Focux" style={{ width: 28, height: 28, borderRadius: 6 }} />
      <div>
        <h1 style={{ margin: 0, color: "#fff", fontSize: 14, fontWeight: 800, letterSpacing: "0.05em" }}>{title}</h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 500 }}>{subtitle}</p>
      </div>
    </div>
    {right && <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{right}</div>}
  </div>);
}
function HeaderBtn({ label, onClick }) {
  return <button onClick={onClick} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, padding: "6px 12px", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: font }}>{label}</button>;
}

/* ═══ STEP 0.1: SETUP GENERAL ═══ */
function S01({ d, u }) {
  const handleScrape = () => { u("scrapeStatus", "loading"); setTimeout(() => { u("scrapeStatus", "done"); }, 2000); };
  return (<div>
    <SectionHead sub="Información base de la constructora">Datos de la Constructora</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Inp label="Nombre de la Constructora" value={d.nombre} onChange={v => u("nombre", v)} required placeholder="Urbansa" />
      <Inp label="NIT" value={d.nit} onChange={v => u("nit", v)} placeholder="800.136.561-7" />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Inp label="Sede principal" value={d.sede} onChange={v => u("sede", v)} placeholder="Bogotá, Colombia" />
      <Inp label="Años de trayectoria" value={d.anios} onChange={v => u("anios", v)} placeholder="30+" />
    </div>
    <SectionHead sub="Pre-llena datos automáticamente">Sitio Web y Scraping</SectionHead>
    <Inp label="URL del sitio web" value={d.website} onChange={v => u("website", v)} required placeholder="https://urbansa.co" />
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <ScrapeBtn url={d.website} status={d.scrapeStatus} onScrape={handleScrape} />
      {d.scrapeStatus === "done" && <span style={{ fontSize: 12, color: tk.green, fontWeight: 500 }}>Datos pre-llenados</span>}
    </div>
    {d.scrapeStatus === "done" && <InfoBox type="success">Scraping completado. Valida y complementa.</InfoBox>}
    <SectionHead sub="Identidad corporativa">Marca Corporativa</SectionHead>
    <Inp label="Slogan / Sello Corporativo" value={d.slogan} onChange={v => u("slogan", v)} placeholder="40 años ¡Creciendo con Felicidad!" note="Aparece en todas las piezas" />
    <ChipEditor label="Certificaciones" items={d.certificaciones} onChange={v => u("certificaciones", v)} placeholder="ISO 9001, Lean Construction..." />
    <ChipEditor label="Afiliaciones" items={d.afiliaciones} onChange={v => u("afiliaciones", v)} placeholder="Camacol, Asobancaria..." />
    <SectionHead sub="Cuentas oficiales">Redes Sociales</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
      <Inp label="Instagram" value={d.redes.instagram} onChange={v => u("redes", { ...d.redes, instagram: v })} placeholder="https://instagram.com/..." />
      <Inp label="Facebook" value={d.redes.facebook} onChange={v => u("redes", { ...d.redes, facebook: v })} placeholder="https://facebook.com/..." />
      <Inp label="TikTok" value={d.redes.tiktok} onChange={v => u("redes", { ...d.redes, tiktok: v })} placeholder="https://tiktok.com/@..." />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Inp label="LinkedIn" value={d.redes.linkedin} onChange={v => u("redes", { ...d.redes, linkedin: v })} placeholder="https://linkedin.com/..." />
      <Inp label="YouTube" value={d.redes.youtube} onChange={v => u("redes", { ...d.redes, youtube: v })} placeholder="https://youtube.com/@..." />
    </div>
  </div>);
}

/* ═══ STEP 0.2: TEAM & GOVERNANCE ═══ */
function S02({ d, u }) {
  return (<div>
    <SectionHead sub="Quién aprueba, coordina, decide">Estructura del Equipo</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Inp label="Aprueba contenido" value={d.equipo.aprueba} onChange={v => u("equipo", { ...d.equipo, aprueba: v })} placeholder="María López — Gerente Mercadeo" />
      <Inp label="KAM Focux" value={d.equipo.kam} onChange={v => u("equipo", { ...d.equipo, kam: v })} placeholder="Susana Tinoco" />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Inp label="Director Comercial" value={d.equipo.dirComercial} onChange={v => u("equipo", { ...d.equipo, dirComercial: v })} placeholder="Carlos Pérez" />
      <Inp label="Notas" value={d.equipo.notas} onChange={v => u("equipo", { ...d.equipo, notas: v })} placeholder="Notas del equipo" />
    </div>
    <SectionHead sub="Módulos disponibles">HubSpot</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 16px", marginBottom: 12 }}>
      {["marketing","sales","service","content","operations"].map(h => <Chk key={h} label={h.charAt(0).toUpperCase() + h.slice(1) + " Hub"} checked={d.hsHubs[h]} onChange={v => u("hsHubs", { ...d.hsHubs, [h]: v })} />)}
    </div>
    <Inp label="Portal ID" value={d.hsPortalId} onChange={v => u("hsPortalId", v)} placeholder="12345678" note="Settings → Account" />
    <Chk label="Focux tiene acceso al portal" checked={d.hsAccesoFocux} onChange={v => u("hsAccesoFocux", v)} desc="Para extraer pipelines y equipos" />
    <SectionHead sub="Herramientas del cliente">Herramientas Actuales</SectionHead>
    <ToggleList items={d.herramientas} onToggle={v => u("herramientas", v)} customItems={d.herramientasCu} onAddCustom={v => u("herramientasCu", v)} onRemoveCustom={v => u("herramientasCu", v)} placeholder="Otra herramienta..." />
    <SectionHead sub="Reglas de aprobación">Aprobación</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Sel label="Ventana" value={d.aprobacionVentana} onChange={v => u("aprobacionVentana", v)} options={[{ v: 24, l: "24 horas" }, { v: 48, l: "48 horas (recomendado)" }, { v: 72, l: "72 horas" }, { v: 0, l: "Sin límite" }]} />
      <Sel label="Escalamiento" value={d.aprobacionEscalamiento} onChange={v => u("aprobacionEscalamiento", v)} options={["KAM escala a Gerencia Comercial","KAM escala a Presidencia","Se publica sin aprobación","Se pausa","Otro"]} />
    </div>
    <SectionHead sub="Aceleración internacional">Estrategia Internacional</SectionHead>
    <Chk label="Equipo para ventas internacionales" checked={d.intl.tieneEquipo} onChange={v => u("intl", { ...d.intl, tieneEquipo: v })} />
    <Inp label="Micrositio internacional" value={d.intl.micrositio} onChange={v => u("intl", { ...d.intl, micrositio: v })} placeholder="https://..." />
    <ToggleList label="Mercados" items={d.intl.mercados} onToggle={v => u("intl", { ...d.intl, mercados: v })} customItems={d.intl.mercadosCu} onAddCustom={v => u("intl", { ...d.intl, mercadosCu: v })} onRemoveCustom={v => u("intl", { ...d.intl, mercadosCu: v })} placeholder="Otro..." />
    <ToggleList label="Ciudades diáspora" items={d.intl.ciudades} onToggle={v => u("intl", { ...d.intl, ciudades: v })} customItems={d.intl.ciudadesCu} onAddCustom={v => u("intl", { ...d.intl, ciudadesCu: v })} onRemoveCustom={v => u("intl", { ...d.intl, ciudadesCu: v })} placeholder="Otra..." />
    <ToggleList label="Ferias" items={d.intl.ferias} onToggle={v => u("intl", { ...d.intl, ferias: v })} customItems={d.intl.feriasCu} onAddCustom={v => u("intl", { ...d.intl, feriasCu: v })} onRemoveCustom={v => u("intl", { ...d.intl, feriasCu: v })} placeholder="Otra..." />
    {d.intl.mercados.filter(m => m.a).length > 0 && <InfoBox type="info">Con {d.intl.mercados.filter(m => m.a).length} mercados activos, cada proyecto generará un buyer "Colombiano en el Exterior".</InfoBox>}
  </div>);
}

/* ═══ STEP 0.3: CONTRACT ═══ */
function S03({ d, u }) {
  const poolTotal = Object.values(d.pool).reduce((a, b) => a + (b || 0), 0);
  const up = (k, v) => u("pool", { ...d.pool, [k]: v });
  const [impSt, setImpSt] = useState("idle");
  const doImp = () => { setImpSt("importing"); setTimeout(() => { u("pool", { postspauta: 80, postsorg: 80, blogs: 8, emails: 16, videoslive: 15, videosia: 15, shorts: 0, sms: 24, whatsapp: 4, infografias: 8, esporadicas: 8, ebooks: 10, descargables: 3, landings: 3 }); setImpSt("done"); }, 2000); };
  return (<div>
    <SectionHead sub="Duración y arranque">Contrato</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
      <Inp label="Duración (meses)" value={d.duracion} onChange={v => u("duracion", v)} type="number" />
      <Inp label="Fecha de inicio" value={d.fechaInicio} onChange={v => u("fechaInicio", v)} type="date" />
      <Inp label="Lanzamientos/año" value={d.lanzamientos} onChange={v => u("lanzamientos", v)} type="number" />
    </div>
    <SectionHead sub="Cantidad máxima mensual por categoría">Pool Mensual</SectionHead>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <button onClick={doImp} disabled={impSt === "importing"} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: impSt === "done" ? tk.green : `linear-gradient(135deg, ${tk.cyan}, ${tk.purple})`, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: font, display: "flex", alignItems: "center", gap: 8 }}>
        {impSt === "importing" ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Extrayendo...</> : impSt === "done" ? <>✅ Pool importado</> : <>📄 Importar desde propuesta</>}
      </button>
    </div>
    {impSt === "done" && <InfoBox type="success">Pool extraído. Ajusta si algo cambió.</InfoBox>}
    <div style={{ padding: 12, background: tk.bg, borderRadius: 10, border: `1px solid ${tk.border}`, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: tk.navy }}>Total pool mensual</span>
      <span style={{ fontSize: 22, fontWeight: 800, color: poolTotal > 0 ? tk.accent : tk.textTer }}>{poolTotal} piezas</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
      {[["Posts pauta","postspauta",200],["Posts orgánicos","postsorg",200],["Blogs AEO","blogs",50],["Emails","emails",50],["Videos live","videoslive",50],["Videos IA/Stock","videosia",50],["Shorts","shorts",50],["SMS","sms",100],["WhatsApp","whatsapp",20],["Infografías","infografias",50],["Esporádicas","esporadicas",50],["Ebooks/mes","ebooks",20],["Descargables/trim","descargables",20],["Landings/trim","landings",20]].map(([l,k,m]) => <NumInp key={k} label={l} value={d.pool[k]} onChange={v => up(k, v)} max={m} />)}
    </div>
    <SectionHead sub="Servicios incluidos">Alcance Adicional</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 16px" }}>
      {[["Administración web","web"],["Community","community"],["WhatsApp / Atria","whatsapp"],["Eventos digitales","eventos"],["Campaña sombrilla","sombrilla"]].map(([l,k]) => <Chk key={k} label={l} checked={d.alcance[k]} onChange={v => u("alcance", { ...d.alcance, [k]: v })} />)}
    </div>
    <SectionHead sub="Alcance internacional">Internacional</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginBottom: 12 }}>
      <Chk label="Presupuesto intl separado" checked={d.intlContrato.presupuestoSep} onChange={v => u("intlContrato", { ...d.intlContrato, presupuestoSep: v })} />
      <Chk label="Reuniones tráfico intl separadas" checked={d.intlContrato.reunionesSep} onChange={v => u("intlContrato", { ...d.intlContrato, reunionesSep: v })} />
    </div>
    <NumInp label="Contenidos intl/mes" value={d.intlContrato.contenidosMes} onChange={v => u("intlContrato", { ...d.intlContrato, contenidosMes: v })} max={100} />
  </div>);
}

/* ═══ STEP 1.1: PROJECT BASE ═══ */
function P11({ p, up }) {
  const handleScrape = () => { up("scrapeStatus", "loading"); setTimeout(() => up("scrapeStatus", "done"), 2000); };
  return (<div>
    <SectionHead sub="URL del proyecto para pre-llenar datos">Scraping</SectionHead>
    <Inp label="URL" value={p.url} onChange={v => up("url", v)} placeholder="https://urbansa.co/apartamentos/bogota/cordoba-127/" />
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}><ScrapeBtn url={p.url} status={p.scrapeStatus} onScrape={handleScrape} /></div>
    <SectionHead sub="Datos generales">Identificación</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Inp label="Nombre oficial" value={p.nombre} onChange={v => up("nombre", v)} required placeholder="Córdoba 127" />
      <Inp label="Slogan" value={p.slogan} onChange={v => up("slogan", v)} placeholder="Una conexión con el buen vivir" />
    </div>
    <Inp label="Fórmula slogan pauta" value={p.formulaSlogan} onChange={v => up("formulaSlogan", v)} placeholder="Conéctate con [beneficio]" note="Variable para piezas de pauta" />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Sel label="Estado" value={p.estado} onChange={v => up("estado", v)} options={[{ v: "pre_venta", l: "Pre-venta / Sobre planos" }, { v: "construccion", l: "En construcción" }, { v: "entrega", l: "Entrega inmediata" }, { v: "vendido", l: "100% vendido" }]} />
      <Sel label="Segmento" value={p.segmento} onChange={v => up("segmento", v)} options={[{ v: "VIS", l: "VIS" }, { v: "NO_VIS", l: "No VIS" }]} />
    </div>
    <SectionHead sub="Ubicación exacta">Ubicación</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Inp label="Ciudad" value={p.ciudad} onChange={v => up("ciudad", v)} required placeholder="Bogotá" />
      <Inp label="Departamento" value={p.departamento} onChange={v => up("departamento", v)} placeholder="Cundinamarca" />
      <Inp label="Dirección" value={p.direccion} onChange={v => up("direccion", v)} placeholder="Calle 127 con Carrera 7" />
      <Inp label="Sector" value={p.sector} onChange={v => up("sector", v)} placeholder="Córdoba" />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
      <Inp label="Estrato" value={p.estrato} onChange={v => up("estrato", v)} placeholder="6" />
      <Inp label="Fiducia" value={p.fiducia} onChange={v => up("fiducia", v)} placeholder="Bancolombia Capital" />
      <Chk label="Subsidio aplica (VIS)" checked={p.subsidio} onChange={v => up("subsidio", v)} />
    </div>
    <SectionHead sub="Escala del proyecto">Estructura</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
      <Inp label="Torres / Etapas" value={p.torres} onChange={v => up("torres", v)} placeholder="2 torres de 13 pisos" />
      <Inp label="Total unidades" value={p.totalUnidades} onChange={v => up("totalUnidades", v)} placeholder="288" />
      <Inp label="Fecha entrega" value={p.fechaEntrega} onChange={v => up("fechaEntrega", v)} placeholder="Dic 2027" />
    </div>
    <Inp label="Constructora aliada" value={p.constructoraAliada} onChange={v => up("constructoraAliada", v)} placeholder="Si aplica" />
    <SectionHead>Contacto</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
      <Inp label="WhatsApp" value={p.whatsapp} onChange={v => up("whatsapp", v)} placeholder="+573102444444" />
      <Inp label="Teléfono" value={p.telefono} onChange={v => up("telefono", v)} placeholder="310 244 4444" />
      <Inp label="Horario sala" value={p.horarioSala} onChange={v => up("horarioSala", v)} placeholder="L-V 8-6 / Sáb 9-5" />
    </div>
    <Inp label="Disclaimer legal" value={p.disclaimer} onChange={v => up("disclaimer", v)} placeholder="Las imágenes son representación artística..." note="Se incluye en contenido con renders o datos de área" />
  </div>);
}

/* ═══ STEP 1.2: PRODUCT ═══ */
function P12({ p, up }) {
  const tipos = p.tipologias || [];
  const addT = () => up("tipologias", [...tipos, { tipo: "", alcobas: "", areaTotal: "", areaPrivada: "", cantidad: "" }]);
  const upT = (i, f, v) => { const n = [...tipos]; n[i] = { ...n[i], [f]: v }; up("tipologias", n); };
  const rmT = i => { const n = [...tipos]; n.splice(i, 1); up("tipologias", n); };
  return (<div>
    <Sel label="Tipo de producto" value={p.tipo} onChange={v => up("tipo", v)} options={["Apartamentos","Casas","Casas campestres","ApartaLofts","Locales comerciales","Mixto"]} />
    <SectionHead sub="Tabla editable">Tipologías</SectionHead>
    {tipos.length > 0 && <div style={{ overflowX: "auto", marginBottom: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: tk.bg }}>
          {["Tipo / Referencia","Alcobas","Área Total m²","Área Privada m²","Cantidad",""].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: tk.navy, borderBottom: `2px solid ${tk.border}`, fontSize: 11 }}>{h}</th>)}
        </tr></thead>
        <tbody>{tipos.map((t, i) => <tr key={i} style={{ borderBottom: `1px solid ${tk.borderLight}` }}>
          <td style={{ padding: 4 }}><input value={t.tipo} onChange={e => upT(i, "tipo", e.target.value)} placeholder="Apto 2 alcobas" style={{ ...ss.input, padding: "6px 8px", fontSize: 12 }} /></td>
          <td style={{ padding: 4 }}><input value={t.alcobas} onChange={e => upT(i, "alcobas", e.target.value)} placeholder="2" style={{ ...ss.input, padding: "6px 8px", fontSize: 12, width: 60 }} /></td>
          <td style={{ padding: 4 }}><input value={t.areaTotal} onChange={e => upT(i, "areaTotal", e.target.value)} placeholder="65.81" style={{ ...ss.input, padding: "6px 8px", fontSize: 12, width: 80 }} /></td>
          <td style={{ padding: 4 }}><input value={t.areaPrivada} onChange={e => upT(i, "areaPrivada", e.target.value)} placeholder="60.12" style={{ ...ss.input, padding: "6px 8px", fontSize: 12, width: 80 }} /></td>
          <td style={{ padding: 4 }}><input value={t.cantidad} onChange={e => upT(i, "cantidad", e.target.value)} placeholder="24" style={{ ...ss.input, padding: "6px 8px", fontSize: 12, width: 60 }} /></td>
          <td style={{ padding: 4 }}><button onClick={() => rmT(i)} style={{ background: "none", border: "none", color: tk.textTer, cursor: "pointer", fontSize: 16 }} onMouseOver={e => e.target.style.color = tk.red} onMouseOut={e => e.target.style.color = tk.textTer}>×</button></td>
        </tr>)}</tbody>
      </table>
    </div>}
    <button onClick={addT} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "11px", background: tk.bg, border: `1.5px dashed ${tk.border}`, borderRadius: 10, color: tk.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, marginBottom: 16 }}>+ Agregar tipología</button>
    <SectionHead sub="Rango de precios">Precios</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
      <MoneyInp label="Precio desde" value={p.precioDesde} onChange={v => up("precioDesde", v)} placeholder="$393.000.000" />
      <MoneyInp label="Precio hasta" value={p.precioHasta} onChange={v => up("precioHasta", v)} placeholder="$1.200.000.000" />
      <MoneyInp label="Precio m²" value={p.precioM2} onChange={v => up("precioM2", v)} placeholder="$5.500.000" />
    </div>
    <SectionHead sub="Marca las confirmadas">Amenidades</SectionHead>
    <ToggleList items={p.amenidades} onToggle={v => up("amenidades", v)} customItems={p.amenidadesCu} onAddCustom={v => up("amenidadesCu", v)} onRemoveCustom={v => up("amenidadesCu", v)} placeholder="Otra amenidad..." note="Solo las CONFIRMADAS — el GPT NO mencionará las inactivas" />
    <ChipEditor label="Amenidades NO incluidas" items={p.amenidadesNo || []} onChange={v => up("amenidadesNo", v)} placeholder="Cancha squash, Rooftop..." note="Se agregan al ClaimsRegistry como PROHIBIDAS" />
    <SectionHead>Extras</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Inp label="Parqueaderos" value={p.parqueaderos} onChange={v => up("parqueaderos", v)} placeholder="Privados cubiertos + visitantes" />
      <Chk label="Tiene bodegas" checked={p.bodegas} onChange={v => up("bodegas", v)} />
    </div>
    <ChipEditor label="Características destacadas" items={p.caracteristicas} onChange={v => up("caracteristicas", v)} placeholder="Vista a montaña, Mall integrado..." />
  </div>);
}

/* ═══ STEP 1.3: IDENTITY & TONE ═══ */
function P13({ p, up }) {
  return (<div>
    <SectionHead sub="Paleta de colores del proyecto (hex)">Paleta de Colores</SectionHead>
    <ColorPicker colors={p.paleta} onChange={v => up("paleta", v)} />
    <SectionHead sub="Fuentes del proyecto">Tipografía</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Inp label="Headlines / Títulos" value={p.tipoHeadlines} onChange={v => up("tipoHeadlines", v)} placeholder="Nolan Next" />
      <Inp label="Body / Cuerpo" value={p.tipoBody} onChange={v => up("tipoBody", v)} placeholder="Nolan Next" />
    </div>
    <SectionHead sub="ADN tonal del proyecto">Tono de Comunicación</SectionHead>
    <Slider label="Warmth (calidez)" value={p.tono.warmth} onChange={v => up("tono", { ...p.tono, warmth: v })} labels={["Frío / Corporate", "Cálido / Cercano"]} />
    <Slider label="Formality (formalidad)" value={p.tono.formality} onChange={v => up("tono", { ...p.tono, formality: v })} labels={["Casual / Joven", "Formal / Premium"]} />
    <Slider label="Urgency (urgencia)" value={p.tono.urgency} onChange={v => up("tono", { ...p.tono, urgency: v })} labels={["Sin presión", "Urgencia alta"]} />
    <SectionHead>Tratamiento</SectionHead>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
      <Sel label="Tratamiento" value={p.tuteo ? "tuteo" : "usted"} onChange={v => up("tuteo", v === "tuteo")} options={[{ v: "tuteo", l: "Tuteo (tú)" }, { v: "usted", l: "Usted" }]} />
      <Sel label="Emojis" value={p.emojis} onChange={v => up("emojis", v)} options={[{ v: "no", l: "No usar emojis" }, { v: "minimo", l: "Mínimo (1-2)" }, { v: "si", l: "Sí, usar emojis" }]} />
    </div>
    {p.emojis !== "no" && <ChipEditor label="Emojis permitidos" items={p.emojisPermitidos} onChange={v => up("emojisPermitidos", v)} placeholder="📍 🏠 ✅ 🌿" note="Solo estos se usarán" />}
    <SectionHead sub="Qué ES y qué NO ES este proyecto">Posicionamiento</SectionHead>
    <Inp label="Posicionamiento" value={p.posicionamiento} onChange={v => up("posicionamiento", v)} placeholder="Buen vivir moderno, NO lujo ostentoso" note="Guía todas las decisiones de tono y contenido" />
  </div>);
}

/* ═══ STEP 1.4: CLAIMS & COMPLIANCE ═══ */
function P14({ p, up }) {
  const cp = p.claimsPermitidos || [];
  const addCp = () => up("claimsPermitidos", [...cp, { claim: "", fuente: "", condicion: "" }]);
  const upCp = (i, f, v) => { const n = [...cp]; n[i] = { ...n[i], [f]: v }; up("claimsPermitidos", n); };
  const rmCp = i => { const n = [...cp]; n.splice(i, 1); up("claimsPermitidos", n); };

  const pr = p.claimsProhibidos || [];
  const addPr = () => up("claimsProhibidos", [...pr, { claim: "", razon: "", severidad: "ALTA" }]);
  const upPr = (i, f, v) => { const n = [...pr]; n[i] = { ...n[i], [f]: v }; up("claimsProhibidos", n); };
  const rmPr = i => { const n = [...pr]; n.splice(i, 1); up("claimsProhibidos", n); };

  const co = p.claimsCondicionales || [];
  const addCo = () => up("claimsCondicionales", [...co, { claim: "", status: "VERIFICAR", condicion: "" }]);
  const upCo = (i, f, v) => { const n = [...co]; n[i] = { ...n[i], [f]: v }; up("claimsCondicionales", n); };
  const rmCo = i => { const n = [...co]; n.splice(i, 1); up("claimsCondicionales", n); };

  const TableRow = ({ items, cols, onUp, onRm }) => items.map((item, i) => (
    <tr key={i} style={{ borderBottom: `1px solid ${tk.borderLight}` }}>
      {cols.map(c => <td key={c.k} style={{ padding: 4 }}>
        {c.type === "select" ? <select value={item[c.k]} onChange={e => onUp(i, c.k, e.target.value)} style={{ ...ss.input, padding: "6px 8px", fontSize: 12 }}>
          {c.opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select> : <input value={item[c.k] || ""} onChange={e => onUp(i, c.k, e.target.value)} placeholder={c.ph} style={{ ...ss.input, padding: "6px 8px", fontSize: 12, minWidth: c.w || 120 }} />}
      </td>)}
      <td style={{ padding: 4 }}><button onClick={() => onRm(i)} style={{ background: "none", border: "none", color: tk.textTer, cursor: "pointer", fontSize: 16 }} onMouseOver={e => e.target.style.color = tk.red} onMouseOut={e => e.target.style.color = tk.textTer}>×</button></td>
    </tr>
  ));

  const AddRow = ({ onClick, label }) => <button onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "10px", background: tk.bg, border: `1.5px dashed ${tk.border}`, borderRadius: 10, color: tk.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, marginBottom: 16, marginTop: 8 }}>+ {label}</button>;

  return (<div>
    <InfoBox type="warn">Este paso es CRÍTICO. Los claims prohibidos se verifican automáticamente en cada pieza de contenido generada. Un error aquí = contenido que no pasa QA.</InfoBox>
    <InfoBox type="info">Los claims prohibidos universales ya están pre-cargados. Las amenidades NO incluidas (del paso Producto) se agregan automáticamente. {p.segmento === "VIS" ? 'Por ser VIS: "lujo", "premium", "exclusivo" están prohibidos.' : p.segmento === "NO_VIS" ? 'Por ser No VIS: "subsidio", "Mi Casa Ya", "VIS" están prohibidos.' : ""} Agrega solo los específicos de este proyecto.</InfoBox>

    <SectionHead sub="Datos verificados que el GPT puede usar libremente">Claims Permitidos ({cp.length})</SectionHead>
    {cp.length > 0 && <div style={{ overflowX: "auto", marginBottom: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: tk.bg }}>
          {["Claim", "Fuente", "Condición", ""].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: tk.navy, borderBottom: `2px solid ${tk.border}`, fontSize: 11 }}>{h}</th>)}
        </tr></thead>
        <tbody><TableRow items={cp} cols={[
          { k: "claim", ph: "Apartamentos desde $393M", w: 200 },
          { k: "fuente", ph: "Landing + Presentación", w: 140 },
          { k: "condicion", ph: "Verificar vigencia (vacío = sin condición)", w: 180 },
        ]} onUp={upCp} onRm={rmCp} /></tbody>
      </table>
    </div>}
    <AddRow onClick={addCp} label="Agregar claim permitido" />

    <SectionHead sub="Cosas que el GPT NUNCA debe decir">Claims Prohibidos ({pr.length})</SectionHead>
    {pr.length > 0 && <div style={{ overflowX: "auto", marginBottom: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: tk.redBg }}>
          {["Claim PROHIBIDO", "Razón", "Severidad", ""].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: tk.red, borderBottom: `2px solid ${tk.red}30`, fontSize: 11 }}>{h}</th>)}
        </tr></thead>
        <tbody><TableRow items={pr} cols={[
          { k: "claim", ph: "Rentabilidad garantizada", w: 200 },
          { k: "razon", ph: "Compliance legal", w: 160 },
          { k: "severidad", type: "select", opts: ["CRÍTICA", "ALTA"] },
        ]} onUp={upPr} onRm={rmPr} /></tbody>
      </table>
    </div>}
    <AddRow onClick={addPr} label="Agregar claim prohibido" />

    <SectionHead sub="Claims que requieren verificación antes de usar">Claims Condicionales ({co.length})</SectionHead>
    {co.length > 0 && <div style={{ overflowX: "auto", marginBottom: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: tk.amberBg }}>
          {["Claim", "Status", "Condición de uso", ""].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: tk.amber, borderBottom: `2px solid ${tk.amber}30`, fontSize: 11 }}>{h}</th>)}
        </tr></thead>
        <tbody><TableRow items={co} cols={[
          { k: "claim", ph: "Precio desde $360M", w: 200 },
          { k: "status", type: "select", opts: ["VERIFICAR", "APROBADO", "RECHAZADO"] },
          { k: "condicion", ph: "Verificar vigencia con equipo comercial", w: 200 },
        ]} onUp={upCo} onRm={rmCo} /></tbody>
      </table>
    </div>}
    <AddRow onClick={addCo} label="Agregar claim condicional" />

    <SectionHead sub="Se incluyen automáticamente cuando aplica">Disclaimers Obligatorios</SectionHead>
    <Inp label="Disclaimer renders" value={p.disclaimerRenders} onChange={v => up("disclaimerRenders", v)} note="Se agrega cuando la pieza usa renders o imágenes del proyecto" />
    <Inp label="Disclaimer áreas" value={p.disclaimerAreas} onChange={v => up("disclaimerAreas", v)} note="Se agrega cuando se mencionan áreas o m²" />
    <Inp label="Disclaimer valorización" value={p.disclaimerValorizacion} onChange={v => up("disclaimerValorizacion", v)} note="Se agrega cuando se menciona valorización" />

    <SectionHead sub="Elementos que son EXCLUSIVOS de este proyecto y no se pueden mezclar con otros">Anti-Contaminación</SectionHead>
    <Inp label="Regla general" value={p.antiContaminacion?.regla} onChange={v => up("antiContaminacion", { ...p.antiContaminacion, regla: v })} />
    <Inp label="Elementos exclusivos" value={p.antiContaminacion?.elementosExclusivos} onChange={v => up("antiContaminacion", { ...p.antiContaminacion, elementosExclusivos: v })} placeholder="Slogan: 'Conéctate con el buen vivir' / Paleta: #D4B276 + #4A5349 / Ubicación: Sector Milán" note="Slogan, paleta, ubicación, tipografía — todo lo que NO se puede usar en otro proyecto" />
  </div>);
}

/* ═══ STEP 1.5: BUYER PERSONAS ═══ */
function P15({ p, up }) {
  const buyers = p.buyers || [];
  const addBuyer = (type) => {
    const templates = {
      residencial: { id: genId(), tipo: "Residencial", nombre: "", segmento: "Residencial", prioridad: 1, edad: "", profesion: "", ingresos: "", ciudad: "", estrato: "", motivaciones: [], objeciones: [], canales: [], mensajeClave: "", hooks: [], tono: "" },
      inversionista: { id: genId(), tipo: "Inversionista", nombre: "", segmento: "Inversionista Patrimonial", prioridad: 2, edad: "", profesion: "", ingresos: "", ciudad: "", estrato: "", motivaciones: [], objeciones: [], canales: [], mensajeClave: "", hooks: [], tono: "" },
      exterior: { id: genId(), tipo: "Exterior", nombre: "", segmento: "Colombiano en el Exterior", prioridad: 3, edad: "", paisResidencia: "", ciudadesResidencia: "", monedaRef: "USD", vinculoCiudad: "", motivaciones: [], objecionesDistancia: [], canalesIntl: [], mensajeClave: "", hooks: [], tono: "" },
    };
    up("buyers", [...buyers, templates[type]]);
  };
  const upBuyer = (i, f, v) => { const n = [...buyers]; n[i] = { ...n[i], [f]: v }; up("buyers", n); };
  const rmBuyer = i => { const n = [...buyers]; n.splice(i, 1); up("buyers", n); };

  const handleGenerate = () => {
    up("buyersGenStatus", "generating");
    // TODO: Claude API call to generate buyers from project data
    setTimeout(() => {
      const generated = [
        { id: genId(), tipo: "Residencial", nombre: `${p.nombre || "Proyecto"} — Residencial`, segmento: "Residencial", prioridad: 1, edad: "30-50", profesion: "Profesional / Ejecutivo", ingresos: "$8-20M", ciudad: p.ciudad || "", estrato: p.estrato || "", motivaciones: ["Ubicación", "Calidad de vida", "Zonas comunes", "Valorización"], objeciones: ["Precio vs competencia", "Tiempos de entrega", "Acabados"], canales: ["Pauta digital", "Referidos", "Sala de ventas"], mensajeClave: `Vive en ${p.sector || p.ciudad || "la mejor ubicación"} con todo lo que necesitas.`, hooks: [`Vivir bien es [beneficio]`, `Tu nuevo hogar en ${p.sector || p.ciudad || "..."}`], tono: "Cálido, cercano, aspiracional" },
        { id: genId(), tipo: "Inversionista", nombre: `${p.nombre || "Proyecto"} — Inversionista`, segmento: "Inversionista Patrimonial", prioridad: 2, edad: "35-60", profesion: "Empresario / Inversionista", ingresos: "$20M+", ciudad: p.ciudad || "", estrato: p.estrato || "", motivaciones: ["Valorización del sector", "Demanda de arriendo", "Respaldo constructora", "Diversificación"], objeciones: ["Rentabilidad esperada", "Vacancia", "Comparación con otros activos"], canales: ["Brokers", "LinkedIn", "Ferias inmobiliarias"], mensajeClave: `Invierte en ${p.sector || p.ciudad || "zona consolidada"} con respaldo de trayectoria.`, hooks: ["Invertir bien no es suerte: es criterio", "Un activo que se valoriza solo"], tono: "Directo, racional, con datos" },
        { id: genId(), tipo: "Exterior", nombre: `${p.nombre || "Proyecto"} — Colombiano Exterior`, segmento: "Colombiano en el Exterior", prioridad: 3, edad: "35-60", paisResidencia: "USA, España", ciudadesResidencia: "Miami, Madrid, New York", monedaRef: "USD", vinculoCiudad: p.ciudad || "", motivaciones: ["Inversión segura en Colombia", "Valor patrimonial", "Uso futuro o arriendo"], objecionesDistancia: ["Distancia física", "Necesidad de acompañamiento remoto", "Desconfianza por no poder visitar"], canalesIntl: ["Pauta geolocalizada", "Portales internacionales", "Brokers"], mensajeClave: `Tu inversión en Colombia, desde donde estés.`, hooks: ["Invierte desde donde estés", "Colombia te espera con valorización real"], tono: "Confiable, datos de respaldo, reduce fricción de distancia" },
      ];
      up("buyers", generated);
      up("buyersGenStatus", "done");
    }, 2500);
  };

  const buyerColors = { Residencial: tk.accent, Inversionista: tk.cyan, Exterior: tk.green };

  return (<div>
    <InfoBox type="info">Regla estructural: cada proyecto genera MÍNIMO 3 buyer personas — Residencial, Inversionista y Colombiano en el Exterior. NUNCA mezclar buyers en una misma pieza de contenido.</InfoBox>

    {/* Generate button */}
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
      <button onClick={handleGenerate} disabled={p.buyersGenStatus === "generating"} style={{
        padding: "12px 24px", borderRadius: 8, border: "none",
        background: p.buyersGenStatus === "done" ? tk.green : `linear-gradient(135deg, ${tk.purple}, ${tk.cyan})`,
        color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 700, fontFamily: font,
        boxShadow: "0 2px 12px rgba(100,16,247,0.3)", display: "flex", alignItems: "center", gap: 10,
      }}>
        {p.buyersGenStatus === "generating" ? <><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Claude está generando buyers...</>
          : p.buyersGenStatus === "done" ? <>✅ Buyers generados — Edita y valida</>
          : <>🤖 Generar Buyer Personas con IA</>}
      </button>
      {buyers.length === 0 && p.buyersGenStatus === "idle" && <span style={{ fontSize: 12, color: tk.textTer }}>Claude analiza los datos del proyecto y genera 3 buyers automáticamente</span>}
    </div>
    {p.buyersGenStatus === "done" && <InfoBox type="success">Buyers generados por IA. Revisa, edita y ajusta según tu conocimiento del mercado. Los datos se usan en las instrucciones del GPT.</InfoBox>}

    {/* Manual add */}
    {buyers.length > 0 && <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <button onClick={() => addBuyer("residencial")} style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${tk.border}`, background: tk.bg, fontSize: 11, color: tk.textSec, cursor: "pointer", fontFamily: font }}>+ Residencial</button>
      <button onClick={() => addBuyer("inversionista")} style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${tk.border}`, background: tk.bg, fontSize: 11, color: tk.textSec, cursor: "pointer", fontFamily: font }}>+ Inversionista</button>
      <button onClick={() => addBuyer("exterior")} style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${tk.border}`, background: tk.bg, fontSize: 11, color: tk.textSec, cursor: "pointer", fontFamily: font }}>+ Exterior</button>
    </div>}

    {/* Buyer cards */}
    {buyers.map((b, i) => {
      const bc = buyerColors[b.tipo] || tk.accent;
      return (
        <div key={b.id} style={{ border: `1px solid ${tk.border}`, borderRadius: 12, padding: 20, marginBottom: 16, borderLeft: `4px solid ${bc}`, background: tk.card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: bc + "18", color: bc, marginBottom: 4, display: "inline-block" }}>{b.tipo}</span>
              <h4 style={{ margin: "4px 0 0", color: tk.navy, fontSize: 14, fontWeight: 700 }}>{b.nombre || `Buyer ${i + 1}`}</h4>
            </div>
            <button onClick={() => rmBuyer(i)} style={{ background: "none", border: "none", color: tk.textTer, cursor: "pointer", fontSize: 18 }} onMouseOver={e => e.target.style.color = tk.red} onMouseOut={e => e.target.style.color = tk.textTer}>×</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Inp label="Nombre del buyer" value={b.nombre} onChange={v => upBuyer(i, "nombre", v)} placeholder="Sebastián — Milán Residencial" />
            <Inp label="Segmento" value={b.segmento} onChange={v => upBuyer(i, "segmento", v)} placeholder="Residencial Consolidado" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
            <Inp label="Edad" value={b.edad} onChange={v => upBuyer(i, "edad", v)} placeholder="30-50 años" />
            <Inp label={b.tipo === "Exterior" ? "País residencia" : "Profesión"} value={b.tipo === "Exterior" ? b.paisResidencia : b.profesion} onChange={v => upBuyer(i, b.tipo === "Exterior" ? "paisResidencia" : "profesion", v)} placeholder={b.tipo === "Exterior" ? "USA, España" : "Profesional / Ejecutivo"} />
            <Inp label={b.tipo === "Exterior" ? "Ciudades residencia" : "Ingresos"} value={b.tipo === "Exterior" ? b.ciudadesResidencia : b.ingresos} onChange={v => upBuyer(i, b.tipo === "Exterior" ? "ciudadesResidencia" : "ingresos", v)} placeholder={b.tipo === "Exterior" ? "Miami, Madrid" : "$8-20M"} />
          </div>

          <ChipEditor label="Motivaciones de compra" items={b.motivaciones || []} onChange={v => upBuyer(i, "motivaciones", v)} placeholder="Ubicación, Valorización, Calidad de vida..." />
          <ChipEditor label={b.tipo === "Exterior" ? "Objeciones de distancia" : "Objeciones"} items={b.tipo === "Exterior" ? (b.objecionesDistancia || []) : (b.objeciones || [])} onChange={v => upBuyer(i, b.tipo === "Exterior" ? "objecionesDistancia" : "objeciones", v)} placeholder="Precio vs competencia, Tiempos de entrega..." />
          <ChipEditor label={b.tipo === "Exterior" ? "Canales internacionales" : "Canales"} items={b.tipo === "Exterior" ? (b.canalesIntl || []) : (b.canales || [])} onChange={v => upBuyer(i, b.tipo === "Exterior" ? "canalesIntl" : "canales", v)} placeholder="Pauta digital, Referidos, Sala de ventas..." />

          <Inp label="Mensaje clave" value={b.mensajeClave} onChange={v => upBuyer(i, "mensajeClave", v)} placeholder="Vive en el corazón de Milán con comodidad y calidad de vida" />
          <ChipEditor label="Hooks efectivos" items={b.hooks || []} onChange={v => upBuyer(i, "hooks", v)} placeholder="Vivir bien es [beneficio]..." />
          <Inp label="Tono" value={b.tono} onChange={v => upBuyer(i, "tono", v)} placeholder="Cálido, cercano, aspiracional" />

          {b.tipo === "Exterior" && <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <Inp label="Moneda referencia" value={b.monedaRef} onChange={v => upBuyer(i, "monedaRef", v)} placeholder="USD" />
              <Inp label="Vínculo con la ciudad" value={b.vinculoCiudad} onChange={v => upBuyer(i, "vinculoCiudad", v)} placeholder="Familia en Bogotá, nacido en Manizales" />
            </div>
          </>}
        </div>
      );
    })}
  </div>);
}

/* ═══ AI GENERATE BUTTON (reusable) ═══ */
function AIGenBtn({ status, onGenerate, label = "Generar con IA", doneLabel = "Generado — Edita y valida", loadingLabel = "Claude está generando..." }) {
  return (<button onClick={onGenerate} disabled={status === "generating"} style={{
    padding: "12px 24px", borderRadius: 8, border: "none",
    background: status === "done" ? tk.green : `linear-gradient(135deg, ${tk.purple}, ${tk.cyan})`,
    color: "#fff", fontSize: 14, cursor: "pointer", fontWeight: 700, fontFamily: font,
    boxShadow: "0 2px 12px rgba(100,16,247,0.3)", display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
  }}>
    {status === "generating" ? <><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> {loadingLabel}</>
      : status === "done" ? <>✅ {doneLabel}</>
      : <>🤖 {label}</>}
  </button>);
}

/* ═══ STEP 1.6: VALUE PROPOSITION ═══ */
function P16({ p, up }) {
  const vpc = p.vpCanvasByBuyer || [];
  const handleGen = () => {
    up("vpGenStatus", "generating");
    setTimeout(() => {
      const buyers = p.buyers || [];
      const generated = buyers.map(b => ({
        buyerId: b.id, buyerNombre: b.nombre || b.tipo,
        jobs: ["Encontrar vivienda ideal", "Mejorar calidad de vida", "Inversión segura"],
        pains: ["Precios altos", "Desconfianza en constructoras", "Procesos complejos"],
        gains: ["Ubicación premium", "Zonas comunes completas", "Valorización del sector"],
        products: [`${p.tipo || "Apartamentos"} desde ${p.precioDesde ? "$" + parseInt(p.precioDesde).toLocaleString("es-CO") : "[precio]"}`],
        painRelievers: ["Fiducia reconocida", "Trayectoria constructora", "Acompañamiento personalizado"],
        gainCreators: ["Amenidades completas", "Ubicación estratégica", "Diseño moderno"],
        fitType: b.tipo === "Inversionista" ? "Racional-Financiero" : b.tipo === "Exterior" ? "Racional + Nostálgico" : "Emocional-Aspiracional",
        fitResumen: `Para ${b.nombre || b.tipo}, ${p.nombre || "este proyecto"} representa ${b.tipo === "Inversionista" ? "una decisión basada en datos y respaldo" : "calidad de vida y bienestar cotidiano"}.`,
      }));
      up("vpCanvasByBuyer", generated);
      up("vpDiferenciadores", ["Ubicación en zona consolidada", "Trayectoria de la constructora", "Amenidades completas", "Producto diverso (tipologías variadas)"]);
      up("vpMensajeUnificado", `${p.nombre || "Proyecto"}: ${p.posicionamiento || "calidad de vida en ubicación estratégica"}.`);
      up("vpGenStatus", "done");
    }, 2500);
  };

  return (<div>
    <InfoBox type="info">El Value Proposition Canvas se genera por buyer. Cada buyer tiene su propio Customer Profile (Jobs, Pains, Gains) y Value Map (Productos, Pain Relievers, Gain Creators).</InfoBox>
    <AIGenBtn status={p.vpGenStatus} onGenerate={handleGen} label="Generar VPC con IA" />
    {p.vpGenStatus === "done" && <InfoBox type="success">VPC generado para {vpc.length} buyers. Revisa y ajusta cada canvas.</InfoBox>}

    <Inp label="Propósito del proyecto" value={p.vpProposito} onChange={v => up("vpProposito", v)} placeholder="Ofrecer calidad de vida en zona consolidada con respaldo de trayectoria" />
    <Inp label="Posicionamiento" value={p.vpPosicionamiento} onChange={v => up("vpPosicionamiento", v)} placeholder={p.posicionamiento || "Buen vivir moderno, NO lujo ostentoso"} />

    {vpc.map((v, i) => (
      <div key={i} style={{ border: `1px solid ${tk.border}`, borderRadius: 12, padding: 20, marginBottom: 16, borderLeft: `4px solid ${tk.accent}`, background: tk.card }}>
        <h4 style={{ margin: "0 0 12px", color: tk.navy, fontSize: 14, fontWeight: 700 }}>VPC — {v.buyerNombre}</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <div>
            <SectionHead>Customer Profile</SectionHead>
            <ChipEditor label="Jobs to do" items={v.jobs} onChange={val => { const n = [...vpc]; n[i] = { ...n[i], jobs: val }; up("vpCanvasByBuyer", n); }} />
            <ChipEditor label="Pains" items={v.pains} onChange={val => { const n = [...vpc]; n[i] = { ...n[i], pains: val }; up("vpCanvasByBuyer", n); }} />
            <ChipEditor label="Gains" items={v.gains} onChange={val => { const n = [...vpc]; n[i] = { ...n[i], gains: val }; up("vpCanvasByBuyer", n); }} />
          </div>
          <div>
            <SectionHead>Value Map</SectionHead>
            <ChipEditor label="Productos/Servicios" items={v.products} onChange={val => { const n = [...vpc]; n[i] = { ...n[i], products: val }; up("vpCanvasByBuyer", n); }} />
            <ChipEditor label="Pain Relievers" items={v.painRelievers} onChange={val => { const n = [...vpc]; n[i] = { ...n[i], painRelievers: val }; up("vpCanvasByBuyer", n); }} />
            <ChipEditor label="Gain Creators" items={v.gainCreators} onChange={val => { const n = [...vpc]; n[i] = { ...n[i], gainCreators: val }; up("vpCanvasByBuyer", n); }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px", marginTop: 8 }}>
          <Inp label="Tipo de fit" value={v.fitType} onChange={val => { const n = [...vpc]; n[i] = { ...n[i], fitType: val }; up("vpCanvasByBuyer", n); }} />
          <Inp label="Resumen del fit" value={v.fitResumen} onChange={val => { const n = [...vpc]; n[i] = { ...n[i], fitResumen: val }; up("vpCanvasByBuyer", n); }} />
        </div>
      </div>
    ))}

    <SectionHead>Diferenciadores vs Competencia</SectionHead>
    <ChipEditor items={p.vpDiferenciadores || []} onChange={v => up("vpDiferenciadores", v)} placeholder="Ubicación, trayectoria, amenidades..." />
    <Inp label="Mensaje unificado del proyecto" value={p.vpMensajeUnificado} onChange={v => up("vpMensajeUnificado", v)} placeholder="El mensaje que engloba todo el proyecto para todos los buyers" note="Una frase que unifica la comunicación del proyecto" />
  </div>);
}

/* ═══ STEP 1.7: SEGMENTACIÓN ═══ */
function P17({ p, up }) {
  const segs = p.segSegmentos || [];
  const handleGen = () => {
    up("segGenStatus", "generating");
    setTimeout(() => {
      const buyers = p.buyers || [];
      const generated = buyers.map((b, i) => ({
        id: b.id, nombre: b.segmento || b.tipo, buyerAsociado: b.nombre || b.tipo,
        prioridad: b.prioridad || (i + 1), volumen: b.tipo === "Residencial" ? "Alto" : b.tipo === "Inversionista" ? "Medio" : "Bajo",
        ticketPromedio: p.precioDesde ? "$" + parseInt(p.precioDesde).toLocaleString("es-CO") : "[pendiente]",
        cicloVenta: b.tipo === "Exterior" ? "6-12 meses" : b.tipo === "Inversionista" ? "2-4 meses" : "3-6 meses",
        motivacionPrincipal: b.motivaciones?.[0] || "Calidad de vida",
        canalesTOFU: ["Pauta Meta", "Google Ads", "Contenido orgánico"],
        canalesMOFU: ["Email marketing", "WhatsApp", "Retargeting"],
        canalesBOFU: ["Sala de ventas", "Llamada directa", "Cotización personalizada"],
        contenidoTOFU: "Awareness: hooks aspiracionales, renders, ubicación",
        contenidoMOFU: "Consideración: tipologías, amenidades, comparativos",
        contenidoBOFU: "Conversión: cotización, simulador, visita sala",
      }));
      up("segSegmentos", generated);
      up("segEstrategia", buyers.length > 1 ? "Estrategia dual: residencial + inversión + internacional" : "Segmento único");
      up("segGenStatus", "done");
    }, 2500);
  };

  return (<div>
    <AIGenBtn status={p.segGenStatus} onGenerate={handleGen} label="Generar Segmentación con IA" />
    {p.segGenStatus === "done" && <InfoBox type="success">Segmentación generada para {segs.length} segmentos.</InfoBox>}

    <Inp label="Estrategia de segmentación" value={p.segEstrategia} onChange={v => up("segEstrategia", v)} placeholder="Estrategia dual: residencial + inversión + internacional" />

    {segs.map((s, i) => (
      <div key={i} style={{ border: `1px solid ${tk.border}`, borderRadius: 12, padding: 20, marginBottom: 16, borderLeft: `4px solid ${tk.cyan}`, background: tk.card }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, color: tk.navy, fontSize: 14, fontWeight: 700 }}>{s.nombre}</h4>
          <span style={{ padding: "2px 10px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: tk.accentLight, color: tk.accent }}>Prioridad {s.prioridad}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
          <Inp label="Volumen" value={s.volumen} onChange={v => { const n = [...segs]; n[i] = { ...n[i], volumen: v }; up("segSegmentos", n); }} />
          <Inp label="Ticket promedio" value={s.ticketPromedio} onChange={v => { const n = [...segs]; n[i] = { ...n[i], ticketPromedio: v }; up("segSegmentos", n); }} />
          <Inp label="Ciclo de venta" value={s.cicloVenta} onChange={v => { const n = [...segs]; n[i] = { ...n[i], cicloVenta: v }; up("segSegmentos", n); }} />
        </div>
        <Inp label="Motivación principal" value={s.motivacionPrincipal} onChange={v => { const n = [...segs]; n[i] = { ...n[i], motivacionPrincipal: v }; up("segSegmentos", n); }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
          <Inp label="Contenido TOFU" value={s.contenidoTOFU} onChange={v => { const n = [...segs]; n[i] = { ...n[i], contenidoTOFU: v }; up("segSegmentos", n); }} note="Awareness" />
          <Inp label="Contenido MOFU" value={s.contenidoMOFU} onChange={v => { const n = [...segs]; n[i] = { ...n[i], contenidoMOFU: v }; up("segSegmentos", n); }} note="Consideración" />
          <Inp label="Contenido BOFU" value={s.contenidoBOFU} onChange={v => { const n = [...segs]; n[i] = { ...n[i], contenidoBOFU: v }; up("segSegmentos", n); }} note="Conversión" />
        </div>
      </div>
    ))}
  </div>);
}

/* ═══ STEP 1.8: PLAN MARKETING ═══ */
function P18({ p, up }) {
  const handleGen = () => {
    up("pmGenStatus", "generating");
    setTimeout(() => {
      up("pmObjetivo", `Posicionar ${p.nombre || "el proyecto"} como la opción #1 en ${p.sector || p.ciudad || "la zona"} y generar leads calificados para los ${(p.buyers || []).length} segmentos.`);
      up("pmEstrategia", "Funnel completo con contenido diferenciado por buyer y etapa. Pauta segmentada + orgánico + WhatsApp.");
      up("pmCanalesDigitales", ["Meta Ads (Facebook + Instagram)", "Google Ads (Search + Display)", "TikTok Ads", "Email Marketing (HubSpot)", "WhatsApp Business / Atria", "SEO + Blog AEO", "Landing pages por proyecto"]);
      up("pmCanalesOffline", ["Sala de ventas", "Eventos inmobiliarios", "Brokers / Referidos", "Material POP"]);
      up("pmCanalesIntl", ["Pauta geolocalizada (Meta + Google)", "Portales internacionales", "Brokers internacionales", "Ferias inmobiliarias"]);
      up("pmKpis", [
        { kpi: "CPL (Costo por Lead)", meta: "[pendiente]", frecuencia: "Semanal" },
        { kpi: "Leads mensuales", meta: "[pendiente]", frecuencia: "Mensual" },
        { kpi: "Tasa Lead→Visita", meta: ">15%", frecuencia: "Mensual" },
        { kpi: "Tasa Visita→Cierre", meta: ">10%", frecuencia: "Mensual" },
        { kpi: "Engagement Rate", meta: ">3%", frecuencia: "Semanal" },
        { kpi: "Response Time WhatsApp", meta: "<5 min", frecuencia: "Diario" },
      ]);
      up("pmReglas", ["Toda pieza apunta a UN SOLO buyer", "Ratio 75% emocional / 25% datos", "Verificar claims antes de publicar", "Hooks NO repetidos", "Disclaimer obligatorio con renders", "Paleta exclusiva del proyecto"]);
      up("pmGenStatus", "done");
    }, 2500);
  };
  const kpis = p.pmKpis || [];
  const upKpi = (i, f, v) => { const n = [...kpis]; n[i] = { ...n[i], [f]: v }; up("pmKpis", n); };

  return (<div>
    <AIGenBtn status={p.pmGenStatus} onGenerate={handleGen} label="Generar Plan Marketing con IA" />
    {p.pmGenStatus === "done" && <InfoBox type="success">Plan de marketing generado. Ajusta objetivos y KPIs según las metas del cliente.</InfoBox>}

    <Inp label="Objetivo principal" value={p.pmObjetivo} onChange={v => up("pmObjetivo", v)} placeholder="Posicionar el proyecto y generar leads calificados..." />
    <Inp label="Estrategia general" value={p.pmEstrategia} onChange={v => up("pmEstrategia", v)} placeholder="Funnel completo con contenido diferenciado..." />

    <SectionHead>Canales</SectionHead>
    <ChipEditor label="Canales digitales" items={p.pmCanalesDigitales || []} onChange={v => up("pmCanalesDigitales", v)} placeholder="Meta Ads, Google Ads..." />
    <ChipEditor label="Canales offline" items={p.pmCanalesOffline || []} onChange={v => up("pmCanalesOffline", v)} placeholder="Sala de ventas, Eventos..." />
    <ChipEditor label="Canales internacionales" items={p.pmCanalesIntl || []} onChange={v => up("pmCanalesIntl", v)} placeholder="Pauta geolocalizada, Portales intl..." />

    <SectionHead sub="Métricas clave con metas">KPIs</SectionHead>
    {kpis.length > 0 && <div style={{ overflowX: "auto", marginBottom: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: tk.bg }}>
          {["KPI", "Meta", "Frecuencia", ""].map(h => <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: tk.navy, borderBottom: `2px solid ${tk.border}`, fontSize: 11 }}>{h}</th>)}
        </tr></thead>
        <tbody>{kpis.map((k, i) => <tr key={i} style={{ borderBottom: `1px solid ${tk.borderLight}` }}>
          <td style={{ padding: 4 }}><input value={k.kpi} onChange={e => upKpi(i, "kpi", e.target.value)} style={{ ...ss.input, padding: "6px 8px", fontSize: 12 }} /></td>
          <td style={{ padding: 4 }}><input value={k.meta} onChange={e => upKpi(i, "meta", e.target.value)} style={{ ...ss.input, padding: "6px 8px", fontSize: 12, width: 100 }} /></td>
          <td style={{ padding: 4 }}><select value={k.frecuencia} onChange={e => upKpi(i, "frecuencia", e.target.value)} style={{ ...ss.input, padding: "6px 8px", fontSize: 12 }}>
            {["Diario", "Semanal", "Mensual", "Trimestral"].map(o => <option key={o}>{o}</option>)}
          </select></td>
          <td style={{ padding: 4 }}><button onClick={() => { const n = [...kpis]; n.splice(i, 1); up("pmKpis", n); }} style={{ background: "none", border: "none", color: tk.textTer, cursor: "pointer", fontSize: 16 }}>×</button></td>
        </tr>)}</tbody>
      </table>
    </div>}
    <button onClick={() => up("pmKpis", [...kpis, { kpi: "", meta: "", frecuencia: "Mensual" }])} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "10px", background: tk.bg, border: `1.5px dashed ${tk.border}`, borderRadius: 10, color: tk.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, marginBottom: 16 }}>+ Agregar KPI</button>

    <SectionHead>Reglas de Contenido para el GPT</SectionHead>
    <ChipEditor items={p.pmReglas || []} onChange={v => up("pmReglas", v)} placeholder="Toda pieza apunta a UN SOLO buyer..." note="Estas reglas se inyectan directamente en las instrucciones del GPT" />
  </div>);
}

/* ═══ STEP 1.9: AUTOQA RÚBRICAS ═══ */
function P20({ p, up }) {
  const rubs = p.qaRubricas || [];
  const handleGen = () => {
    up("qaGenStatus", "generating");
    setTimeout(() => {
      up("qaRubricas", [
        { id: "R1", nombre: "Verificación de Claims", severidad: "CRÍTICA", checks: ["¿Todo dato aparece en ClaimsRegistry como PERMITIDO?", "¿Hay algún claim PROHIBIDO incluido?", "¿Disclaimer incluido si hay renders?"], failAction: "NO publicar. Corregir o marcar [DATO_PENDIENTE]." },
        { id: "R2", nombre: "Separación de Buyers", severidad: "CRÍTICA", checks: ["¿La pieza apunta a UN SOLO buyer?", "¿El tono es coherente con el buyer target?", "¿El hook usa fórmula apropiada para ese buyer?"], failAction: "Separar en piezas independientes." },
        { id: "R3", nombre: "Anti-Repetición de Hooks", severidad: "ALTA", checks: ["¿El hook NO está en la lista de hooks usados?", "¿Usa fórmula diferente a las últimas 3 piezas?"], failAction: "Generar hook alternativo." },
        { id: "R4", nombre: "Anti-Contaminación", severidad: "CRÍTICA", checks: ["¿NO menciona otros proyectos de la constructora?", "¿La paleta es exclusiva de este proyecto?", "¿El slogan es correcto?", "¿Las amenidades son SOLO las confirmadas?"], failAction: "ELIMINAR referencia contaminante." },
        { id: "R5", nombre: "Consistencia de Marca", severidad: "ALTA", checks: [`¿Se usa ${p.tuteo ? "tuteo" : "usted"}?`, `¿Emojis ${p.emojis === "no" ? "ausentes" : "solo los permitidos"}?`, "¿Tipografía y paleta correctas?"], failAction: "Corregir según TasteProfile." },
        { id: "R6", nombre: "Especificaciones de Formato", severidad: "MEDIA", checks: ["¿Cumple con formato solicitado (reel/carrusel/blog)?", "¿Longitud dentro de límites?", "¿CTAs presentes?"], failAction: "Ajustar formato." },
        { id: "R7", nombre: "Calidad de Reel", severidad: "ALTA", checks: ["¿Hook en primeros 2 segundos?", "¿Duración 15-30s?", "¿Texto legible?", "¿Audio de calidad?"], failAction: "Rehacer guión de reel." },
        { id: "R8", nombre: "Reel Avance de Obra", severidad: "ALTA", checks: ["¿Solo datos aprobados por la constructora?", "¿Sin promesas de fecha no confirmadas?", "¿Tono general (no buyer-specific)?"], failAction: "Verificar datos con equipo de obra." },
      ]);
      up("qaGenStatus", "done");
    }, 2000);
  };
  const upRub = (i, f, v) => { const n = [...rubs]; n[i] = { ...n[i], [f]: v }; up("qaRubricas", n); };
  const sevColors = { "CRÍTICA": tk.red, "ALTA": tk.amber, "MEDIA": tk.cyan };

  return (<div>
    <InfoBox type="info">Las rúbricas AutoQA se generan 100% automáticamente a partir de los datos de los pasos anteriores (Claims, Buyers, Identidad, Amenidades). El GPT ejecuta TODAS las rúbricas antes de entregar cualquier pieza.</InfoBox>
    <AIGenBtn status={p.qaGenStatus} onGenerate={handleGen} label="Auto-generar Rúbricas QA" doneLabel="Rúbricas generadas — Ajusta severidades" />
    {p.qaGenStatus === "done" && <InfoBox type="success">{rubs.length} rúbricas generadas (R1-R8). Puedes ajustar severidades y agregar checks adicionales.</InfoBox>}

    {rubs.map((r, i) => {
      const sc = sevColors[r.severidad] || tk.textSec;
      return (
        <div key={r.id} style={{ border: `1px solid ${tk.border}`, borderRadius: 12, padding: 16, marginBottom: 12, borderLeft: `4px solid ${sc}`, background: tk.card }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h4 style={{ margin: 0, color: tk.navy, fontSize: 13, fontWeight: 700 }}>{r.id}: {r.nombre}</h4>
            <select value={r.severidad} onChange={e => upRub(i, "severidad", e.target.value)} style={{ padding: "3px 8px", borderRadius: 6, border: `1.5px solid ${sc}40`, background: sc + "12", color: sc, fontSize: 11, fontWeight: 700 }}>
              {["CRÍTICA", "ALTA", "MEDIA"].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 8 }}>
            {(r.checks || []).map((c, ci) => (
              <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 12, color: tk.textSec }}>
                <span style={{ color: sc, fontSize: 14 }}>•</span> {c}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: tk.textTer, margin: 0 }}>Si falla → {r.failAction}</p>
        </div>
      );
    })}
  </div>);
}

/* ═══ STEP PLACEHOLDER ═══ */
function StepPlaceholder({ step }) {
  return (<div style={{ textAlign: "center", padding: "60px 20px" }}>
    <p style={{ fontSize: 48, margin: "0 0 16px" }}>{step.i}</p>
    <h3 style={{ margin: "0 0 8px", color: tk.navy, fontSize: 18 }}>{step.t}</h3>
    <p style={{ color: tk.textTer, fontSize: 13 }}>{step.d}</p>
    <p style={{ color: tk.textTer, fontSize: 12, marginTop: 24, fontStyle: "italic" }}>Se construirá en la siguiente iteración</p>
  </div>);
}

/* ═══ PROJECTS HOME ═══ */
function ProjectsHome({ projects, onSelect, onNew, onDelete, name }) {
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <div>
        <h2 style={{ margin: 0, color: tk.navy, fontSize: 20, fontWeight: 800 }}>Proyectos — {name}</h2>
        <p style={{ margin: "4px 0 0", color: tk.textTer, fontSize: 13 }}>{projects.length} proyectos</p>
      </div>
      <button onClick={onNew} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${tk.purple}, ${tk.cyan})`, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: "0 2px 8px rgba(100,16,247,0.3)" }}>+ Nuevo Proyecto</button>
    </div>
    {projects.length === 0 ? (
      <div style={{ textAlign: "center", padding: "60px 20px", background: tk.card, borderRadius: 12, border: `1.5px dashed ${tk.border}` }}>
        <p style={{ fontSize: 40, margin: "0 0 12px" }}>🏗️</p>
        <p style={{ color: tk.textSec, fontSize: 14 }}>No hay proyectos configurados</p>
        <p style={{ color: tk.textTer, fontSize: 12 }}>Haz clic en "+ Nuevo Proyecto" para comenzar</p>
      </div>
    ) : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {projects.map(p => {
          const fields = [p.nombre, p.ciudad, p.segmento, p.precioDesde, p.tipo].filter(Boolean).length;
          const pct = Math.round((fields / 5) * 100);
          return (<div key={p.id} style={{ background: tk.card, borderRadius: 12, border: `1px solid ${tk.border}`, overflow: "hidden", cursor: "pointer", transition: "all 0.2s" }}
            onMouseOver={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(100,16,247,0.12)"; }} onMouseOut={e => { e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ height: 4, background: `linear-gradient(90deg, ${tk.cyan}, ${tk.purple})` }} />
            <div onClick={() => onSelect(p.id)} style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h3 style={{ margin: "0 0 4px", color: tk.navy, fontSize: 15, fontWeight: 700 }}>{p.nombre || "Sin nombre"}</h3>
                <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, background: p.segmento === "VIS" ? tk.greenBg : tk.accentLight, color: p.segmento === "VIS" ? tk.green : tk.accent }}>{p.segmento || "—"}</span>
              </div>
              <p style={{ margin: "0 0 8px", color: tk.textTer, fontSize: 12 }}>{p.ciudad || "Sin ciudad"}{p.sector ? ` · ${p.sector}` : ""}</p>
              {p.precioDesde && <p style={{ margin: "0 0 8px", fontSize: 11, color: tk.textSec }}>Desde ${parseInt(p.precioDesde).toLocaleString("es-CO")}</p>}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: tk.textTer }}>Completitud</span>
                <span style={{ fontWeight: 600, color: pct === 100 ? tk.green : pct > 30 ? tk.amber : tk.accent }}>{pct}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: tk.borderLight }}><div style={{ height: 4, borderRadius: 2, background: pct === 100 ? tk.green : pct > 30 ? tk.amber : tk.accent, width: `${pct}%`, transition: "width 0.3s" }} /></div>
            </div>
            <div style={{ borderTop: `1px solid ${tk.borderLight}`, textAlign: "center" }}>
              <button onClick={e => { e.stopPropagation(); if (confirm(`¿Eliminar "${p.nombre || "proyecto"}"?`)) onDelete(p.id); }}
                style={{ width: "100%", padding: "8px 0", border: "none", background: "transparent", fontSize: 11, color: tk.textTer, cursor: "pointer", fontFamily: font }}
                onMouseOver={e => e.target.style.color = tk.red} onMouseOut={e => e.target.style.color = tk.textTer}>🗑 Eliminar</button>
            </div>
          </div>);
        })}
      </div>
    )}
  </div>);
}

/* ═══ CLIENT HOME ═══ */
function ClientHome({ clients, onSelect, onNew, onImport, onDelete, onExport }) {
  const handleFile = e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { onImport(JSON.parse(ev.target.result)); } catch { alert("JSON inválido"); } }; r.readAsText(f); e.target.value = ""; };
  return (<div style={{ fontFamily: font, background: tk.bg, minHeight: "100vh", color: tk.text }}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}} @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');`}</style>
    <Header title="FOCUXAI CONTENT" subtitle="Strategic Content Onboarding Engine" />
    <div style={{ textAlign: "center", padding: "40px 20px 20px" }}>
      <img src="/logo-focux.png" alt="Focux" style={{ width: 100, marginBottom: 16 }} />
      <h2 style={{ margin: "0 0 4px", color: tk.navy, fontSize: 24, fontWeight: 800 }}>FocuxAI Content</h2>
      <p style={{ margin: 0, color: tk.textSec, fontSize: 14 }}>Selecciona una constructora o crea una nueva</p>
    </div>
    <div style={{ display: "flex", justifyContent: "center", gap: 12, padding: "0 20px 24px" }}>
      <button onClick={onNew} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${tk.purple}, ${tk.cyan})`, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: "0 2px 8px rgba(100,16,247,0.3)" }}>+ Nueva Constructora</button>
      <button onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json"; inp.onchange = handleFile; inp.click(); }} style={{ padding: "10px 24px", borderRadius: 8, border: `1.5px solid ${tk.border}`, background: tk.card, color: tk.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>📥 Importar JSON</button>
    </div>
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 20px 40px" }}>
      {clients.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: tk.card, borderRadius: 12, border: `1.5px dashed ${tk.border}` }}>
          <p style={{ fontSize: 40, margin: "0 0 12px" }}>🏗️</p>
          <p style={{ color: tk.textSec, fontSize: 14 }}>No hay constructoras</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {clients.map(c => (
            <div key={c.id} style={{ background: tk.card, borderRadius: 12, border: `1px solid ${tk.border}`, overflow: "hidden", cursor: "pointer", transition: "all 0.2s" }}
              onMouseOver={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(100,16,247,0.12)"} onMouseOut={e => e.currentTarget.style.boxShadow = "none"}>
              <div style={{ height: 4, background: `linear-gradient(90deg, ${tk.purple}, ${tk.cyan})` }} />
              <div onClick={() => onSelect(c.id)} style={{ padding: 20 }}>
                <h3 style={{ margin: "0 0 4px", color: tk.navy, fontSize: 16, fontWeight: 700 }}>{c.nombre || "Sin nombre"}</h3>
                <p style={{ margin: "0 0 12px", color: tk.textTer, fontSize: 12 }}>{c.website || "—"}</p>
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: tk.textSec }}><span>📍 {c.sede || "—"}</span><span>🏠 {c.projectCount || 0} proy.</span></div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}><span style={{ color: tk.textTer }}>Completitud</span><span style={{ fontWeight: 600, color: tk.accent }}>{c.pct || 0}%</span></div>
                  <div style={{ height: 4, borderRadius: 2, background: tk.borderLight }}><div style={{ height: 4, borderRadius: 2, background: tk.accent, width: `${c.pct || 0}%` }} /></div>
                </div>
              </div>
              <div style={{ display: "flex", borderTop: `1px solid ${tk.borderLight}` }}>
                <button onClick={e => { e.stopPropagation(); onExport(c.id); }} style={{ flex: 1, padding: "8px 0", border: "none", background: "transparent", fontSize: 11, color: tk.textSec, cursor: "pointer", fontFamily: font }} onMouseOver={e => e.target.style.color = tk.accent} onMouseOut={e => e.target.style.color = tk.textSec}>📤 Exportar</button>
                <div style={{ width: 1, background: tk.borderLight }} />
                <button onClick={e => { e.stopPropagation(); if (confirm(`¿Eliminar "${c.nombre}"?`)) onDelete(c.id); }} style={{ flex: 1, padding: "8px 0", border: "none", background: "transparent", fontSize: 11, color: tk.textSec, cursor: "pointer", fontFamily: font }} onMouseOver={e => e.target.style.color = tk.red} onMouseOut={e => e.target.style.color = tk.textSec}>🗑 Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>);
}

/* ═══ MAIN APP ═══ */
export default function ContentWizard() {
  const [view, setView] = useState("home");
  const [clients, setClients] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [d, setD] = useState(INIT);
  const [ok, sOk] = useState(false);
  const [saving, sSv] = useState(false);

  useEffect(() => { setClients(loadIdx()); sOk(true); }, []);

  const persist = useCallback(nd => {
    if (!activeId) return; sSv(true); saveClient(activeId, nd);
    setClients(prev => { const next = prev.map(c => c.id === activeId ? { ...c, nombre: nd.nombre || "", website: nd.website || "", sede: nd.sede || "", projectCount: (nd.projects || []).length, updated: new Date().toISOString(), pct: Math.round(([nd.nombre, nd.website, nd.sede, nd.slogan].filter(Boolean).length / 4) * 100) } : c); saveIdx(next); return next; });
    setTimeout(() => sSv(false), 500);
  }, [activeId]);

  const u = useCallback((f, v) => { setD(prev => { const next = { ...prev, [f]: v }; persist(next); return next; }); }, [persist]);
  const goTo = step => { const next = { ...d, step }; setD(next); persist(next); };
  const updateProject = useCallback((pid, field, value) => { setD(prev => { const next = { ...prev, projects: prev.projects.map(p => p.id === pid ? { ...p, [field]: value } : p) }; persist(next); return next; }); }, [persist]);

  const handleNew = () => { const id = genId(); const nc = { id, nombre: "", website: "", sede: "", projectCount: 0, updated: new Date().toISOString(), pct: 0 }; setClients(p => { const n = [...p, nc]; saveIdx(n); return n; }); saveClient(id, { ...INIT }); setActiveId(id); setD({ ...INIT }); setView("wizard"); };
  const handleSelect = id => { const data = loadClient(id); if (data) { setActiveId(id); setD({ ...INIT, ...data }); setView("wizard"); } };
  const handleDelete = id => { setClients(p => { const n = p.filter(c => c.id !== id); saveIdx(n); return n; }); localStorage.removeItem(SK_CL + id); };
  const handleExport = id => { const data = loadClient(id); if (!data) return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = `FocuxAI_${(data.nombre || "export").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
  const handleImport = data => { const id = genId(); setClients(p => { const n = [...p, { id, nombre: data.nombre || "Importado", website: data.website || "", sede: data.sede || "", projectCount: (data.projects || []).length, updated: new Date().toISOString(), pct: 0 }]; saveIdx(n); return n; }); saveClient(id, { ...INIT, ...data }); setActiveId(id); setD({ ...INIT, ...data }); setView("wizard"); };
  const handleBackToHome = () => { setView("home"); setActiveId(null); setClients(loadIdx()); };

  if (!ok) return (<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", background: tk.bg, fontFamily: font }}>
    <img src="/logo-focux.png" alt="Focux" style={{ width: 120, marginBottom: 20 }} /><div style={{ width: 40, height: 40, border: `3px solid ${tk.border}`, borderTopColor: tk.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><p style={{ color: tk.textSec, fontSize: 13, marginTop: 12 }}>Cargando...</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>);

  if (view === "home") return <ClientHome clients={clients} onSelect={handleSelect} onNew={handleNew} onImport={handleImport} onDelete={handleDelete} onExport={handleExport} />;

  // WIZARD
  const isProject = d.view === "project" && d.activeProjectId;
  const ap = isProject ? (d.projects || []).find(p => p.id === d.activeProjectId) : null;
  const enterProject = pid => { u("view", "project"); u("activeProjectId", pid); };
  const exitProject = () => { u("view", "phase0"); u("activeProjectId", null); };
  const addProject = () => { const np = NEW_PROJECT(); u("projects", [...(d.projects || []), np]); enterProject(np.id); };
  const deleteProject = pid => u("projects", (d.projects || []).filter(p => p.id !== pid));
  const ps = ap?.step || 0;
  const setPs = s => updateProject(d.activeProjectId, "step", s);
  const pComps = [P11, P12, P13, P14, P15, P16, P17, P18, P20];

  return (<div style={{ fontFamily: font, background: tk.bg, minHeight: "100vh", color: tk.text }}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}} @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');`}</style>
    <Header title="FOCUXAI CONTENT" subtitle="Strategic Content Onboarding Engine" right={<>
      {saving && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Guardando...</span>}
      {d.nombre && <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600 }}>{d.nombre}</span>}
      <HeaderBtn label="📤 JSON" onClick={() => handleExport(activeId)} />
      <HeaderBtn label="← Home" onClick={handleBackToHome} />
    </>} />
    <div style={{ display: "flex", maxWidth: 1280, margin: "0 auto" }}>
      {/* Sidebar */}
      <div style={{ width: 240, minHeight: "calc(100vh - 52px)", background: tk.card, borderRight: `1px solid ${tk.border}`, padding: "12px 0", flexShrink: 0, overflow: "auto" }}>
        <div style={{ textAlign: "center", padding: "8px 0 16px", borderBottom: `1px solid ${tk.borderLight}`, marginBottom: 8 }}><img src="/logo-focux.png" alt="Focux" style={{ width: 80, opacity: 0.8 }} /></div>
        {isProject && ap ? (<>
          <button onClick={exitProject} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "10px 16px", background: tk.bg, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: tk.accent, fontFamily: font, borderBottom: `1px solid ${tk.borderLight}`, marginBottom: 8 }}>← Volver a proyectos</button>
          <div style={{ padding: "4px 16px 8px", fontSize: 11, fontWeight: 700, color: tk.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ap.nombre || "Proyecto"}</div>
          {PROJECT_STEPS.map((s, i) => <button key={i} onClick={() => setPs(i)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 16px", background: ps === i ? tk.accentLight : "transparent", border: "none", cursor: "pointer", textAlign: "left", borderRight: ps === i ? `3px solid ${tk.accent}` : "3px solid transparent" }}>
            <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>{s.i}</span>
            <p style={{ margin: 0, fontSize: 11, fontWeight: ps === i ? 700 : 500, color: ps === i ? tk.navy : tk.textSec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.t}</p>
          </button>)}
        </>) : (<>
          <div style={{ padding: "8px 16px", fontSize: 10, fontWeight: 700, color: tk.purple, textTransform: "uppercase", letterSpacing: "0.08em" }}>Fase 0 — Constructora</div>
          {PHASE0_STEPS.map((s, i) => <button key={i} onClick={() => { u("view", "phase0"); goTo(i); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 16px", background: d.step === i && d.view === "phase0" ? tk.accentLight : "transparent", border: "none", cursor: "pointer", textAlign: "left", borderRight: d.step === i && d.view === "phase0" ? `3px solid ${tk.accent}` : "3px solid transparent" }}>
            <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>{s.i}</span>
            <p style={{ margin: 0, fontSize: 11, fontWeight: d.step === i && d.view === "phase0" ? 700 : 500, color: d.step === i && d.view === "phase0" ? tk.navy : tk.textSec }}>{s.t}</p>
          </button>)}
          <button onClick={() => u("view", "projects")} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 16px", background: d.view === "projects" ? tk.accentLight : "transparent", border: "none", cursor: "pointer", textAlign: "left", borderRight: d.view === "projects" ? `3px solid ${tk.accent}` : "3px solid transparent", marginTop: 4 }}>
            <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>🏠</span>
            <p style={{ margin: 0, fontSize: 11, fontWeight: d.view === "projects" ? 700 : 500, color: d.view === "projects" ? tk.navy : tk.textSec }}>Proyectos ({(d.projects || []).length})</p>
          </button>
        </>)}
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: "28px 32px", maxWidth: 860, overflow: "auto" }}>
        {isProject && ap ? (<>
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: tk.cyan, textTransform: "uppercase", letterSpacing: "0.06em" }}>Proyecto — {ap.nombre || "Sin nombre"}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, marginBottom: 4 }}><span style={{ fontSize: 22 }}>{PROJECT_STEPS[ps].i}</span><h2 style={{ margin: 0, color: tk.navy, fontSize: 22, fontWeight: 800 }}>{PROJECT_STEPS[ps].t}</h2></div>
            <p style={{ margin: 0, color: tk.textTer, fontSize: 13 }}>{PROJECT_STEPS[ps].d}</p>
          </div>
          {ps < pComps.length ? (() => { const C = pComps[ps]; return <C p={ap} up={(f, v) => updateProject(d.activeProjectId, f, v)} />; })() : <StepPlaceholder step={PROJECT_STEPS[ps]} />}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 20, borderTop: `1px solid ${tk.border}` }}>
            <button onClick={() => ps === 0 ? exitProject() : setPs(ps - 1)} style={{ padding: "10px 24px", borderRadius: 8, border: `1.5px solid ${tk.border}`, background: tk.card, color: tk.text, fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: font }}>{ps === 0 ? "← Proyectos" : "← Anterior"}</button>
            <button onClick={() => setPs(Math.min(PROJECT_STEPS.length - 1, ps + 1))} disabled={ps === PROJECT_STEPS.length - 1} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: ps === PROJECT_STEPS.length - 1 ? tk.border : `linear-gradient(135deg, ${tk.purple}, ${tk.cyan})`, color: "#fff", fontSize: 13, cursor: ps === PROJECT_STEPS.length - 1 ? "default" : "pointer", fontWeight: 600, fontFamily: font, boxShadow: ps === PROJECT_STEPS.length - 1 ? "none" : "0 2px 8px rgba(100,16,247,0.3)" }}>Siguiente →</button>
          </div>
        </>) : d.view === "projects" ? (
          <ProjectsHome projects={d.projects || []} onSelect={enterProject} onNew={addProject} onDelete={deleteProject} name={d.nombre || "Constructora"} />
        ) : (<>
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: tk.purple, textTransform: "uppercase", letterSpacing: "0.06em" }}>Fase 0 — Constructora</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, marginBottom: 4 }}><span style={{ fontSize: 22 }}>{PHASE0_STEPS[d.step]?.i}</span><h2 style={{ margin: 0, color: tk.navy, fontSize: 22, fontWeight: 800 }}>{PHASE0_STEPS[d.step]?.t}</h2></div>
            <p style={{ margin: 0, color: tk.textTer, fontSize: 13 }}>{PHASE0_STEPS[d.step]?.d}</p>
          </div>
          {[S01, S02, S03][d.step] && (() => { const C = [S01, S02, S03][d.step]; return <C d={d} u={u} />; })()}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 20, borderTop: `1px solid ${tk.border}` }}>
            <button onClick={() => goTo(Math.max(0, d.step - 1))} disabled={d.step === 0} style={{ padding: "10px 24px", borderRadius: 8, border: `1.5px solid ${tk.border}`, background: tk.card, color: d.step === 0 ? tk.textTer : tk.text, fontSize: 13, cursor: d.step === 0 ? "default" : "pointer", fontWeight: 600, fontFamily: font, opacity: d.step === 0 ? 0.5 : 1 }}>← Anterior</button>
            {d.step < 2 ? <button onClick={() => goTo(d.step + 1)} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${tk.purple}, ${tk.cyan})`, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: font, boxShadow: "0 2px 8px rgba(100,16,247,0.3)" }}>Siguiente →</button>
              : <button onClick={() => u("view", "projects")} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${tk.purple}, ${tk.cyan})`, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: font, boxShadow: "0 2px 8px rgba(100,16,247,0.3)" }}>Ir a Proyectos →</button>}
          </div>
        </>)}
      </div>
    </div>
  </div>);
}
