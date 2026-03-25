// @ts-nocheck
"use client";
import { useState, useEffect, useCallback, useMemo } from "react";

/* ═══ STORAGE ═══ */
const SK = "focuxai-v4";
async function ld() { try { const raw = localStorage.getItem(SK); return raw ? JSON.parse(raw) : null; } catch { return null; } }
async function sv(d) { try { localStorage.setItem(SK, JSON.stringify(d)); } catch (e) { console.error(e); } }

/* ═══ DEFAULTS ═══ */
const DEF_CH = ["Pauta Facebook-IG","Pauta Google","Sitio Web","Mail Marketing","Redes Sociales Orgánicas","Búsqueda Orgánica","Sala de Ventas Física","Referido","Importación Base de Datos","Feria Inmobiliaria","Canal WhatsApp","Llamada Telefónica","Aliado / Portal Inmobiliario","Recompra"];
const DEF_CT = ["Valla / Carro Valla","Volante","Emisora","Prensa / Revista","Activación Física","Vitrina Salas","Ascensores","SMS"];
const DEF_EP = ["Lead Nuevo","Intento de Contacto","Contactado en Seguimiento","Calificado por Prospección","Presentación Virtual","Lead Descartado por Prospección"];
const DEF_ES = ["Lead Nuevo Sala de Ventas","Intento Contacto Sala","Contactado Sala en Seguimiento","Visitó Sala de Ventas","Cotización Enviada","Cliente Potencial (Opcionó)","Cliente Negocio Ganado","Lead Descartado por Ventas"];
const DEF_PL = [{n:"Cotización Solicitada",p:10},{n:"Opcionó",p:40},{n:"Consignó",p:60},{n:"Entregó Documentos",p:70},{n:"Se vinculó a Fiducia",p:80},{n:"Firmó Documentos",p:90},{n:"Venta Formalizada",p:100},{n:"Perdida",p:0}];
const DEF_MD = ["Ingresos insuficientes","Crédito Denegado","Centrales de Riesgo","Precio del proyecto","Ubicación","Área","Acabados","Tiempos de Entrega","Parqueaderos","Compró en competencia","No volvió a contestar","Datos Errados","No interesado","Aplaza Compra","No aplican subsidios","Licencia Turismo"];
const DEF_MP = ["Calamidad Doméstica","Compró en Otro Proyecto","Cambio condiciones","No firma contratos","Dejó de contestar","No salió préstamo","No salió subsidio","Eligió otra unidad"];
const DEF_NIVELES = ["AAA","AA","A","B","C","D"];
const DEF_VARS = [
  {id:"ingresos",label:"Rango de Ingresos",on:true,opts:[]},
  {id:"ahorros",label:"Tiene Ahorros o Cesantías",on:true,opts:["Sí","No"]},
  {id:"proposito",label:"Propósito de Compra",on:true,opts:["Vivienda","Inversión"]},
  {id:"credito",label:"Crédito Preaprobado",on:false,opts:["Sí","No"]},
  {id:"subsidios",label:"Aplica a Subsidios",on:false,opts:["Sí","No"]},
  {id:"horario",label:"Horario de Contacto",on:true,opts:["Lunes a Viernes 9am-12m","Lunes a Viernes 12m-2pm","Lunes a Viernes 2pm-6pm","Lunes a Viernes 6pm-8pm","Sábados en la Mañana"]},
  {id:"horizonte",label:"Horizonte de Compra",on:true,opts:["Inmediato","Antes de 3 meses","De 3 a 6 meses","Más de 6 meses"]},
];
const DEF_REGLAS = [
  {si:"Cumple ingreso mínimo",y:"Con ahorros",entonces:"AAA"},
  {si:"Cumple ingreso mínimo",y:"Sin ahorros",entonces:"AA"},
  {si:"Un nivel debajo",y:"Con ahorros",entonces:"A"},
  {si:"Un nivel debajo",y:"Sin ahorros",entonces:"B"},
  {si:"No cumple requisito",y:"Cualquiera",entonces:"C"},
  {si:"Inversionista",y:"Cualquiera",entonces:"AAA"},
  {si:"No desea ser contactado",y:"Cualquiera",entonces:"D"},
];

const INIT = {
  step:0, nombreConst:"", dominio:"", nombrePipeline:"", triggerDeal:"Cotización Solicitada",
  diasSinAct:7, pais:"Colombia",
  hubSales:"Pro", hubMarketing:"Pro", hubService:"No", hubContent:"No",
  tieneCotizador:false, tieneAgente:false,
  crmOrigen:"Ninguno", volRegistros:"", tieneAdj:false,
  macros:[],
  chStd:DEF_CH.map(n=>({n,a:true})), chTr:DEF_CT.map(n=>({n,a:false})), chCu:[],
  rangos:["Menos de $2M","Entre $2M y $4M","Entre $4M y $8M","Entre $8M y $15M","Más de $15M"],
  niveles:[...DEF_NIVELES], varsCalif:DEF_VARS.map(v=>({...v})), reglas:DEF_REGLAS.map(r=>({...r})),
  usaCalif:true, umbral:75,
  etP:[...DEF_EP], etS:[...DEF_ES],
  pipeline:[...DEF_PL.map(p=>({...p}))],
  moD:[...DEF_MD], moP:[...DEF_MP],
  nomAgente:"", tonoAgente:"Profesional y cálido", wabaNum:"", tiposAgente:["AAA","AA","A"],
  ex:{}, vn:{},
};

/* ═══ DESIGN TOKENS ═══ */
const font = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
const tk = {
  navy:"#211968", blue:"#1A4BA8", teal:"#0D7AB5", cyan:"#2099D8",
  bg:"#FAFBFD", card:"#FFFFFF", border:"#E8ECF1", borderLight:"#F1F4F8",
  text:"#1A1D26", textSec:"#6B7280", textTer:"#9CA3AF",
  green:"#10B981", red:"#EF4444", amber:"#F59E0B",
  greenBg:"#ECFDF5", redBg:"#FEF2F2", amberBg:"#FFFBEB",
  accent: "#0D7AB5", accentLight:"#E0F4FD",
};

