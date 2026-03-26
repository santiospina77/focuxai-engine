// @ts-nocheck
"use client";
import { useState, useEffect, useCallback } from "react";

/* ═══ LOGOS BASE64 ═══ */
const LOGO_F = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADeUlEQVR42u2WTWhcVRTHf/e+N++9+WjMNC2NkrQaUVKl1EaKQWstbgOxUJAsCnYhaF1KFas7EbpwoyCWInTRhQu7ExdV/NiI8YugkRaaaZrOxJI2RpJMMpN5H/ceFy8DLsROhxkL0rO5q3vO755z/uceAERkTFJLpPvWjDEGoLnDdhfgLsD/D0AAI3cIwAgowFGtQ3QEQCR9uaNgOba8OVfnUhQBYLsJIIAVUAoUwrmFkMcmG3wabVDwbUs+3HaD2016paCybnnpcoMLy8LWnHBkMCE2CpwuADQDa6AaC9Nr8MlPMV9EFqdHc3AwxHel5R5wbyfdzZqJwNSK4dcVxZ81uHrVkL9f01swPLo9YSkG60tnAdTmWSLiTOMavYs7GQgCynMhtbqgtWLkvpCGWJ4IAnY5GeRv99oGaDq5KTFfs86PVDkfXeak/wArVctcOSFG01cIeXo7jLtFijdcIoRCf5qtf6PQrQRfIOYD/uCKSpiK51k2dbKOw6WZmIUVKGQt7+/xecUWqXyueet4jd8vmtSH7UAJ6lhEKep2gx/CMlv9HLOlmIuzCUf3a154MsONWeHU+ZBr14WgJHgZ1bkeUAJZ5XIhKhFSYynO4NUSzk74SL/mxJSl8VFIQWmKG0K8Jhing5MwUC7zZpVvoxKDqsi5YD/HDwR8bDX7vlNM/pJQzCo8B5yKTQdU0gEZNnsgEstX4RVOZvbwqr+XySTkwM9QqmkGNgwP1Q2Rr8jPWxrXLWSEbKEDAM0qBmL4zBul5mR4Tk1jzRaWomHyGdg1FyMumKrQmE4YfkozfiJgaMRDBLTTARkG2uVttchpytxLnhfVNn7LCDtuWnrWDUtWsdsYjpzyGZ0IWlB/iwAWwUExJWucVnNo8TlMPzHgJUJvOcI6cOxxzdGXAwoFnepeQOkOjmIPjYPDbtvDEHnKgaV3IWZsp3DsGZ+hbakbazZT3noCWgOwCCbRPOv2kWDJzjicHdEcethPFxELWt263m3LsK4Me917GFjNUXndRz+f49CQiwhYC45Ov+Xu7IQCxUaG4Q/7qYzmqL0bkMQQGkGp9OVdW0odUYjAPtnC4Zk+VmeExBNcr3PLpL7VH6w0eFnFxHsBb3zjseNBqC62n/K29wFr4JGDHu987/LlmQZJBK73HwJoJ4XI9WjGX8uleuf2JPdP9hdyQd1EriG97QAAAABJRU5ErkJggg==";
const LOGO_FULL = "data:image/png;base64,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";

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
const PHASES = [
  { name: "Constructora", color: tk.purple, steps: [
    { t: "Setup General", i: "🏢", d: "Datos base, scraping web, identidad corporativa" },
    { t: "Equipo y Gobernanza", i: "👥", d: "Estructura, HubSpot, mercados internacionales" },
    { t: "Contrato y Alcance", i: "📋", d: "Fee, pool mensual, categorías de contenido" },
  ]},
  { name: "Proyectos", color: tk.cyan, steps: [
    { t: "Datos Base", i: "📍", d: "Scraping del proyecto, ubicación, estado" },
    { t: "Producto", i: "🏠", d: "Tipologías, precios, amenidades" },
    { t: "Identidad y Tono", i: "🎨", d: "Paleta, tipografía, posicionamiento" },
    { t: "Claims y Compliance", i: "⚖️", d: "Permitidos, prohibidos, disclaimers" },
    { t: "Buyer Personas", i: "🎯", d: "IA genera + consultor valida" },
    { t: "Value Proposition", i: "💎", d: "VPC por buyer, diferenciadores" },
    { t: "Segmentación", i: "📊", d: "Nacional + internacional, matriz" },
    { t: "Plan Marketing", i: "📈", d: "Funnel, canales, KPIs" },
    { t: "Análisis 7Gs", i: "🔍", d: "Propósito, brechas, palancas" },
    { t: "AutoQA Rúbricas", i: "✅", d: "R1-R8 auto-generadas" },
  ]},
  { name: "Generación", color: tk.green, steps: [
    { t: "Revisión y Preview", i: "👁️", d: "Dashboard de JSONs, completitud" },
    { t: "Instrucciones GPT", i: "🤖", d: "System prompts compilados" },
    { t: "Export / Deploy", i: "🚀", d: "ZIP, Drive, GPTs" },
  ]},
];

