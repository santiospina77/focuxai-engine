// @ts-nocheck
"use client";
import { useState, useCallback, useRef, useMemo } from "react";
import { generateScanPDF } from "./ScanReport";

/* ═══════════════════════════════════════════════════════════
   FOCUXAI ENGINE™ — FOCUX SCAN v1.0
   Portal Inventory Scanner — HubSpot API v3
   Deterministic. Auditable. Unstoppable.
   ═══════════════════════════════════════════════════════════ */

const font = "'Plus Jakarta Sans', system-ui, sans-serif";
const mono = "'JetBrains Mono', 'Fira Code', monospace";
const tk = {
  navy:"#211968", blue:"#1A4BA8", teal:"#0D7AB5", cyan:"#2099D8",
  bg:"#0B0E1A", card:"#12162B", cardHover:"#1A1F38", border:"#2A2F4A",
  text:"#E8ECF4", textSec:"#8B92A8", textTer:"#5A6078",
  green:"#10B981", red:"#EF4444", amber:"#F59E0B", purple:"#6410F7",
  greenBg:"#10B98115", redBg:"#EF444415", amberBg:"#F59E0B15",
  accent:"#0D7AB5", accentGlow:"#0D7AB530",
};

/* ═══ API HELPER (same proxy pattern as Adapter) ═══ */
async function hubspotAPI(token, method, path) {
  const res = await fetch(`/api/hubspot${path}`, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, message: data.message || JSON.stringify(data) };
  return data;
}

/* ═══ FUZZY MATCH FOR DUPLICATE DETECTION ═══ */
function normalizeForMatch(str) {
  return (str || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function findDuplicates(props) {
  const dupes = [];
  const names = props.map(p => ({ label: p.label, name: p.name, norm: normalizeForMatch(p.label) }));
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const dist = levenshtein(names[i].norm, names[j].norm);
      const maxLen = Math.max(names[i].norm.length, names[j].norm.length);
      if (maxLen > 3 && dist <= Math.max(2, Math.floor(maxLen * 0.25))) {
        dupes.push([names[i].label, names[j].label]);
      }
    }
  }
  return dupes;
}

/* ═══ CROSS-REFERENCE ENGINE ═══ */
function buildUsageMap(workflows, forms, lists, pipelineStages) {
  const usage = {}; // propName → Set of usage locations

  const addUsage = (propName, location) => {
    if (!propName) return;
    const key = propName.toLowerCase();
    if (!usage[key]) usage[key] = new Set();
    usage[key].add(location);
  };

  // Workflows: scan actions and filters for property references
  (workflows || []).forEach(wf => {
    const wfName = wf.name || `WF ${wf.id}`;
    // Scan actions
    (wf.actions || []).forEach(action => {
      if (action.fields?.property_name) addUsage(action.fields.property_name, `WF: ${wfName}`);
      // Check value references
      if (action.fields?.value?.propertyName) addUsage(action.fields.value.propertyName, `WF: ${wfName}`);
    });
    // Scan enrollment filters
    const scanFilters = (branch) => {
      if (!branch) return;
      (branch.filters || []).forEach(f => {
        if (f.property) addUsage(f.property, `WF: ${wfName}`);
      });
      (branch.filterBranches || []).forEach(scanFilters);
    };
    if (wf.enrollmentCriteria?.listFilterBranch) scanFilters(wf.enrollmentCriteria.listFilterBranch);
    if (wf.enrollmentCriteria?.eventFilterBranches) wf.enrollmentCriteria.eventFilterBranches.forEach(scanFilters);
  });

  // Forms: scan fields
  (forms || []).forEach(form => {
    const formName = form.name || `Form ${form.id}`;
    (form.fieldGroups || []).forEach(group => {
      (group.fields || []).forEach(field => {
        if (field.name) addUsage(field.name, `Form: ${formName}`);
      });
    });
    // Legacy form format
    (form.formFieldGroups || []).forEach(group => {
      (group.fields || []).forEach(field => {
        if (field.name) addUsage(field.name, `Form: ${formName}`);
      });
    });
  });

  // Lists: scan filter branches
  (lists || []).forEach(list => {
    const listName = list.name || `List ${list.listId}`;
    const scanListFilters = (branch) => {
      if (!branch) return;
      (branch.filters || []).forEach(f => {
        if (f.property) addUsage(f.property, `List: ${listName}`);
      });
      (branch.filterBranches || []).forEach(scanListFilters);
    };
    if (list.filterBranch) scanListFilters(list.filterBranch);
    if (list.filters) list.filters.forEach(f => { if (f.property) addUsage(f.property, `List: ${listName}`); });
  });

  // Pipeline required properties
  (pipelineStages || []).forEach(({ pipeline, stage }) => {
    (stage.requiredProperties || []).forEach(prop => {
      addUsage(prop, `Pipeline: ${pipeline} → ${stage.label}`);
    });
  });

  return usage;
}

/* ═══ DATE FORMATTER ═══ */
function fmtDate(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleDateString("es-CO", { year:"numeric", month:"short", day:"numeric" }); }
  catch { return "—"; }
}

function fmtAgo(ts) {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Hoy";
  if (days < 30) return `Hace ${days}d`;
  if (days < 365) return `Hace ${Math.floor(days/30)}m`;
  return `Hace ${Math.floor(days/365)}a`;
}