/* ═══ UI PRIMITIVES ═══ */
const ss = { // shared styles
  label: { display:"block", fontSize:12, fontWeight:600, color:tk.text, marginBottom:4, letterSpacing:"0.01em" },
  input: { width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${tk.border}`, fontSize:13, color:tk.text, outline:"none", boxSizing:"border-box", fontFamily:font, transition:"border-color 0.2s, box-shadow 0.2s" },
  card: { border:`1px solid ${tk.border}`, borderRadius:12, padding:20, marginBottom:14, background:tk.card, position:"relative", transition:"box-shadow 0.2s" },
};

function Inp({ label, value, onChange, type="text", placeholder="", required=false, note="", mono=false }) {
  return (
    <div style={{ marginBottom:16 }}>
      {label && <label style={ss.label}>{label}{required && <span style={{color:tk.red}}> *</span>}</label>}
      <input type={type} value={value||""} onChange={e => onChange(type==="number" ? (+e.target.value||0) : e.target.value)}
        placeholder={placeholder}
        style={{...ss.input, fontFamily: mono ? "monospace" : font}}
        onFocus={e => { e.target.style.borderColor = tk.accent; e.target.style.boxShadow = `0 0 0 3px ${tk.accentLight}`; }}
        onBlur={e => { 
          e.target.style.borderColor = tk.border; e.target.style.boxShadow = "none";
          if(type==="email" && e.target.value) onChange(e.target.value.trim().toLowerCase());
          else if(type==="text" && e.target.value) onChange(e.target.value.trim());
        }} />
      {note && <p style={{ fontSize:11, color:tk.textTer, margin:"4px 0 0", lineHeight:1.4 }}>{note}</p>}
    </div>
  );
}

function MoneyInp({ label, value, onChange, placeholder="$0", required=false, note="" }) {
  const fmt = (v) => {
    if (!v && v !== 0) return "";
    const num = String(v).replace(/[^0-9]/g, "");
    if (!num) return "";
    return "$" + parseInt(num).toLocaleString("es-CO");
  };
  const raw = String(value||"").replace(/[^0-9]/g, "");
  const handleChange = (input) => {
    const digits = input.replace(/[^0-9]/g, "");
    onChange(digits);
  };
  return (
    <div style={{ marginBottom:16 }}>
      {label && <label style={ss.label}>{label}{required && <span style={{color:tk.red}}> *</span>}</label>}
      <input type="text" value={fmt(raw)} onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        style={{...ss.input}}
        onFocus={e => { e.target.style.borderColor = tk.accent; e.target.style.boxShadow = `0 0 0 3px ${tk.accentLight}`; }}
        onBlur={e => { e.target.style.borderColor = tk.border; e.target.style.boxShadow = "none"; }} />
      {note && <p style={{ fontSize:11, color:tk.textTer, margin:"4px 0 0", lineHeight:1.4 }}>{note}</p>}
    </div>
  );
}

function Sel({ label, value, onChange, options, required=false, note="" }) {
  return (
    <div style={{ marginBottom:16 }}>
      {label && <label style={ss.label}>{label}{required && <span style={{color:tk.red}}> *</span>}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{...ss.input, background:tk.card, cursor:"pointer", appearance:"auto"}}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {note && <p style={{ fontSize:11, color:tk.textTer, margin:"4px 0 0" }}>{note}</p>}
    </div>
  );
}

function Chk({ label, checked, onChange, desc="" }) {
  return (
    <label style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8, fontSize:13, color:tk.text, cursor:"pointer", lineHeight:1.4 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width:18, height:18, accentColor:tk.accent, marginTop:1, flexShrink:0 }} />
      <div>
        <span style={{fontWeight:500}}>{label}</span>
        {desc && <span style={{display:"block", fontSize:11, color:tk.textTer, marginTop:1}}>{desc}</span>}
      </div>
    </label>
  );
}

function Card({ children, title, subtitle, onRemove, accent=false }) {
  return (
    <div style={{...ss.card, borderLeft: accent ? `3px solid ${tk.accent}` : undefined }}>
      {(title || onRemove) && (
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div>
            {title && <h4 style={{ margin:0, color:tk.navy, fontSize:14, fontWeight:700 }}>{title}</h4>}
            {subtitle && <p style={{ margin:"2px 0 0", fontSize:11, color:tk.textTer }}>{subtitle}</p>}
          </div>
          {onRemove && <button onClick={onRemove} style={{ background:"none", border:"none", color:tk.textTer, cursor:"pointer", fontSize:18, fontWeight:400, lineHeight:1, padding:"0 4px" }} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>}
        </div>
      )}
      {children}
    </div>
  );
}

function AddBtn({ onClick, label }) {
  return (
    <button onClick={onClick} style={{
      display:"flex", alignItems:"center", justifyContent:"center", gap:6, width:"100%",
      padding:"11px 16px", background:tk.bg, border:`1.5px dashed ${tk.border}`, borderRadius:10,
      color:tk.textSec, fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:14,
      transition:"all 0.2s", fontFamily:font,
    }} onMouseOver={e => { e.currentTarget.style.borderColor = tk.accent; e.currentTarget.style.color = tk.accent; }}
       onMouseOut={e => { e.currentTarget.style.borderColor = tk.border; e.currentTarget.style.color = tk.textSec; }}>
      <span style={{fontSize:18, lineHeight:1}}>+</span> {label}
    </button>
  );
}

function SectionHead({ children, sub="" }) {
  return (
    <div style={{ marginTop:20, marginBottom:12 }}>
      <h3 style={{ margin:0, fontSize:13, fontWeight:700, color:tk.navy, textTransform:"uppercase", letterSpacing:"0.05em" }}>{children}</h3>
      {sub && <p style={{margin:"2px 0 0", fontSize:11, color:tk.textTer}}>{sub}</p>}
    </div>
  );
}

function Badge({ text, color=tk.accent }) {
  return <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:10, fontSize:10, fontWeight:600, background:color+"18", color, letterSpacing:"0.02em" }}>{text}</span>;
}

function Pill({ text, onRemove, color=tk.accent }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:4, padding:"5px 12px",
      borderRadius:20, fontSize:12, fontWeight:500, background:color+"12", color, border:`1px solid ${color}30`,
    }}>
      {text}
      {onRemove && <button onClick={onRemove} style={{ background:"none", border:"none", color, cursor:"pointer", fontSize:14, padding:0, lineHeight:1, marginLeft:2, fontWeight:700 }}>×</button>}
    </span>
  );
}

function ChipEditor({ items, onChange, label, placeholder="Agregar...", note="" }) {
  const [val, setVal] = useState("");
  const add = () => { if (val.trim() && !items.includes(val.trim())) { onChange([...items, val.trim()]); setVal(""); } };
  return (
    <div style={{ marginBottom:16 }}>
      {label && <label style={ss.label}>{label}</label>}
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:8, minHeight:32 }}>
        {items.map((item, i) => <Pill key={i} text={item} onRemove={() => { const n=[...items]; n.splice(i,1); onChange(n); }} />)}
        {items.length === 0 && <span style={{fontSize:12, color:tk.textTer, fontStyle:"italic", paddingTop:6}}>Ninguno definido</span>}
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if(e.key==="Enter"){e.preventDefault(); add();} }}
          placeholder={placeholder} style={{...ss.input, flex:1}} />
        <button onClick={add} disabled={!val.trim()} style={{
          padding:"10px 18px", borderRadius:8, border:"none", background: val.trim() ? tk.accent : tk.border,
          color: val.trim() ? "#fff" : tk.textTer, fontSize:13, cursor: val.trim() ? "pointer" : "default",
          fontWeight:600, fontFamily:font, transition:"all 0.2s",
        }}>Agregar</button>
      </div>
      {note && <p style={{fontSize:11, color:tk.textTer, margin:"4px 0 0"}}>{note}</p>}
    </div>
  );
}

function InfoBox({ children, type="info" }) {
  const colors = { info: {bg:tk.accentLight, border:tk.accent, text:tk.navy}, warn: {bg:tk.amberBg, border:tk.amber, text:"#92400E"}, success: {bg:tk.greenBg, border:tk.green, text:"#065F46"} };
  const c = colors[type] || colors.info;
  return (
    <div style={{ padding:"12px 14px", background:c.bg, borderRadius:8, borderLeft:`3px solid ${c.border}`, marginBottom:14 }}>
      <p style={{ margin:0, fontSize:12, color:c.text, lineHeight:1.5 }}>{children}</p>
    </div>
  );
}

function PasteModal({ open, onClose, onParse, cols, example, title, description }) {
  const [txt, setTxt] = useState("");
  if (!open) return null;
  const go = () => {
    const lines = txt.trim().split("\n").filter(Boolean);
    const rows = lines.map(l => l.split("\t").length > 1 ? l.split("\t") : l.split(";").map(c => c.trim()));
    const first = rows[0] || [];
    const isH = cols.some(c => first.some(cell => cell.toLowerCase().includes(c.label.toLowerCase())));
    onParse(isH ? rows.slice(1) : rows);
    setTxt(""); onClose();
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:1000, backdropFilter:"blur(4px)" }}>
      <div style={{ background:tk.card, borderRadius:16, padding:24, width:"92%", maxWidth:640, maxHeight:"85vh", overflow:"auto", boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div>
            <h3 style={{ margin:0, color:tk.navy, fontSize:18, fontWeight:700 }}>{title}</h3>
            {description && <p style={{margin:"4px 0 0", fontSize:12, color:tk.textSec}}>{description}</p>}
          </div>
          <button onClick={onClose} style={{ background:tk.bg, border:"none", width:32, height:32, borderRadius:8, fontSize:18, cursor:"pointer", color:tk.textSec, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        <div style={{ padding:12, background:tk.bg, borderRadius:10, marginBottom:14, border:`1px solid ${tk.border}` }}>
          <p style={{ fontSize:11, fontWeight:700, color:tk.navy, margin:"0 0 8px", textTransform:"uppercase", letterSpacing:"0.05em" }}>Columnas esperadas</p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>
            {cols.map((c,i) => (
              <span key={i} style={{ padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:600, background: c.required ? tk.accent+"15" : tk.bg, color: c.required ? tk.accent : tk.textSec, border:`1px solid ${c.required ? tk.accent+"30" : tk.border}` }}>
                {c.label}{c.required && " *"}
              </span>
            ))}
          </div>
          <p style={{ fontSize:11, color:tk.textTer, margin:0 }}>
            Copia un rango de celdas desde Excel o Google Sheets y pégalo aquí. Separador: tab (automático desde Excel) o punto y coma.
          </p>
          <div style={{ marginTop:8, padding:8, background:tk.card, borderRadius:6, fontFamily:"monospace", fontSize:11, color:tk.textSec, overflowX:"auto", whiteSpace:"pre" }}>
            {example}
          </div>
        </div>
        <textarea value={txt} onChange={e => setTxt(e.target.value)} placeholder="Pega tus datos aquí..."
          style={{ width:"100%", height:160, padding:12, borderRadius:10, border:`1.5px solid ${tk.border}`, fontSize:13, fontFamily:"monospace", resize:"vertical", boxSizing:"border-box", outline:"none" }}
          onFocus={e => e.target.style.borderColor = tk.accent}
          onBlur={e => e.target.style.borderColor = tk.border} />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14 }}>
          <span style={{ fontSize:12, color:tk.textTer }}>{txt.trim() ? `${txt.trim().split("\n").filter(Boolean).length} filas detectadas` : "Sin datos"}</span>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={onClose} style={{ padding:"9px 20px", borderRadius:8, border:`1.5px solid ${tk.border}`, background:tk.card, fontSize:13, cursor:"pointer", fontFamily:font, fontWeight:600, color:tk.textSec }}>Cancelar</button>
            <button onClick={go} disabled={!txt.trim()} style={{
              padding:"9px 24px", borderRadius:8, border:"none",
              background: txt.trim() ? `linear-gradient(135deg, ${tk.teal}, ${tk.blue})` : tk.border,
              color:"#fff", fontSize:13, cursor: txt.trim() ? "pointer" : "default",
              fontWeight:600, fontFamily:font, transition:"all 0.2s",
            }}>Importar datos</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ COMPLETENESS ═══ */
function calcPct(d, s) {
  const checks = [
    () => { let t=0,f=0; ["nombreConst","dominio","nombrePipeline"].forEach(k=>{t++;if(d[k])f++}); return Math.round(f/t*100); },
    () => { if(!d.macros.length)return 0; let t=0,f=0; d.macros.forEach(m=>{["nombre","ciudad","precioDesde"].forEach(k=>{t++;if(m[k])f++})}); return Math.round(f/t*100); },
    () => d.macros.some(m=>(m.torres||[]).length>0)?100:(d.macros.length?0:100),
    () => d.macros.some(m=>(m.asesores||[]).length>0)?100:(d.macros.length?0:100),
    () => d.chStd.some(c=>c.a)?100:0,
    () => d.usaCalif && d.niveles.length>=2 ? 100 : (!d.usaCalif ? 100 : 0),
    () => d.etP.length>0 && d.etS.length>0 ? 100 : 50,
    () => d.pipeline.length>=2 ? 100 : 0,
    () => d.moD.length>0 && d.moP.length>0 ? 100 : 50,
    () => !d.tieneAgente ? 100 : (d.nomAgente ? 100 : 0),
  ];
  return (checks[s] || (() => 100))();
}

/* ═══ VALIDATE ═══ */
function validate(d) {
  const w=[], e=[];
  if(!d.nombreConst) e.push("Falta nombre de la constructora");
  if(!d.dominio) e.push("Falta dominio web");
  if(!d.nombrePipeline) e.push("Falta nombre del pipeline");
  if(!d.macros.length) e.push("No hay macroproyectos");
  if(d.pipeline.length<2) e.push("Pipeline necesita al menos 2 etapas");
  d.macros.forEach((m,i) => {
    if(!m.nombre) e.push(`Macro ${i+1}: sin nombre`);
    if(!(m.torres||[]).length) w.push(`${m.nombre||`M${i+1}`}: sin torres/etapas`);
    if(!(m.asesores||[]).length) w.push(`${m.nombre||`M${i+1}`}: sin asesores`);
    if(d.usaCalif && !m.rangoMinimo) w.push(`${m.nombre||`M${i+1}`}: sin rango de ingreso mínimo`);
    if(!(m.buyers||[]).length) w.push(`${m.nombre||`M${i+1}`}: sin buyer personas`);
  });
  if(d.tieneAgente && !d.nomAgente) e.push("Agente activado sin nombre");
  return {w,e};
}

/* ═══ PROMPT GENERATOR ═══ */
/* ═══ MONEY FORMATTER ═══ */
const fmtMoney = (v) => { const n = String(v||"").replace(/[^0-9]/g,""); return n ? "$"+parseInt(n).toLocaleString("es-CO") : ""; };

function genPrompts(d) {
  const P=[], ms=d.macros||[];
  const mn = ms.map(m=>m.nombre).filter(Boolean).join(", ");
  const tn = ms.flatMap(m=>(m.torres||[]).map(t=>`${m.nombre} ${t.nombre}`)).filter(Boolean).join(", ");
  const allCh = [...d.chStd.filter(c=>c.a).map(c=>c.n),...d.chTr.filter(c=>c.a).map(c=>c.n),...d.chCu.filter(Boolean)].join(", ");
  const allEt = [...d.etP,...d.etS].filter(Boolean).join(", ");
  const pn = d.nombrePipeline||"Pipeline Ventas";
  const plStages = d.pipeline.map(s=>`${s.n} (${s.p}%)`).join(", ");

  // Helper: get opts for a varsCalif variable by id
  const getVarOpts = (id) => {
    const v = (d.varsCalif||[]).find(v => v.id === id);
    return v && v.on && (v.opts||[]).length ? v.opts.join(", ") : null;
  };

  // PRE-REQS (deduplicated users)
  const allUsers = [];
  const seenEmails = new Set();
  ms.forEach(m=>(m.asesores||[]).forEach(a=>{
    if(a.email && !seenEmails.has(a.email)){seenEmails.add(a.email);allUsers.push(a);}
  }));
  P.push({id:"PRE-01",cat:"0. Setup Base",tp:"spec",pr:`MANUAL — Setup del Portal\n\n1. Crear usuarios:\n${allUsers.map(a=>`   ${a.nombre} ${a.apellido||""}: ${a.email}`.trim()).join("\n")}\n2. Asignar permisos (Marketing, Ventas, Admin)\n3. Conectar correo corporativo\n4. Conectar dominio: ${d.dominio}\n5. Instalar tracking code\n6. Integrar Meta Ads + Google Ads\n7. Crear grupo de propiedades "Focux":\n   Config → Propiedades → Contactos → Groups → Crear → "Focux"\n   Config → Propiedades → Negocios → Groups → Crear → "Focux"`});

  // PROPERTIES (dynamic from varsCalif)
  let pb = `Crea estas propiedades en el grupo "Focux". Usa el internal name exacto.\n\nCONTACTOS\n`;
  const contactProps = [
    ["Lista de Proyectos","lista_proyectos_fx","dropdown",mn],
    ["Canal de Atribución","canal_atribucion_fx","dropdown",allCh],
    ["Etapa del Lead","etapa_lead_fx","dropdown",allEt],
    ["Tipo de Lead","tipo_lead_fx","dropdown",d.niveles.join(", ")],
    ["Motivo de Descarte","motivo_descarte_fx","dropdown",d.moD.join(", ")],
    ["Rango de Ingresos","rango_ingresos_fx","dropdown",d.rangos.join(", ")],
    ["Tiene Ahorros","tiene_ahorros_fx","dropdown",getVarOpts("ahorros")||"Sí, No"],
    ["Propósito de Compra","proposito_compra_fx","dropdown",getVarOpts("proposito")||"Vivienda, Inversión"],
    ["Horizonte de Compra","horizonte_compra_fx","dropdown",getVarOpts("horizonte")||"Inmediato, Antes de 3 meses, De 3 a 6 meses, Más de 6 meses"],
    ["Horario de Contacto","horario_contacto_fx","dropdown",getVarOpts("horario")||"Lunes a Viernes 9am-12m, Lunes a Viernes 12m-2pm, Lunes a Viernes 2pm-6pm, Lunes a Viernes 6pm-8pm, Sábados en la Mañana"],
    ["Crédito Preaprobado","credito_preaprobado_fx","dropdown",getVarOpts("credito")||"Sí, No"],
    ["Aplica a Subsidios","aplica_subsidios_fx","dropdown",getVarOpts("subsidios")||"Sí, No"],
    ["Cédula","cedula_fx","texto",""],
    ["ID Externo","id_externo_fx","texto",""],
  ];
  // Add custom variables as properties
  (d.varsCalif||[]).filter(v=>v.on && v.id.startsWith("custom_") && (v.opts||[]).length).forEach(v=>{
    const internalName = v.label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")+"_fx";
    contactProps.push([v.label, internalName, "dropdown", v.opts.join(", ")]);
  });
  contactProps.forEach(([l,n,t,o])=>{pb+=`- ${l} | ${n} | ${t}${o?` | ${o}`:""}\n`});
  pb += `\nNEGOCIOS\n`;
  [["Macroproyecto","macroproyecto_fx","dropdown",mn],["Proyecto Torre","proyecto_torre_fx","dropdown",tn],["Nro Cotización","nro_cotizacion_fx","texto",""],["Valor Cotización","valor_cotizacion_fx","moneda",""],["Unidad Principal","unidad_principal_fx","texto",""],["Tipo Unidad","tipo_unidad_fx","dropdown","Apartamento, Casa, Local, Lote, Bodega"],["Área m2","area_m2_fx","número",""],["Habitaciones","habitaciones_fx","número",""],["Baños","banos_fx","número",""],["Parqueadero","parqueadero_fx","texto",""],["Depósito","deposito_fx","texto",""],["Fecha Entrega","fecha_entrega_fx","fecha",""],["Motivo Pérdida","motivo_perdida_fx","dropdown",d.moP.join(", ")],["ID Externo","id_externo_deal_fx","texto",""],["Canal Atribución","canal_deal_fx","dropdown",allCh],["Tipo Lead","tipo_lead_deal_fx","dropdown",d.niveles.join(", ")],["Propósito Compra","proposito_deal_fx","dropdown","Vivienda, Inversión"],["Cédula Comprador 1","cedula_comp1_fx","texto",""],["Nombre Comprador 2","nombre_comp2_fx","texto",""],["Apellido Comprador 2","apellido_comp2_fx","texto",""],["Teléfono Comprador 2","tel_comp2_fx","texto",""],["Email Comprador 2","email_comp2_fx","texto",""],["Cédula Comprador 2","cedula_comp2_fx","texto",""]].forEach(([l,n,t,o])=>{pb+=`- ${l} | ${n} | ${t}${o?` | ${o}`:""}\n`});
  pb += `\nDevuélveme resumen con internal name y link de cada propiedad.`;
  P.push({id:"PROP-01",cat:"1. Propiedades",tp:"exec",pr:pb});

  // PIPELINE
  P.push({id:"PL-01",cat:"2. Pipeline",tp:"exec",pr:`Crea pipeline "${pn}" con etapas: ${plStages}\n\nDevuélveme resumen con link.`});

  // TEAMS
  let tb=`MANUAL — Equipos de Venta\nConfig → Usuarios y equipos → Equipos\n\n`;
  ms.forEach(m=>{if(m.nombre&&(m.asesores||[]).length){tb+=`Equipo ${m.nombre}: ${m.asesores.map(a=>`${a.nombre} ${a.apellido||""} <${a.email}>`.trim()).filter(Boolean).join(", ")}\n`}});
  P.push({id:"EQ-01",cat:"3. Equipos",tp:"spec",pr:tb});

  // WF ASSIGNMENT (per project × nivel group, with task)
  // SIEMPRE filtra por tipo_lead_fx — el workflow espera a que calificación termine
  ms.forEach((m,i)=>{
    if(!m.nombre || !(m.asesores||[]).length) return;
    // Group asesores by their niveles combination
    const groups = {};
    (m.asesores||[]).forEach(a => {
      const key = (a.niveles||[]).sort().join(",") || "ALL";
      if(!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    let gi = 0;
    Object.entries(groups).forEach(([nivKey, asesores]) => {
      gi++;
      const niveles = nivKey === "ALL" ? d.niveles : nivKey.split(",");
      const nivelesStr = niveles.join(", ");
      const asesoresStr = asesores.map(a => `${a.nombre} ${a.apellido||""} (${a.email})`.trim()).join(", ");
      const roundRobinStr = asesores.length > 1 ? `round robin entre: ${asesoresStr}` : `asignar a: ${asesoresStr}`;
      P.push({id:`WF-A${i+1}${gi>1?String.fromCharCode(96+gi):""}`,cat:"4. Workflows",tp:"exec",pr:`Workflow "Asignación ${m.nombre} — ${nivelesStr}":\nTrigger: lista_proyectos_fx = ${m.nombre} Y tipo_lead_fx = cualquiera de [${nivelesStr}]\nAcciones:\n1) ${roundRobinStr}\n2) Crear tarea para el propietario:\n   Título: "Tienes un lead nuevo en ${m.nombre} — contáctalo ya"\n   Vencimiento: día siguiente\n   Recordatorio: 30 minutos antes`});
    });
  });

  // WF QUALIFICATION (per project, dynamic matrix using active variables)
  if(d.usaCalif) {
    const activeVars = (d.varsCalif||[]).filter(v => v.on && v.id !== "ingresos");
    ms.forEach((m,i)=>{
      if(!m.nombre||!m.rangoMinimo) return;
      const rIdx=d.rangos.indexOf(m.rangoMinimo);
      const below=rIdx>0?d.rangos[rIdx-1]:null;
      d.reglas.forEach((r,ri)=>{
        let trigger="", action=r.entonces;
        // Build trigger from matrix rule columns
        const conditions = [`lista_proyectos_fx = ${m.nombre}`];
        // Column "si" maps to income
        if(r.si==="Cumple ingreso mínimo") conditions.push(`rango_ingresos_fx = ${m.rangoMinimo}`);
        else if(r.si==="Un nivel debajo" && below) conditions.push(`rango_ingresos_fx = ${below}`);
        else if(r.si==="Inversionista") conditions.push(`proposito_compra_fx = Inversión`);
        else if(r.si==="No cumple requisito") conditions.push(`rango_ingresos_fx < ${m.rangoMinimo}`);
        else if(r.si==="No desea ser contactado") { conditions.push(`etapa_lead_fx = Descartado`); }
        else if(r.si) conditions.push(r.si);
        // Column "y" maps to second variable (dynamic)
        if(r.y && r.y !== "Cualquiera") {
          conditions.push(r.y);
        }
        trigger = conditions.join(" Y ");
        if(conditions.length > 1) {
          P.push({id:`WF-Q${i+1}${String.fromCharCode(97+ri)}`,cat:"4. Workflows",tp:"exec",pr:`Workflow "Calif ${m.nombre} → ${action}":\nTrigger: ${trigger}\nAcción: tipo_lead_fx = ${action}`});
        }
      });
    });
  }

  // WF SALES
  P.push({id:"WF-D1",cat:"4. Workflows",tp:"exec",pr:`Workflow "Crear Deal":\nTrigger: etapa_lead_fx = ${d.triggerDeal}\nAcciones:\n1) Crear negocio en ${pn}, Amount=0\n2) Copiar: lista_proyectos_fx→macroproyecto_fx, canal_atribucion_fx→canal_deal_fx, tipo_lead_fx→tipo_lead_deal_fx, proposito_compra_fx→proposito_deal_fx, cedula_fx→cedula_comp1_fx\n3) Notificar propietario: "Nuevo negocio {lista_proyectos_fx} - {firstname} {lastname} ({tipo_lead_fx})"`});
  P.push({id:"WF-D2",cat:"4. Workflows",tp:"exec",pr:`Workflow "Valor al Opcionar":\nTrigger: etapa → Opcionó\nAcción: valor_cotizacion_fx → Amount`});
  P.push({id:"WF-D3",cat:"4. Workflows",tp:"exec",pr:`Workflow "Alerta ${d.diasSinAct}d":\nTrigger: ${d.diasSinAct} días sin actividad\nAcción: tarea + notificación`});

  // SCORING + FORMS + REPORTS + CONTENT
  P.push({id:"LS-01",cat:"5. Lead Scoring",tp:"spec",pr:`MANUAL — Config → HubSpot Score\n\nEmail mktg abrió:+15 | clic:+20 | respondió:+25\nEmail ventas apertura:+15 | clic:+20 | respuesta:+30\nVisitó ${d.dominio}:+15 | Redes:+20 | Form:+50\nDecay: 30%/3m | Umbral: ${d.umbral}pts`});

  ms.forEach((m,i)=>{if(!m.nombre)return;const v=m.tipo==="VIS";const filtro=m.preguntaFiltroCustom||(v?`${m.nombre} en ${m.ciudad}, áreas ${m.areaDesde}. ¿Se acomoda?`:`${m.nombre} en ${m.ciudad}, ${m.areaDesde}, ${m.precioDesde}, cuotas ${m.cuotaDesde}. ¿Te interesa?`);
  P.push({id:`FM-${i+1}`,cat:"6. Formularios",tp:"spec",pr:`MANUAL — Form "${m.nombre}" (${m.tipo})\nFiltro: "${filtro}"\nCampos: ${v?"Email,Nombre,Apellido,Cédula,Cel":"Nombre,Apellido,Email,Cel"}\nCalificación: Rango Ingresos${v?"":", Ahorros, Propósito"}\nHidden: lista_proyectos_fx=${m.nombre}, canal_atribucion_fx=Sitio Web`})});

  P.push({id:"RPT-01",cat:"7. Informes",tp:"spec",pr:`MANUAL — 8 Informes:\n1.Embudo ${pn} 2.Ganados vs Perdidos/mes 3.Tiempo×etapa 4.Pipeline×Macro 5.Conversión×Canal 6.Cerrados×Asesor 7.Actividad ventas 8.Motivos pérdida`});

  P.push({id:"SEQ-01",cat:"8. Productividad",tp:"spec",pr:`MANUAL — Secuencia + Templates + Snippets + Playbook\n\nSecuencia: Día0:Email Día2:Llamada Día4:Email Día7:Cierre\nTemplates: Primer contacto, Brochure, Post-cotización\nSnippets: ${ms.map(m=>`#${(m.nombre||"").toLowerCase().replace(/\s/g,"_")}`).join(", ")}\nPlaybook: Calificación inmobiliaria\n\nNurturing Proyecto×Buyer:\n${ms.map(m=>(m.buyers||[]).map(b=>`${m.nombre} × ${b.nombre}`).join(", ")).filter(Boolean).join("\n")}`});

  ms.forEach((m,i)=>{if(m.nombre)P.push({id:`LP-${i+1}`,cat:"9. Landing Pages",tp:"spec",pr:`PROMPT IA HubSpot — Landing "${m.nombre}"\n${m.ciudad} | ${m.tipo} | Áreas ${m.areaDesde} | ${fmtMoney(m.precioDesde)}\n${m.amenities?`Amenidades: ${m.amenities}`:""}\nEstructura: Hero→Beneficios→Galería→Tipologías→Ubicación→Form→Footer`})});

  if(d.tieneAgente&&d.nomAgente){const info=ms.map(m=>`${m.nombre}: ${m.ciudad}, ${fmtMoney(m.precioDesde)}, ${m.tipologias}`).join(". ");
  P.push({id:"AI-01",cat:"10. Agente IA",tp:"spec",pr:`Breeze Studio — "${d.nomAgente}" (${d.tonoAgente})\nWABA: ${d.wabaNum}\nProyectos: ${info}\nReglas: NO descuentos/precios exactos/fechas/legal\nActivar: ${d.tiposAgente.join(", ")}`})};

  return P;
}

/* ═══ OBJECIONES ═══ */
const OBJS = [
  {c:"Proceso",q:"¿Por qué no usamos solo Breeze?",a:"Breeze interpreta prompts y a veces falla. FocuxAI Engine usa JSON determinístico: mismo input, mismo resultado, cada vez. Breeze lo usamos para validar, la API para producción."},
  {c:"Proceso",q:"Esto suena muy complejo para nuestro equipo",a:"El equipo solo usa HubSpot. Toda la complejidad está en el Engine: ustedes ven propiedades, pipelines y workflows que ya funcionan. El setup lo hace Focux en <5 minutos por API."},
  {c:"Costo",q:"¿Por qué no hacemos la implementación nosotros?",a:"Pueden hacerlo. Pero les tomaría 3-6 meses de prueba y error. Focux ya documentó 7 módulos SOP probados en +6 constructoras. El costo de no hacer es mayor: leads perdidos, datos sucios, equipo frustrado."},
  {c:"Costo",q:"El agente de HubSpot ya está incluido, ¿para qué pagar otro?",a:"El agente de HubSpot cobra $1 USD por conversación y es genérico. Focux Agent cuesta $0.01-$0.05 y conoce el sector: sabe de subsidios, cuotas iniciales, VIS vs No VIS. Es 20x más barato y 5x más preciso."},
  {c:"Técnico",q:"¿Qué pasa si HubSpot cambia su API?",a:"FocuxAI Engine tiene un Adapter Pattern: la lógica de negocio vive en la capa Focux, no en HubSpot. Si HubSpot cambia, actualizamos el adapter. Si mañana migran a SmartHome, la configuración es la misma."},
  {c:"Técnico",q:"¿Y si ya tenemos propiedades creadas?",a:"El Engine detecta propiedades existentes antes de crear. Si ya existe una con el mismo internal name, la salta. Si existe con nombre diferente, la mapea. Cero duplicados."},
  {c:"Cambio",q:"Nuestros asesores no van a usar esto",a:"Los asesores no cambian su rutina. Siguen usando HubSpot igual. Lo que cambia es que ahora tienen calificación automática, cotizaciones en 2 clics, y alertas inteligentes. Menos trabajo manual, más cierres."},
  {c:"Cambio",q:"Ya tenemos un CRM y funciona bien",a:"Si funciona bien, no nos necesitan. Pero si están aquí es porque algo no funciona: leads sin seguimiento, datos sucios, reportes manuales, equipo sin visibilidad. El Engine no reemplaza su CRM, lo potencia."},
  {c:"Tiempo",q:"¿Cuánto demora todo esto?",a:"El deployment técnico toma <5 minutos por API. El taller de kickoff 3-4 horas. La habilitación del equipo 4 sesiones de 1 hora. En 2-3 semanas están operando. Comparado con 3-6 meses haciendo solos."},
  {c:"Tiempo",q:"No tenemos tiempo para un taller de 4 horas",a:"El taller es una inversión de 4 horas que ahorra 6 meses. Sin el taller, implementamos algo genérico. Con el taller, implementamos algo que refleja exactamente cómo venden ustedes."},
];

/* ═══ TEMPLATE GENERATOR (Gemini-ready) ═══ */
/* ═══ TEMPLATE DATA ═══ */
function getTemplate(type, constructoraName, domain) {
  const nm = constructoraName || "[nombre constructora]";
  const dm = domain || "[dominio.com]";
  const templates = {
    macroproyectos: {
      title: "FocuxAI Scraping — Macroproyectos",
      headers: ["Nombre","Ciudad","Tipo (VIS/No VIS/Mixto)","Precio Desde","Área Desde","Cuota Desde","Tipos de Unidad","Amenities"],
      examples: [
        ["Firenze","Medellín, El Poblado","No VIS","$350,000,000","45 m2","$3,500,000","1,2,3 hab","Piscina, gym, coworking"],
        ["Caoba","Villavicencio","VIS","$150,000,000","51 m2","","2,3 hab","Zona BBQ, parque infantil"],
      ],
      prompt: `Visita https://${dm} y extrae TODOS los proyectos en comercialización de ${nm}.