const ALL_STEPS = PHASES.flatMap((p, pi) => p.steps.map((s, si) => ({ ...s, phase: pi, phaseIdx: si, phaseName: p.name, phaseColor: p.color })));

/* ═══ DEFAULT LISTS (pre-loaded, toggle on/off like Ops v7 channels) ═══ */
const DEF_HERRAMIENTAS = [
  "Meta Business Suite", "Google Ads", "Google Analytics", "Google Tag Manager",
  "HubSpot CRM", "WordPress", "Canva", "Adobe Creative Cloud",
  "ChatGPT / IA Generativa", "CapCut", "ElevenLabs", "Mailchimp",
  "Hootsuite / Buffer", "Semrush / Ahrefs", "WhatsApp Business", "Atria (WhatsApp)",
  "Zoom / Google Meet", "Trello / Asana / Monday",
];
const DEF_MERCADOS = [
  "USA", "España", "Panamá", "México", "Ecuador", "Chile",
  "Costa Rica", "Rep. Dominicana", "Canadá", "Reino Unido", "Alemania", "Australia",
];
const DEF_CIUDADES = [
  "Miami, FL", "Orlando, FL", "New York, NY", "New Jersey", "Houston, TX", "Los Angeles, CA",
  "Madrid", "Barcelona", "Ciudad de Panamá", "Ciudad de México", "Quito", "Santiago de Chile",
  "Toronto", "Londres",
];
const DEF_FERIAS_INTL = [
  "Colombia Real Estate Show (Miami)", "Gran Salón Inmobiliario (Bogotá)",
  "FIABCI Americas (Variable)", "Expo Real Estate (LATAM)",
];

/* ═══ INITIAL STATE ═══ */
const INIT = {
  step: 0,
  // Phase 0.1 — Setup General
  nombre: "", nit: "", sede: "", anios: "", website: "",
  scrapeStatus: "idle", scrapeData: null,
  logoUrl: "", brandbookUrl: "",
  slogan: "", certificaciones: [], afiliaciones: [],
  redes: { instagram: "", facebook: "", tiktok: "", linkedin: "", youtube: "" },
  // Phase 0.2 — Team & Governance
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
  // Phase 0.3 — Contract & Scope
  duracion: 12, fechaInicio: "", lanzamientos: 3,
  pool: {
    postspauta: 0, postsorg: 0, blogs: 0, emails: 0,
    videoslive: 0, videosia: 0, shorts: 0, sms: 0,
    whatsapp: 0, infografias: 0, esporadicas: 0,
    ebooks: 0, descargables: 0, landings: 0,
  },
  alcance: { web: false, community: false, whatsapp: false, eventos: false, sombrilla: false },
  intlContrato: { presupuestoSep: false, contenidosMes: 0, reunionesSep: false },
  // Projects
  projects: [],
};

