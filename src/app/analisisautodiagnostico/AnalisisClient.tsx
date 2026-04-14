"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Legend } from "recharts";

// ─── Excel Export (SheetJS) ───────────────────────────────────────────────────
async function exportExcel(rows) {
  const XLSX = await import("xlsx");
  const headers = ["Nombre","Apellido","Cargo","Empresa","Email","Teléfono","# Proyectos","% VIS","Clasificación CX","Score Global","CRM Actual","Sitio Web","Agendó Reunión","Brecha 1","Brecha 2","Brecha 3","Dim Atracción","Dim Conversión","Dim Experiencia","Dim Datos","Dim Posventa","Dim IA","Fecha Diagnóstico"];
  const data = rows.map(p => [
    p.firstname||"", p.lastname||"", p.jobtitle||"", p.company||"",
    p.email||"", p.phone||"",
    p.focux_cx_proyectos_activos ? Number(p.focux_cx_proyectos_activos) : "",
    p.focux_cx_mix_vis ? Number(p.focux_cx_mix_vis) : "",
    p.focux_cx_classification||"",
    p.focux_cx_score ? parseFloat(parseFloat(p.focux_cx_score).toFixed(1)) : "",
    p.focux_cx_crm_actual||"", p.website||"",
    p.focux_cx_meeting_booked === "true" ? "Sí" : "No",
    p.focux_cx_top_gap_1||"", p.focux_cx_top_gap_2||"", p.focux_cx_top_gap_3||"",
    p.focux_cx_dim1_score ? parseFloat(p.focux_cx_dim1_score) : "",
    p.focux_cx_dim2_score ? parseFloat(p.focux_cx_dim2_score) : "",
    p.focux_cx_dim3_score ? parseFloat(p.focux_cx_dim3_score) : "",
    p.focux_cx_dim4_score ? parseFloat(p.focux_cx_dim4_score) : "",
    p.focux_cx_dim5_score ? parseFloat(p.focux_cx_dim5_score) : "",
    p.focux_cx_dim6_score ? parseFloat(p.focux_cx_dim6_score) : "",
    p.focux_cx_diagnosis_date||"",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws["!cols"] = [14,14,20,22,28,14,10,8,16,10,22,28,12,16,16,16,12,12,12,12,12,12,16].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Diagnósticos Camacol 2026");
  XLSX.writeFile(wb, `Camacol_Barranquilla_2026_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
function exportPDF(props, radarData, byClass, crmData, gapData) {
  const totalN = props.length;
  const avgScore = totalN ? (props.reduce((s,p)=>s+parseFloat(p.focux_cx_score||0),0)/totalN).toFixed(1) : 0;
  const agendaron = props.filter(p=>p.focux_cx_meeting_booked==="true").length;
  const topCRM = crmData[0]?.name || "—";
  const topGap = gapData[0]?.name || "—";

  const classRows = ["Fragmentado","Conectado","Inteligente"].map(cls => {
    const group = props.filter(p=>p.focux_cx_classification===cls);
    const avg = group.length ? (group.reduce((s,p)=>s+parseFloat(p.focux_cx_score||0),0)/group.length).toFixed(1) : "—";
    const booked = group.filter(p=>p.focux_cx_meeting_booked==="true").length;
    return { cls, count: group.length, avg, booked };
  });

  const radarRows = radarData.map(d => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${d.dim}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:700;color:#6410F7">${d.score.toFixed(2)} / 5</td></tr>`).join("");
  const classRowsHTML = classRows.map(r => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${r.cls}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${r.count}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:700">${r.avg}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${r.booked} (${r.count ? Math.round(r.booked/r.count*100) : 0}%)</td></tr>`).join("");
  const gapRowsHTML = gapData.slice(0,6).map((g,i) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">#${i+1}</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${g.name}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:700;color:#6410F7">${g.value}</td></tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Reporte Camacol 2026 — Focux</title>
<style>
  body { font-family: Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 40px; font-size: 13px; }
  .header { background: linear-gradient(135deg, #1F0067, #6410F7); color: white; padding: 40px; border-radius: 12px; margin-bottom: 32px; }
  .header h1 { margin: 0 0 6px; font-size: 26px; }
  .header p { margin: 0; opacity: 0.7; font-size: 13px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; margin-bottom: 32px; }
  .kpi { background: #f8f7ff; border: 1px solid #e8e0ff; border-radius: 10px; padding: 20px; text-align: center; }
  .kpi .val { font-size: 32px; font-weight: 700; color: #6410F7; }
  .kpi .lbl { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
  h2 { font-size: 16px; color: #1F0067; border-bottom: 2px solid #6410F7; padding-bottom: 8px; margin: 28px 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1F0067; color: white; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .insight { background: #f0ebff; border-left: 4px solid #6410F7; padding: 16px 20px; border-radius: 0 8px 8px 0; margin-bottom: 12px; }
  .insight strong { color: #1F0067; }
  .footer { margin-top: 40px; text-align: center; color: #aaa; font-size: 11px; }
  @media print { body { padding: 20px; } }
</style></head><body>
<div class="header">
  <div style="font-size:11px;letter-spacing:3px;opacity:0.7;margin-bottom:10px">FOCUX DIGITAL GROUP · REPORTE EJECUTIVO</div>
  <h1>Diagnóstico CX Sector Constructor</h1>
  <p>Camacol Barranquilla 2026 · Generado el ${new Date().toLocaleDateString("es-CO",{year:"numeric",month:"long",day:"numeric"})}</p>
</div>

<div class="kpi-grid">
  <div class="kpi"><div class="val">${totalN}</div><div class="lbl">Diagnósticos</div></div>
  <div class="kpi"><div class="val">${avgScore}/5</div><div class="lbl">Score Promedio</div></div>
  <div class="kpi"><div class="val">${agendaron}</div><div class="lbl">Agendaron Reunión</div></div>
  <div class="kpi"><div class="val">${totalN-agendaron}</div><div class="lbl">Sin Agendar</div></div>
</div>

<h2>Madurez por Dimensión (Promedio Sector)</h2>
<table><thead><tr><th>Dimensión</th><th>Score Promedio</th></tr></thead><tbody>${radarRows}</tbody></table>

<h2>Distribución por Clasificación CX</h2>
<table><thead><tr><th>Clasificación</th><th>Cantidad</th><th>Score Promedio</th><th>Agendaron</th></tr></thead><tbody>${classRowsHTML}</tbody></table>

<h2>Brechas Más Frecuentes del Sector</h2>
<table><thead><tr><th>#</th><th>Dimensión</th><th>Frecuencia</th></tr></thead><tbody>${gapRowsHTML}</tbody></table>

<h2>Insights Comerciales</h2>
<div class="insight"><strong>CRM más usado en el sector:</strong> ${topCRM} — oportunidad directa de migración a HubSpot.</div>
<div class="insight"><strong>Brecha más común:</strong> ${topGap} — el sector necesita ayuda específica en esta dimensión.</div>
<div class="insight"><strong>Oportunidad inmediata:</strong> ${totalN-agendaron} constructoras llenaron el diagnóstico pero no agendaron reunión. Contacto directo esta semana.</div>
<div class="insight"><strong>Benchmark exclusivo:</strong> Focux tiene el único dataset de madurez digital del sector constructor en Colombia con ${totalN} empresas.</div>

<div class="footer">Focux Digital Group S.A.S · focux.co · Confidencial — Solo para uso interno</div>
</body></html>`;

  const w = window.open("","_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
}

const FOCUX_COLORS = {
  navy: "#1F0067",
  purple: "#6410F7",
  cyan: "#08C1F5",
  teal: "#76F6EA",
  white: "#FFFFFF",
  dark: "#0A0020",
  cardBg: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
};

const CLASSIFICATION_CONFIG = {
  Fragmentado: { color: "#FF4D6D", bg: "rgba(255,77,109,0.15)", label: "Fragmentado" },
  Conectado: { color: "#FFB830", bg: "rgba(255,184,48,0.15)", label: "Conectado" },
  Inteligente: { color: "#76F6EA", bg: "rgba(118,246,234,0.15)", label: "Inteligente" },
};

const DIM_LABELS = ["Atracción", "Conversión", "Experiencia", "Datos", "Posventa", "IA"];

const PROPERTIES = [
  "firstname","lastname","jobtitle","company","email","phone","website",
  "focux_cx_score","focux_cx_classification","focux_cx_proyectos_activos",
  "focux_cx_mix_vis","focux_cx_crm_actual","focux_cx_meeting_booked",
  "focux_cx_dim1_score","focux_cx_dim2_score","focux_cx_dim3_score",
  "focux_cx_dim4_score","focux_cx_dim5_score","focux_cx_dim6_score",
  "focux_cx_top_gap_1","focux_cx_top_gap_2","focux_cx_top_gap_3","focux_cx_diagnosis_date"
].join(",");

// ─── Token Screen ─────────────────────────────────────────────────────────────
function TokenScreen({ onConnect }) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = async () => {
    if (!token.trim()) return;
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/hubspot?url=${encodeURIComponent('https://api.hubapi.com/crm/v3/objects/contacts?limit=1&properties=firstname')}`, {
        headers: { "x-hubspot-token": token.trim() }
      });
      if (!r.ok) throw new Error("Token inválido");
      onConnect(token.trim());
    } catch {
      setError("Token inválido o sin permisos. Verifica en HubSpot → Settings → Private Apps.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background: FOCUX_COLORS.dark, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap');`}</style>
      <div style={{ width:480, padding:48, background:"rgba(255,255,255,0.04)", border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:20 }}>
        <div style={{ marginBottom:32 }}>
          <div style={{ fontSize:11, letterSpacing:4, color: FOCUX_COLORS.cyan, textTransform:"uppercase", marginBottom:12, fontWeight:600 }}>Focux Digital Group</div>
          <div style={{ fontSize:28, fontWeight:700, color:"#fff", fontFamily:"'Space Grotesk', sans-serif", lineHeight:1.2, marginBottom:8 }}>Análisis Estratégico<br/>Autodiagnóstico Digital Focux</div>
          <div style={{ fontSize:14, color:"rgba(255,255,255,0.45)", lineHeight:1.6 }}>Conecta tu portal de HubSpot para ver el análisis completo de los diagnósticos CX.</div>
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:"rgba(255,255,255,0.5)", letterSpacing:1, textTransform:"uppercase", display:"block", marginBottom:8 }}>Private App Token</label>
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handle()}
            placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:`1px solid ${error ? "#FF4D6D" : FOCUX_COLORS.border}`, borderRadius:10, padding:"14px 16px", color:"#fff", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"monospace" }}
          />
        </div>
        {error && <div style={{ fontSize:12, color:"#FF4D6D", marginBottom:16 }}>{error}</div>}
        <button onClick={handle} disabled={loading || !token.trim()} style={{ width:"100%", padding:"14px", background: loading ? "rgba(100,16,247,0.4)" : FOCUX_COLORS.purple, border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:600, cursor: loading ? "default" : "pointer", transition:"all 0.2s", fontFamily:"'DM Sans', sans-serif" }}>
          {loading ? "Conectando..." : "Conectar HubSpot →"}
        </button>
        <div style={{ marginTop:16, fontSize:11, color:"rgba(255,255,255,0.25)", textAlign:"center" }}>El token nunca se almacena. Solo se usa en esta sesión.</div>
      </div>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ value }) {
  const cfg = CLASSIFICATION_CONFIG[value] || { color:"#888", bg:"rgba(136,136,136,0.1)", label: value || "—" };
  return (
    <span style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, color: cfg.color, background: cfg.bg, border:`1px solid ${cfg.color}30`, whiteSpace:"nowrap" }}>
      {cfg.label}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: FOCUX_COLORS.cardBg, border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:16, padding:"24px 28px" }}>
      <div style={{ fontSize:11, letterSpacing:2, textTransform:"uppercase", color:"rgba(255,255,255,0.4)", marginBottom:10 }}>{label}</div>
      <div style={{ fontSize:36, fontWeight:700, color: accent || "#fff", fontFamily:"'Space Grotesk', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginTop:4 }}>{sub}</div>}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function Dashboard({ token }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortCol, setSortCol] = useState("focux_cx_score");
  const [sortDir, setSortDir] = useState("desc");

  // Fetch all contacts with pagination
  useEffect(() => {
    const fetchAll = async () => {
      let all = [], after = null;
      try {
        while (true) {
          const url = `/api/hubspot?url=${encodeURIComponent(`https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=${PROPERTIES}${after ? `&after=${after}` : ''}`)}`;
          const r = await fetch(url, { headers: { "x-hubspot-token": token } });
          const data = await r.json();
          const filtered = (data.results || []).filter(c => c.properties.focux_cx_score);
          all = [...all, ...filtered];
          if (data.paging?.next?.after) after = data.paging.next.after;
          else break;
        }
        setContacts(all);
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, [token]);

  const allProps = useMemo(() => contacts.map(c => c.properties), [contacts]);
  const props = useMemo(() => {
    let p = allProps;
    if (dateFrom) p = p.filter(x => x.focux_cx_diagnosis_date && x.focux_cx_diagnosis_date >= dateFrom);
    if (dateTo) p = p.filter(x => x.focux_cx_diagnosis_date && x.focux_cx_diagnosis_date <= dateTo);
    return p;
  }, [allProps, dateFrom, dateTo]);

  // ── Analytics ──
  const totalN = props.length;
  const avgScore = totalN ? (props.reduce((s, p) => s + parseFloat(p.focux_cx_score || 0), 0) / totalN).toFixed(1) : 0;
  const agendaron = props.filter(p => p.focux_cx_meeting_booked === "true").length;
  const noAgendaron = totalN - agendaron;

  const byClass = useMemo(() => {
    const counts = { Fragmentado: 0, Conectado: 0, Inteligente: 0 };
    props.forEach(p => { if (counts[p.focux_cx_classification] !== undefined) counts[p.focux_cx_classification]++; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [props]);

  const radarData = useMemo(() => DIM_LABELS.map((dim, i) => ({
    dim,
    score: totalN ? +(props.reduce((s, p) => s + parseFloat(p[`focux_cx_dim${i+1}_score`] || 0), 0) / totalN).toFixed(2) : 0
  })), [props, totalN]);

  const crmData = useMemo(() => {
    const counts = {};
    props.forEach(p => { const v = p.focux_cx_crm_actual || "Sin CRM"; counts[v] = (counts[v]||0)+1; });
    return Object.entries(counts).sort((a,b)=>(b[1] as number)-(a[1] as number)).slice(0,8).map(([name,value])=>({ name: name.length > 20 ? name.slice(0,18)+"…" : name, value: value as number }));
  }, [props]);

  const gapData = useMemo(() => {
    const counts = {};
    props.forEach(p => {
      [p.focux_cx_top_gap_1, p.focux_cx_top_gap_2, p.focux_cx_top_gap_3].forEach(g => { if (g) counts[g] = (counts[g]||0)+1; });
    });
    return Object.entries(counts).sort((a,b)=>(b[1] as number)-(a[1] as number)).map(([name,value])=>({ name, value: value as number }));
  }, [props]);

  // Priority score: lower CX score + no meeting = higher priority
  const withPriority = useMemo(() => props.map((p, i) => ({
    ...p,
    _id: contacts[i].id,
    _priority: (100 - parseFloat(p.focux_cx_score || 50)) + (p.focux_cx_meeting_booked === "true" ? 0 : 20)
  })), [props, contacts]);

  // ── Table ──
  const filtered = useMemo(() => {
    let rows = [...withPriority];
    if (filterClass !== "all") rows = rows.filter(p => p.focux_cx_classification === filterClass);
    if (dateFrom) rows = rows.filter(p => p.focux_cx_diagnosis_date && p.focux_cx_diagnosis_date >= dateFrom);
    if (dateTo) rows = rows.filter(p => p.focux_cx_diagnosis_date && p.focux_cx_diagnosis_date <= dateTo);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(p => [p.firstname, p.lastname, p.company, p.email].join(" ").toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      let va = a[sortCol] || "", vb = b[sortCol] || "";
      if (!isNaN(parseFloat(va))) { va = parseFloat(va); vb = parseFloat(vb); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [withPriority, filterClass, search, sortCol, sortDir]);

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const tabs = [
    { id:"overview", label:"Dashboard" },
    { id:"table", label:"Directorio" },
    { id:"insights", label:"Insights" },
    { id:"commercial", label:"Oportunidades" },
  ];

  const CHART_COLORS = [FOCUX_COLORS.purple, FOCUX_COLORS.cyan, FOCUX_COLORS.teal, "#FF4D6D", "#FFB830", "#A78BFA", "#34D399", "#FB923C"];

  if (loading) return (
    <div style={{ minHeight:"100vh", background: FOCUX_COLORS.dark, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ width:48, height:48, border:`3px solid ${FOCUX_COLORS.border}`, borderTopColor: FOCUX_COLORS.purple, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <div style={{ color:"rgba(255,255,255,0.4)", fontSize:14 }}>Cargando diagnósticos de HubSpot…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background: FOCUX_COLORS.dark, color:"#fff", fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap');
        ::-webkit-scrollbar { width:6px; height:6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius:3px; }
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom:`1px solid ${FOCUX_COLORS.border}`, padding:"20px 40px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          <div>
            <div style={{ fontSize:11, letterSpacing:3, color: FOCUX_COLORS.cyan, textTransform:"uppercase", fontWeight:600 }}>Focux Digital Group</div>
            <div style={{ fontSize:20, fontWeight:700, fontFamily:"'Space Grotesk', sans-serif" }}>Análisis Estratégico Autodiagnóstico Digital Focux</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div style={{ padding:"6px 14px", background:"rgba(118,246,234,0.1)", border:`1px solid ${FOCUX_COLORS.teal}30`, borderRadius:20, fontSize:12, color: FOCUX_COLORS.teal, fontWeight:600 }}>
            {totalN} diagnósticos
          </div>
          <div style={{ padding:"6px 14px", background:"rgba(100,16,247,0.2)", border:`1px solid ${FOCUX_COLORS.purple}40`, borderRadius:20, fontSize:12, color:"rgba(255,255,255,0.6)" }}>
            Live · HubSpot
          </div>
          <button onClick={() => exportExcel(tab === "table" && filtered.length > 0 ? filtered : withPriority)} style={{ padding:"6px 16px", background:"rgba(118,246,234,0.1)", border:`1px solid ${FOCUX_COLORS.teal}40`, borderRadius:20, fontSize:12, color: FOCUX_COLORS.teal, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight:600 }}>
            ↓ Excel
          </button>
          <button onClick={() => exportPDF(props, radarData, byClass, crmData, gapData)} style={{ padding:"6px 16px", background:"rgba(100,16,247,0.15)", border:`1px solid ${FOCUX_COLORS.purple}50`, borderRadius:20, fontSize:12, color:"#c4a0ff", cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight:600 }}>
            ↓ PDF Ejecutivo
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div style={{ padding:"10px 40px", borderBottom:`1px solid ${FOCUX_COLORS.border}`, display:"flex", alignItems:"center", gap:12, background:"rgba(255,255,255,0.02)" }}>
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)", letterSpacing:1, textTransform:"uppercase" }}>Filtrar por fecha de diagnóstico:</span>
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.05)", border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:8, padding:"0 12px" }}>
          <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>Desde</span>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ background:"transparent", border:"none", color:"#fff", fontSize:12, outline:"none", fontFamily:"'DM Sans', sans-serif", padding:"8px 0" }} />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.05)", border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:8, padding:"0 12px" }}>
          <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>Hasta</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ background:"transparent", border:"none", color:"#fff", fontSize:12, outline:"none", fontFamily:"'DM Sans', sans-serif", padding:"8px 0" }} />
        </div>
        {(dateFrom || dateTo) && (
          <button onClick={()=>{setDateFrom("");setDateTo("");}} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid rgba(255,77,109,0.3)`, background:"rgba(255,77,109,0.1)", color:"#FF4D6D", fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" }}>✕ Limpiar</button>
        )}
        {(dateFrom || dateTo) && (
          <div style={{ marginLeft:"auto", padding:"4px 12px", background:"rgba(100,16,247,0.2)", border:`1px solid ${FOCUX_COLORS.purple}40`, borderRadius:8, fontSize:11, color:"rgba(255,255,255,0.5)" }}>
            Mostrando {props.length} de {allProps.length} diagnósticos
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ padding:"0 40px", borderBottom:`1px solid ${FOCUX_COLORS.border}`, display:"flex", gap:4 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding:"16px 20px", background:"none", border:"none", color: tab===t.id ? "#fff" : "rgba(255,255,255,0.4)", fontSize:13, fontWeight: tab===t.id ? 600 : 400, cursor:"pointer", borderBottom: tab===t.id ? `2px solid ${FOCUX_COLORS.purple}` : "2px solid transparent", transition:"all 0.15s", fontFamily:"'DM Sans', sans-serif" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding:"32px 40px" }}>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:28 }}>
              <StatCard label="Total Diagnósticos" value={totalN} sub="Camacol Barranquilla" accent={FOCUX_COLORS.cyan} />
              <StatCard label="Score Promedio" value={`${avgScore}/5`} sub="Madurez digital sector" accent={FOCUX_COLORS.purple} />
              <StatCard label="Agendaron Reunión" value={agendaron} sub={`${totalN ? Math.round(agendaron/totalN*100) : 0}% del total`} accent={FOCUX_COLORS.teal} />
              <StatCard label="Sin Agendar" value={noAgendaron} sub="Oportunidad de contacto" accent="#FFB830" />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
              {/* Radar */}
              <div style={{ background: FOCUX_COLORS.cardBg, border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:16, padding:28 }}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Madurez Promedio por Dimensión</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:20 }}>Score 0–5 · Promedio del grupo</div>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.08)" />
                    <PolarAngleAxis dataKey="dim" tick={{ fill:"rgba(255,255,255,0.5)", fontSize:11 }} />
                    <Radar dataKey="score" stroke={FOCUX_COLORS.purple} fill={FOCUX_COLORS.purple} fillOpacity={0.25} strokeWidth={2} dot={{ fill: FOCUX_COLORS.cyan, r:3 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie clasificación */}
              <div style={{ background: FOCUX_COLORS.cardBg, border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:16, padding:28 }}>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Distribución por Clasificación CX</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:20 }}>Fragmentado · Conectado · Inteligente</div>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={byClass} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3} label={({name,value})=>`${name}: ${value}`} labelLine={false}>
                      {byClass.map((entry) => (
                        <Cell key={entry.name} fill={CLASSIFICATION_CONFIG[entry.name]?.color || "#888"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background:"#1a1a2e", border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:8, color:"#fff" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display:"flex", justifyContent:"center", gap:20, marginTop:8 }}>
                  {byClass.map(b => (
                    <div key={b.name} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
                      <div style={{ width:10, height:10, borderRadius:2, background: CLASSIFICATION_CONFIG[b.name]?.color }} />
                      <span style={{ color:"rgba(255,255,255,0.6)" }}>{b.name}</span>
                      <span style={{ fontWeight:600 }}>{b.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CRM Bar */}
            <div style={{ background: FOCUX_COLORS.cardBg, border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:16, padding:28 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>CRM Actual del Sector</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:20 }}>¿Con qué herramienta gestionan sus leads hoy?</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={crmData} layout="vertical" margin={{ left:10 }}>
                  <XAxis type="number" tick={{ fill:"rgba(255,255,255,0.4)", fontSize:11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill:"rgba(255,255,255,0.6)", fontSize:11 }} axisLine={false} tickLine={false} width={160} />
                  <Tooltip contentStyle={{ background:"#1a1a2e", border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:8, color:"#fff" }} />
                  <Bar dataKey="value" radius={[0,6,6,0]} label={{ position: "right", fill: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>
                    {crmData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── TABLE ── */}
        {tab === "table" && (
          <div>
            <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.05)", border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:10, padding:"0 12px" }}>
                <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)", whiteSpace:"nowrap" }}>Desde</span>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ background:"transparent", border:"none", color:"#fff", fontSize:12, outline:"none", fontFamily:"'DM Sans', sans-serif", padding:"10px 0" }} />
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.05)", border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:10, padding:"0 12px" }}>
                <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)", whiteSpace:"nowrap" }}>Hasta</span>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ background:"transparent", border:"none", color:"#fff", fontSize:12, outline:"none", fontFamily:"'DM Sans', sans-serif", padding:"10px 0" }} />
              </div>
              {(dateFrom || dateTo) && <button onClick={()=>{setDateFrom("");setDateTo("");}} style={{ padding:"10px 12px", borderRadius:10, border:`1px solid ${FOCUX_COLORS.border}`, background:"rgba(255,77,109,0.1)", color:"#FF4D6D", fontSize:11, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", whiteSpace:"nowrap" }}>✕ Limpiar fechas</button>}
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nombre, empresa o email…" style={{ flex:1, minWidth:240, background:"rgba(255,255,255,0.05)", border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:10, padding:"10px 16px", color:"#fff", fontSize:13, outline:"none", fontFamily:"'DM Sans', sans-serif" }} />
              {["all","Fragmentado","Conectado","Inteligente"].map(f => (
                <button key={f} onClick={()=>setFilterClass(f)} style={{ padding:"10px 16px", borderRadius:10, border:`1px solid ${filterClass===f ? FOCUX_COLORS.purple : FOCUX_COLORS.border}`, background: filterClass===f ? "rgba(100,16,247,0.2)" : "rgba(255,255,255,0.03)", color: filterClass===f ? "#fff" : "rgba(255,255,255,0.5)", fontSize:12, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", fontWeight: filterClass===f ? 600 : 400 }}>
                  {f === "all" ? "Todos" : f}
                </button>
              ))}
              <div style={{ padding:"10px 16px", background:"rgba(118,246,234,0.08)", border:`1px solid ${FOCUX_COLORS.teal}30`, borderRadius:10, fontSize:12, color: FOCUX_COLORS.teal, fontWeight:600 }}>
                {filtered.length} resultados
              </div>
            </div>

            <div style={{ overflowX:"auto", borderRadius:12, border:`1px solid ${FOCUX_COLORS.border}` }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                    {[
                      ["Nombre","firstname"],["Cargo","jobtitle"],["Empresa","company"],
                      ["Email","email"],["Teléfono","phone"],["Proyectos","focux_cx_proyectos_activos"],
                      ["% VIS","focux_cx_mix_vis"],["Clasificación","focux_cx_classification"],
                      ["Score","focux_cx_score"],["CRM","focux_cx_crm_actual"],
                      ["Sitio Web","website"],["Agendó","focux_cx_meeting_booked"],
                    ].map(([label, col]) => (
                      <th key={col} onClick={()=>handleSort(col)} style={{ padding:"12px 14px", textAlign:"left", color:"rgba(255,255,255,0.4)", fontWeight:600, letterSpacing:1, fontSize:10, textTransform:"uppercase", cursor:"pointer", whiteSpace:"nowrap", borderBottom:`1px solid ${FOCUX_COLORS.border}`, userSelect:"none" }}>
                        {label} {sortCol===col ? (sortDir==="asc"?"↑":"↓") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr key={p._id || i} style={{ borderBottom:`1px solid ${FOCUX_COLORS.border}`, transition:"background 0.1s" }}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{ padding:"12px 14px", whiteSpace:"nowrap", fontWeight:500 }}>{[p.firstname, p.lastname].filter(Boolean).join(" ") || "—"}</td>
                      <td style={{ padding:"12px 14px", color:"rgba(255,255,255,0.55)", whiteSpace:"nowrap" }}>{p.jobtitle || "—"}</td>
                      <td style={{ padding:"12px 14px", fontWeight:500, whiteSpace:"nowrap" }}>{p.company || "—"}</td>
                      <td style={{ padding:"12px 14px", color: FOCUX_COLORS.cyan, fontSize:11 }}>{p.email || "—"}</td>
                      <td style={{ padding:"12px 14px", color:"rgba(255,255,255,0.55)" }}>{p.phone || "—"}</td>
                      <td style={{ padding:"12px 14px", textAlign:"center" }}>{p.focux_cx_proyectos_activos || "—"}</td>
                      <td style={{ padding:"12px 14px", textAlign:"center" }}>{p.focux_cx_mix_vis ? `${p.focux_cx_mix_vis}%` : "—"}</td>
                      <td style={{ padding:"12px 14px" }}><Badge value={p.focux_cx_classification} /></td>
                      <td style={{ padding:"12px 14px", textAlign:"center", fontWeight:700, color: parseFloat(p.focux_cx_score)>=3.5 ? FOCUX_COLORS.teal : parseFloat(p.focux_cx_score)>=2 ? "#FFB830" : "#FF4D6D" }}>{p.focux_cx_score ? parseFloat(p.focux_cx_score).toFixed(1) : "—"}</td>
                      <td style={{ padding:"12px 14px", color:"rgba(255,255,255,0.55)", whiteSpace:"nowrap", maxWidth:150, overflow:"hidden", textOverflow:"ellipsis" }}>{p.focux_cx_crm_actual || "—"}</td>
                      <td style={{ padding:"12px 14px" }}>
                        {p.website ? <a href={p.website} target="_blank" rel="noreferrer" style={{ color: FOCUX_COLORS.purple, fontSize:11, textDecoration:"none" }}>↗ Ver</a> : <span style={{ color:"rgba(255,255,255,0.25)" }}>—</span>}
                      </td>
                      <td style={{ padding:"12px 14px", textAlign:"center" }}>
                        <span style={{ fontSize:11, fontWeight:600, color: p.focux_cx_meeting_booked==="true" ? FOCUX_COLORS.teal : "#FF4D6D" }}>
                          {p.focux_cx_meeting_booked==="true" ? "✓ Sí" : "✗ No"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div style={{ padding:40, textAlign:"center", color:"rgba(255,255,255,0.3)" }}>No hay resultados para esta búsqueda.</div>
              )}
            </div>
          </div>
        )}

        {/* ── INSIGHTS ── */}
        {tab === "insights" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
            {/* Gaps */}
            <div style={{ background: FOCUX_COLORS.cardBg, border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:16, padding:28, gridColumn:"1/-1" }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Brechas Más Frecuentes del Sector</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:20 }}>Top dimensiones con mayor déficit · Suma de Top Gap 1, 2 y 3</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={gapData}>
                  <XAxis dataKey="name" tick={{ fill:"rgba(255,255,255,0.5)", fontSize:11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill:"rgba(255,255,255,0.4)", fontSize:11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background:"#1a1a2e", border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:8, color:"#fff" }} />
                  <Bar dataKey="value" radius={[6,6,0,0]} label={{ position: "top", fill: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>
                    {gapData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Score por clasificación */}
            <div style={{ background: FOCUX_COLORS.cardBg, border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:16, padding:28 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:20 }}>Score Promedio por Clasificación</div>
              {["Fragmentado","Conectado","Inteligente"].map(cls => {
                const group = props.filter(p=>p.focux_cx_classification===cls);
                const avg = group.length ? (group.reduce((s,p)=>s+parseFloat(p.focux_cx_score||0),0)/group.length).toFixed(1) : "—";
                const cfg = CLASSIFICATION_CONFIG[cls];
                return (
                  <div key={cls} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 0", borderBottom:`1px solid ${FOCUX_COLORS.border}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background: cfg.color }} />
                      <span style={{ fontSize:13 }}>{cls}</span>
                      <span style={{ fontSize:11, color:"rgba(255,255,255,0.35)" }}>{group.length} constructoras</span>
                    </div>
                    <span style={{ fontWeight:700, fontSize:18, fontFamily:"'Space Grotesk', sans-serif", color: cfg.color }}>{avg}</span>
                  </div>
                );
              })}
            </div>

            {/* Conversión reuniones */}
            <div style={{ background: FOCUX_COLORS.cardBg, border:`1px solid ${FOCUX_COLORS.border}`, borderRadius:16, padding:28 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:20 }}>Conversión a Reunión</div>
              {["Fragmentado","Conectado","Inteligente"].map(cls => {
                const group = props.filter(p=>p.focux_cx_classification===cls);
                const booked = group.filter(p=>p.focux_cx_meeting_booked==="true").length;
                const pct = group.length ? Math.round(booked/group.length*100) : 0;
                const cfg = CLASSIFICATION_CONFIG[cls];
                return (
                  <div key={cls} style={{ marginBottom:16 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <span style={{ fontSize:12 }}>{cls}</span>
                      <span style={{ fontSize:12, fontWeight:600, color: cfg.color }}>{booked}/{group.length} · {pct}%</span>
                    </div>
                    <div style={{ height:6, background:"rgba(255,255,255,0.08)", borderRadius:3 }}>
                      <div style={{ height:"100%", width:`${pct}%`, background: cfg.color, borderRadius:3, transition:"width 0.5s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── COMMERCIAL ── */}
        {tab === "commercial" && (
          <div>
            <div style={{ background:"rgba(100,16,247,0.1)", border:`1px solid ${FOCUX_COLORS.purple}30`, borderRadius:16, padding:24, marginBottom:24 }}>
              <div style={{ fontSize:13, fontWeight:600, color: FOCUX_COLORS.cyan, marginBottom:6 }}>🎯 Ranking de Oportunidades Comerciales</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)" }}>Ordenado por prioridad: score bajo + sin reunión agendada = oportunidad más caliente. Llama a los primeros 10 esta semana.</div>
            </div>
            <div style={{ overflowX:"auto", borderRadius:12, border:`1px solid ${FOCUX_COLORS.border}` }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"rgba(255,255,255,0.04)" }}>
                    {["#","Nombre","Empresa","Email","Teléfono","Clasificación","Score","Agendó","Prioridad"].map(h => (
                      <th key={h} style={{ padding:"12px 14px", textAlign:"left", color:"rgba(255,255,255,0.4)", fontWeight:600, letterSpacing:1, fontSize:10, textTransform:"uppercase", borderBottom:`1px solid ${FOCUX_COLORS.border}`, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...withPriority].sort((a,b)=>b._priority-a._priority).map((p, i) => (
                    <tr key={i} style={{ borderBottom:`1px solid ${FOCUX_COLORS.border}` }}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.03)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{ padding:"12px 14px", fontWeight:700, color: i<10 ? FOCUX_COLORS.cyan : "rgba(255,255,255,0.3)" }}>#{i+1}</td>
                      <td style={{ padding:"12px 14px", fontWeight:500, whiteSpace:"nowrap" }}>{[p.firstname,p.lastname].filter(Boolean).join(" ")||"—"}</td>
                      <td style={{ padding:"12px 14px", whiteSpace:"nowrap" }}>{p.company||"—"}</td>
                      <td style={{ padding:"12px 14px", color: FOCUX_COLORS.cyan, fontSize:11 }}>{p.email||"—"}</td>
                      <td style={{ padding:"12px 14px", color:"rgba(255,255,255,0.55)" }}>{p.phone||"—"}</td>
                      <td style={{ padding:"12px 14px" }}><Badge value={p.focux_cx_classification} /></td>
                      <td style={{ padding:"12px 14px", fontWeight:700, color: parseFloat(p.focux_cx_score)>=3.5 ? FOCUX_COLORS.teal : parseFloat(p.focux_cx_score)>=2 ? "#FFB830" : "#FF4D6D" }}>{p.focux_cx_score ? parseFloat(p.focux_cx_score).toFixed(1) : "—"}</td>
                      <td style={{ padding:"12px 14px" }}>
                        <span style={{ fontSize:11, fontWeight:600, color: p.focux_cx_meeting_booked==="true" ? FOCUX_COLORS.teal : "#FF4D6D" }}>
                          {p.focux_cx_meeting_booked==="true" ? "✓ Agendó" : "✗ Pendiente"}
                        </span>
                      </td>
                      <td style={{ padding:"12px 14px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <div style={{ width:60, height:4, background:"rgba(255,255,255,0.08)", borderRadius:2 }}>
                            <div style={{ height:"100%", width:`${Math.min(p._priority,100)}%`, background: p._priority>80 ? "#FF4D6D" : p._priority>50 ? "#FFB830" : FOCUX_COLORS.teal, borderRadius:2 }} />
                          </div>
                          <span style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>{Math.round(p._priority)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(null);
  if (!token) return <TokenScreen onConnect={setToken} />;
  return <Dashboard token={token} />;
}