Devuelve una tabla con EXACTAMENTE 8 columnas separadas por TAB, en este orden:

COL1: Nombre del proyecto
COL2: Ciudad / ubicación (ej: "Santa Marta, El Rodadero")
COL3: Tipo → escribe "VIS" si precio < $187M COP, "No VIS" si es mayor, "Mixto" si tiene ambos
COL4: Precio desde (formato: $XXX.XXX.XXX o vacío si no hay)
COL5: Área desde (formato: "XX m2" o vacío)
COL6: Cuota mensual desde (formato: $X.XXX.XXX o vacío si no hay)
COL7: Tipos de unidad (ej: "1, 2, 3 hab" o "Apartasuites" o "Locales")
COL8: Amenidades principales (las más relevantes, separadas por coma)

REGLAS ESTRICTAS:
- EXACTAMENTE 8 columnas por fila. Si un dato no existe, deja la celda VACÍA (dos tabs seguidos).
- Separador: TAB (\\t) entre cada columna.
- SIN encabezados. Solo filas de datos.
- SIN numeración ni viñetas.
- NO inventes datos. Solo lo visible en la web.
- Una fila por proyecto.

EJEMPLO DE FORMATO CORRECTO (tabs entre columnas):
Firenze[TAB]Medellín, El Poblado[TAB]No VIS[TAB]$350.000.000[TAB]45 m2[TAB]$3.500.000[TAB]1, 2, 3 hab[TAB]Piscina, gym, coworking
Caoba[TAB]Villavicencio[TAB]VIS[TAB]$150.000.000[TAB]51 m2[TAB][TAB]2, 3 hab[TAB]Zona BBQ, parque infantil`,
    },
    torres: {
      title: "FocuxAI Scraping — Torres / Etapas",
      headers: ["Macroproyecto (exacto)","Torre/Etapa","Fecha Entrega","Meses Cuota Inicial","% Separación","% Cuota Inicial","Total Unidades"],
      examples: [
        ["Firenze","Torre 1","2028-06-15","35","1","30","120"],
        ["Firenze","Torre 2","2029-01-20","35","1","30","95"],
      ],
      prompt: `Visita https://${dm} y para CADA proyecto de ${nm}, extrae las torres o etapas disponibles.

Devuelve una tabla con EXACTAMENTE 7 columnas separadas por TAB, en este orden:

COL1: Nombre del macroproyecto (EXACTO como aparece en la web)
COL2: Nombre de la torre o etapa (ej: "Torre 1", "Etapa 2", "Torre Única" si no hay subdivisión)
COL3: Fecha de entrega estimada (formato YYYY-MM-DD. Si dice "Diciembre 2028" → 2028-12-01)
COL4: Meses de cuota inicial (número o vacío)
COL5: % de separación (número o vacío)
COL6: % de cuota inicial total (número o vacío)
COL7: Total de unidades (número o vacío)

REGLAS ESTRICTAS:
- EXACTAMENTE 7 columnas por fila. Dato faltante = celda vacía (dos tabs seguidos).
- Si un proyecto no tiene torres individuales, una fila con "Torre Única".
- Separador: TAB. SIN encabezados. Solo datos.`,
    },
    equipos: {
      title: "FocuxAI Scraping — Equipo Comercial",
      headers: ["Macroproyecto (exacto)","Nombre Asesor","Email Corporativo","Meeting Link"],
      examples: [
        ["Firenze","María Gómez","maria@constructora.com",""],
        ["Caoba","Ana Martínez","ana@constructora.com",""],
      ],
      prompt: `Visita https://${dm} y busca información del equipo comercial de ${nm}.

Busca en: página de contacto, sección "equipo", salas de ventas, WhatsApp de proyectos.

Devuelve una tabla con EXACTAMENTE 4 columnas separadas por TAB:

COL1: Nombre del macroproyecto asignado (EXACTO)
COL2: Nombre completo del asesor
COL3: Email corporativo (NO personal)
COL4: Link de agendamiento (o vacío)