/* ═══ UI PRIMITIVES ═══ */
const ss = {
  label: { display: "block", fontSize: 12, fontWeight: 600, color: tk.text, marginBottom: 4, letterSpacing: "0.01em" },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${tk.border}`, fontSize: 13, color: tk.text, outline: "none", boxSizing: "border-box", fontFamily: font, transition: "border-color 0.2s, box-shadow 0.2s" },
  card: { border: `1px solid ${tk.border}`, borderRadius: 12, padding: 20, marginBottom: 14, background: tk.card, position: "relative", transition: "box-shadow 0.2s" },
};

function Inp({ label, value, onChange, type = "text", placeholder = "", required = false, note = "" }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={ss.label}>{label}{required && <span style={{ color: tk.red }}> *</span>}</label>}
      <input type={type} value={value || ""} onChange={e => onChange(type === "number" ? (+e.target.value || 0) : e.target.value)}
        placeholder={placeholder} style={{ ...ss.input }}
        onFocus={e => { e.target.style.borderColor = tk.accent; e.target.style.boxShadow = `0 0 0 3px ${tk.accentLight}`; }}
        onBlur={e => { e.target.style.borderColor = tk.border; e.target.style.boxShadow = "none"; }} />
      {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0", lineHeight: 1.4 }}>{note}</p>}
    </div>
  );
}

function MoneyInp({ label, value, onChange, placeholder = "$0", required = false, note = "" }) {
  const fmt = (v) => { if (!v && v !== 0) return ""; const num = String(v).replace(/[^0-9]/g, ""); if (!num) return ""; return "$" + parseInt(num).toLocaleString("es-CO"); };
  const raw = String(value || "").replace(/[^0-9]/g, "");
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={ss.label}>{label}{required && <span style={{ color: tk.red }}> *</span>}</label>}
      <input type="text" value={fmt(raw)} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder={placeholder} style={{ ...ss.input }}
        onFocus={e => { e.target.style.borderColor = tk.accent; e.target.style.boxShadow = `0 0 0 3px ${tk.accentLight}`; }}
        onBlur={e => { e.target.style.borderColor = tk.border; e.target.style.boxShadow = "none"; }} />
      {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0", lineHeight: 1.4 }}>{note}</p>}
    </div>
  );
}

function Sel({ label, value, onChange, options, note = "" }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={ss.label}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ ...ss.input, background: tk.card, cursor: "pointer", appearance: "auto" }}>
        {options.map(o => <option key={typeof o === "string" ? o : o.v} value={typeof o === "string" ? o : o.v}>{typeof o === "string" ? o : o.l}</option>)}
      </select>
      {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0" }}>{note}</p>}
    </div>
  );
}

function Chk({ label, checked, onChange, desc = "" }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, fontSize: 13, color: tk.text, cursor: "pointer", lineHeight: 1.4 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: tk.accent, marginTop: 1, flexShrink: 0 }} />
      <div>
        <span style={{ fontWeight: 500 }}>{label}</span>
        {desc && <span style={{ display: "block", fontSize: 11, color: tk.textTer, marginTop: 1 }}>{desc}</span>}
      </div>
    </label>
  );
}

function Card({ children, title, subtitle, accent = false }) {
  return (
    <div style={{ ...ss.card, borderLeft: accent ? `3px solid ${tk.accent}` : undefined }}>
      {title && <div style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0, color: tk.navy, fontSize: 14, fontWeight: 700 }}>{title}</h4>
        {subtitle && <p style={{ margin: "2px 0 0", fontSize: 11, color: tk.textTer }}>{subtitle}</p>}
      </div>}
      {children}
    </div>
  );
}

function SectionHead({ children, sub = "" }) {
  return (
    <div style={{ marginTop: 20, marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: tk.navy, textTransform: "uppercase", letterSpacing: "0.05em" }}>{children}</h3>
      {sub && <p style={{ margin: "2px 0 0", fontSize: 11, color: tk.textTer }}>{sub}</p>}
    </div>
  );
}

function InfoBox({ children, type = "info" }) {
  const colors = { info: { bg: tk.accentLight, border: tk.accent, text: tk.navy }, warn: { bg: tk.amberBg, border: tk.amber, text: "#92400E" }, success: { bg: tk.greenBg, border: tk.green, text: "#065F46" } };
  const c = colors[type] || colors.info;
  return (
    <div style={{ padding: "12px 14px", background: c.bg, borderRadius: 8, borderLeft: `3px solid ${c.border}`, marginBottom: 14 }}>
      <p style={{ margin: 0, fontSize: 12, color: c.text, lineHeight: 1.5 }}>{children}</p>
    </div>
  );
}

function Pill({ text, onRemove, color = tk.accent }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: color + "12", color, border: `1px solid ${color}30` }}>
      {text}
      {onRemove && <button onClick={onRemove} style={{ background: "none", border: "none", color, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1, marginLeft: 2, fontWeight: 700 }}>×</button>}
    </span>
  );
}

function ChipEditor({ items, onChange, label, placeholder = "Agregar...", note = "" }) {
  const [val, setVal] = useState("");
  const add = () => { if (val.trim() && !items.includes(val.trim())) { onChange([...items, val.trim()]); setVal(""); } };
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={ss.label}>{label}</label>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, minHeight: 32 }}>
        {items.map((item, i) => <Pill key={i} text={item} onRemove={() => { const n = [...items]; n.splice(i, 1); onChange(n); }} />)}
        {items.length === 0 && <span style={{ fontSize: 12, color: tk.textTer, fontStyle: "italic", paddingTop: 6 }}>Ninguno definido</span>}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder} style={{ ...ss.input, flex: 1 }} />
        <button onClick={add} disabled={!val.trim()} style={{
          padding: "10px 18px", borderRadius: 8, border: "none", background: val.trim() ? tk.accent : tk.border,
          color: val.trim() ? "#fff" : tk.textTer, fontSize: 13, cursor: val.trim() ? "pointer" : "default",
          fontWeight: 600, fontFamily: font, transition: "all 0.2s",
        }}>Agregar</button>
      </div>
      {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0" }}>{note}</p>}
    </div>
  );
}

function ToggleList({ items, onToggle, customItems, onAddCustom, onRemoveCustom, label, note = "", placeholder = "Agregar otro..." }) {
  const [val, setVal] = useState("");
  const addCu = () => { if (val.trim() && !customItems.includes(val.trim())) { onAddCustom([...customItems, val.trim()]); setVal(""); } };
  const activeCount = items.filter(i => i.a).length + customItems.filter(Boolean).length;
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={ss.label}>{label} <span style={{ fontWeight: 400, color: tk.textTer }}>({activeCount} activos)</span></label>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {items.map((item, i) => (
          <button key={i} onClick={() => { const n = [...items]; n[i] = { ...n[i], a: !n[i].a }; onToggle(n); }}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer",
              border: `1.5px solid ${item.a ? tk.accent + "50" : tk.border}`,
              background: item.a ? tk.accent + "12" : tk.bg,
              color: item.a ? tk.accent : tk.textSec,
              transition: "all 0.15s",
            }}>{item.a ? "✓ " : ""}{item.n}</button>
        ))}
        {customItems.map((item, i) => (
          <span key={"cu" + i} style={{
            display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: 20,
            fontSize: 12, fontWeight: 500, background: tk.accent + "12", color: tk.accent, border: `1.5px solid ${tk.accent}50`,
          }}>
            ✓ {item}
            <button onClick={() => { const n = [...customItems]; n.splice(i, 1); onRemoveCustom(n); }}
              style={{ background: "none", border: "none", color: tk.accent, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1, fontWeight: 700 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCu(); } }}
          placeholder={placeholder} style={{ ...ss.input, flex: 1, maxWidth: 300 }} />
        <button onClick={addCu} disabled={!val.trim()} style={{
          padding: "8px 16px", borderRadius: 8, border: "none", background: val.trim() ? tk.accent : tk.border,
          color: val.trim() ? "#fff" : tk.textTer, fontSize: 12, cursor: val.trim() ? "pointer" : "default",
          fontWeight: 600, fontFamily: font, transition: "all 0.2s",
        }}>+ Agregar</button>
      </div>
      {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0" }}>{note}</p>}
    </div>
  );
}

function NumInp({ label, value, onChange, min = 0, max = 999, note = "" }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ ...ss.label, marginBottom: 6 }}>{label}</label>}
      <div style={{ display: "flex", alignItems: "center", gap: 0, border: `1.5px solid ${tk.border}`, borderRadius: 8, overflow: "hidden", height: 38 }}>
        <button onClick={() => onChange(Math.max(min, (value || 0) - 1))} style={{ width: 36, height: "100%", border: "none", borderRight: `1px solid ${tk.border}`, background: tk.bg, cursor: "pointer", fontSize: 16, fontWeight: 700, color: tk.textSec, fontFamily: font }}>−</button>
        <span style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 600, color: value > 0 ? tk.text : tk.textTer, background: tk.card }}>{value || 0}</span>
        <button onClick={() => onChange(Math.min(max, (value || 0) + 1))} style={{ width: 36, height: "100%", border: "none", borderLeft: `1px solid ${tk.border}`, background: tk.bg, cursor: "pointer", fontSize: 16, fontWeight: 700, color: tk.textSec, fontFamily: font }}>+</button>
      </div>
      {note && <p style={{ fontSize: 11, color: tk.textTer, margin: "4px 0 0" }}>{note}</p>}
    </div>
  );
}

/* ═══ SCRAPE BUTTON ═══ */
function ScrapeBtn({ url, status, onScrape }) {
  const canScrape = url && url.startsWith("http") && status !== "loading";
  return (
    <button onClick={onScrape} disabled={!canScrape} style={{
      padding: "10px 20px", borderRadius: 8, border: "none",
      background: canScrape ? `linear-gradient(135deg, ${tk.cyan}, ${tk.purple})` : tk.border,
      color: "#fff", fontSize: 13, cursor: canScrape ? "pointer" : "default",
      fontWeight: 600, fontFamily: font, transition: "all 0.2s",
      boxShadow: canScrape ? "0 2px 8px rgba(100,16,247,0.3)" : "none",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {status === "loading" ? (
        <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Scrapeando...</>
      ) : status === "done" ? (
        <>✅ Datos obtenidos — Re-scrapear</>
      ) : (
        <>🔍 Scrapear sitio web</>
      )}
    </button>
  );
}

/* ═══ STEP 0.1: SETUP GENERAL ═══ */
function S01({ d, u }) {
  const handleScrape = () => {
    u("scrapeStatus", "loading");
    // TODO: Replace with actual scraping API call
    setTimeout(() => {
      u("scrapeStatus", "done");
      u("scrapeData", { scraped: true, timestamp: new Date().toISOString() });
    }, 2000);
  };

  return (
    <div>
      <SectionHead sub="Información base de la constructora — se usa en todos los módulos">Datos de la Constructora</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Inp label="Nombre de la Constructora" value={d.nombre} onChange={v => u("nombre", v)} required placeholder="Urbansa" />
        <Inp label="NIT" value={d.nit} onChange={v => u("nit", v)} placeholder="800.136.561-7" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Inp label="Sede principal" value={d.sede} onChange={v => u("sede", v)} placeholder="Bogotá, Colombia" />
        <Inp label="Años de trayectoria" value={d.anios} onChange={v => u("anios", v)} placeholder="30+" />
      </div>

      <SectionHead sub="El scraping pre-llena datos corporativos automáticamente">Sitio Web y Scraping</SectionHead>
      <Inp label="URL del sitio web" value={d.website} onChange={v => u("website", v)} required placeholder="https://urbansa.co" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <ScrapeBtn url={d.website} status={d.scrapeStatus} onScrape={handleScrape} />
        {d.scrapeStatus === "done" && <span style={{ fontSize: 12, color: tk.green, fontWeight: 500 }}>Datos pre-llenados desde el sitio web</span>}
      </div>
      {d.scrapeStatus === "done" && (
        <InfoBox type="success">Scraping completado. Los campos que pudimos extraer ya están pre-llenados. Valida y complementa lo que falte.</InfoBox>
      )}

      <SectionHead sub="Identidad corporativa (no de proyecto individual)">Marca Corporativa</SectionHead>
      <Inp label="Slogan / Sello Corporativo" value={d.slogan} onChange={v => u("slogan", v)} placeholder="40 años ¡Creciendo con Felicidad!" note="El sello que aparece en todas las piezas de todos los proyectos" />
      <ChipEditor label="Certificaciones" items={d.certificaciones} onChange={v => u("certificaciones", v)} placeholder="ISO 9001, Lean Construction, EDGE..." />
      <ChipEditor label="Afiliaciones" items={d.afiliaciones} onChange={v => u("afiliaciones", v)} placeholder="Camacol, Asobancaria..." />

      <SectionHead sub="URLs de las cuentas oficiales de la constructora">Redes Sociales</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
        <Inp label="Instagram" value={d.redes.instagram} onChange={v => u("redes", { ...d.redes, instagram: v })} placeholder="https://instagram.com/constructora_urbansa" />
        <Inp label="Facebook" value={d.redes.facebook} onChange={v => u("redes", { ...d.redes, facebook: v })} placeholder="https://facebook.com/urbansa" />
        <Inp label="TikTok" value={d.redes.tiktok} onChange={v => u("redes", { ...d.redes, tiktok: v })} placeholder="https://tiktok.com/@urbansa" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Inp label="LinkedIn" value={d.redes.linkedin} onChange={v => u("redes", { ...d.redes, linkedin: v })} placeholder="https://linkedin.com/company/urbansa" />
        <Inp label="YouTube" value={d.redes.youtube} onChange={v => u("redes", { ...d.redes, youtube: v })} placeholder="https://youtube.com/@urbansa" />
      </div>
    </div>
  );
}

/* ═══ STEP 0.2: TEAM & GOVERNANCE ═══ */
function S02({ d, u }) {
  return (
    <div>
      <SectionHead sub="Quién aprueba, quién coordina, quién decide">Estructura del Equipo</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Inp label="Aprueba contenido (nombre + cargo)" value={d.equipo.aprueba} onChange={v => u("equipo", { ...d.equipo, aprueba: v })} placeholder="María López — Gerente de Mercadeo" />
        <Inp label="KAM Focux asignado" value={d.equipo.kam} onChange={v => u("equipo", { ...d.equipo, kam: v })} placeholder="Susana Tinoco" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Inp label="Director Comercial" value={d.equipo.dirComercial} onChange={v => u("equipo", { ...d.equipo, dirComercial: v })} placeholder="Carlos Pérez — Director Comercial" />
        <Inp label="Notas de estructura" value={d.equipo.notas} onChange={v => u("equipo", { ...d.equipo, notas: v })} placeholder="Notas adicionales sobre el equipo" />
      </div>

      <SectionHead sub="Define qué módulos están disponibles">HubSpot</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 16px", marginBottom: 12 }}>
        <Chk label="Marketing Hub" checked={d.hsHubs.marketing} onChange={v => u("hsHubs", { ...d.hsHubs, marketing: v })} />
        <Chk label="Sales Hub" checked={d.hsHubs.sales} onChange={v => u("hsHubs", { ...d.hsHubs, sales: v })} />
        <Chk label="Service Hub" checked={d.hsHubs.service} onChange={v => u("hsHubs", { ...d.hsHubs, service: v })} />
        <Chk label="Content Hub" checked={d.hsHubs.content} onChange={v => u("hsHubs", { ...d.hsHubs, content: v })} />
        <Chk label="Operations Hub" checked={d.hsHubs.operations} onChange={v => u("hsHubs", { ...d.hsHubs, operations: v })} />
      </div>
      <Inp label="Portal ID" value={d.hsPortalId} onChange={v => u("hsPortalId", v)} placeholder="12345678" note="Se encuentra en Settings → Account" />
      <Chk label="Focux tiene acceso al portal" checked={d.hsAccesoFocux} onChange={v => u("hsAccesoFocux", v)} desc="Para extraer datos de pipelines, propiedades y equipos" />

      <SectionHead sub="Marca las herramientas que usa actualmente el equipo del cliente">Herramientas Actuales</SectionHead>
      <ToggleList
        items={d.herramientas} onToggle={v => u("herramientas", v)}
        customItems={d.herramientasCu} onAddCustom={v => u("herramientasCu", v)} onRemoveCustom={v => u("herramientasCu", v)}
        placeholder="Otra herramienta..."
        note="Activa las que el cliente ya usa. Esto define la línea base del ecosistema digital."
      />

      <SectionHead sub="Reglas de aprobación de contenido">Aprobación</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Sel label="Ventana de aprobación" value={d.aprobacionVentana} onChange={v => u("aprobacionVentana", v)}
          options={[{ v: 24, l: "24 horas" }, { v: 48, l: "48 horas (recomendado)" }, { v: 72, l: "72 horas" }, { v: 0, l: "Sin límite definido" }]} />
        <Sel label="Escalamiento si no se aprueba" value={d.aprobacionEscalamiento} onChange={v => u("aprobacionEscalamiento", v)}
          options={["KAM escala a Gerencia Comercial", "KAM escala a Presidencia", "Se publica sin aprobación explícita", "Se pausa hasta nueva instrucción", "Otro (especificar en notas)"]} />
      </div>

      <SectionHead sub="Pilar de aceleración comercial a mercados internacionales">Estrategia Internacional</SectionHead>
      <Chk label="Tiene equipo/asesor dedicado para ventas internacionales" checked={d.intl.tieneEquipo} onChange={v => u("intl", { ...d.intl, tieneEquipo: v })} />
      <Inp label="URL micrositio internacional" value={d.intl.micrositio} onChange={v => u("intl", { ...d.intl, micrositio: v })} placeholder="https://urbansa.co/compras-vivienda-exterior/" />
      
      <ToggleList label="Mercados objetivo"
        items={d.intl.mercados} onToggle={v => u("intl", { ...d.intl, mercados: v })}
        customItems={d.intl.mercadosCu} onAddCustom={v => u("intl", { ...d.intl, mercadosCu: v })} onRemoveCustom={v => u("intl", { ...d.intl, mercadosCu: v })}
        placeholder="Otro mercado..."
        note="Activa los países donde hay colombianos compradores de vivienda"
      />
      <ToggleList label="Ciudades con diáspora colombiana"
        items={d.intl.ciudades} onToggle={v => u("intl", { ...d.intl, ciudades: v })}
        customItems={d.intl.ciudadesCu} onAddCustom={v => u("intl", { ...d.intl, ciudadesCu: v })} onRemoveCustom={v => u("intl", { ...d.intl, ciudadesCu: v })}
        placeholder="Otra ciudad..."
        note="Para geosegmentación de pauta Meta y Google en español"
      />
      <ToggleList label="Ferias internacionales"
        items={d.intl.ferias} onToggle={v => u("intl", { ...d.intl, ferias: v })}
        customItems={d.intl.feriasCu} onAddCustom={v => u("intl", { ...d.intl, feriasCu: v })} onRemoveCustom={v => u("intl", { ...d.intl, feriasCu: v })}
        placeholder="Otra feria..."
        note="Ferias donde la constructora participa o planea participar"
      />
      {d.intl.mercados.filter(m => m.a).length > 0 && (
        <InfoBox type="info">Con {d.intl.mercados.filter(m => m.a).length} mercados internacionales activos, cada proyecto generará automáticamente un buyer persona "Colombiano en el Exterior" con campos específicos de distancia, moneda y canales internacionales.</InfoBox>
      )}
    </div>
  );
}

/* ═══ STEP 0.3: CONTRACT & SCOPE ═══ */
function S03({ d, u }) {
  const poolTotal = Object.values(d.pool).reduce((a, b) => a + (b || 0), 0);
  const up = (k, v) => u("pool", { ...d.pool, [k]: v });
  const [importStatus, setImportStatus] = useState("idle"); // idle | importing | done

  const handleImportProposal = () => {
    setImportStatus("importing");
    // TODO: Replace with actual file upload + AI parsing of proposal PDF/PPTX
    // For now, simulates extracting pool from Urbansa proposal
    setTimeout(() => {
      u("pool", {
        postspauta: 80, postsorg: 80, blogs: 8, emails: 16,
        videoslive: 15, videosia: 15, shorts: 0, sms: 24,
        whatsapp: 4, infografias: 8, esporadicas: 8,
        ebooks: 10, descargables: 3, landings: 3,
      });
      setImportStatus("done");
    }, 2000);
  };

  return (
    <div>
      <SectionHead sub="Duración y fecha de arranque del contrato">Contrato</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
        <Inp label="Duración (meses)" value={d.duracion} onChange={v => u("duracion", v)} type="number" />
        <Inp label="Fecha de inicio" value={d.fechaInicio} onChange={v => u("fechaInicio", v)} type="date" />
        <Inp label="Lanzamientos incluidos/año" value={d.lanzamientos} onChange={v => u("lanzamientos", v)} type="number" />
      </div>

      <SectionHead sub="Cantidad máxima mensual por categoría de contenido">Pool Mensual de Contenido</SectionHead>
      
      {/* Import from proposal */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={handleImportProposal} disabled={importStatus === "importing"} style={{
          padding: "10px 20px", borderRadius: 8, border: "none",
          background: importStatus === "done" ? tk.green : `linear-gradient(135deg, ${tk.cyan}, ${tk.purple})`,
          color: "#fff", fontSize: 13, cursor: importStatus === "importing" ? "default" : "pointer",
          fontWeight: 600, fontFamily: font, transition: "all 0.2s",
          boxShadow: "0 2px 8px rgba(100,16,247,0.2)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {importStatus === "importing" ? (
            <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} /> Extrayendo del documento...</>
          ) : importStatus === "done" ? (
            <>✅ Pool importado — Valida y ajusta</>
          ) : (
            <>📄 Importar pool desde propuesta aprobada</>
          )}
        </button>
        {importStatus === "idle" && <span style={{ fontSize: 11, color: tk.textTer }}>Sube el PDF o PPTX de la propuesta y el sistema extrae las cantidades</span>}
      </div>
      {importStatus === "done" && (
        <InfoBox type="success">Pool extraído de la propuesta. Los valores se pre-llenaron. Ajusta manualmente si alguna cantidad cambió en la negociación final.</InfoBox>
      )}

      {/* Pool counter */}
      <div style={{ padding: 12, background: tk.bg, borderRadius: 10, border: `1px solid ${tk.border}`, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: tk.navy }}>Total pool mensual</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: poolTotal > 0 ? tk.accent : tk.textTer }}>{poolTotal} piezas</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px" }}>
        <NumInp label="Posts pauta" value={d.pool.postspauta} onChange={v => up("postspauta", v)} max={200} />
        <NumInp label="Posts orgánicos" value={d.pool.postsorg} onChange={v => up("postsorg", v)} max={200} />
        <NumInp label="Blogs AEO" value={d.pool.blogs} onChange={v => up("blogs", v)} max={50} />
        <NumInp label="Emails" value={d.pool.emails} onChange={v => up("emails", v)} max={50} />
        <NumInp label="Videos live action" value={d.pool.videoslive} onChange={v => up("videoslive", v)} max={50} />
        <NumInp label="Videos IA/Stock" value={d.pool.videosia} onChange={v => up("videosia", v)} max={50} />
        <NumInp label="Shorts pauta" value={d.pool.shorts} onChange={v => up("shorts", v)} max={50} />
        <NumInp label="SMS" value={d.pool.sms} onChange={v => up("sms", v)} max={100} />
        <NumInp label="Workflows WhatsApp" value={d.pool.whatsapp} onChange={v => up("whatsapp", v)} max={20} />
        <NumInp label="Infografías / newsletters" value={d.pool.infografias} onChange={v => up("infografias", v)} max={50} />
        <NumInp label="Piezas esporádicas" value={d.pool.esporadicas} onChange={v => up("esporadicas", v)} max={50} />
        <NumInp label="Ajustes ebooks/mes" value={d.pool.ebooks} onChange={v => up("ebooks", v)} max={20} />
        <NumInp label="Descargables/trimestre" value={d.pool.descargables} onChange={v => up("descargables", v)} max={20} />
        <NumInp label="Landing pages/trimestre" value={d.pool.landings} onChange={v => up("landings", v)} max={20} />
      </div>

      <SectionHead sub="Servicios incluidos en el alcance del contrato">Alcance Adicional</SectionHead>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 16px" }}>
        <Chk label="Administración web" checked={d.alcance.web} onChange={v => u("alcance", { ...d.alcance, web: v })} />
        <Chk label="Community management" checked={d.alcance.community} onChange={v => u("alcance", { ...d.alcance, community: v })} />
        <Chk label="WhatsApp / Atria" checked={d.alcance.whatsapp} onChange={v => u("alcance", { ...d.alcance, whatsapp: v })} />
        <Chk label="Eventos digitales" checked={d.alcance.eventos} onChange={v => u("alcance", { ...d.alcance, eventos: v })} />
        <Chk label="Campaña sombrilla" checked={d.alcance.sombrilla} onChange={v => u("alcance", { ...d.alcance, sombrilla: v })} />
      </div>

      <SectionHead sub="Alcance específico para mercado internacional">Internacional</SectionHead>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12 }}>
        <Chk label="Presupuesto de pauta internacional separado" checked={d.intlContrato.presupuestoSep} onChange={v => u("intlContrato", { ...d.intlContrato, presupuestoSep: v })} />
        <Chk label="Reuniones de tráfico internacionales separadas" checked={d.intlContrato.reunionesSep} onChange={v => u("intlContrato", { ...d.intlContrato, reunionesSep: v })} />
      </div>
      <NumInp label="Contenidos internacionales por mes" value={d.intlContrato.contenidosMes} onChange={v => u("intlContrato", { ...d.intlContrato, contenidosMes: v })} max={100} />
    </div>
  );
}

/* ═══ PLACEHOLDER FOR PHASE 1+ ═══ */
function StepPlaceholder({ step }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <p style={{ fontSize: 48, margin: "0 0 16px" }}>{step.i}</p>
      <h3 style={{ margin: "0 0 8px", color: tk.navy, fontSize: 18 }}>{step.t}</h3>
      <p style={{ color: tk.textTer, fontSize: 13 }}>{step.d}</p>
      <p style={{ color: tk.textTer, fontSize: 12, marginTop: 24, fontStyle: "italic" }}>Este paso se construirá en la siguiente iteración</p>
    </div>
  );
}

/* ═══ MAIN APP ═══ */
export default function ContentWizard() {
  const [d, setD] = useState(INIT);
  const [ok, sOk] = useState(false);
  const [saving, sSv] = useState(false);
  const [clientId] = useState(() => genId());

  useEffect(() => {
    const idx = loadIdx();
    if (idx.length > 0) {
      const last = idx[idx.length - 1];
      const data = loadClient(last.id);
      if (data) { setD(prev => ({ ...INIT, ...data })); }
    }
    sOk(true);
  }, []);

  const persist = useCallback(async nd => { sSv(true); saveClient(clientId, nd); setTimeout(() => sSv(false), 500); }, [clientId]);
  const u = useCallback((f, v) => { setD(prev => { const next = { ...prev, [f]: v }; persist(next); return next; }); }, [persist]);
  const goTo = step => { const next = { ...d, step }; setD(next); persist(next); };

  if (!ok) return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", background: tk.bg, fontFamily: font }}>
      <img src={LOGO_FULL} alt="Focux" style={{ width: 120, marginBottom: 20 }} />
      <div style={{ width: 40, height: 40, border: `3px solid ${tk.border}`, borderTopColor: tk.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: tk.textSec, fontSize: 13, marginTop: 12 }}>Cargando FocuxAI Content...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const curStep = ALL_STEPS[d.step] || ALL_STEPS[0];
  const Comps = [S01, S02, S03];
  const Cur = d.step < Comps.length ? Comps[d.step] : null;

  return (
    <div style={{ fontFamily: font, background: tk.bg, minHeight: "100vh", color: tk.text }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${tk.navy} 0%, ${tk.purple} 50%, ${tk.cyan} 100%)`, padding: "0 24px", height: 52, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={LOGO_F} alt="Focux" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <div>
            <h1 style={{ margin: 0, color: "#fff", fontSize: 14, fontWeight: 800, letterSpacing: "0.05em" }}>FOCUXAI CONTENT</h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 500 }}>Strategic Content Onboarding Engine</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saving && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Guardando...</span>}
          {d.nombre && <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600 }}>{d.nombre}</span>}
        </div>
      </div>

      <div style={{ display: "flex", maxWidth: 1280, margin: "0 auto" }}>
        {/* Sidebar */}
        <div style={{ width: 240, minHeight: "calc(100vh - 52px)", background: tk.card, borderRight: `1px solid ${tk.border}`, padding: "12px 0", flexShrink: 0, overflow: "auto" }}>
          {/* Logo in sidebar */}
          <div style={{ textAlign: "center", padding: "8px 0 16px", borderBottom: `1px solid ${tk.borderLight}`, marginBottom: 8 }}>
            <img src={LOGO_FULL} alt="Focux" style={{ width: 80, opacity: 0.8 }} />
          </div>

          {PHASES.map((phase, pi) => {
            const startIdx = PHASES.slice(0, pi).reduce((a, p) => a + p.steps.length, 0);
            return (
              <div key={pi} style={{ marginBottom: 4 }}>
                <div style={{ padding: "8px 16px", fontSize: 10, fontWeight: 700, color: phase.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Fase {pi} — {phase.name}
                </div>
                {phase.steps.map((s, si) => {
                  const idx = startIdx + si;
                  const active = d.step === idx;
                  return (
                    <button key={si} onClick={() => goTo(idx)} style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 16px",
                      background: active ? tk.accentLight : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                      borderRight: active ? `3px solid ${tk.accent}` : "3px solid transparent",
                      transition: "all 0.15s",
                    }}>
                      <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>{s.i}</span>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: active ? 700 : 500, color: active ? tk.navy : tk.textSec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.t}
                      </p>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: "28px 32px", maxWidth: 820, overflow: "auto" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: curStep.phaseColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>Fase {curStep.phase} — {curStep.phaseName}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{curStep.i}</span>
              <h2 style={{ margin: 0, color: tk.navy, fontSize: 22, fontWeight: 800 }}>{curStep.t}</h2>
            </div>
            <p style={{ margin: 0, color: tk.textTer, fontSize: 13 }}>{curStep.d}</p>
          </div>

          {Cur ? <Cur d={d} u={u} /> : <StepPlaceholder step={curStep} />}

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 20, borderTop: `1px solid ${tk.border}` }}>
            <button onClick={() => goTo(Math.max(0, d.step - 1))} disabled={d.step === 0}
              style={{
                padding: "10px 24px", borderRadius: 8, border: `1.5px solid ${tk.border}`,
                background: tk.card, color: d.step === 0 ? tk.textTer : tk.text,
                fontSize: 13, cursor: d.step === 0 ? "default" : "pointer", fontWeight: 600, fontFamily: font,
                opacity: d.step === 0 ? 0.5 : 1, transition: "all 0.2s",
              }}>← Anterior</button>
            <button onClick={() => goTo(Math.min(ALL_STEPS.length - 1, d.step + 1))} disabled={d.step === ALL_STEPS.length - 1}
              style={{
                padding: "10px 28px", borderRadius: 8, border: "none",
                background: d.step === ALL_STEPS.length - 1 ? tk.border : `linear-gradient(135deg, ${tk.purple}, ${tk.cyan})`,
                color: "#fff", fontSize: 13, cursor: d.step === ALL_STEPS.length - 1 ? "default" : "pointer",
                fontWeight: 600, fontFamily: font, transition: "all 0.2s",
                boxShadow: d.step === ALL_STEPS.length - 1 ? "none" : "0 2px 8px rgba(100,16,247,0.3)",
              }}>Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