/* ═══ EXCEL EXPORT (SheetJS CDN) ═══ */
async function loadSheetJS() {
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function exportExcel(scanData, portalName) {
  const XLSX = await loadSheetJS();
  const wb = XLSX.utils.book_new();

  // Tab 1: Resumen
  const summary = [
    ["FocuxHub Inventory — Resumen Ejecutivo"],
    ["Portal", portalName || "—"],
    ["Fecha Scan", new Date().toLocaleDateString("es-CO")],
    [],
    ["Módulo", "Total", "Highlights"],
    ["Propiedades Custom", scanData.properties?.length || 0, `${scanData.kpis?.orphanedProps || 0} huérfanas`],
    ["Workflows", scanData.workflows?.length || 0, `${scanData.kpis?.offWorkflows || 0} apagados`],
    ["Pipelines", scanData.pipelines?.length || 0, ""],
    ["Formularios", scanData.forms?.length || 0, `${scanData.kpis?.zeroSubmForms || 0} sin submissions`],
    ["Listas", scanData.lists?.length || 0, `${scanData.kpis?.orphanedLists || 0} huérfanas`],
    ["Usuarios", scanData.users?.length || 0, `${scanData.kpis?.inactiveUsers || 0} inactivos`],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumen");

  // Tab 2: Properties
  if (scanData.properties?.length) {
    const rows = [["#","Objeto","Nombre","Nombre Interno","Tipo","Grupo","Opciones","Creado Por","Fecha","Estado Uso","Dónde Se Usa"]];
    scanData.properties.forEach((p, i) => {
      rows.push([i+1, p.objectType, p.label, p.name, p.type, p.groupName||"", (p.options||[]).map(o=>o.label).join("; "), p.createdUserId||"", fmtDate(p.createdAt), p.usageStatus, (p.usageLocations||[]).join("; ")]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Propiedades");
  }

  // Tab 3: Workflows
  if (scanData.workflows?.length) {
    const rows = [["#","Nombre","Estado","Tipo","Objeto","Acciones","Inscritos","Creado Por","Fecha","Última Edición"]];
    scanData.workflows.forEach((wf, i) => {
      rows.push([i+1, wf.name, wf.enabled?"Activo":"Apagado", wf.type||"", wf.objectTypeId||"", (wf.actions||[]).length, wf.enrollmentCount||0, wf.createdBy||"", fmtDate(wf.insertedAt), fmtDate(wf.updatedAt)]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Workflows");
  }

  // Tab 4: Pipelines
  if (scanData.pipelines?.length) {
    const rows = [["Objeto","Pipeline","Etapa","Order","Probabilidad","Campos Requeridos"]];
    scanData.pipelines.forEach(pl => {
      (pl.stages || []).forEach(st => {
        rows.push([pl.objectType, pl.label, st.label, st.displayOrder, st.metadata?.probability||"", (st.requiredProperties||[]).join(", ")]);
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Pipelines");
  }

  // Tab 5: Forms
  if (scanData.forms?.length) {
    const rows = [["#","Nombre","Tipo","Campos","Submissions","Creado","Última Edición"]];
    scanData.forms.forEach((f, i) => {
      const fieldCount = (f.fieldGroups||f.formFieldGroups||[]).reduce((acc, g) => acc + (g.fields||[]).length, 0);
      rows.push([i+1, f.name, f.formType||"", fieldCount, f.submissions||f.submitCount||0, fmtDate(f.createdAt), fmtDate(f.updatedAt)]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Formularios");
  }

  // Tab 6: Lists
  if (scanData.lists?.length) {
    const rows = [["#","Nombre","Tipo","Tamaño","Creado","Última Actualización"]];
    scanData.lists.forEach((l, i) => {
      rows.push([i+1, l.name, l.listType||l.processingType||"", l.size||l.listSize||0, fmtDate(l.createdAt), fmtDate(l.updatedAt)]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Listas");
  }

  // Tab 7: Users
  if (scanData.users?.length) {
    const rows = [["#","Nombre","Email","Rol","Último Login"]];
    scanData.users.forEach((u, i) => {
      rows.push([i+1, `${u.firstName||""} ${u.lastName||""}`.trim(), u.email, u.roleId||u.role||"", fmtDate(u.lastLogin||u.lastActiveAt)]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Usuarios");
  }

  XLSX.writeFile(wb, `FocuxScan_${portalName||"Portal"}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ═══ SORTABLE TABLE COMPONENT ═══ */
function ScanTable({ columns, data, searchKeys }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const perPage = 50;

  const filtered = useMemo(() => {
    let rows = data || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r => (searchKeys || columns.map(c => c.key)).some(k => String(r[k] || "").toLowerCase().includes(q)));
    }
    if (sortCol !== null) {
      rows = [...rows].sort((a, b) => {
        const va = a[columns[sortCol].key] ?? "";
        const vb = b[columns[sortCol].key] ?? "";
        if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
        return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
    }
    return rows;
  }, [data, search, sortCol, sortDir, columns, searchKeys]);

  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const toggleSort = (i) => {
    if (sortCol === i) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(i); setSortDir("asc"); }
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <input
          value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Buscar..."
          style={{ padding:"8px 14px", borderRadius:8, border:`1.5px solid ${tk.border}`, background:tk.bg, color:tk.text, fontSize:12, fontFamily:font, outline:"none", width:280 }}
        />
        <span style={{ fontSize:11, color:tk.textSec }}>{filtered.length} registros</span>
      </div>
      <div style={{ overflowX:"auto", borderRadius:10, border:`1px solid ${tk.border}` }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:font }}>
          <thead>
            <tr style={{ background:tk.card }}>
              {columns.map((col, ci) => (
                <th key={ci} onClick={() => toggleSort(ci)} style={{ padding:"10px 12px", textAlign:"left", color:tk.textSec, fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", cursor:"pointer", whiteSpace:"nowrap", borderBottom:`1px solid ${tk.border}`, userSelect:"none" }}>
                  {col.label} {sortCol === ci ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : tk.card + "40", borderBottom:`1px solid ${tk.border}20` }}>
                {columns.map((col, ci) => (
                  <td key={ci} style={{ padding:"8px 12px", color: col.color ? col.color(row) : tk.text, fontFamily: col.mono ? mono : font, fontSize: col.mono ? 11 : 12, maxWidth: col.maxWidth || 300, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {col.render ? col.render(row) : (row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={columns.length} style={{ padding:24, textAlign:"center", color:tk.textTer }}>Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:12 }}>
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${tk.border}`, background:"transparent", color:tk.textSec, fontSize:11, cursor:"pointer", opacity:page===0?0.4:1 }}>← Ant</button>
          <span style={{ fontSize:11, color:tk.textSec, lineHeight:"28px" }}>{page+1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page>=totalPages-1} style={{ padding:"4px 12px", borderRadius:6, border:`1px solid ${tk.border}`, background:"transparent", color:tk.textSec, fontSize:11, cursor:"pointer", opacity:page>=totalPages-1?0.4:1 }}>Sig →</button>
        </div>
      )}
    </div>
  );
}

/* ═══ KPI CARD ═══ */
function KpiCard({ value, label, sub, color }) {
  return (
    <div style={{ background:tk.card, borderRadius:12, border:`1px solid ${tk.border}`, padding:"18px 16px", textAlign:"center", minWidth:120 }}>
      <p style={{ margin:0, fontSize:28, fontWeight:800, color: color || tk.cyan, fontFamily:font, letterSpacing:"-0.02em" }}>{value}</p>
      <p style={{ margin:"4px 0 0", fontSize:11, color:tk.textSec, fontWeight:600 }}>{label}</p>
      {sub && <p style={{ margin:"2px 0 0", fontSize:10, color:tk.textTer }}>{sub}</p>}
    </div>
  );
}

/* ═══ USAGE BADGE ═══ */
function UsageBadge({ status }) {
  const cfg = {
    "🟢 En uso": { bg: tk.greenBg, color: tk.green, border: tk.green+"40" },
    "🟡 Solo registros": { bg: tk.amberBg, color: tk.amber, border: tk.amber+"40" },
    "🔴 Huérfana": { bg: tk.redBg, color: tk.red, border: tk.red+"40" },
  }[status] || { bg:"transparent", color:tk.textTer, border:tk.border };
  return (
    <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:4, fontSize:10, fontWeight:700, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}` }}>
      {status}
    </span>
  );
}

/* ═══ WF STATUS BADGE ═══ */
function WfBadge({ wf }) {
  const isSuspicious = /test|prueba|copy|backup|old|v\d$/i.test(wf.name || "");
  if (!wf.enabled) return <span style={{ color:tk.red, fontSize:10, fontWeight:700 }}>🔴 Apagado</span>;
  if (isSuspicious) return <span style={{ color:tk.amber, fontSize:10, fontWeight:700 }}>⚠️ Sospechoso</span>;
  if ((wf.enrollmentCount || 0) === 0) return <span style={{ color:tk.amber, fontSize:10, fontWeight:700 }}>🟡 0 inscritos</span>;
  return <span style={{ color:tk.green, fontSize:10, fontWeight:700 }}>🟢 Activo</span>;
}

/* ═══ PROGRESS BAR ═══ */
function ProgressBar({ steps, current }) {
  const pct = steps.length ? ((current + 1) / steps.length) * 100 : 0;
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
        <span style={{ fontSize:12, color:tk.cyan, fontWeight:600 }}>{steps[current] || "Preparando..."}</span>
        <span style={{ fontSize:11, color:tk.textSec }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ height:4, background:tk.border, borderRadius:2, overflow:"hidden" }}>
        <div style={{ height:4, background:`linear-gradient(90deg,${tk.teal},${tk.cyan})`, width:`${pct}%`, transition:"width 0.5s ease", borderRadius:2 }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN SCAN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function ScanClient() {
  const [token, setToken] = useState("");
  const [clientName, setClientName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [scanStepName, setScanStepName] = useState("");
  const [scanDone, setScanDone] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const scanDataRef = useRef(null);
  const [scanData, setScanData] = useState(null);

  const scanSteps = [
    "Propiedades Contacts",
    "Propiedades Companies",
    "Propiedades Deals",
    "Propiedades Tickets",
    "Workflows",
    "Pipelines (Deals)",
    "Pipelines (Tickets)",
    "Formularios",
    "Listas",
    "Usuarios",
    "Owners",
    "Cross-referencing",
  ];

  const startScan = useCallback(async () => {
    if (!token.trim()) { setError("Ingresa el Private App Token"); return; }
    setScanning(true);
    setScanDone(false);
    setError(null);
    setScanStep(0);
    const warnings = [];

    try {
      const allProps = [];
      const objectTypes = ["contacts", "companies", "deals", "tickets"];

      // M1: Properties per object
      for (let oi = 0; oi < objectTypes.length; oi++) {
        setScanStep(oi);
        setScanStepName(`Propiedades ${objectTypes[oi]}`);
        try {
          const res = await hubspotAPI(token, "GET", `/crm/v3/properties/${objectTypes[oi]}?archived=false`);
          const results = res.results || [];
          results.forEach(p => {
            // Include all non-HubSpot-defined properties (custom props)
            // hubspotDefined=true means it's a default HubSpot property
            if (p.hubspotDefined === false || p.hubspotDefined === undefined) {
              allProps.push({ ...p, objectType: objectTypes[oi] });
            }
          });
          if (results.length === 0) warnings.push(`${objectTypes[oi]}: 0 propiedades encontradas`);
        } catch (e) {
          warnings.push(`Props ${objectTypes[oi]}: ${e.message || "Error"}`);
        }
      }

      // M2: Workflows
      setScanStep(4);
      setScanStepName("Workflows");
      let allWorkflows = [];
      try {
        const wfRes = await hubspotAPI(token, "GET", "/automation/v4/flows");
        allWorkflows = wfRes.results || wfRes.flows || [];
      } catch (e) {
        warnings.push(`Workflows: ${e.message || "Error"}`);
      }

      // M3: Pipelines
      setScanStep(5);
      setScanStepName("Pipelines (Deals)");
      let allPipelines = [];
      try {
        const plDeals = await hubspotAPI(token, "GET", "/crm/v3/pipelines/deals");
        (plDeals.results || []).forEach(p => allPipelines.push({ ...p, objectType: "deals" }));
      } catch (e) { warnings.push(`Pipelines deals: ${e.message}`); }

      setScanStep(6);
      setScanStepName("Pipelines (Tickets)");
      try {
        const plTickets = await hubspotAPI(token, "GET", "/crm/v3/pipelines/tickets");
        (plTickets.results || []).forEach(p => allPipelines.push({ ...p, objectType: "tickets" }));
      } catch (e) { warnings.push(`Pipelines tickets: ${e.message}`); }

      // M4: Forms
      setScanStep(7);
      setScanStepName("Formularios");
      let allForms = [];
      try {
        const formRes = await hubspotAPI(token, "GET", "/marketing/v3/forms?limit=500");
        allForms = formRes.results || [];
      } catch (e) { warnings.push(`Forms: ${e.message}`); }

      // M5: Lists
      setScanStep(8);
      setScanStepName("Listas");
      let allLists = [];
      try {
        const listRes = await hubspotAPI(token, "GET", "/crm/v3/lists?limit=500");
        allLists = listRes.lists || listRes.results || [];
      } catch (e) { warnings.push(`Lists: ${e.message}`); }

      // M6: Users + Owners
      setScanStep(9);
      setScanStepName("Usuarios");
      let allUsers = [];
      try {
        const userRes = await hubspotAPI(token, "GET", "/settings/v3/users?limit=500");
        allUsers = userRes.results || [];
      } catch (e) { warnings.push(`Users: ${e.message}`); }

      setScanStep(10);
      setScanStepName("Owners");
      let allOwners = [];
      try {
        const ownerRes = await hubspotAPI(token, "GET", "/crm/v3/owners?limit=500");
        allOwners = ownerRes.results || [];
      } catch (e) { warnings.push(`Owners: ${e.message}`); }

      // Cross-reference
      setScanStep(11);
      setScanStepName("Cross-referencing propiedades...");

      // Build pipeline stages flat list for cross-ref
      const pipelineStages = [];
      allPipelines.forEach(pl => {
        (pl.stages || []).forEach(st => {
          pipelineStages.push({ pipeline: pl.label, stage: st });
        });
      });

      const usageMap = buildUsageMap(allWorkflows, allForms, allLists, pipelineStages);

      // Enrich properties with usage
      const enrichedProps = allProps.map(p => {
        const refs = usageMap[p.name.toLowerCase()];
        const locations = refs ? [...refs] : [];
        let usageStatus;
        if (locations.length > 0) usageStatus = "🟢 En uso";
        else usageStatus = "🔴 Huérfana";
        return { ...p, usageStatus, usageLocations: locations };
      });

      // Detect duplicates
      const dupeGroups = findDuplicates(enrichedProps);

      // Build owner email map for "Herencia de Agencias"
      const ownerMap = {};
      allOwners.forEach(o => { if (o.userId) ownerMap[String(o.userId)] = o.email || `${o.firstName||""} ${o.lastName||""}`.trim(); });
      allUsers.forEach(u => { if (u.id) ownerMap[String(u.id)] = u.email || `${u.firstName||""} ${u.lastName||""}`.trim(); });

      // Agency heritage — group props by creator
      const heritage = {};
      enrichedProps.forEach(p => {
        const creator = ownerMap[String(p.createdUserId)] || p.createdUserId || "Desconocido";
        if (!heritage[creator]) heritage[creator] = { count:0, earliest:null, latest:null };
        heritage[creator].count++;
        if (p.createdAt) {
          if (!heritage[creator].earliest || p.createdAt < heritage[creator].earliest) heritage[creator].earliest = p.createdAt;
          if (!heritage[creator].latest || p.createdAt > heritage[creator].latest) heritage[creator].latest = p.createdAt;
        }
      });

      // KPIs
      const orphanedProps = enrichedProps.filter(p => p.usageStatus === "🔴 Huérfana").length;
      const offWorkflows = allWorkflows.filter(wf => wf.enabled === false).length;
      const zombieWorkflows = allWorkflows.filter(wf => wf.enabled === true && (wf.enrollmentCount || 0) === 0).length;
      const trashWorkflows = allWorkflows.filter(wf => /test|prueba|copy|backup|old/i.test(wf.name || "")).length;
      const zeroSubmForms = allForms.filter(f => (f.submissions || f.submitCount || 0) === 0).length;
      const orphanedLists = allLists.filter(l => {
        // Simple heuristic: if list has 0 size
        return (l.size || l.listSize || 0) === 0;
      }).length;
      const inactiveUsers = allUsers.filter(u => {
        if (!u.lastLogin && !u.lastActiveAt) return true;
        const last = new Date(u.lastLogin || u.lastActiveAt).getTime();
        return (Date.now() - last) > 90 * 86400000;
      }).length;

      // Pipelines without required properties
      const pipelinesNoReq = allPipelines.filter(pl =>
        (pl.stages || []).every(st => !(st.requiredProperties || []).length)
      ).length;

      // Props by object
      const propsByObj = {};
      objectTypes.forEach(ot => { propsByObj[ot] = enrichedProps.filter(p => p.objectType === ot).length; });

      // Props by group
      const propsByGroup = {};
      enrichedProps.forEach(p => {
        const g = p.groupName || "Sin grupo";
        propsByGroup[g] = (propsByGroup[g] || 0) + 1;
      });

      const result = {
        properties: enrichedProps,
        workflows: allWorkflows,
        pipelines: allPipelines,
        forms: allForms,
        lists: allLists,
        users: allUsers,
        owners: allOwners,
        heritage,
        duplicates: dupeGroups,
        warnings,
        kpis: {
          totalProps: enrichedProps.length,
          orphanedProps,
          orphanedPropsPct: enrichedProps.length ? Math.round(orphanedProps / enrichedProps.length * 100) : 0,
          propsByObj,
          propsByGroup,
          totalWorkflows: allWorkflows.length,
          offWorkflows,
          zombieWorkflows,
          trashWorkflows,
          totalPipelines: allPipelines.length,
          pipelinesNoReq,
          totalForms: allForms.length,
          zeroSubmForms,
          totalLists: allLists.length,
          orphanedLists,
          totalUsers: allUsers.length,
          inactiveUsers,
        },
      };

      scanDataRef.current = result;
      setScanData(result);
      setScanDone(true);
      setActiveTab("overview");
    } catch (err) {
      setError(`Error en scan: ${err.message || JSON.stringify(err)}`);
    } finally {
      setScanning(false);
    }
  }, [token]);

  const kpis = scanData?.kpis;

  // Tabs
  const tabs = [
    { id:"overview", label:"Resumen", icon:"📊" },
    { id:"properties", label:`Propiedades (${kpis?.totalProps || 0})`, icon:"🏷" },
    { id:"workflows", label:`Workflows (${kpis?.totalWorkflows || 0})`, icon:"⚙️" },
    { id:"pipelines", label:`Pipelines (${kpis?.totalPipelines || 0})`, icon:"🔀" },
    { id:"forms", label:`Forms (${kpis?.totalForms || 0})`, icon:"📝" },
    { id:"lists", label:`Listas (${kpis?.totalLists || 0})`, icon:"📋" },
    { id:"users", label:`Usuarios (${kpis?.totalUsers || 0})`, icon:"👥" },
    { id:"heritage", label:"Herencia", icon:"🏗" },
  ];

  /* ═══ RENDER ═══ */
  return (
    <div style={{ fontFamily:font, background:tk.bg, minHeight:"100vh", color:tk.text }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        @keyframes scanGlow { 0%,100%{box-shadow:0 0 20px ${tk.cyan}20} 50%{box-shadow:0 0 40px ${tk.cyan}40} }
        input::placeholder{color:${tk.textTer}}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:${tk.bg}}
        ::-webkit-scrollbar-thumb{background:${tk.border};border-radius:3px}
      `}</style>

      {/* HEADER */}
      <div style={{ background:`linear-gradient(135deg, ${tk.navy} 0%, #0A0D1A 100%)`, padding:"0 28px", height:56, display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${tk.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg,${tk.purple},${tk.cyan})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:"#fff" }}>🔍</div>
          <div>
            <h1 style={{ margin:0, color:"#fff", fontSize:15, fontWeight:800, letterSpacing:"0.06em" }}>FOCUX SCAN</h1>
            <p style={{ margin:0, color:tk.textTer, fontSize:10, fontWeight:500, letterSpacing:"0.1em" }}>PORTAL INVENTORY SCANNER — HUBSPOT API v3</p>
          </div>
        </div>
        {scanDone && (
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:11, color:tk.textSec }}>{clientName || "Portal"}</span>
            <button onClick={() => { setScanDone(false); setScanData(null); setActiveTab("overview"); }}
              style={{ padding:"6px 16px", borderRadius:8, border:`1px solid ${tk.border}`, background:"transparent", color:tk.textSec, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:font }}>
              ↻ Nuevo Scan
            </button>
          </div>
        )}
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"28px 24px" }}>
        {/* TOKEN INPUT + SCAN BUTTON */}
        {!scanDone && (
          <div style={{ animation:"slideUp 0.4s ease" }}>
            <div style={{ background:tk.card, borderRadius:14, padding:24, border:`1px solid ${tk.border}`, marginBottom:16 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:tk.textSec, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>Nombre de la Empresa</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)}
                placeholder="Ej: Constructora Jiménez"
                style={{ width:"100%", padding:"12px 16px", borderRadius:10, border:`1.5px solid ${tk.border}`, background:tk.bg, color:tk.text, fontSize:14, fontFamily:font, outline:"none", boxSizing:"border-box" }}
              />
              <p style={{ margin:"6px 0 0", fontSize:10, color:tk.textTer }}>Este nombre aparecerá en el PDF del reporte ejecutivo</p>
            </div>

            {/* SETUP GUIDE */}
            <div style={{ background:tk.card, borderRadius:14, padding:20, border:`1px solid ${tk.border}`, marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div>
                  <p style={{ margin:0, fontSize:13, fontWeight:700, color:tk.text }}>¿Primera vez? Configura el acceso al portal</p>
                  <p style={{ margin:"4px 0 0", fontSize:11, color:tk.textSec }}>El cliente debe crear una Private App en HubSpot con los permisos necesarios.</p>
                </div>
                <a href="/FocuxScan_Setup_Guide.pdf" download
                  style={{ padding:"8px 18px", borderRadius:8, border:`1.5px solid ${tk.purple}`, background:tk.purple+"15", color:tk.purple, fontSize:11, fontWeight:700, textDecoration:"none", fontFamily:font, whiteSpace:"nowrap", cursor:"pointer" }}>
                  📋 Descargar Guía
                </a>
              </div>
              <div style={{ background:tk.bg, borderRadius:10, padding:16, border:`1px solid ${tk.border}` }}>
                <p style={{ margin:"0 0 8px", fontSize:10, fontWeight:700, color:tk.textSec, textTransform:"uppercase", letterSpacing:"0.06em" }}>Pasos rápidos</p>
                <div style={{ fontSize:11, color:tk.textSec, lineHeight:"1.8" }}>
                  <p style={{ margin:"0 0 4px" }}><span style={{ color:tk.purple, fontWeight:700 }}>1.</span> El cliente va a <span style={{ color:tk.text }}>Settings → Integrations → Private Apps</span></p>
                  <p style={{ margin:"0 0 4px" }}><span style={{ color:tk.purple, fontWeight:700 }}>2.</span> Crea una nueva app con nombre <span style={{ color:tk.text }}>"Focux Scan"</span></p>
                  <p style={{ margin:"0 0 4px" }}><span style={{ color:tk.purple, fontWeight:700 }}>3.</span> Activa los <span style={{ color:tk.text }}>10 scopes</span> listados en la guía (solo lectura)</p>
                  <p style={{ margin:"0 0 4px" }}><span style={{ color:tk.purple, fontWeight:700 }}>4.</span> Crea la app y copia el <span style={{ color:tk.text }}>Access Token</span></p>
                  <p style={{ margin:0 }}><span style={{ color:tk.purple, fontWeight:700 }}>5.</span> Te envía el token → lo pegas abajo y escaneas</p>
                </div>
                <p style={{ margin:"10px 0 0", fontSize:10, color:tk.green }}>🔒 El token es solo de lectura — no modifica ni elimina nada del portal.</p>
              </div>
            </div>

            <div style={{ background:tk.card, borderRadius:14, padding:24, border:`1px solid ${tk.border}`, marginBottom:24 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:tk.textSec, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>Private App Token</label>
              <div style={{ display:"flex", gap:12 }}>
                <input type="password" value={token} onChange={e => setToken(e.target.value)}
                  placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  style={{ flex:1, padding:"12px 16px", borderRadius:10, border:`1.5px solid ${tk.border}`, background:tk.bg, color:tk.text, fontSize:13, fontFamily:mono, outline:"none" }}
                  onKeyDown={e => { if (e.key === "Enter" && !scanning) startScan(); }}
                />
                <button onClick={startScan} disabled={scanning || !token.trim()}
                  style={{
                    padding:"12px 32px", borderRadius:10, border:"none", fontSize:14, fontWeight:700,
                    fontFamily:font, cursor: scanning || !token.trim() ? "default" : "pointer",
                    background: scanning ? tk.border : `linear-gradient(135deg, ${tk.purple}, ${tk.cyan})`,
                    color:"#fff", letterSpacing:"0.03em",
                    boxShadow: scanning || !token.trim() ? "none" : `0 4px 20px ${tk.accentGlow}`,
                    opacity: scanning || !token.trim() ? 0.5 : 1,
                    animation: scanning ? "scanGlow 2s infinite" : "none",
                  }}>
                  {scanning ? "Escaneando..." : "Escanear Portal"}
                </button>
              </div>
              <p style={{ margin:"8px 0 0", fontSize:10, color:tk.textTer }}>
                Scopes requeridos: crm.objects.contacts.read, crm.schemas.contacts.read, crm.schemas.companies.read, crm.schemas.deals.read, crm.schemas.tickets.read, automation, forms, crm.lists.read, settings.users.read, crm.objects.owners.read
              </p>
            </div>

            {scanning && <ProgressBar steps={scanSteps} current={scanStep} />}
          </div>
        )}

        {error && (
          <div style={{ padding:"14px 18px", background:tk.redBg, borderRadius:10, borderLeft:`3px solid ${tk.red}`, marginBottom:20 }}>
            <p style={{ margin:0, fontSize:12, color:tk.red, fontWeight:600 }}>{error}</p>
          </div>
        )}

        {/* RESULTS */}
        {scanDone && scanData && (
          <div style={{ animation:"slideUp 0.5s ease" }}>
            {/* Tab Bar */}
            <div style={{ display:"flex", gap:4, marginBottom:24, overflowX:"auto", paddingBottom:4 }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding:"8px 16px", borderRadius:8, border: activeTab === tab.id ? `1.5px solid ${tk.cyan}` : `1px solid ${tk.border}`,
                    background: activeTab === tab.id ? tk.cyan + "15" : "transparent",
                    color: activeTab === tab.id ? tk.cyan : tk.textSec,
                    fontSize:12, fontWeight:700, fontFamily:font, cursor:"pointer", whiteSpace:"nowrap",
                    transition:"all 0.2s ease",
                  }}>
                  {tab.icon} {tab.label}
                </button>
              ))}
              {/* Export buttons */}
              <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                <button onClick={() => generateScanPDF(scanData, clientName || "Portal")}
                  style={{ padding:"8px 16px", borderRadius:8, border:`1.5px solid ${tk.purple}`, background:tk.purple+"15", color:tk.purple, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:font }}>
                  📄 PDF Report
                </button>
                <button onClick={() => exportExcel(scanData, clientName || "Portal")}
                  style={{ padding:"8px 16px", borderRadius:8, border:`1px solid ${tk.green}`, background:tk.greenBg, color:tk.green, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:font }}>
                  📥 Excel
                </button>
              </div>
            </div>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === "overview" && (
              <div>
                {/* Scan warnings */}
                {scanData.warnings?.length > 0 && (
                  <div style={{ padding:"14px 18px", background:tk.amberBg, borderRadius:10, borderLeft:`3px solid ${tk.amber}`, marginBottom:20 }}>
                    <p style={{ margin:"0 0 6px", fontSize:12, color:tk.amber, fontWeight:700 }}>⚠ Advertencias del Scan ({scanData.warnings.length})</p>
                    {scanData.warnings.map((w, i) => (
                      <p key={i} style={{ margin:"2px 0", fontSize:11, color:tk.textSec }}>{w}</p>
                    ))}
                    <p style={{ margin:"8px 0 0", fontSize:10, color:tk.textTer }}>Verifica que la Private App tenga todos los scopes necesarios.</p>
                  </div>
                )}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:12, marginBottom:24 }}>
                  <KpiCard value={kpis.totalProps} label="Propiedades Custom" sub={`${kpis.orphanedPropsPct}% huérfanas`} color={tk.cyan} />
                  <KpiCard value={kpis.orphanedProps} label="Huérfanas" sub="Sin referencia" color={tk.red} />
                  <KpiCard value={kpis.totalWorkflows} label="Workflows" sub={`${kpis.offWorkflows} apagados`} color={tk.teal} />
                  <KpiCard value={kpis.zombieWorkflows} label="Zombies" sub="Activos, 0 inscritos" color={tk.amber} />
                  <KpiCard value={kpis.totalPipelines} label="Pipelines" sub={`${kpis.pipelinesNoReq} sin req.`} color={tk.purple} />
                  <KpiCard value={kpis.totalForms} label="Formularios" sub={`${kpis.zeroSubmForms} sin subm.`} color={tk.green} />
                  <KpiCard value={kpis.totalLists} label="Listas" sub={`${kpis.orphanedLists} vacías`} color={tk.blue} />
                  <KpiCard value={kpis.totalUsers} label="Usuarios" sub={`${kpis.inactiveUsers} inactivos`} color={tk.cyan} />
                </div>

                {/* Props by object */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
                  <div style={{ background:tk.card, borderRadius:12, border:`1px solid ${tk.border}`, padding:20 }}>
                    <h3 style={{ margin:"0 0 12px", fontSize:13, fontWeight:700, color:tk.text }}>Propiedades por Objeto</h3>
                    {Object.entries(kpis.propsByObj).map(([obj, count]) => (
                      <div key={obj} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${tk.border}20` }}>
                        <span style={{ fontSize:12, color:tk.textSec, textTransform:"capitalize" }}>{obj}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:tk.text }}>{count}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:tk.card, borderRadius:12, border:`1px solid ${tk.border}`, padding:20 }}>
                    <h3 style={{ margin:"0 0 12px", fontSize:13, fontWeight:700, color:tk.text }}>Top Grupos de Propiedades</h3>
                    {Object.entries(kpis.propsByGroup).sort((a,b) => b[1]-a[1]).slice(0,8).map(([group, count]) => (
                      <div key={group} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${tk.border}20` }}>
                        <span style={{ fontSize:12, color:tk.textSec }}>{group}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:tk.text }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Duplicates warning */}
                {scanData.duplicates.length > 0 && (
                  <div style={{ background:tk.amberBg, borderRadius:12, border:`1px solid ${tk.amber}30`, padding:20, marginBottom:24 }}>
                    <h3 style={{ margin:"0 0 8px", fontSize:13, fontWeight:700, color:tk.amber }}>⚠ Posibles Duplicados ({scanData.duplicates.length})</h3>
                    <div style={{ maxHeight:200, overflow:"auto" }}>
                      {scanData.duplicates.slice(0, 20).map(([a, b], i) => (
                        <div key={i} style={{ fontSize:12, color:tk.text, padding:"4px 0" }}>
                          <span style={{ color:tk.amber, fontWeight:600 }}>{a}</span> ↔ <span style={{ color:tk.amber, fontWeight:600 }}>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Workflow breakdown */}
                {kpis.trashWorkflows > 0 && (
                  <div style={{ background:tk.redBg, borderRadius:12, border:`1px solid ${tk.red}30`, padding:20, marginBottom:24 }}>
                    <h3 style={{ margin:"0 0 4px", fontSize:13, fontWeight:700, color:tk.red }}>🗑 {kpis.trashWorkflows} Workflows Basura</h3>
                    <p style={{ margin:0, fontSize:11, color:tk.textSec }}>Nombres con "test", "prueba", "copy", "backup", "old"</p>
                  </div>
                )}
              </div>
            )}

            {/* ── PROPERTIES TAB ── */}
            {activeTab === "properties" && (
              <ScanTable
                columns={[
                  { key:"_idx", label:"#", render: (r) => scanData.properties.indexOf(r)+1 },
                  { key:"objectType", label:"Objeto", render: r => <span style={{textTransform:"capitalize"}}>{r.objectType}</span> },
                  { key:"label", label:"Nombre" },
                  { key:"name", label:"Interno", mono:true, maxWidth:200 },
                  { key:"type", label:"Tipo" },
                  { key:"groupName", label:"Grupo" },
                  { key:"createdUserId", label:"Creado Por", render: r => {
                    const ownerMap = {};
                    (scanData.owners||[]).forEach(o => { if (o.userId) ownerMap[String(o.userId)] = o.email; });
                    (scanData.users||[]).forEach(u => { if (u.id) ownerMap[String(u.id)] = u.email; });
                    return ownerMap[String(r.createdUserId)] || r.createdUserId || "—";
                  }},
                  { key:"createdAt", label:"Fecha", render: r => fmtDate(r.createdAt) },
                  { key:"usageStatus", label:"Estado", render: r => <UsageBadge status={r.usageStatus} /> },
                  { key:"usageLocations", label:"Dónde", render: r => (r.usageLocations||[]).slice(0,2).join(", ") || "—", maxWidth:250 },
                ]}
                data={scanData.properties}
                searchKeys={["label","name","objectType","groupName","usageStatus"]}
              />
            )}

            {/* ── WORKFLOWS TAB ── */}
            {activeTab === "workflows" && (
              <ScanTable
                columns={[
                  { key:"_idx", label:"#", render: (r) => scanData.workflows.indexOf(r)+1 },
                  { key:"name", label:"Nombre", maxWidth:280 },
                  { key:"enabled", label:"Estado", render: r => <WfBadge wf={r} /> },
                  { key:"type", label:"Tipo", render: r => r.type || r.flowType || "—" },
                  { key:"objectTypeId", label:"Objeto" },
                  { key:"actions", label:"Acciones", render: r => (r.actions||[]).length },
                  { key:"createdBy", label:"Creado Por", maxWidth:200, render: r => {
                    const ownerMap = {};
                    (scanData.owners||[]).forEach(o => { if (o.userId) ownerMap[String(o.userId)] = o.email; });
                    (scanData.users||[]).forEach(u => { if (u.id) ownerMap[String(u.id)] = u.email; });
                    return ownerMap[String(r.createdBy)] || r.createdBy || "—";
                  }},
                  { key:"insertedAt", label:"Creado", render: r => fmtDate(r.insertedAt || r.createdAt) },
                  { key:"updatedAt", label:"Editado", render: r => fmtAgo(r.updatedAt) },
                ]}
                data={scanData.workflows}
                searchKeys={["name","type","objectTypeId","createdBy"]}
              />
            )}

            {/* ── PIPELINES TAB ── */}
            {activeTab === "pipelines" && (
              <div>
                {scanData.pipelines.map((pl, pi) => (
                  <div key={pi} style={{ background:tk.card, borderRadius:12, border:`1px solid ${tk.border}`, padding:20, marginBottom:16 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                      <div>
                        <h3 style={{ margin:0, fontSize:14, fontWeight:700, color:tk.text }}>{pl.label}</h3>
                        <span style={{ fontSize:11, color:tk.textSec, textTransform:"capitalize" }}>{pl.objectType} · {(pl.stages||[]).length} etapas</span>
                      </div>
                      <span style={{
                        padding:"4px 10px", borderRadius:6, fontSize:10, fontWeight:700,
                        background: (pl.stages||[]).some(s => (s.requiredProperties||[]).length) ? tk.greenBg : tk.amberBg,
                        color: (pl.stages||[]).some(s => (s.requiredProperties||[]).length) ? tk.green : tk.amber,
                      }}>
                        {(pl.stages||[]).some(s => (s.requiredProperties||[]).length) ? "Campos req. ✓" : "Sin campos req."}
                      </span>
                    </div>
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead>
                          <tr style={{ background:tk.bg }}>
                            <th style={{ padding:"8px 12px", textAlign:"left", color:tk.textSec, fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:`1px solid ${tk.border}` }}>Etapa</th>
                            <th style={{ padding:"8px 12px", textAlign:"left", color:tk.textSec, fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:`1px solid ${tk.border}` }}>Orden</th>
                            <th style={{ padding:"8px 12px", textAlign:"left", color:tk.textSec, fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:`1px solid ${tk.border}` }}>Probabilidad</th>
                            <th style={{ padding:"8px 12px", textAlign:"left", color:tk.textSec, fontWeight:700, fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:`1px solid ${tk.border}` }}>Campos Requeridos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(pl.stages||[]).sort((a,b) => (a.displayOrder||0)-(b.displayOrder||0)).map((st, si) => (
                            <tr key={si} style={{ borderBottom:`1px solid ${tk.border}20` }}>
                              <td style={{ padding:"8px 12px", color:tk.text }}>{st.label}</td>
                              <td style={{ padding:"8px 12px", color:tk.textSec }}>{st.displayOrder}</td>
                              <td style={{ padding:"8px 12px", color:tk.textSec }}>{st.metadata?.probability ? `${(parseFloat(st.metadata.probability)*100).toFixed(0)}%` : "—"}</td>
                              <td style={{ padding:"8px 12px", color: (st.requiredProperties||[]).length ? tk.green : tk.textTer, fontFamily:mono, fontSize:11 }}>
                                {(st.requiredProperties||[]).join(", ") || "Ninguno"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {scanData.pipelines.length === 0 && <p style={{ color:tk.textTer, textAlign:"center", padding:40 }}>No se encontraron pipelines</p>}
              </div>
            )}

            {/* ── FORMS TAB ── */}
            {activeTab === "forms" && (
              <ScanTable
                columns={[
                  { key:"_idx", label:"#", render: (r) => scanData.forms.indexOf(r)+1 },
                  { key:"name", label:"Nombre", maxWidth:280 },
                  { key:"formType", label:"Tipo" },
                  { key:"_fields", label:"Campos", render: r => (r.fieldGroups||r.formFieldGroups||[]).reduce((a,g) => a + (g.fields||[]).length, 0) },
                  { key:"_submissions", label:"Submissions", render: r => r.submissions || r.submitCount || 0, color: r => (r.submissions||r.submitCount||0) === 0 ? tk.red : tk.text },
                  { key:"createdBy", label:"Creado Por", maxWidth:200, render: r => r.createdBy || r.createdUserId || "—" },
                  { key:"createdAt", label:"Creado", render: r => fmtDate(r.createdAt) },
                  { key:"updatedAt", label:"Editado", render: r => fmtAgo(r.updatedAt) },
                ]}
                data={scanData.forms}
                searchKeys={["name","formType","createdBy"]}
              />
            )}

            {/* ── LISTS TAB ── */}
            {activeTab === "lists" && (
              <ScanTable
                columns={[
                  { key:"_idx", label:"#", render: (r) => scanData.lists.indexOf(r)+1 },
                  { key:"name", label:"Nombre", maxWidth:280 },
                  { key:"_type", label:"Tipo", render: r => r.listType || r.processingType || "—" },
                  { key:"_size", label:"Tamaño", render: r => r.size || r.listSize || 0, color: r => (r.size||r.listSize||0) === 0 ? tk.red : tk.text },
                  { key:"createdBy", label:"Creado Por", maxWidth:200, render: r => r.createdBy || r.authorUserId || "—" },
                  { key:"createdAt", label:"Creado", render: r => fmtDate(r.createdAt) },
                  { key:"updatedAt", label:"Actualizado", render: r => fmtAgo(r.updatedAt) },
                ]}
                data={scanData.lists}
                searchKeys={["name","createdBy"]}
              />
            )}

            {/* ── USERS TAB ── */}
            {activeTab === "users" && (
              <ScanTable
                columns={[
                  { key:"_idx", label:"#", render: (r) => scanData.users.indexOf(r)+1 },
                  { key:"_name", label:"Nombre", render: r => `${r.firstName||""} ${r.lastName||""}`.trim() || "—" },
                  { key:"email", label:"Email", mono:true },
                  { key:"roleId", label:"Rol", render: r => r.roleId || r.role || "—" },
                  { key:"_lastLogin", label:"Último Login", render: r => fmtAgo(r.lastLogin || r.lastActiveAt),
                    color: r => {
                      const last = r.lastLogin || r.lastActiveAt;
                      if (!last) return tk.red;
                      return (Date.now() - new Date(last).getTime()) > 90*86400000 ? tk.red : tk.text;
                    }
                  },
                  { key:"superAdmin", label:"Super Admin", render: r => r.superAdmin ? "✓" : "" , color: r => r.superAdmin ? tk.amber : tk.textTer },
                ]}
                data={scanData.users}
                searchKeys={["email","firstName","lastName","roleId"]}
              />
            )}

            {/* ── HERITAGE TAB ── */}
            {activeTab === "heritage" && (
              <div>
                <h3 style={{ margin:"0 0 16px", fontSize:14, fontWeight:700, color:tk.text }}>Herencia de Agencias — ¿Quién creó qué?</h3>
                <p style={{ margin:"0 0 20px", fontSize:12, color:tk.textSec }}>Propiedades custom agrupadas por creador. Muestra cuántas manos han tocado el portal.</p>
                {Object.entries(scanData.heritage).sort((a,b) => b[1].count - a[1].count).map(([creator, info], i) => {
                  const pct = scanData.kpis.totalProps ? Math.round(info.count / scanData.kpis.totalProps * 100) : 0;
                  return (
                    <div key={i} style={{ background:tk.card, borderRadius:10, border:`1px solid ${tk.border}`, padding:"14px 18px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ flex:1 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:tk.text }}>{creator}</span>
                        <div style={{ display:"flex", gap:16, marginTop:4 }}>
                          <span style={{ fontSize:11, color:tk.textSec }}>{info.count} propiedades ({pct}%)</span>
                          {info.earliest && <span style={{ fontSize:11, color:tk.textTer }}>{fmtDate(info.earliest)} → {fmtDate(info.latest)}</span>}
                        </div>
                      </div>
                      <div style={{ width:120, height:6, borderRadius:3, background:tk.border, overflow:"hidden" }}>
                        <div style={{ width:`${pct}%`, height:6, borderRadius:3, background:`linear-gradient(90deg,${tk.purple},${tk.cyan})` }} />
                      </div>
                    </div>
                  );
                })}
                {Object.keys(scanData.heritage).length === 0 && <p style={{ color:tk.textTer, textAlign:"center", padding:40 }}>No hay datos de herencia</p>}
              </div>
            )}
          </div>
        )}

        {/* FOOTER */}
        <div style={{ marginTop:40, textAlign:"center", padding:16 }}>
          <p style={{ margin:0, fontSize:10, color:tk.textTer, letterSpacing:"0.1em" }}>
            FOCUX SCAN v1.0 — FOCUXAI ENGINE™ — DETERMINISTIC. AUDITABLE. UNSTOPPABLE.
          </p>
        </div>
      </div>
    </div>
  );
}