REGLAS: Si no encuentras asesores por proyecto, usa el contacto general. EXACTAMENTE 4 columnas. SIN encabezados.`,
    },
    buyers: {
      title: "FocuxAI Scraping — Buyer Personas",
      headers: ["Macroproyecto (exacto)","Nombre Buyer Persona","Descripción"],
      examples: [
        ["Firenze","Familia Joven","Parejas 28-38, primer hogar, ingreso $6-12M, buscan 2-3 hab cerca a colegios"],
        ["Firenze","Inversionista","Profesional 35-55, compra para renta, busca ROI y valorización, prefiere 1-2 hab"],
      ],
      prompt: `Basándote en los proyectos de ${nm} (https://${dm}), genera 2-3 buyer personas por proyecto.

Analiza: ubicación, precio, tipo VIS/No VIS, tipologías, amenidades de cada proyecto.

Devuelve una tabla con EXACTAMENTE 3 columnas separadas por TAB:

COL1: Nombre del macroproyecto (EXACTO como aparece en la web)
COL2: Nombre del buyer persona (descriptivo: "Familia Joven", "Inversionista Turístico", etc.)
COL3: Descripción (rango edad, composición familiar, ingreso estimado, motivación, necesidades)

Guías:
- VIS: familias jóvenes, primer hogar, subsidio Mi Casa Ya
- No VIS turístico: inversionistas de renta corta, nómadas digitales
- No VIS residencial bajo: parejas profesionales sin subsidio
- No VIS medio-alto: familias establecidas, upgrade
- No VIS alto: inversionistas, empty nesters

REGLAS: EXACTAMENTE 3 columnas. SIN encabezados. Una fila por buyer persona.`,
    },
    pipeline: {
      title: "FocuxAI Scraping — Pipeline de Ventas",
      headers: ["Nombre Etapa","% Probabilidad"],
      examples: [
        ["Cotización Solicitada","10"],["Opcionó","40"],["Consignó","60"],["Entregó Documentos","70"],
        ["Se vinculó a Fiducia","80"],["Firmó Documentos","90"],["Venta Formalizada","100"],["Perdida","0"],
      ],
      prompt: `Este es el pipeline estándar Focux para constructoras del sector inmobiliario colombiano.\n\nSi ${nm} tiene un proceso comercial diferente al estándar, ajusta las etapas.\n\nFormato: columnas separadas por TAB, sin encabezados, solo datos.`,
    },
    etapas_lead: {
      title: "FocuxAI Scraping — Etapas del Lead",
      headers: ["Fase (Prospección/Sala)","Nombre Etapa"],
      examples: [
        ["Prospección","Lead Nuevo"],["Prospección","Intento de Contacto"],["Prospección","Contactado en Seguimiento"],
        ["Sala","Lead Nuevo Sala de Ventas"],["Sala","Visitó Sala de Ventas"],["Sala","Cotización Enviada"],
      ],
      prompt: `Etapas del ciclo de vida del lead para ${nm}.\nProspección = equipo marketing/BDR. Sala = equipo comercial.\n\nFormato: columnas separadas por TAB, sin encabezados, solo datos.`,
    },
    motivos: {
      title: "FocuxAI Scraping — Motivos",
      headers: ["Tipo (Descarte/Pérdida)","Motivo"],
      examples: [
        ["Descarte","Ingresos insuficientes"],["Descarte","No interesado"],["Descarte","Datos Errados"],
        ["Pérdida","Compró en Otro Proyecto"],["Pérdida","No salió préstamo"],["Pérdida","Dejó de contestar"],
      ],
      prompt: `Motivos de descarte (lead, antes de cotizar) y pérdida (negocio, después de cotizar) estándar del sector inmobiliario.\n\nSi conoces motivos específicos de ${nm}, agrégalos.\n\nFormato: columnas separadas por TAB, sin encabezados, solo datos.`,
    },
  };
  return templates[type] || null;
}

/* ═══ TEMPLATE MODAL ═══ */
function TemplateModal({ open, onClose, template }) {
  const [copied, setCopied] = useState("");
  if (!open || !template) return null;

  const copyText = (text, label) => {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(label); setTimeout(()=>setCopied(""),2000); }
      catch(e) {}
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(()=>{setCopied(label);setTimeout(()=>setCopied(""),2000)}).catch(fallback);
    } else { fallback(); }
  };

  const copyPrompt = () => copyText(template.prompt, "prompt");
  const copyTable = () => {
    const rows = template.examples.map(r => r.join("\t")).join("\n");
    copyText(template.headers.join("\t") + "\n" + rows, "table");
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:1000, backdropFilter:"blur(4px)" }}>
      <div style={{ background:tk.card, borderRadius:16, padding:24, width:"94%", maxWidth:720, maxHeight:"90vh", overflow:"auto", boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${tk.teal},${tk.blue})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#fff"}}>⚡</div>
            <div>
              <h3 style={{ margin:0, color:tk.navy, fontSize:16, fontWeight:700 }}>{template.title}</h3>
              <p style={{margin:"2px 0 0",fontSize:11,color:tk.textTer}}>Copia el prompt → pégalo en Gemini → pega el resultado en la app</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background:tk.bg, border:"none", width:32, height:32, borderRadius:8, fontSize:18, cursor:"pointer", color:tk.textSec, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>

        {/* Step 1: Prompt */}
        <div style={{ marginBottom:16 }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>
              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:"50%",background:tk.accent,color:"#fff",fontSize:10,fontWeight:800,marginRight:6}}>1</span>
              Prompt para Gemini / ChatGPT
            </p>
            <button onClick={copyPrompt} style={{
              padding:"5px 14px", borderRadius:6, border:"none", fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:font, transition:"all 0.2s",
              background: copied==="prompt" ? tk.green : `linear-gradient(135deg,${tk.teal},${tk.blue})`, color:"#fff",
            }}>
              {copied==="prompt" ? "✓ Copiado" : "Copiar prompt"}
            </button>
          </div>
          <div style={{background:tk.bg, borderRadius:10, padding:14, border:`1px solid ${tk.border}`, maxHeight:200, overflow:"auto"}}>
            <pre style={{margin:0, fontSize:12, color:tk.text, whiteSpace:"pre-wrap", lineHeight:1.6, fontFamily:font}}>{template.prompt}</pre>
          </div>
        </div>

        {/* Step 2: Expected format */}
        <div style={{ marginBottom:16 }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>
              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:"50%",background:tk.accent,color:"#fff",fontSize:10,fontWeight:800,marginRight:6}}>2</span>
              Formato esperado (ejemplo)
            </p>
            <button onClick={copyTable} style={{
              padding:"5px 14px", borderRadius:6, border:`1.5px solid ${tk.border}`, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:font, transition:"all 0.2s",
              background: copied==="table" ? tk.greenBg : tk.card, color: copied==="table" ? tk.green : tk.textSec,
            }}>
              {copied==="table" ? "✓ Copiado" : "Copiar ejemplo"}
            </button>
          </div>
          <div style={{overflowX:"auto", borderRadius:10, border:`1px solid ${tk.border}`}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:11}}>
              <thead>
                <tr style={{background:tk.navy}}>
                  {template.headers.map((h,i) => (
                    <th key={i} style={{padding:"8px 10px", color:"#fff", fontWeight:600, textAlign:"left", whiteSpace:"nowrap", fontSize:10}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {template.examples.map((row,ri) => (
                  <tr key={ri} style={{background:ri%2===0?tk.bg:tk.card, borderBottom:`1px solid ${tk.border}`}}>
                    {row.map((cell,ci) => (
                      <td key={ci} style={{padding:"6px 10px", color:tk.text, whiteSpace:"nowrap", fontSize:11}}>{cell || <span style={{color:tk.textTer,fontStyle:"italic"}}>—</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Step 3: Instructions */}
        <div style={{padding:12, background:tk.accentLight, borderRadius:10, border:`1px solid ${tk.accent}30`}}>
          <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.navy,marginBottom:4}}>
            <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:"50%",background:tk.accent,color:"#fff",fontSize:10,fontWeight:800,marginRight:6}}>3</span>
            Pegar resultado
          </p>
          <p style={{margin:0,fontSize:12,color:tk.text,lineHeight:1.5}}>
            Cuando Gemini devuelva los datos, selecciona las filas → copia → vuelve a esta app → usa el botón <strong>"📋 Importar desde Excel"</strong> para pegar. El parser detecta tabs automáticamente.
          </p>
        </div>

        {/* Close */}
        <div style={{display:"flex", justifyContent:"flex-end", marginTop:16}}>
          <button onClick={onClose} style={{padding:"9px 24px", borderRadius:8, border:"none", background:tk.navy, color:"#fff", fontSize:13, cursor:"pointer", fontWeight:600, fontFamily:font}}>Entendido</button>
        </div>
      </div>
    </div>
  );
}

/* ═══ BULK IMPORT BAR ═══ */
function BulkBar({ onPaste, onTemplate, pasteLabel="Importar desde Excel", templateLabel="FocuxAI Scraping" }) {
  return (
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      {onPaste && <button onClick={onPaste} style={{padding:"8px 16px",background:tk.card,border:`1.5px solid ${tk.border}`,borderRadius:8,color:tk.textSec,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:font,display:"flex",alignItems:"center",gap:6,transition:"all 0.2s"}}
        onMouseOver={e=>{e.currentTarget.style.borderColor=tk.accent;e.currentTarget.style.color=tk.accent}}
        onMouseOut={e=>{e.currentTarget.style.borderColor=tk.border;e.currentTarget.style.color=tk.textSec}}>
        <span style={{fontSize:14}}>📋</span> {pasteLabel}
      </button>}
      {onTemplate && <button onClick={onTemplate} style={{padding:"8px 16px",background:tk.card,border:`1.5px solid ${tk.accent}30`,borderRadius:8,color:tk.accent,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:font,display:"flex",alignItems:"center",gap:6,transition:"all 0.2s"}}
        onMouseOver={e=>{e.currentTarget.style.background=tk.accentLight}}
        onMouseOut={e=>{e.currentTarget.style.background=tk.card}}>
        <span style={{fontSize:14}}>⚡</span> {templateLabel}
      </button>}
    </div>
  );
}

/* ═══ STEP DEFINITIONS ═══ */
const STEPS = [
  {t:"Setup General",i:"⚙️",d:"Datos base, suscripción y migración"},
  {t:"Macroproyectos",i:"🏗️",d:"Proyectos en comercialización + buyers"},
  {t:"Torres / Etapas",i:"🏠",d:"Subdivisiones por macroproyecto"},
  {t:"Equipos de Venta",i:"👥",d:"Asesores por proyecto"},
  {t:"Canales",i:"📡",d:"Fuentes de atribución"},
  {t:"Calificación",i:"⭐",d:"Niveles, variables y matriz"},
  {t:"Etapas del Lead",i:"🔄",d:"Ciclo de vida del prospecto"},
  {t:"Pipeline de Ventas",i:"📊",d:"Etapas del negocio + probabilidad"},
  {t:"Motivos",i:"📋",d:"Descarte de leads y pérdida de negocios"},
  {t:"Agente IA",i:"🤖",d:"Configuración del asistente virtual"},
  {t:"Validación",i:"✅",d:"Revisión pre-ejecución"},
  {t:"Ejecución",i:"🚀",d:"Prompts, guías y plantillas"},
  {t:"Objeciones",i:"💡",d:"Base de conocimiento para kickoff"},
  {t:"Métricas",i:"📈",d:"Resumen de la implementación"},
];

/* ═══ STEP 0: SETUP ═══ */
function S0({d,u}) {
  return (
    <div>
      <SectionHead sub="Información base que se usa en todos los módulos">Datos de la Constructora</SectionHead>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Inp label="Nombre de la Constructora" value={d.nombreConst} onChange={v=>u("nombreConst",v)} required placeholder="Constructora Jiménez" />
        <Inp label="Dominio web principal" value={d.dominio} onChange={v=>u("dominio",v)} required placeholder="jimenez.com.co" />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Inp label="Nombre del Pipeline" value={d.nombrePipeline} onChange={v=>u("nombrePipeline",v)} required placeholder="Pipeline Ventas Jiménez" />
        <Sel label="Trigger creación de Deal" value={d.triggerDeal} onChange={v=>u("triggerDeal",v)} required options={["Cotización Solicitada","Visitó Sala de Ventas","Calificado por Prospección"]} />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Inp label="Días sin actividad para alerta" value={d.diasSinAct} onChange={v=>u("diasSinAct",v)} type="number" required />
        <Sel label="País" value={d.pais} onChange={v=>u("pais",v)} required options={["Colombia","México","Panamá","Costa Rica","Rep. Dominicana","Otro"]} />
      </div>

      <SectionHead sub="Define qué módulos están disponibles">Suscripción HubSpot</SectionHead>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"0 10px"}}>
        <Sel label="Sales Hub" value={d.hubSales} onChange={v=>u("hubSales",v)} options={["No","Starter","Pro","Enterprise"]} />
        <Sel label="Marketing Hub" value={d.hubMarketing} onChange={v=>u("hubMarketing",v)} options={["No","Starter","Pro","Enterprise"]} />
        <Sel label="Service Hub" value={d.hubService} onChange={v=>u("hubService",v)} options={["No","Starter","Pro","Enterprise"]} />
        <Sel label="Content Hub" value={d.hubContent} onChange={v=>u("hubContent",v)} options={["No","Starter","Pro","Enterprise"]} />
      </div>
      <div style={{display:"flex",gap:20,marginTop:8,flexWrap:"wrap"}}>
        <Chk label="Módulo 3: Cotizador e Inventario" desc="Requiere al menos 1 Hub Enterprise" checked={d.tieneCotizador} onChange={v=>u("tieneCotizador",v)} />
        <Chk label="Módulo 4: Agente IA" desc="Breeze AI — agente conversacional para leads" checked={d.tieneAgente} onChange={v=>u("tieneAgente",v)} />
      </div>

      <SectionHead sub="Para planificar el Módulo 5">Migración de Datos</SectionHead>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Sel label="CRM actual del cliente" value={d.crmOrigen} onChange={v=>u("crmOrigen",v)} options={["Ninguno","SmartHome","Pipedrive","Sinco CRM","Excel/Sheets","Bitrix24","Otro"]} />
        <Inp label="Volumen aprox. de registros" value={d.volRegistros} onChange={v=>u("volRegistros",v)} placeholder="~5,000 contactos + ~2,000 negocios" />
      </div>
      <Chk label="Tiene archivos adjuntos que migrar" desc="Requiere App de Migración (desarrollo adicional)" checked={d.tieneAdj} onChange={v=>u("tieneAdj",v)} />
    </div>
  );
}

/* ═══ STEP 1: MACROS ═══ */
function S1({d,u}) {
  const ms=d.macros||[];
  const [sp,setSp]=useState(false);
  const [bpModal,setBpModal]=useState({open:false,mi:0});
  const [tplModal,setTplModal]=useState(null);
  const add=()=>u("macros",[...ms,{nombre:"",ciudad:"",tipo:"No VIS",precioDesde:"",areaDesde:"",cuotaDesde:"",tipologias:"",amenities:"",rangoMinimo:"",preguntaFiltroCustom:"",buyers:[],torres:[],asesores:[]}]);
  const up=(i,f,v)=>{const n=[...ms];n[i]={...n[i],[f]:v};u("macros",n)};
  const rm=i=>{const n=[...ms];n.splice(i,1);u("macros",n)};
  const addBuyer=(i)=>{const n=[...ms];n[i]={...n[i],buyers:[...(n[i].buyers||[]),{nombre:"",desc:""}]};u("macros",n)};
  const upBuyer=(mi,bi,f,v)=>{const n=[...ms];n[mi]={...n[mi],buyers:[...(n[mi].buyers||[])]};n[mi].buyers[bi]={...n[mi].buyers[bi],[f]:v};u("macros",n)};
  const rmBuyer=(mi,bi)=>{const n=[...ms];n[mi]={...n[mi],buyers:[...n[mi].buyers]};n[mi].buyers.splice(bi,1);u("macros",n)};
  const paste=rows=>{
    const parsed = rows.map(r => {
      // Smart column detection: expected 8 cols (nombre, ciudad, tipo, precio, area, cuota, tipologias, amenities)
      // If 7 cols: likely missing "cuota desde" (col 5) — detect by checking if col[5] looks like money or like tipologías
      // If 6 cols: likely missing cuota AND amenities
      let nombre, ciudad, tipo, precioDesde, areaDesde, cuotaDesde, tipologias, amenities;
      
      if (r.length >= 8) {
        // Full 8 columns
        [nombre, ciudad, tipo, precioDesde, areaDesde, cuotaDesde, tipologias, amenities] = r;
      } else if (r.length === 7) {
        // 7 cols — check if col[5] looks like a price (starts with $ or is a number > 100000)
        const col5 = (r[5]||"").trim();
        const looksLikePrice = /^\$|^\d{3,}/.test(col5.replace(/[.\s]/g,""));
        if (looksLikePrice) {
          // Col 5 is cuota, col 6 is tipologias, no amenities
          [nombre, ciudad, tipo, precioDesde, areaDesde, cuotaDesde, tipologias] = r;
          amenities = "";
        } else {
          // Col 5 is tipologias (cuota missing), col 6 is amenities
          [nombre, ciudad, tipo, precioDesde, areaDesde, tipologias, amenities] = r;
          cuotaDesde = "";
        }
      } else if (r.length === 6) {
        [nombre, ciudad, tipo, precioDesde, areaDesde, tipologias] = r;
        cuotaDesde = ""; amenities = "";
      } else if (r.length === 5) {
        [nombre, ciudad, tipo, precioDesde, areaDesde] = r;
        cuotaDesde = ""; tipologias = ""; amenities = "";
      } else {
        nombre = r[0]||""; ciudad = r[1]||""; tipo = r[2]||"No VIS";
        precioDesde = r[3]||""; areaDesde = "";
        cuotaDesde = ""; tipologias = ""; amenities = "";
      }
      
      return {
        nombre: (nombre||"").trim(), ciudad: (ciudad||"").trim(), 
        tipo: (tipo||"No VIS").trim(), precioDesde: (precioDesde||"").replace(/[^0-9]/g,"").trim(),
        areaDesde: (areaDesde||"").trim(), cuotaDesde: (cuotaDesde||"").replace(/[^0-9]/g,"").trim(),
        tipologias: (tipologias||"").trim(), amenities: (amenities||"").trim(),
        rangoMinimo:"", preguntaFiltroCustom:"", buyers:[], torres:[], asesores:[]
      };
    }).filter(m => m.nombre);
    u("macros", [...ms, ...parsed]);
  };
  const pasteBuyers=(rows)=>{const mi=bpModal.mi;const n=[...ms];n[mi]={...n[mi],buyers:[...(n[mi].buyers||[]),...rows.map(r=>({nombre:r[0]||"",desc:r[1]||""}))]};u("macros",n)};
  const filtroAuto=(m)=>m.tipo==="VIS"?`${m.nombre} se encuentra en ${m.ciudad||"..."} con áreas ${m.areaDesde||"..."}. ¿Se acomoda a tus necesidades?`:`El proyecto ${m.nombre} está en ${m.ciudad||"..."}, áreas ${m.areaDesde||"..."}, valor ${fmtMoney(m.precioDesde)||"..."}, cuotas ${fmtMoney(m.cuotaDesde)||"..."}. ¿Te interesa?`;

  return (
    <div>
      <BulkBar onPaste={()=>setSp(true)} onTemplate={()=>setTplModal(getTemplate("macroproyectos",d.nombreConst,d.dominio))} />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={sp} onClose={()=>setSp(false)} onParse={paste} title="Importar Macroproyectos"
        description="Pega los datos de tus proyectos desde Excel o Google Sheets"
        cols={[{label:"Nombre",required:true},{label:"Ciudad",required:true},{label:"Tipo (VIS/No VIS)",required:true},{label:"Precio Desde",required:false},{label:"Área Desde",required:false},{label:"Cuota Desde",required:false},{label:"Tipos de Unidad",required:false},{label:"Amenities",required:false}]}
        example={"Firenze\tMedellín, El Poblado\tNo VIS\t$350,000,000\t45 m2\t$3,500,000\t1,2,3 hab\tPiscina, gym\nCaoba\tVillavicencio\tVIS\t$150,000,000\t51 m2\t\t2,3 hab\tZona BBQ"} />
      <PasteModal open={bpModal.open} onClose={()=>setBpModal({open:false,mi:0})} onParse={pasteBuyers}
        title={`Importar Buyers → ${ms[bpModal.mi]?.nombre||""}`}
        description="Nombre del buyer persona y descripción del perfil"
        cols={[{label:"Nombre Buyer",required:true},{label:"Descripción"}]}
        example={"Familia Joven\tParejas 28-38, primer hogar, ingreso $6-12M\nInversionista\tProfesional 35-55, compra para renta, busca ROI"} />

      {ms.map((m,i) => (
        <Card key={i} title={m.nombre||`Macroproyecto ${i+1}`} subtitle={m.ciudad ? `${m.ciudad} · ${m.tipo}` : ""} onRemove={()=>rm(i)} accent>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
            <Inp label="Nombre del Macroproyecto" value={m.nombre} onChange={v=>up(i,"nombre",v)} required placeholder="Firenze" />
            <Inp label="Ciudad / Ubicación" value={m.ciudad} onChange={v=>up(i,"ciudad",v)} required placeholder="Medellín, El Poblado" />
            <Sel label="Tipo de Proyecto" value={m.tipo} onChange={v=>up(i,"tipo",v)} required options={["No VIS","VIS","Mixto"]} />
            <Sel label="Ingreso mínimo requerido" value={m.rangoMinimo||""} onChange={v=>up(i,"rangoMinimo",v)} options={["",...d.rangos]} note="De los rangos definidos en Calificación (Paso 6)" />
            <MoneyInp label="Precio Desde" value={m.precioDesde} onChange={v=>up(i,"precioDesde",v)} placeholder="$350.000.000" />
            <Inp label="Área Desde" value={m.areaDesde} onChange={v=>up(i,"areaDesde",v)} placeholder="Desde 45 m2" />
            <MoneyInp label="Cuota Mensual Desde" value={m.cuotaDesde} onChange={v=>up(i,"cuotaDesde",v)} placeholder="$3.500.000" />
            <Inp label="Tipos de Unidad / Habitaciones" value={m.tipologias} onChange={v=>up(i,"tipologias",v)} placeholder="1, 2 y 3 habitaciones" />
          </div>
          <Inp label="Amenities principales" value={m.amenities} onChange={v=>up(i,"amenities",v)} placeholder="Piscina, gimnasio, salón social, zona BBQ" />

          {m.nombre && (
            <div style={{padding:12,background:tk.bg,borderRadius:8,marginTop:8,border:`1px solid ${tk.border}`}}>
              <p style={{fontSize:11,fontWeight:700,color:tk.navy,margin:"0 0 4px",textTransform:"uppercase",letterSpacing:"0.04em"}}>Pregunta filtro ({m.tipo})</p>
              <p style={{fontSize:12,color:tk.text,margin:"0 0 8px",fontStyle:"italic",lineHeight:1.4}}>{m.preguntaFiltroCustom||filtroAuto(m)}</p>
              <Inp label="" value={m.preguntaFiltroCustom} onChange={v=>up(i,"preguntaFiltroCustom",v)} placeholder="Vacío = auto-generada. Escribe aquí para personalizar." note="Override manual de la pregunta filtro" />
            </div>
          )}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
            <SectionHead sub="Cada proyecto tiene sus propios buyer personas">Buyer Personas — {m.nombre||"Proyecto"}</SectionHead>
            <button onClick={()=>setBpModal({open:true,mi:i})} style={{padding:"4px 10px",borderRadius:6,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.textSec,fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:600,marginTop:8}}>📋 Pegar buyers</button>
          </div>
          {(m.buyers||[]).map((b,bi) => (
            <div key={bi} style={{display:"flex",gap:8,marginBottom:8,alignItems:"flex-start"}}>
              <input value={b.nombre} onChange={e=>upBuyer(i,bi,"nombre",e.target.value)} placeholder="Ej: Familia Joven"
                style={{...ss.input, flex:"0 0 180px", padding:"8px 10px", fontSize:12}} />
              <input value={b.desc} onChange={e=>upBuyer(i,bi,"desc",e.target.value)} placeholder="Descripción: Parejas 25-35, primer hogar, subsidio Mi Casa Ya"
                style={{...ss.input, flex:1, padding:"8px 10px", fontSize:12}} />
              <button onClick={()=>rmBuyer(i,bi)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16,padding:"8px 4px"}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
            </div>
          ))}
          <button onClick={()=>addBuyer(i)} style={{fontSize:12,color:tk.accent,background:"none",border:"none",cursor:"pointer",fontWeight:600,fontFamily:font,padding:"4px 0"}}>+ Agregar buyer persona</button>
        </Card>
      ))}
      <AddBtn onClick={add} label="Agregar Macroproyecto" />
    </div>
  );
}

/* ═══ STEPS 2-4: Torres, Equipos, Canales ═══ */
function S2({d,u}) {
  const ms=d.macros||[];const[sp,setSp]=useState(false);const[pt,sPt]=useState(0);const[tplModal,setTplModal]=useState(null);
  
  // Auto-create default torre for macros that have none
  useEffect(()=>{
    let changed=false;
    const n=[...ms];
    n.forEach((m,i)=>{
      if(m.nombre && !(m.torres||[]).length){
        n[i]={...m,torres:[{nombre:m.nombre,fechaEntrega:"",mesesCI:"",pctSep:"1",pctCI:"30",totalU:""}]};
        changed=true;
      }
    });
    if(changed) u("macros",n);
  },[ms.map(m=>m.nombre+"|"+(m.torres||[]).length).join(",")]);
  
  const up=(mi,ti,f,v)=>{const n=[...ms];n[mi]={...n[mi],torres:[...(n[mi].torres||[])]};n[mi].torres[ti]={...n[mi].torres[ti],[f]:v};u("macros",n)};
  const add=mi=>{
    const n=[...ms];
    const existing=n[mi].torres||[];
    const last=existing.length?existing[existing.length-1]:{};
    // Copy last torre, increment name
    const lastNum=(last.nombre||"").match(/(\d+)\s*$/);
    const newName=lastNum?last.nombre.replace(/(\d+)\s*$/,""+(parseInt(lastNum[1])+1)):(n[mi].nombre||"Torre")+" 2";
    n[mi]={...n[mi],torres:[...existing,{nombre:newName,fechaEntrega:last.fechaEntrega||"",mesesCI:last.mesesCI||"",pctSep:last.pctSep||"1",pctCI:last.pctCI||"30",totalU:last.totalU||""}]};
    u("macros",n);
  };
  const rm=(mi,ti)=>{const n=[...ms];n[mi]={...n[mi],torres:[...n[mi].torres]};n[mi].torres.splice(ti,1);u("macros",n)};
  const paste=rows=>{const n=[...ms];n[pt]={...n[pt],torres:[...(n[pt].torres||[]),...rows.map(r=>({nombre:r[0]||"",fechaEntrega:r[1]||"",mesesCI:r[2]||"",pctSep:r[3]||"1",pctCI:r[4]||"30",totalU:r[5]||""}))]};u("macros",n)};
  if(!ms.length) return <InfoBox type="warn">Agrega macroproyectos primero en el Paso 2.</InfoBox>;
  return (
    <div>
      <BulkBar onPaste={null} onTemplate={()=>setTplModal(getTemplate("torres",d.nombreConst,d.dominio))} templateLabel="FocuxAI Scraping — Torres" />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={sp} onClose={()=>sPt(false)||setSp(false)} onParse={paste} title={`Importar Torres → ${ms[pt]?.nombre||""}`} description="Nombre de torre, fecha entrega, meses cuota inicial, % separación, % cuota, total unidades"
        cols={[{label:"Torre",required:true},{label:"Fecha",required:true},{label:"Meses CI"},{label:"% Sep"},{label:"% CI"},{label:"Unidades"}]} example="Torre 1\t2028-06-15\t35\t1\t30\t120" />
      {ms.map((m,mi) => (
        <div key={mi} style={{marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h3 style={{margin:0,fontSize:15,fontWeight:700,color:tk.navy}}>{m.nombre||`Macro ${mi+1}`}</h3>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{sPt(mi);setSp(true)}} style={{padding:"5px 12px",borderRadius:6,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.textSec,fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:600}}>📋 Pegar torres</button>
            </div>
          </div>
          {(m.torres||[]).map((t,ti) => (
            <Card key={ti} title={t.nombre?`${m.nombre} ${t.nombre}`:`Torre ${ti+1}`} onRemove={()=>rm(mi,ti)}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
                <Inp label="Nombre Torre/Etapa" value={t.nombre} onChange={v=>up(mi,ti,"nombre",v)} required placeholder="Torre 1" note={t.nombre?`Nombre completo: ${m.nombre} ${t.nombre}`:""} />
                <Inp label="Fecha de Entrega" value={t.fechaEntrega} onChange={v=>up(mi,ti,"fechaEntrega",v)} type="date" />
                {d.tieneCotizador && <>
                  <Inp label="Meses Cuota Inicial" value={t.mesesCI} onChange={v=>up(mi,ti,"mesesCI",v)} type="number" placeholder="35" />
                  <Inp label="% Separación" value={t.pctSep} onChange={v=>up(mi,ti,"pctSep",v)} type="number" placeholder="1" />
                  <Inp label="% Cuota Inicial" value={t.pctCI} onChange={v=>up(mi,ti,"pctCI",v)} type="number" placeholder="30" />
                  <Inp label="Total Unidades" value={t.totalU} onChange={v=>up(mi,ti,"totalU",v)} type="number" placeholder="120" />
                </>}
              </div>
            </Card>
          ))}
          <AddBtn onClick={()=>add(mi)} label={`Agregar Torre a ${m.nombre||"macro"}`} />
        </div>
      ))}
    </div>
  );
}

function S3({d,u}) {
  const ms=d.macros||[];const[sp,setSp]=useState(false);const[pt,sPt]=useState(0);const[tplModal,setTplModal]=useState(null);
  const nivelesDisp = d.niveles.length ? d.niveles : DEF_NIVELES;
  const up=(mi,ai,f,v)=>{const n=[...ms];n[mi]={...n[mi],asesores:[...(n[mi].asesores||[])]};n[mi].asesores[ai]={...n[mi].asesores[ai],[f]:v};u("macros",n)};
  const toggleNivel=(mi,ai,niv)=>{
    const n=[...ms];n[mi]={...n[mi],asesores:[...(n[mi].asesores||[])]};
    const a=n[mi].asesores[ai];const cur=a.niveles||[];
    a.niveles=cur.includes(niv)?cur.filter(x=>x!==niv):[...cur,niv];
    n[mi].asesores[ai]=a;u("macros",n);
  };
  const add=mi=>{const n=[...ms];n[mi]={...n[mi],asesores:[...(n[mi].asesores||[]),{nombre:"",apellido:"",email:"",tel:"",ml:"",niveles:[...nivelesDisp]}]};u("macros",n)};
  const rm=(mi,ai)=>{const n=[...ms];n[mi]={...n[mi],asesores:[...n[mi].asesores]};n[mi].asesores.splice(ai,1);u("macros",n)};
  const paste=rows=>{const n=[...ms];n[pt]={...n[pt],asesores:[...(n[pt].asesores||[]),...rows.map(r=>{
    // Smart parse: if col 0 has space, split into nombre+apellido
    let nombre=r[0]||"",apellido="";
    const parts=nombre.trim().split(/\s+/);
    if(parts.length>=2 && !r[1]?.includes("@")){nombre=parts[0];apellido=parts.slice(1).join(" ");}
    else if(r[1] && !r[1].includes("@")){apellido=r[1];} 
    const emailIdx=r.findIndex(c=>(c||"").includes("@"));
    const email=emailIdx>=0?(r[emailIdx]||"").trim().toLowerCase():"";
    const afterEmail=emailIdx>=0?r.slice(emailIdx+1):[];
    const tel=afterEmail.find(c=>/^\+?\d[\d\s-]{6,}/.test(c||""))||"";
    const ml=afterEmail.find(c=>(c||"").includes("meeting")||(c||"").includes("hubspot.com")||(c||"").includes("calendly"))||"";
    return {nombre:nombre.trim(),apellido:apellido.trim(),email,tel:tel.trim(),ml:ml.trim(),niveles:[...nivelesDisp]};
  })]};u("macros",n)};
  if(!ms.length) return <InfoBox type="warn">Agrega macroproyectos primero en el Paso 2.</InfoBox>;
  return (
    <div>
      <InfoBox>Cada asesor define qué niveles de calificación atiende. Si varios asesores comparten los mismos niveles, HubSpot rota entre ellos (round robin).</InfoBox>
      <BulkBar onPaste={null} onTemplate={()=>setTplModal(getTemplate("equipos",d.nombreConst,d.dominio))} templateLabel="FocuxAI Scraping — Equipos" />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={sp} onClose={()=>setSp(false)} onParse={paste} title={`Importar Asesores → ${ms[pt]?.nombre||""}`}
        description="Nombre, apellido, email corporativo, teléfono, enlace de agendamiento"
        cols={[{label:"Nombre",required:true},{label:"Apellido",required:true},{label:"Email",required:true},{label:"Teléfono"},{label:"Meeting Link"}]} 
        example={"María\tGómez\tmaria@jimenez.com\t+573001234567\tmeetings.hubspot.com/maria\nCarlos\tLópez\tcarlos@jimenez.com\t+573009876543\t"} />
      {ms.map((m,mi) => (
        <div key={mi} style={{marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h3 style={{margin:0,fontSize:15,fontWeight:700,color:tk.navy}}>Equipo {m.nombre||mi+1}</h3>
            <button onClick={()=>{sPt(mi);setSp(true)}} style={{padding:"5px 12px",borderRadius:6,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.textSec,fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:600}}>📋 Pegar asesores</button>
          </div>
          {(m.asesores||[]).map((a,ai) => (
            <Card key={ai} title={`${a.nombre||""} ${a.apellido||""}`.trim()||`Asesor ${ai+1}`} onRemove={()=>rm(mi,ai)}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 10px"}}>
                <Inp label="Nombre" value={a.nombre} onChange={v=>up(mi,ai,"nombre",v)} required placeholder="María" />
                <Inp label="Apellido" value={a.apellido} onChange={v=>up(mi,ai,"apellido",v)} required placeholder="Gómez" />
                <Inp label="Email corporativo" value={a.email} onChange={v=>up(mi,ai,"email",v)} required placeholder="maria@jimenez.com" type="email" />
                <Inp label="Teléfono" value={a.tel} onChange={v=>up(mi,ai,"tel",v)} placeholder="+57 300 123 4567" />
              </div>
              <Inp label="Meeting Link" value={a.ml} onChange={v=>up(mi,ai,"ml",v)} placeholder="meetings.hubspot.com/maria (opcional)" />
              <div style={{marginTop:4}}>
                <label style={{...ss.label,marginBottom:6}}>Niveles que atiende</label>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {nivelesDisp.map(niv=>{
                    const active=(a.niveles||[]).includes(niv);
                    return (
                      <button key={niv} onClick={()=>toggleNivel(mi,ai,niv)} style={{
                        padding:"4px 12px",borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer",
                        border:`1.5px solid ${active?tk.accent:tk.border}`,
                        background:active?tk.accent+"15":tk.card,
                        color:active?tk.accent:tk.textTer,
                        fontFamily:font,transition:"all 0.15s",
                      }}>{niv}</button>
                    );
                  })}
                </div>
              </div>
            </Card>
          ))}
          <AddBtn onClick={()=>add(mi)} label={`Agregar Asesor a ${m.nombre||"equipo"}`} />
        </div>
      ))}
    </div>
  );
}

function S4({d,u}) {
  return (
    <div>
      <SectionHead sub="Pre-seleccionados. Desactiva los que no apliquen.">Canales Estándar</SectionHead>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
        {d.chStd.map((c,i)=><Chk key={i} label={c.n} checked={c.a} onChange={v=>{const n=[...d.chStd];n[i]={...n[i],a:v};u("chStd",n)}} />)}
      </div>
      <SectionHead sub="Activa solo los que la constructora use">Medios Tradicionales</SectionHead>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
        {d.chTr.map((c,i)=><Chk key={i} label={c.n} checked={c.a} onChange={v=>{const n=[...d.chTr];n[i]={...n[i],a:v};u("chTr",n)}} />)}
      </div>
      <SectionHead sub="Ferias específicas, aliados, etc.">Canales Personalizados</SectionHead>
      {d.chCu.map((c,i) => (
        <div key={i} style={{display:"flex",gap:8,marginBottom:8}}>
          <input value={c} onChange={e=>{const n=[...d.chCu];n[i]=e.target.value;u("chCu",n)}} placeholder="Ej: Feria Camacol Barranquilla 2026"
            style={{...ss.input, flex:1, padding:"8px 10px", fontSize:12}} />
          <button onClick={()=>{const n=[...d.chCu];n.splice(i,1);u("chCu",n)}} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
        </div>
      ))}
      <AddBtn onClick={()=>u("chCu",[...d.chCu,""])} label="Agregar canal personalizado" />
    </div>
  );
}

/* ═══ STEP 5: CALIFICACIÓN ═══ */
function S5({d,u}) {
  const upRegla=(i,f,v)=>{const n=[...d.reglas];n[i]={...n[i],[f]:v};u("reglas",n)};
  const rmRegla=i=>{const n=[...d.reglas];n.splice(i,1);u("reglas",n)};
  return (
    <div>
      <Chk label="Esta constructora usa calificación de leads" desc="Si no califica, se saltan los workflows de calificación" checked={d.usaCalif} onChange={v=>u("usaCalif",v)} />
      {d.usaCalif && <>
        <InfoBox>Los rangos de ingreso son comunes a toda la constructora. El ingreso mínimo por proyecto se define en cada macroproyecto (Paso 2).</InfoBox>

        <SectionHead sub="Defina todos los rangos de ingreso de la constructora">Rangos de Ingreso</SectionHead>
        <ChipEditor items={d.rangos} onChange={v=>u("rangos",v)} placeholder="Ej: Más de $20M" />

        <SectionHead sub="Ingreso mínimo por proyecto">Asignación por Macroproyecto</SectionHead>
        {(d.macros||[]).map((m,i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,marginBottom:8,padding:"8px 12px",background:tk.bg,borderRadius:8,border:`1px solid ${tk.border}`}}>
            <span style={{fontWeight:600,color:tk.navy,fontSize:13,minWidth:140}}>{m.nombre||`Macro ${i+1}`}</span>
            <select value={m.rangoMinimo||""} onChange={e=>{const n=[...d.macros];n[i]={...n[i],rangoMinimo:e.target.value};u("macros",n)}}
              style={{...ss.input,flex:1,padding:"7px 10px",fontSize:12}}>
              <option value="">Seleccionar rango mínimo...</option>
              {d.rangos.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <Badge text={m.tipo||"No VIS"} color={tk.accent} />
          </div>
        ))}
        {!d.macros.length && <InfoBox type="warn">Agrega macroproyectos en el Paso 2 para asignar rangos mínimos.</InfoBox>}

        <SectionHead sub="Etiquetas de prioridad del lead">Niveles de Calificación</SectionHead>
        <ChipEditor items={d.niveles} onChange={v=>u("niveles",v)} placeholder="Ej: E" note="Estándar Focux: AAA, AA, A, B, C, D. Edita según la constructora." />

        <SectionHead sub="Variables que se capturan en el formulario. Activa, edita opciones o crea nuevas.">Variables de Calificación</SectionHead>
        {d.varsCalif.map((v,i)=>{
          const upVar=(f,val)=>{const n=[...d.varsCalif];n[i]={...n[i],[f]:val};u("varsCalif",n)};
          const rmVar=()=>{const n=[...d.varsCalif];n.splice(i,1);u("varsCalif",n)};
          const isCustom = !["ingresos","ahorros","proposito","credito","subsidios","horario","horizonte"].includes(v.id);
          return (
            <div key={v.id||i} style={{padding:"12px 14px",marginBottom:8,borderRadius:10,border:`1.5px solid ${v.on?tk.accent+"40":tk.border}`,background:v.on?tk.accentLight+"60":tk.card,transition:"all 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:v.on&&(v.opts||[]).length?8:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                  <input type="checkbox" checked={v.on} onChange={e=>upVar("on",e.target.checked)} style={{width:18,height:18,accentColor:tk.accent,flexShrink:0}} />
                  {isCustom ? (
                    <input value={v.label} onChange={e=>upVar("label",e.target.value)} placeholder="Nombre de la variable..."
                      style={{...ss.input,padding:"5px 8px",fontSize:13,fontWeight:500,border:`1px solid ${tk.borderLight}`,flex:1}} />
                  ) : (
                    <span style={{fontWeight:500,fontSize:13,color:tk.text}}>{v.label}</span>
                  )}
                  {v.id==="ingresos" && <span style={{fontSize:10,color:tk.textTer}}>Opciones = Rangos de Ingreso</span>}
                </div>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  {isCustom && <button onClick={rmVar} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:14,padding:"2px 4px"}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>}
                </div>
              </div>
              {v.on && v.id!=="ingresos" && (
                <div style={{marginTop:4,paddingTop:8,borderTop:`1px solid ${tk.border}`}}>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
                    {(v.opts||[]).map((opt,oi)=>(
                      <Pill key={oi} text={opt} color={tk.accent} onRemove={()=>{const no=[...(v.opts||[])];no.splice(oi,1);upVar("opts",no)}} />
                    ))}
                    {!(v.opts||[]).length && <span style={{fontSize:11,color:tk.textTer,fontStyle:"italic"}}>Sin opciones definidas</span>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <input placeholder="Agregar opción..." onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){upVar("opts",[...(v.opts||[]),e.target.value.trim()]);e.target.value="";}}}
                      style={{...ss.input,flex:1,padding:"6px 10px",fontSize:11}} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <AddBtn onClick={()=>{
          const id="custom_"+Date.now();
          u("varsCalif",[...d.varsCalif,{id,label:"Nueva Variable",on:true,opts:[]}]);
        }} label="Agregar variable de calificación" />

        <SectionHead sub="Cómo se combinan las variables para asignar el nivel">Reglas de la Matriz</SectionHead>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:tk.navy}}>
                {["Si el ingreso es...","Y la condición es...","Entonces el nivel es...",""].map((h,i)=>(
                  <th key={i} style={{padding:"8px 10px",color:"#fff",fontWeight:600,textAlign:"left",fontSize:11}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.reglas.map((r,i)=>(
                <tr key={i} style={{background:i%2===0?tk.bg:tk.card,borderBottom:`1px solid ${tk.border}`}}>
                  <td style={{padding:"6px 8px"}}><input value={r.si} onChange={e=>upRegla(i,"si",e.target.value)} style={{...ss.input,padding:"5px 8px",fontSize:12,border:`1px solid ${tk.borderLight}`}} /></td>
                  <td style={{padding:"6px 8px"}}><input value={r.y} onChange={e=>upRegla(i,"y",e.target.value)} style={{...ss.input,padding:"5px 8px",fontSize:12,border:`1px solid ${tk.borderLight}`}} /></td>
                  <td style={{padding:"6px 8px"}}>
                    <select value={r.entonces} onChange={e=>upRegla(i,"entonces",e.target.value)} style={{...ss.input,padding:"5px 8px",fontSize:12,border:`1px solid ${tk.borderLight}`}}>
                      {d.niveles.map(n=><option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <td style={{padding:"6px 4px",width:30}}><button onClick={()=>rmRegla(i)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:14}}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={()=>u("reglas",[...d.reglas,{si:"",y:"",entonces:d.niveles[0]||""}])} style={{fontSize:12,color:tk.accent,background:"none",border:"none",cursor:"pointer",fontWeight:600,fontFamily:font,padding:"8px 0",marginTop:4}}>+ Agregar regla</button>

        <div style={{marginTop:16}}>
          <Inp label="Umbral de Lead Scoring (puntos)" value={d.umbral} onChange={v=>u("umbral",v)} type="number" required note="Cuando el lead alcanza este puntaje se dispara alerta al asesor. Estándar Focux: 75." />
        </div>
      </>}
    </div>
  );
}

/* ═══ STEP 6: ETAPAS LEAD ═══ */
function S6({d,u}) {
  const ed=(t,i,v)=>{const k=t==="p"?"etP":"etS";const n=[...d[k]];n[i]=v;u(k,n)};
  const rm=(t,i)=>{const k=t==="p"?"etP":"etS";const n=[...d[k]];n.splice(i,1);u(k,n)};
  const [spE,setSpE]=useState(false);const[tplModal,setTplModal]=useState(null);
  const pasteEtapas=(rows)=>{
    const newP=[], newS=[];
    rows.forEach(r=>{
      const fase=(r[0]||"").toLowerCase();
      const nombre=r[1]||r[0]||"";
      if(fase.includes("sala")||fase.includes("vent")||fase.includes("comercial")) newS.push(nombre);
      else if(r.length>=2) { if(fase.includes("prosp")||fase.includes("market")||fase.includes("bdr")) newP.push(r[1]||""); else newP.push(nombre); }
      else newP.push(nombre);
    });
    if(newP.length) u("etP",[...d.etP,...newP.filter(Boolean)]);
    if(newS.length) u("etS",[...d.etS,...newS.filter(Boolean)]);
  };
  return (
    <div>
      <InfoBox>Las etapas del lead trazan el recorrido desde la captura hasta el cierre. Vienen precargadas con el estándar Focux. Edita, agrega o elimina según la constructora.</InfoBox>
      <BulkBar onPaste={()=>setSpE(true)} onTemplate={()=>setTplModal(getTemplate("etapas_lead",d.nombreConst,d.dominio))} templateLabel="FocuxAI Scraping — Etapas" />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={spE} onClose={()=>setSpE(false)} onParse={pasteEtapas}
        title="Importar Etapas del Lead"
        description="Si incluyes columna Fase, las etapas se distribuyen automáticamente"
        cols={[{label:"Fase (Prospección/Sala)",required:false},{label:"Nombre Etapa",required:true}]}
        example={"Prospección\tLead Nuevo\nProspección\tIntento de Contacto\nSala\tVisitó Sala de Ventas\nSala\tCotización Enviada"} />
      <SectionHead>Fase Prospección (Marketing / BDR)</SectionHead>
      {d.etP.map((e,i)=>(
        <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
          <span style={{minWidth:24,color:tk.textTer,fontSize:12,fontWeight:600,textAlign:"right"}}>{i+1}</span>
          <input value={e} onChange={ev=>ed("p",i,ev.target.value)} style={{...ss.input,flex:1,padding:"8px 10px",fontSize:12}} />
          <button onClick={()=>rm("p",i)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
        </div>
      ))}
      <AddBtn onClick={()=>u("etP",[...d.etP,""])} label="Agregar etapa de prospección" />
      <SectionHead>Fase Sala de Ventas (Equipo Comercial)</SectionHead>
      {d.etS.map((e,i)=>(
        <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
          <span style={{minWidth:24,color:tk.textTer,fontSize:12,fontWeight:600,textAlign:"right"}}>{i+1}</span>
          <input value={e} onChange={ev=>ed("s",i,ev.target.value)} style={{...ss.input,flex:1,padding:"8px 10px",fontSize:12}} />
          <button onClick={()=>rm("s",i)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
        </div>
      ))}
      <AddBtn onClick={()=>u("etS",[...d.etS,""])} label="Agregar etapa de sala" />
    </div>
  );
}

/* ═══ STEP 7: PIPELINE ═══ */
function S7({d,u}) {
  const upPl=(i,f,v)=>{const n=[...d.pipeline];n[i]={...n[i],[f]:v};u("pipeline",n)};
  const rmPl=i=>{const n=[...d.pipeline];n.splice(i,1);u("pipeline",n)};
  const [spPl,setSpPl]=useState(false);const[tplModal,setTplModal]=useState(null);
  const pastePipeline=(rows)=>{
    const newStages=rows.map(r=>({n:r[0]||"",p:parseInt(r[1])||0})).filter(s=>s.n);
    u("pipeline",[...d.pipeline,...newStages]);
  };
  return (
    <div>
      <InfoBox>Las etapas del pipeline representan el avance del negocio (deal) desde la cotización hasta el cierre. Cada etapa tiene una probabilidad de cierre que alimenta el forecast.</InfoBox>
      <BulkBar onPaste={()=>setSpPl(true)} onTemplate={()=>setTplModal(getTemplate("pipeline",d.nombreConst,d.dominio))} templateLabel="FocuxAI Scraping — Pipeline" />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={spPl} onClose={()=>setSpPl(false)} onParse={pastePipeline}
        title="Importar Etapas del Pipeline"
        description="Nombre de la etapa y probabilidad de cierre (%)"
        cols={[{label:"Nombre Etapa",required:true},{label:"% Probabilidad",required:true}]}
        example={"Cotización Solicitada\t10\nOpcionó\t40\nConsignó\t60\nVenta Formalizada\t100\nPerdida\t0"} />
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead>
            <tr style={{background:tk.navy}}>
              <th style={{padding:"10px 12px",color:"#fff",fontWeight:600,textAlign:"left",width:40}}>#</th>
              <th style={{padding:"10px 12px",color:"#fff",fontWeight:600,textAlign:"left"}}>Nombre de la Etapa</th>
              <th style={{padding:"10px 12px",color:"#fff",fontWeight:600,textAlign:"center",width:120}}>% Probabilidad</th>
              <th style={{padding:"10px 12px",width:40}}></th>
            </tr>
          </thead>
          <tbody>
            {d.pipeline.map((s,i) => (
              <tr key={i} style={{background:i%2===0?tk.bg:tk.card,borderBottom:`1px solid ${tk.border}`}}>
                <td style={{padding:"8px 12px",color:tk.textTer,fontWeight:600}}>{i+1}</td>
                <td style={{padding:"6px 8px"}}><input value={s.n} onChange={e=>upPl(i,"n",e.target.value)} style={{...ss.input,padding:"7px 10px",fontSize:13,border:`1px solid ${tk.borderLight}`}} /></td>
                <td style={{padding:"6px 8px",textAlign:"center"}}>
                  <input type="number" value={s.p} onChange={e=>upPl(i,"p",+e.target.value||0)} min={0} max={100}
                    style={{...ss.input,width:70,padding:"7px 10px",fontSize:13,textAlign:"center",border:`1px solid ${tk.borderLight}`,display:"inline-block"}} />
                  <span style={{color:tk.textTer,marginLeft:4}}>%</span>
                </td>
                <td style={{padding:"6px 4px"}}><button onClick={()=>rmPl(i)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:14}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={()=>u("pipeline",[...d.pipeline,{n:"",p:0}])} style={{fontSize:12,color:tk.accent,background:"none",border:"none",cursor:"pointer",fontWeight:600,fontFamily:font,padding:"8px 0",marginTop:4}}>+ Agregar etapa al pipeline</button>
    </div>
  );
}

/* ═══ STEPS 8-9: Motivos, Agente ═══ */
function S8({d,u}) {
  const ed=(t,i,v)=>{const k=t==="d"?"moD":"moP";const n=[...d[k]];n[i]=v;u(k,n)};
  const rm=(t,i)=>{const k=t==="d"?"moD":"moP";const n=[...d[k]];n.splice(i,1);u(k,n)};
  const [spM,setSpM]=useState(false);const[tplModal,setTplModal]=useState(null);
  const pasteMotivos=(rows)=>{
    const newD=[], newP=[];
    rows.forEach(r=>{
      const tipo=(r[0]||"").toLowerCase();
      const motivo=r[1]||r[0]||"";
      if(tipo.includes("pérdida")||tipo.includes("perdida")||tipo.includes("loss")) newP.push(r[1]||"");
      else if(r.length>=2) { if(tipo.includes("descarte")||tipo.includes("discard")) newD.push(r[1]||""); else newD.push(motivo); }
      else newD.push(motivo);
    });
    if(newD.length) u("moD",[...d.moD,...newD.filter(Boolean)]);
    if(newP.length) u("moP",[...d.moP,...newP.filter(Boolean)]);
  };
  return (
    <div>
      <BulkBar onPaste={()=>setSpM(true)} onTemplate={()=>setTplModal(getTemplate("motivos",d.nombreConst,d.dominio))} templateLabel="FocuxAI Scraping — Motivos" />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={spM} onClose={()=>setSpM(false)} onParse={pasteMotivos}
        title="Importar Motivos"
        description="Si incluyes columna Tipo (Descarte/Pérdida), se distribuyen automáticamente"
        cols={[{label:"Tipo (Descarte/Pérdida)",required:false},{label:"Motivo",required:true}]}
        example={"Descarte\tIngresos insuficientes\nDescarte\tNo interesado\nPérdida\tCompró en Otro Proyecto\nPérdida\tNo salió préstamo"} />
      <SectionHead sub="Razones por las que un lead se descarta antes de convertirse en negocio">Motivos de Descarte del Lead</SectionHead>
      {d.moD.map((m,i)=>(
        <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
          <input value={m} onChange={e=>ed("d",i,e.target.value)} style={{...ss.input,flex:1,padding:"8px 10px",fontSize:12}} />
          <button onClick={()=>rm("d",i)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
        </div>
      ))}
      <AddBtn onClick={()=>u("moD",[...d.moD,""])} label="Agregar motivo de descarte" />
      <SectionHead sub="Razones por las que un negocio se pierde después de cotizar">Motivos de Pérdida del Negocio</SectionHead>
      {d.moP.map((m,i)=>(
        <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
          <input value={m} onChange={e=>ed("p",i,e.target.value)} style={{...ss.input,flex:1,padding:"8px 10px",fontSize:12}} />
          <button onClick={()=>rm("p",i)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
        </div>
      ))}
      <AddBtn onClick={()=>u("moP",[...d.moP,""])} label="Agregar motivo de pérdida" />
    </div>
  );
}

function S9({d,u}) {
  if(!d.tieneAgente) return <InfoBox type="warn">El Módulo 4 (Agente IA) no está activado. Puedes activarlo en el Paso 1 (Setup).</InfoBox>;
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Inp label="Nombre del Agente" value={d.nomAgente} onChange={v=>u("nomAgente",v)} required placeholder="Ana" />
        <Sel label="Tono" value={d.tonoAgente} onChange={v=>u("tonoAgente",v)} required options={["Profesional y cálido","Formal y corporativo","Cercano y juvenil"]} />
      </div>
      <Inp label="Número WhatsApp WABA" value={d.wabaNum} onChange={v=>u("wabaNum",v)} required placeholder="+57 300 123 4567" />
      <SectionHead>Tipos de Lead que activan el Agente outbound</SectionHead>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {(d.niveles.length?d.niveles:["AAA","AA","A","B","C","D"]).map(t=>(
          <Chk key={t} label={t} checked={d.tiposAgente.includes(t)} onChange={v=>u("tiposAgente",v?[...d.tiposAgente,t]:d.tiposAgente.filter(x=>x!==t))} />
        ))}
      </div>
    </div>
  );
}

/* ═══ STEP 10: VALIDATION ═══ */
function S10({d}) {
  const {w,e}=validate(d);
  const pcts=Array.from({length:10},(_,i)=>calcPct(d,i));
  const avg=Math.round(pcts.reduce((a,b)=>a+b,0)/10);
  return (
    <div>
      <div style={{padding:16,background:avg===100?tk.greenBg:avg>70?tk.amberBg:tk.redBg,borderRadius:12,marginBottom:16,textAlign:"center"}}>
        <p style={{fontSize:32,fontWeight:800,color:avg===100?tk.green:avg>70?tk.amber:tk.red,margin:0,fontFamily:font}}>{avg}%</p>
        <p style={{fontSize:13,color:tk.text,margin:"4px 0 0"}}>Completitud general</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:20}}>
        {STEPS.slice(0,10).map((s,i)=>{const p=pcts[i];return(
          <div key={i} style={{padding:8,borderRadius:8,background:p===100?tk.greenBg:p>50?tk.amberBg:tk.redBg,textAlign:"center",border:`1px solid ${p===100?tk.green+"30":p>50?tk.amber+"30":tk.red+"30"}`}}>
            <p style={{margin:0,fontSize:16}}>{s.i}</p>
            <p style={{margin:"2px 0 0",fontSize:14,fontWeight:700,color:p===100?tk.green:p>50?tk.amber:tk.red}}>{p}%</p>
          </div>
        )})}
      </div>
      {e.length>0&&<div style={{marginBottom:16}}>
        <h3 style={{color:tk.red,fontSize:13,fontWeight:700,marginBottom:8}}>Errores — corregir antes de ejecutar</h3>
        {e.map((x,i)=><p key={i} style={{fontSize:12,color:tk.red,margin:"4px 0",padding:"8px 12px",background:tk.redBg,borderRadius:6,borderLeft:`3px solid ${tk.red}`}}>• {x}</p>)}
      </div>}
      {w.length>0&&<div>
        <h3 style={{color:tk.amber,fontSize:13,fontWeight:700,marginBottom:8}}>Advertencias — revisar</h3>
        {w.map((x,i)=><p key={i} style={{fontSize:12,color:"#92400E",margin:"4px 0",padding:"8px 12px",background:tk.amberBg,borderRadius:6,borderLeft:`3px solid ${tk.amber}`}}>• {x}</p>)}
      </div>}
      {!e.length&&!w.length&&<div style={{textAlign:"center",padding:20}}><p style={{fontSize:16,color:tk.green,fontWeight:700}}>✅ Todo validado. Listo para ejecutar.</p></div>}
    </div>
  );
}

/* ═══ STEP 11: EXECUTION ═══ */
function S11({d,u}) {
  const prms=useMemo(()=>genPrompts(d),[d]);
  const execPrms = prms.filter(p=>p.tp==="exec");
  const specPrms = prms.filter(p=>p.tp==="spec");
  const ex=d.ex||{};
  const [tab,setTab]=useState("exec"); // "exec" or "spec"
  const [tplModal,setTplModal]=useState(null);
  const [copied,setCopied]=useState("");
  const cp=t=>{
    // Try navigator.clipboard first, fallback to textarea execCommand
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied("ok"); setTimeout(()=>setCopied(""),1500); }
      catch(e) { console.error("Copy failed"); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(()=>{setCopied("ok");setTimeout(()=>setCopied(""),1500)}).catch(fallback);
    } else { fallback(); }
  };

  const expJ=()=>{
    const json = JSON.stringify(d,null,2);
    try {
      const b=new Blob([json],{type:"application/json"});
      const u2=URL.createObjectURL(b);
      const a=document.createElement("a");a.href=u2;a.download=`${d.nombreConst||"config"}_hubspot.json`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u2);
    } catch(e) {
      cp(json);
    }
  };
  const genCSV=(type)=>{
    let cols=[];
    if(type==="contactos") cols=["email","firstname","lastname","phone","cedula_fx","lista_proyectos_fx","canal_atribucion_fx","tipo_lead_fx","rango_ingresos_fx","tiene_ahorros_fx","proposito_compra_fx","etapa_lead_fx","horizonte_compra_fx","horario_contacto_fx","id_externo_fx"];
    else cols=["dealname","macroproyecto_fx","proyecto_torre_fx","valor_cotizacion_fx","tipo_unidad_fx","area_m2_fx","pipeline","dealstage","cedula_comp1_fx","nombre_comp2_fx","apellido_comp2_fx","tel_comp2_fx","email_comp2_fx","cedula_comp2_fx","id_externo_deal_fx"];
    const csv=cols.join(",")+"\n"+cols.map(()=>"").join(",")+"\n";
    try {
      const b=new Blob([csv],{type:"text/csv"});const u2=URL.createObjectURL(b);
      const a=document.createElement("a");a.href=u2;a.download=`plantilla_migracion_${type}_${d.nombreConst||"constructora"}.csv`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u2);
    } catch(e) { cp(csv); }
  };

  // Copy all prompts of current tab
  const copyAll = (items) => {
    const text = items.map(p => `=== ${p.id} ===\n${p.pr}`).join("\n\n");
    cp(text);
  };
  // Copy all of a category
  const copyCat = (catItems) => {
    const text = catItems.map(p => `=== ${p.id} ===\n${p.pr}`).join("\n\n");
    cp(text);
  };
  // Toggle all in category: if all done → unmark, if any undone → mark all
  const markCatDone = (catItems) => {
    const allDone = catItems.every(p => ex[p.id]);
    const newEx = {...ex};
    catItems.forEach(p => { newEx[p.id] = !allDone; });
    u("ex", newEx);
  };

  const currentPrms = tab === "exec" ? execPrms : specPrms;
  const cats = [...new Set(currentPrms.map(p=>p.cat))];
  const totDone = Object.values(ex).filter(Boolean).length;

  return(
    <div>
      {/* Header stats */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <p style={{margin:0,fontSize:13,fontWeight:600,color:tk.text}}>{execPrms.length} prompts Breeze · {specPrms.length} pasos manuales · <span style={{color:tk.green}}>{totDone} hechos</span></p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={expJ} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.text,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>📥 JSON</button>
          <button onClick={()=>genCSV("contactos")} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.text,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>📄 CSV Contactos</button>
          <button onClick={()=>genCSV("negocios")} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.text,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>📄 CSV Negocios</button>
          <button onClick={()=>setTplModal(getTemplate("macroproyectos",d.nombreConst,d.dominio))} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${tk.accent}`,background:tk.accentLight,color:tk.accent,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>⚡ FocuxAI Scraping</button>
        </div>
      </div>

      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />

      {/* Tab selector */}
      <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:`2px solid ${tk.border}`}}>
        <button onClick={()=>setTab("exec")} style={{padding:"10px 24px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:font,border:"none",borderBottom:tab==="exec"?`3px solid ${tk.accent}`:"3px solid transparent",background:"none",color:tab==="exec"?tk.navy:tk.textTer,transition:"all 0.2s"}}>
          ⚡ Prompts Breeze ({execPrms.length})
        </button>
        <button onClick={()=>setTab("spec")} style={{padding:"10px 24px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:font,border:"none",borderBottom:tab==="spec"?`3px solid ${tk.amber}`:"3px solid transparent",background:"none",color:tab==="spec"?tk.navy:tk.textTer,transition:"all 0.2s"}}>
          📋 Guía de Configuración Manual ({specPrms.length})
        </button>
      </div>

      {/* Copy all bar + global mark toggle */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>copyAll(currentPrms)} style={{padding:"8px 18px",borderRadius:8,border:"none",background:tab==="exec"?`linear-gradient(135deg,${tk.teal},${tk.blue})`:`linear-gradient(135deg,${tk.amber},#D97706)`,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>
            {copied==="ok"?"✓ Copiado":"📋 Copiar todo"} ({currentPrms.length} {tab==="exec"?"prompts":"pasos"})
          </button>
          <button onClick={()=>{
            const allDone = currentPrms.every(p=>ex[p.id]);
            const newEx={...ex};
            currentPrms.forEach(p=>{newEx[p.id]=!allDone});
            u("ex",newEx);
          }} style={{padding:"8px 18px",borderRadius:8,border:`1.5px solid ${currentPrms.every(p=>ex[p.id])?tk.amber:tk.green}`,background:currentPrms.every(p=>ex[p.id])?tk.amberBg:tk.greenBg,color:currentPrms.every(p=>ex[p.id])?"#92400E":tk.green,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>
            {currentPrms.every(p=>ex[p.id])?"↩ Desmarcar todo":"✓ Marcar todo"}
          </button>
        </div>
        {tab==="spec" && <p style={{margin:0,fontSize:11,color:tk.textTer,fontStyle:"italic"}}>Instrucciones paso a paso para el consultor Focux</p>}
      </div>

      {/* Content by category */}
      {cats.map(cat=>{const ps=currentPrms.filter(p=>p.cat===cat);return(
        <div key={cat} style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:6,marginBottom:8,borderBottom:`1.5px solid ${tk.border}`}}>
            <h3 style={{margin:0,fontSize:13,fontWeight:700,color:tk.navy}}>{cat}</h3>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={()=>copyCat(ps)} style={{padding:"3px 10px",borderRadius:5,border:`1.5px solid ${tk.accent}30`,background:tk.card,color:tk.accent,fontSize:10,cursor:"pointer",fontWeight:600,fontFamily:font}}>Copiar sección</button>
              <span style={{fontSize:11,color:tk.textTer,fontWeight:600}}>{ps.filter(p=>ex[p.id]).length}/{ps.length}</span>
            </div>
          </div>
          {ps.map(pr=>(
            <div key={pr.id} style={{border:`1.5px solid ${ex[pr.id]?tk.green+"40":tk.border}`,borderRadius:8,padding:10,marginBottom:8,background:ex[pr.id]?tk.greenBg:tk.card,transition:"all 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:tk.navy}}>{pr.id}</span>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>cp(pr.pr)} style={{padding:"3px 10px",borderRadius:5,border:`1.5px solid ${tk.accent}30`,background:tk.card,color:tk.accent,fontSize:10,cursor:"pointer",fontWeight:600}}>Copiar</button>
                  <label style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:tk.green,cursor:"pointer",fontWeight:600}}>
                    <input type="checkbox" checked={!!ex[pr.id]} onChange={()=>u("ex",{...ex,[pr.id]:!ex[pr.id]})} style={{accentColor:tk.green,width:14,height:14}} />✓
                  </label>
                </div>
              </div>
              <pre style={{fontFamily:"monospace",fontSize:10,color:tk.textSec,margin:0,whiteSpace:"pre-wrap",lineHeight:1.5,maxHeight:120,overflow:"auto"}}>{pr.pr}</pre>
            </div>
          ))}
        </div>
      )})}
    </div>
  );
}

/* ═══ STEP 12: OBJECIONES ═══ */
function S12() {
  const[f,sF]=useState("Todas");
  const cs=["Todas",...new Set(OBJS.map(o=>o.c))];
  const fl=f==="Todas"?OBJS:OBJS.filter(o=>o.c===f);
  return(
    <div>
      <p style={{fontSize:13,color:tk.textSec,marginBottom:14,lineHeight:1.5}}>Respuestas probadas a las objeciones más comunes durante talleres de kickoff e implementación. Usa esta guía para mantener la confianza del cliente en la metodología.</p>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {cs.map(c=><button key={c} onClick={()=>sF(c)} style={{padding:"5px 14px",borderRadius:20,border:`1.5px solid ${f===c?tk.accent:tk.border}`,background:f===c?tk.accent:tk.card,color:f===c?"#fff":tk.textSec,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font,transition:"all 0.2s"}}>{c}</button>)}
      </div>
      {fl.map((o,i)=>(
        <Card key={i}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <p style={{margin:0,fontSize:13,fontWeight:700,color:tk.red}}>"{o.q}"</p>
            <Badge text={o.c} color={tk.accent} />
          </div>
          <p style={{margin:0,fontSize:13,color:tk.text,lineHeight:1.6,paddingLeft:12,borderLeft:`3px solid ${tk.green}`}}>{o.a}</p>
        </Card>
      ))}
    </div>
  );
}

/* ═══ STEP 13: METRICS ═══ */
function S13({d}) {
  const ms=d.macros||[];const prms=genPrompts(d);const en=Object.values(d.ex||{}).filter(Boolean).length;
  const eP=prms.filter(p=>p.tp==="exec").length,sP=prms.filter(p=>p.tp==="spec").length;
  const totalBuyers=ms.reduce((a,m)=>a+(m.buyers||[]).length,0);
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
        {[["Macroproyectos",ms.length,"🏗️"],["Torres",ms.reduce((a,m)=>a+(m.torres||[]).length,0),"🏠"],["Asesores",ms.reduce((a,m)=>a+(m.asesores||[]).length,0),"👥"],["Buyer Personas",totalBuyers,"🎯"],
          ["Canales",d.chStd.filter(c=>c.a).length+d.chTr.filter(c=>c.a).length+d.chCu.filter(Boolean).length,"📡"],["Total Pasos",prms.length,"🚀"],["Breeze",eP,"⚡"],["Manual",sP,"📋"],
          ["Ejecutados",en,"✅"],["Pendientes",prms.length-en,"⏳"],["Niveles Calif",d.niveles.length,"⭐"],["Etapas Pipeline",d.pipeline.length,"📊"]].map(([l,v,icon],i)=>(
          <div key={i} style={{padding:14,background:tk.card,borderRadius:10,textAlign:"center",border:`1px solid ${tk.border}`}}>
            <p style={{margin:0,fontSize:20}}>{icon}</p>
            <p style={{margin:"4px 0 0",fontSize:22,fontWeight:800,color:tk.navy,fontFamily:font}}>{v}</p>
            <p style={{margin:"2px 0 0",fontSize:10,color:tk.textTer,fontWeight:600}}>{l}</p>
          </div>
        ))}
      </div>
      <Card>
        <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.navy}}>Suscripción</p>
        <p style={{margin:"4px 0 0",fontSize:12,color:tk.textSec}}>Sales: {d.hubSales} · Marketing: {d.hubMarketing} · Service: {d.hubService} · Content: {d.hubContent}</p>
      </Card>
      <Card>
        <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.navy}}>Módulos activos</p>
        <p style={{margin:"4px 0 0",fontSize:12,color:tk.textSec}}>M1: Marketing ✅ · M2: Sales ✅{d.tieneCotizador?" · M3: Cotizador ✅":""}{d.tieneAgente?" · M4: Agente ✅":""} · M5-M7 ✅</p>
      </Card>
      {d.crmOrigen!=="Ninguno"&&<Card>
        <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.amber}}>Migración planificada</p>
        <p style={{margin:"4px 0 0",fontSize:12,color:tk.textSec}}>Origen: {d.crmOrigen} · Volumen: {d.volRegistros||"N/D"} · Adjuntos: {d.tieneAdj?"Sí":"No"}</p>
      </Card>}
      <div style={{padding:14,background:tk.bg,borderRadius:10,textAlign:"center",marginTop:12,border:`1px solid ${tk.border}`}}>
        <p style={{margin:0,fontSize:13,fontWeight:700,color:tk.navy}}>⏱ Tiempo estimado total</p>
        <p style={{margin:"4px 0 0",fontSize:24,fontWeight:800,color:tk.accent,fontFamily:font}}>~{Math.round((eP*1.5+sP*5)/60*10)/10} horas</p>
      </div>
    </div>
  );
}

/* ═══ MAIN APP ═══ */
export default function OpsWizard() {
  const [d, setD] = useState(INIT);
  const [ok, sOk] = useState(false);
  const [saving, sSv] = useState(false);

  useEffect(() => {
    ld().then(s => {
      if (s) {
        // Migrate varsCalif opts
        if (s.varsCalif) {
          const defMap = {};
          DEF_VARS.forEach(v => { defMap[v.id] = v; });
          s.varsCalif = s.varsCalif.map(v => ({
            ...v,
            opts: v.opts || (defMap[v.id] ? defMap[v.id].opts : []),
          }));
          DEF_VARS.forEach(dv => {
            if (!s.varsCalif.find(v => v.id === dv.id)) {
              s.varsCalif.push({...dv});
            }
          });
        }
        // Migrate asesores: split nombre into nombre+apellido if apellido missing
        // + clean up prices to digits-only
        if (s.macros) {
          s.macros = s.macros.map(m => ({
            ...m,
            precioDesde: String(m.precioDesde||"").replace(/[^0-9]/g,""),
            cuotaDesde: String(m.cuotaDesde||"").replace(/[^0-9]/g,""),
            asesores: (m.asesores||[]).map(a => {
              if (a.apellido !== undefined) return a;
              const parts = (a.nombre||"").trim().split(/\s+/);
              return { ...a, nombre: parts[0]||"", apellido: parts.slice(1).join(" ")||"", tel: a.tel||"" };
            }),
          }));
        }
        setD(prev => ({ ...INIT, ...s }));
      }
      sOk(true);
    });
  }, []);

  const persist = useCallback(async nd => { sSv(true); await sv(nd); setTimeout(() => sSv(false), 500); }, []);
  const u = useCallback((f, v) => { setD(prev => { const next = { ...prev, [f]: v }; persist(next); return next; }); }, [persist]);
  const goTo = step => { const next = { ...d, step }; setD(next); persist(next); };

  if (!ok) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: tk.bg, fontFamily: font }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${tk.border}`, borderTopColor: tk.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: tk.textSec, fontSize: 13 }}>Cargando configuración...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  const Comps = [S0, S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13];
  const Cur = Comps[d.step] || S0;

  return (
    <div style={{ fontFamily: font, background: tk.bg, minHeight: "100vh", color: tk.text }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${tk.navy} 0%, ${tk.blue} 50%, ${tk.teal} 100%)`, padding: "0 24px", height: 52, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚡</div>
          <div>
            <h1 style={{ margin: 0, color: "#fff", fontSize: 14, fontWeight: 800, letterSpacing: "0.05em" }}>FOCUXAI OPS</h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 500 }}>HubSpot Implementation Engine</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saving && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Guardando...</span>}
          {d.nombreConst && <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600 }}>{d.nombreConst}</span>}
        </div>
      </div>

      <div style={{ display: "flex", maxWidth: 1280, margin: "0 auto" }}>
        {/* Sidebar */}
        <div style={{ width: 220, minHeight: "calc(100vh - 52px)", background: tk.card, borderRight: `1px solid ${tk.border}`, padding: "16px 0", flexShrink: 0, overflow: "auto" }}>
          {STEPS.map((s, i) => {
            const pct = i < 10 ? calcPct(d, i) : -1;
            const active = d.step === i;
            return (
              <button key={i} onClick={() => goTo(i)} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px",
                background: active ? tk.accentLight : "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
                borderRight: active ? `3px solid ${tk.accent}` : "3px solid transparent",
                transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{s.i}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: active ? 700 : 500, color: active ? tk.navy : tk.textSec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.t}
                  </p>
                  {pct >= 0 && (
                    <div style={{ height: 3, borderRadius: 2, background: tk.borderLight, marginTop: 4 }}>
                      <div style={{ height: 3, borderRadius: 2, background: pct === 100 ? tk.green : pct > 50 ? tk.amber : tk.red, width: `${pct}%`, transition: "width 0.3s" }} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: "28px 32px", maxWidth: 820, overflow: "auto" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{STEPS[d.step].i}</span>
              <h2 style={{ margin: 0, color: tk.navy, fontSize: 22, fontWeight: 800 }}>{STEPS[d.step].t}</h2>
            </div>
            <p style={{ margin: 0, color: tk.textTer, fontSize: 13 }}>{STEPS[d.step].d}</p>
          </div>

          <Cur d={d} u={u} />

          {/* Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 20, borderTop: `1px solid ${tk.border}` }}>
            <button onClick={() => goTo(Math.max(0, d.step - 1))} disabled={d.step === 0}
              style={{
                padding: "10px 24px", borderRadius: 8, border: `1.5px solid ${tk.border}`,
                background: tk.card, color: d.step === 0 ? tk.textTer : tk.text,
                fontSize: 13, cursor: d.step === 0 ? "default" : "pointer", fontWeight: 600, fontFamily: font,
                opacity: d.step === 0 ? 0.5 : 1, transition: "all 0.2s",
              }}>← Anterior</button>
            <button onClick={() => goTo(Math.min(STEPS.length - 1, d.step + 1))} disabled={d.step === STEPS.length - 1}
              style={{
                padding: "10px 28px", borderRadius: 8, border: "none",
                background: d.step === STEPS.length - 1 ? tk.border : `linear-gradient(135deg, ${tk.teal}, ${tk.blue})`,
                color: "#fff", fontSize: 13, cursor: d.step === STEPS.length - 1 ? "default" : "pointer",
                fontWeight: 600, fontFamily: font, transition: "all 0.2s",
                boxShadow: d.step === STEPS.length - 1 ? "none" : "0 2px 8px rgba(13,122,181,0.3)",
              }}>Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
