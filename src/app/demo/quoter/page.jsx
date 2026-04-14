"use client";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════
   FOCUXAI COTIZADOR v2 — Constructora Jiménez Demo
   Light theme, real branding, complete quotation flow
   ═══════════════════════════════════════════════════════════════ */

// ── DESIGN TOKENS (from constructorajimenez.com) ──
const C = {
  gold: "#B8963E", goldDark: "#9A7B2F", goldLight: "#D4B96E", goldBg: "#F9F5EC",
  goldBorder: "#E8D5A8",
  navy: "#1B2A4A", navyLight: "#2C3E5F",
  bg: "#FAFAF7", white: "#FFFFFF", card: "#FFFFFF",
  border: "#E8E5DE", borderLight: "#F0EDE6",
  text: "#1B2A4A", textSec: "#6B7280", textTer: "#9CA3AF", textGold: "#8B7130",
  green: "#16A34A", greenBg: "#F0FDF4", greenBorder: "#BBF7D0",
  yellow: "#D97706", yellowBg: "#FFFBEB", yellowBorder: "#FDE68A",
  red: "#DC2626", redBg: "#FEF2F2", redBorder: "#FECACA",
  blue: "#2563EB", blueBg: "#EFF6FF",
};

// ── COUNTRY CODES ──
const COUNTRIES = [
  { code: "+57", flag: "🇨🇴", name: "Colombia", len: 10 },
  { code: "+1", flag: "🇺🇸", name: "Estados Unidos", len: 10 },
  { code: "+52", flag: "🇲🇽", name: "México", len: 10 },
  { code: "+34", flag: "🇪🇸", name: "España", len: 9 },
  { code: "+507", flag: "🇵🇦", name: "Panamá", len: 8 },
  { code: "+593", flag: "🇪🇨", name: "Ecuador", len: 9 },
  { code: "+51", flag: "🇵🇪", name: "Perú", len: 9 },
  { code: "+58", flag: "🇻🇪", name: "Venezuela", len: 10 },
  { code: "+56", flag: "🇨🇱", name: "Chile", len: 9 },
  { code: "+54", flag: "🇦🇷", name: "Argentina", len: 10 },
];

// ── MOCK ASESORES (from Sinco: 57 vendedores) ──
const ASESORES = [
  { id: 101, nombre: "María Camila Rodríguez" },
  { id: 102, nombre: "Carlos Andrés Jiménez" },
  { id: 103, nombre: "Ana Lucía Ospina" },
  { id: 104, nombre: "Juan Pablo Mejía" },
  { id: 105, nombre: "Laura Valentina Torres" },
  { id: 106, nombre: "Santiago Bolaño" },
  { id: 107, nombre: "Daniela Herrera" },
  { id: 108, nombre: "Andrés Felipe Castro" },
];

// ── MOCK DATA (Real Porto Sabbia) ──
const MACROS = [
  { id: 58, nombre: "Porto Sabbia", ciudad: "Santa Marta", zona: "Puerto Gaira", estado: "En lanzamiento" },
  { id: 33, nombre: "Salguero Beach", ciudad: "Santa Marta", zona: "Playa Salguero", estado: "En construcción" },
  { id: 45, nombre: "Coralina", ciudad: "Santa Marta", zona: "Pozos Colorados", estado: "En construcción" },
];

const TORRES = {
  58: [
    { id: 1, nombre: "Suites Torre 1", tipo: "Apartasuite", precioDesde: 485450000, areaDesde: 34.21, areaHasta: 54.19 },
    { id: 2, nombre: "Residences Torre 2", tipo: "Apartamento", precioDesde: 638800000, areaDesde: 51.11, areaHasta: 133.42 },
  ],
  33: [
    { id: 3, nombre: "Torre A", tipo: "Apartamento", precioDesde: 520000000, areaDesde: 45, areaHasta: 95 },
    { id: 4, nombre: "Torre B", tipo: "Apartamento", precioDesde: 490000000, areaDesde: 42, areaHasta: 88 },
  ],
  45: [
    { id: 5, nombre: "Sunset", tipo: "Apartamento turístico", precioDesde: 298000000, areaDesde: 34, areaHasta: 65.88 },
  ],
};

const CONFIG = {
  separacion_pct: 5, cuota_inicial_pct: 30, cuotas_default: 24,
  financiacion_pct: 70, dias_bloqueo: 4, vigencia_cotizacion: 7,
  agrupaciones_preestablecidas: true,
};

const TIPS_SUITES = [
  { tipo: "A1", area: 43.12, habs: 1, banos: 1 },
  { tipo: "A2", area: 34.21, habs: 1, banos: 1 },
  { tipo: "A3", area: 38.50, habs: 1, banos: 1 },
  { tipo: "A4", area: 54.19, habs: 1, banos: 1 },
];
const TIPS_RES = [
  { tipo: "B3", area: 74.62, habs: 2, banos: 2 },
  { tipo: "B3A", area: 86.34, habs: 2, banos: 2 },
  { tipo: "B4", area: 68.57, habs: 2, banos: 3 },
  { tipo: "B5", area: 65.64, habs: 2, banos: 3 },
  { tipo: "B6", area: 51.70, habs: 1, banos: 2 },
  { tipo: "B7", area: 81.72, habs: 2, banos: 3 },
  { tipo: "B8", area: 72.86, habs: 2, banos: 2 },
  { tipo: "B9", area: 73.69, habs: 2, banos: 2 },
  { tipo: "B10", area: 76.91, habs: 2, banos: 3 },
  { tipo: "C1", area: 133.42, habs: 3, banos: 4 },
  { tipo: "C2", area: 107.71, habs: 3, banos: 3 },
  { tipo: "C2A", area: 104.48, habs: 3, banos: 3 },
  { tipo: "C3", area: 103.59, habs: 3, banos: 3 },
  { tipo: "C4", area: 109.55, habs: 3, banos: 3 },
  { tipo: "C4A", area: 107.71, habs: 3, banos: 3 },
];

const ESTADOS = { D: "disponible", B: "bloqueada", V: "vendida", C: "cotizada" };
function genUnits(tid, tips, pisos, pBase) {
  const u = []; let id = tid * 1000;
  for (let p = 1; p <= pisos; p++) {
    tips.slice(0, Math.min(4, tips.length)).forEach((t, i) => {
      id++;
      const precio = Math.round(t.area * (pBase + p * 120000) / 1e6) * 1e6;
      const r = Math.random();
      const estado = r < 0.55 ? ESTADOS.D : r < 0.7 ? ESTADOS.B : ESTADOS.V;
      u.push({ id, torreId: tid, piso: p, numero: `${p}${String.fromCharCode(65+i)}`, tipologia: t.tipo, area: t.area, habs: t.habs, banos: t.banos, precio, estado, tipo_inmueble: "APT" });
    });
  }
  return u;
}
function genComps(tid, n, tipo) {
  const items = []; const bp = tipo === "PARQ" ? 45e6 : 18e6;
  for (let i = 1; i <= n; i++) {
    const id = tid * 10000 + (tipo === "PARQ" ? 5000 : 8000) + i;
    items.push({ id, torreId: tid, numero: `${tipo === "PARQ" ? "P" : "D"}-${String(i).padStart(2,"0")}`, precio: bp + Math.round(Math.random()*5e6/1e6)*1e6, estado: Math.random()>0.3 ? ESTADOS.D : ESTADOS.V, tipo_inmueble: tipo });
  }
  return items;
}
const U1 = genUnits(1, TIPS_SUITES, 18, 11200000);
const U2 = genUnits(2, TIPS_RES, 16, 9500000);
const P1 = genComps(1, 30, "PARQ"), P2 = genComps(2, 40, "PARQ");
const D1 = genComps(1, 15, "DEP"), D2 = genComps(2, 20, "DEP");

// ── HELPERS ──
const fmt = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0,maximumFractionDigits:0}).format(n);
const fmtS = n => { if(n>=1e9) return `$${(n/1e9).toFixed(1)}B`; if(n>=1e6) return `$${Math.round(n/1e6)}M`; return fmt(n); };
const eColor = e => e===ESTADOS.D?"#16A34A":e===ESTADOS.B?"#D97706":e===ESTADOS.C?"#2563EB":"#DC2626";
const eLabel = e => e===ESTADOS.D?"Disponible":e===ESTADOS.B?"Bloqueada":e===ESTADOS.C?"Cotizada":"Vendida";
const validatePhone = (num, country) => { const digits = num.replace(/\D/g,""); return digits.length === country.len; };
const validateEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ── EDITABLE SLIDER+INPUT COMPONENT ──
function SliderInput({ label, value, onChange, min, max, step=1, suffix="", prefix="", formatDisplay }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(value));
  const commit = () => {
    let v = parseFloat(inputVal);
    if(isNaN(v)) v = min;
    v = Math.max(min, Math.min(max, v));
    if(step >= 1) v = Math.round(v);
    onChange(v);
    setInputVal(String(v));
    setEditing(false);
  };
  useEffect(()=>{ if(!editing) setInputVal(String(value)); },[value, editing]);
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 6 }}>
        <span style={S.label}>{label}</span>
        {editing ? (
          <input autoFocus value={inputVal}
            onChange={e=>setInputVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e=>e.key==="Enter"&&commit()}
            style={{ width: 80, padding:"4px 8px", border:`1px solid ${C.gold}`, borderRadius:4, fontSize:14, fontWeight:600, color:C.navy, textAlign:"right", fontFamily:"'Montserrat',sans-serif", outline:"none" }}
          />
        ) : (
          <span onClick={()=>setEditing(true)} style={{ fontSize:15, fontWeight:700, color:C.gold, cursor:"pointer", borderBottom:`1px dashed ${C.goldBorder}`, fontFamily:"'Montserrat',sans-serif" }}>
            {prefix}{formatDisplay ? formatDisplay(value) : value}{suffix}
          </span>
        )}
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)}
        style={{ width:"100%", appearance:"none", height:5, borderRadius:3, background:`linear-gradient(to right, ${C.gold} ${((value-min)/(max-min))*100}%, ${C.border} ${((value-min)/(max-min))*100}%)`, outline:"none", cursor:"pointer" }} />
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:C.textTer, fontFamily:"'Montserrat',sans-serif", marginTop:2 }}>
        <span>{prefix}{min}{suffix}</span><span>{prefix}{max}{suffix}</span>
      </div>
    </div>
  );
}

// ── STYLES ──
const S = {
  label: { fontSize:11, letterSpacing:"1.5px", textTransform:"uppercase", color:C.textSec, fontFamily:"'Montserrat',sans-serif", fontWeight:600 },
  input: { width:"100%", padding:"11px 14px", background:C.white, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:14, fontFamily:"'Montserrat',sans-serif", outline:"none", boxSizing:"border-box", transition:"border 0.2s" },
  select: { width:"100%", padding:"11px 14px", background:C.white, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, fontFamily:"'Montserrat',sans-serif", outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box", backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236B7280'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center" },
  btn: (variant="primary", disabled=false) => ({
    padding: variant==="sm"?"7px 14px":"12px 24px",
    background: disabled?C.border : variant==="primary"?C.gold : "transparent",
    color: disabled?C.textTer : variant==="primary"?C.white : C.gold,
    border: variant==="outline"?`1.5px solid ${C.gold}`:"none",
    borderRadius:6, cursor:disabled?"not-allowed":"pointer",
    fontSize: variant==="sm"?11:12, fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase",
    fontFamily:"'Montserrat',sans-serif", transition:"all 0.2s",
  }),
  card: { background:C.card, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" },
  th: { padding:"10px 12px", textAlign:"left", fontSize:10, letterSpacing:"1.5px", textTransform:"uppercase", color:C.textSec, borderBottom:`1px solid ${C.border}`, fontWeight:600, background:C.goldBg, fontFamily:"'Montserrat',sans-serif" },
  td: { padding:"10px 12px", borderBottom:`1px solid ${C.borderLight}`, color:C.text, fontSize:13, fontFamily:"'Montserrat',sans-serif" },
  tag: (bg, color, border) => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:20, fontSize:11, fontFamily:"'Montserrat',sans-serif", background:bg, color, border:`1px solid ${border}`, fontWeight:500 }),
  dot: color => ({ display:"inline-block", width:8, height:8, borderRadius:"50%", background:color, marginRight:6 }),
  sectionTitle: { fontSize:26, fontWeight:300, lineHeight:1.3, color:C.navy, fontFamily:"'Cormorant Garamond',Georgia,serif" },
  sectionSub: { fontSize:13, color:C.textSec, fontFamily:"'Montserrat',sans-serif", fontWeight:400 },
  goldBar: { height:3, background:`linear-gradient(90deg, ${C.gold}, ${C.goldLight}, ${C.gold})`, borderRadius:2 },
};

// ── MAIN COMPONENT ──
export default function CotizadorV2() {
  // Navigation
  const [step, setStep] = useState(0);
  // Data
  const [macro, setMacro] = useState(null);
  const [torre, setTorre] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedParking, setSelectedParking] = useState([]);
  const [selectedStorage, setSelectedStorage] = useState([]);
  const [incluyeParq, setIncluyeParq] = useState(true); // checkbox: precio incluye parqueadero
  const [incluyeDep, setIncluyeDep] = useState(true); // checkbox: precio incluye depósito
  // Buyer — HubSpot fields
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [cedula, setCedula] = useState("");
  const [tipoDoc, setTipoDoc] = useState("CC");
  const [email, setEmail] = useState("");
  const [phoneCc, setPhoneCc] = useState(COUNTRIES[0]);
  const [phone, setPhone] = useState("");
  const [showCcDrop, setShowCcDrop] = useState(false);
  // Asesor
  const [asesor, setAsesor] = useState(ASESORES[0]);
  // Plan
  const [separacionPct, setSeparacionPct] = useState(CONFIG.separacion_pct);
  const [ciPct, setCiPct] = useState(CONFIG.cuota_inicial_pct);
  const [numCuotas, setNumCuotas] = useState(CONFIG.cuotas_default);
  // Descuentos (fixed fields — map to valorDescuento/valorDescuentoFinanciero in Sinco)
  const [dtoComercial, setDtoComercial] = useState(0);
  const [dtoFinanciero, setDtoFinanciero] = useState(0);
  // Abonos — DYNAMIC ARRAY (each maps to a Sinco ConceptoPlanDePagos line)
  const ABONO_TIPOS = [
    { sincoId:5, label:"Cesantías", defaultMes:2 },
    { sincoId:6, label:"Subsidio", defaultMes:6 },
    { sincoId:7, label:"Ahorro Programado", defaultMes:3 },
    { sincoId:271, label:"Bono Cuota Inicial", defaultMes:1 },
    { sincoId:25, label:"Confirmación", defaultMes:0, fixedMes:true },
    { sincoId:130, label:"Dto. Financiero (abono)", defaultMes:1 },
  ];
  const [abonos, setAbonos] = useState([]); // [{sincoId, label, valor, cuota}]
  const addAbono = (tipo) => setAbonos(prev=>[...prev, { ...tipo, valor:0, cuota:tipo.defaultMes, id:Date.now() }]);
  const updateAbono = (id, field, val) => setAbonos(prev=>prev.map(a=>a.id===id?{...a,[field]:val}:a));
  const removeAbono = (id) => setAbonos(prev=>prev.filter(a=>a.id!==id));
  const [tipoVenta, setTipoVenta] = useState(1);
  // Canal de atribución (for new contacts or contacts without canal)
  const [canalAtribucion, setCanalAtribucion] = useState("Sala de Ventas Física");
  // Contact lookup — email-first
  const [contactExists, setContactExists] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactData, setContactData] = useState(null); // precarged data from HubSpot
  // UI
  const [showPlan, setShowPlan] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDescuentos, setShowDescuentos] = useState(false);
  const [showAbonos, setShowAbonos] = useState(false);
  const [filterPiso, setFilterPiso] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterHabs, setFilterHabs] = useState("all");
  const [phoneError, setPhoneError] = useState("");
  const [emailError, setEmailError] = useState("");

  const units = torre?.id===1?U1:torre?.id===2?U2:[];
  const parking = torre?.id===1?P1:P2;
  const storage = torre?.id===1?D1:D2;

  const filtered = useMemo(()=>units.filter(u=>{
    if(filterPiso!=="all"&&u.piso!==+filterPiso) return false;
    if(filterTipo!=="all"&&u.tipologia!==filterTipo) return false;
    if(filterHabs!=="all"&&u.habs!==+filterHabs) return false;
    return true;
  }),[units,filterPiso,filterTipo,filterHabs]);
  const pisos = useMemo(()=>Array.from(new Set(units.map(u=>u.piso))).sort((a,b)=>a-b),[units]);
  const tipos = useMemo(()=>Array.from(new Set(units.map(u=>u.tipologia))).sort(),[units]);
  const habsOpts = useMemo(()=>Array.from(new Set(units.map(u=>u.habs))).sort((a,b)=>a-b),[units]);

  // Calculations
  const subtotal = useMemo(()=>{
    if(!selectedUnit) return 0;
    return selectedUnit.precio + selectedParking.reduce((s,p)=>s+p.precio,0) + selectedStorage.reduce((s,d)=>s+d.precio,0);
  },[selectedUnit,selectedParking,selectedStorage]);

  const totalDescuentos = dtoComercial + dtoFinanciero;
  const totalAbonos = abonos.reduce((s,a)=>s+a.valor,0);
  const valorNeto = subtotal - totalDescuentos;
  const separacion = Math.round(valorNeto * separacionPct / 100);
  const cuotaInicialTotal = Math.round(valorNeto * ciPct / 100);
  // Abonos are EXTRA payments on top of cuotas — do NOT reduce cuota mensual
  // They reduce saldo final (less mortgage/credit needed)
  const cuotaInicialNeta = cuotaInicialTotal - separacion;
  const valorCuota = numCuotas > 0 ? Math.round(Math.max(0, cuotaInicialNeta) / numCuotas) : 0;
  const saldoFinal = Math.max(0, valorNeto - cuotaInicialTotal - totalAbonos);

  const planRows = useMemo(()=>{
    if(!selectedUnit) return [];
    const rows = [];
    // Fixed: separación
    rows.push({ concepto:"Separación", sincoId:0, mes:0, pago:separacion, tipo:"fixed" });
    // Dynamic abonos — each at its configured cuota
    abonos.filter(a=>a.valor>0).forEach(a=>{
      rows.push({ concepto:`${a.label} (cuota ${a.cuota})`, sincoId:a.sincoId, mes:a.fixedMes?0:a.cuota, pago:a.valor, tipo:"abono" });
    });
    // Monthly installments
    for(let i=1; i<=numCuotas; i++) rows.push({ concepto:`Cuota ${i}`, sincoId:1, mes:i, pago:valorCuota, tipo:"cuota" });
    // Final balance
    rows.push({ concepto:"Saldo final (crédito)", sincoId:3, mes:numCuotas+1, pago:saldoFinal, tipo:"fixed" });
    // Sort by month, then abonos first within same month
    rows.sort((a,b)=> a.mes!==b.mes ? a.mes-b.mes : (a.tipo==="abono"?-1:b.tipo==="abono"?1:0));
    // Calculate running balance
    let saldo = valorNeto;
    rows.forEach(r=>{ saldo -= r.pago; r.saldo = Math.max(saldo, 0); });
    return rows;
  },[selectedUnit,separacion,valorCuota,numCuotas,saldoFinal,valorNeto,abonos,cuotaInicialNeta]);

  const allStats = useMemo(()=>{
    const all = [...U1,...U2];
    return { total:all.length, disp:all.filter(u=>u.estado===ESTADOS.D).length, bloq:all.filter(u=>u.estado===ESTADOS.B).length, vend:all.filter(u=>u.estado===ESTADOS.V).length };
  },[]);

  const torreStats = useMemo(()=>{
    if(!torre) return null;
    return { total:units.length, disp:units.filter(u=>u.estado===ESTADOS.D).length, bloq:units.filter(u=>u.estado===ESTADOS.B).length, vend:units.filter(u=>u.estado===ESTADOS.V).length };
  },[torre,units]);

  const steps = ["Macroproyecto","Proyecto","Inventario","Agrupación","Comprador","Plan de Pagos","Cotización"];

  const MoneyInput = ({ label, value, onChange, placeholder }) => (
    <div>
      <span style={S.label}>{label}</span>
      <div style={{ display:"flex", alignItems:"center", marginTop:4 }}>
        <span style={{ padding:"11px 10px", background:C.goldBg, border:`1px solid ${C.border}`, borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:13, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>$</span>
        <input style={{ ...S.input, borderRadius:"0 6px 6px 0", borderLeft:"none" }} placeholder={placeholder||"0"} value={value===0?"":value.toLocaleString("es-CO")}
          onChange={e=>{const v=parseInt(e.target.value.replace(/\D/g,""))||0; onChange(v);}} />
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily:"'Cormorant Garamond','Georgia',serif", background:C.bg, minHeight:"100vh", color:C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600;700&family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:${C.gold};cursor:pointer;border:3px solid ${C.white};box-shadow:0 1px 4px rgba(0,0,0,.2)}
        input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:${C.gold};cursor:pointer;border:3px solid ${C.white};box-shadow:0 1px 4px rgba(0,0,0,.2)}
        ::selection{background:${C.goldBg};color:${C.navy}}
        *{box-sizing:border-box}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .4s ease forwards}
        .rh:hover{background:${C.goldBg}!important}
        select option{background:${C.white};color:${C.text}}
        input::placeholder{color:${C.textTer}}
        input:focus,select:focus{border-color:${C.gold}!important;box-shadow:0 0 0 3px ${C.gold}22}
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
      `}</style>

      {/* ══ HEADER ══ */}
      <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 24px", borderBottom:`1px solid ${C.border}`, background:C.white, position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:38, height:38, background:C.gold, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, color:C.white, fontSize:16, fontFamily:"'Montserrat',sans-serif" }}>CJ</div>
          <div>
            <div style={{ fontSize:17, fontWeight:700, letterSpacing:"2px", textTransform:"uppercase", color:C.navy, fontFamily:"'Montserrat',sans-serif" }}>Constructora Jiménez</div>
            <div style={{ fontSize:9, letterSpacing:"3px", color:C.textTer, textTransform:"uppercase", fontFamily:"'Montserrat',sans-serif" }}>40 años construyendo legado</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:10, color:C.textTer, fontFamily:"'Montserrat',sans-serif", letterSpacing:"1px" }}>ASESOR</div>
            <div style={{ fontSize:12, color:C.navy, fontWeight:600, fontFamily:"'Montserrat',sans-serif" }}>{asesor.nombre}</div>
          </div>
          <span style={{ ...S.tag(C.goldBg, C.textGold, C.goldBorder), fontSize:9, letterSpacing:"1.5px" }}>COTIZADOR FOCUXAI</span>
        </div>
      </header>

      <div style={{ maxWidth:1160, margin:"0 auto", padding:"20px 20px 60px" }}>
        {/* ══ STEP BAR ══ */}
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, padding:"0 2px" }}>
          {steps.map((s,i)=>(
            <span key={i} style={{ fontSize:9, letterSpacing:"1.5px", textTransform:"uppercase", fontFamily:"'Montserrat',sans-serif", color:i===step?C.gold:i<step?C.textSec:C.textTer, fontWeight:i===step?700:400, cursor:i<step?"pointer":"default" }}
              onClick={()=>i<step&&setStep(i)}>{s}</span>
          ))}
        </div>
        <div style={{ display:"flex", gap:3, marginBottom:28 }}>
          {steps.map((_,i)=><div key={i} style={{ flex:1, height:3, borderRadius:2, background:i<step?C.gold:i===step?C.goldLight:`${C.border}`, transition:"all .4s" }} />)}
        </div>

        {/* ══════ STEP 0: MACROPROYECTO ══════ */}
        {step===0 && (
          <div className="fu">
            <h1 style={S.sectionTitle}>Seleccionar Macroproyecto</h1>
            <p style={S.sectionSub}>Elige el desarrollo para cotizar</p>
            <div style={S.goldBar} />
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16, marginTop:24 }}>
              {MACROS.map(m=>{
                const sel = macro?.id===m.id;
                return (
                  <div key={m.id} onClick={()=>{setMacro(m);setTorre(null);setSelectedUnit(null);setSelectedParking([]);setSelectedStorage([]);}}
                    style={{ ...S.card, padding:24, cursor:"pointer", borderColor:sel?C.gold:C.border, background:sel?C.goldBg:C.white, transition:"all .2s" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                      <span style={{ ...S.tag(sel?`${C.gold}22`:C.goldBg, C.textGold, C.goldBorder), fontSize:10 }}>{m.estado}</span>
                      <span style={{ fontSize:11, color:C.textTer, fontFamily:"'Montserrat',sans-serif" }}>ID: {m.id}</span>
                    </div>
                    <div style={{ fontSize:22, fontWeight:400, color:C.navy, marginBottom:4 }}>{m.nombre}</div>
                    <div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>{m.zona}, {m.ciudad}</div>
                    {sel && <div style={{ ...S.goldBar, marginTop:12 }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop:24, display:"flex", justifyContent:"flex-end" }}>
              <button style={S.btn("primary",!macro)} disabled={!macro} onClick={()=>setStep(1)}>Continuar →</button>
            </div>
          </div>
        )}

        {/* ══════ STEP 1: TORRE ══════ */}
        {step===1 && macro && (
          <div className="fu">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
              <div>
                <h1 style={S.sectionTitle}>{macro.nombre}</h1>
                <p style={S.sectionSub}>{macro.zona}, {macro.ciudad} — Seleccionar torre / proyecto</p>
              </div>
              <button style={S.btn("outline")} onClick={()=>setStep(0)}>← Macroproyectos</button>
            </div>
            <div style={{ ...S.goldBar, marginBottom:24 }} />

            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
              {[{v:allStats.total,l:"Total",c:C.navy},{v:allStats.disp,l:"Disponibles",c:C.green},{v:allStats.bloq,l:"Bloqueadas",c:C.yellow},{v:allStats.vend,l:"Vendidas",c:C.red}].map((m,i)=>(
                <div key={i} style={{ ...S.card, textAlign:"center", padding:16 }}>
                  <div style={{ fontSize:26, fontWeight:300, color:m.c }}>{m.v}</div>
                  <div style={{ fontSize:9, letterSpacing:"2px", textTransform:"uppercase", color:C.textTer, fontFamily:"'Montserrat',sans-serif", marginTop:2 }}>{m.l}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:16 }}>
              {(TORRES[macro.id]||[]).map(t=>{
                const sel = torre?.id===t.id;
                const tu = t.id===1?U1:t.id===2?U2:[];
                const disp = tu.filter(u=>u.estado===ESTADOS.D).length;
                return (
                  <div key={t.id} onClick={()=>{setTorre(t);setSelectedUnit(null);setSelectedParking([]);setSelectedStorage([]);}}
                    style={{ ...S.card, padding:24, cursor:"pointer", borderColor:sel?C.gold:C.border, background:sel?C.goldBg:C.white, transition:"all .2s" }}>
                    <div style={{ fontSize:10, letterSpacing:"2px", textTransform:"uppercase", color:C.gold, fontFamily:"'Montserrat',sans-serif", fontWeight:700, marginBottom:6 }}>Torre {t.id}</div>
                    <div style={{ fontSize:20, fontWeight:400, color:C.navy, marginBottom:4 }}>{t.nombre}</div>
                    <div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif", marginBottom:14 }}>{t.tipo} · {t.areaDesde} — {t.areaHasta} m²</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div><span style={{ fontSize:11, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>Desde </span><span style={{ fontSize:18, fontWeight:600, color:C.gold }}>{fmtS(t.precioDesde)}</span></div>
                      <span style={S.tag(C.greenBg, C.green, C.greenBorder)}>{disp} disp.</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop:24, display:"flex", justifyContent:"flex-end" }}>
              <button style={S.btn("primary",!torre)} disabled={!torre} onClick={()=>setStep(2)}>Ver inventario →</button>
            </div>
          </div>
        )}

        {/* ══════ STEP 2: INVENTORY ══════ */}
        {step===2 && torre && (
          <div className="fu">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
              <div>
                <h1 style={{ ...S.sectionTitle, fontSize:22 }}>{torre.nombre} — Inventario</h1>
                <p style={S.sectionSub}>{macro.nombre} · {torreStats?.disp} disponibles de {torreStats?.total}</p>
              </div>
              <button style={S.btn("outline")} onClick={()=>setStep(1)}>← Torres</button>
            </div>
            <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
              {[{l:"Piso",v:filterPiso,set:setFilterPiso,opts:pisos.map(p=>({v:p,l:`Piso ${p}`}))},
                {l:"Tipología",v:filterTipo,set:setFilterTipo,opts:tipos.map(t=>({v:t,l:t}))},
                {l:"Habitaciones",v:filterHabs,set:setFilterHabs,opts:habsOpts.map(h=>({v:h,l:`${h} hab.`}))},
              ].map((f,i)=>(
                <div key={i} style={{ minWidth:120 }}>
                  <label style={{...S.label, display:"block", marginBottom:4}}>{f.l}</label>
                  <select style={S.select} value={f.v} onChange={e=>f.set(e.target.value)}>
                    <option value="all">Todos</option>
                    {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ flex:1, display:"flex", alignItems:"flex-end", justifyContent:"flex-end" }}>
                <span style={{ fontSize:12, color:C.textTer, fontFamily:"'Montserrat',sans-serif" }}>{filtered.length} unidades</span>
              </div>
            </div>
            <div style={{ ...S.card, maxHeight:440, overflow:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>{["Unidad","Piso","Tipo","Área m²","Hab","Baños","Precio","Estado",""].map((h,i)=><th key={i} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map(u=>(
                    <tr key={u.id} className="rh" style={{ cursor:u.estado===ESTADOS.D?"pointer":"default", opacity:u.estado!==ESTADOS.D?.4:1 }}>
                      <td style={{...S.td,fontWeight:600}}>{u.numero}</td>
                      <td style={S.td}>{u.piso}</td>
                      <td style={S.td}><span style={S.tag(C.goldBg,C.textGold,C.goldBorder)}>{u.tipologia}</span></td>
                      <td style={S.td}>{u.area.toFixed(1)}</td>
                      <td style={S.td}>{u.habs}</td>
                      <td style={S.td}>{u.banos}</td>
                      <td style={{...S.td,fontWeight:600}}>{fmtS(u.precio)}</td>
                      <td style={S.td}><span style={S.dot(eColor(u.estado))}/>{eLabel(u.estado)}</td>
                      <td style={S.td}>{u.estado===ESTADOS.D&&<button style={S.btn("sm")} onClick={()=>{setSelectedUnit(u);setStep(3);}}>Seleccionar</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════ STEP 3: AGRUPACIÓN ══════ */}
        {step===3 && selectedUnit && (
          <div className="fu">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
              <h1 style={{ ...S.sectionTitle, fontSize:22 }}>Armar Agrupación</h1>
              <button style={S.btn("outline")} onClick={()=>setStep(2)}>← Inventario</button>
            </div>
            {/* Selected APT */}
            <div style={{ ...S.card, marginBottom:16 }}>
              <div style={{ padding:"16px 20px", borderBottom:`1px solid ${C.borderLight}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:C.goldBg }}>
                <span style={S.label}>Apartamento Seleccionado</span>
                <span style={S.tag(C.goldBg,C.textGold,C.goldBorder)}>APT {selectedUnit.numero}</span>
              </div>
              <div style={{ padding:"16px 20px", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))", gap:12 }}>
                {[{l:"Tipo",v:selectedUnit.tipologia},{l:"Piso",v:selectedUnit.piso},{l:"Área",v:`${selectedUnit.area} m²`},{l:"Hab.",v:selectedUnit.habs},{l:"Baños",v:selectedUnit.banos},{l:"Valor Total",v:fmt(selectedUnit.precio)}].map((d,i)=>(
                  <div key={i}><div style={{...S.label,marginBottom:2}}>{d.l}</div><div style={{ fontSize:15, fontWeight:600, color:C.navy, fontFamily:"'Montserrat',sans-serif" }}>{d.v}</div></div>
                ))}
              </div>
              {/* Incluye parq/dep checkboxes */}
              <div style={{ padding:"12px 20px", borderTop:`1px solid ${C.borderLight}`, display:"flex", gap:20 }}>
                {[{label:"Incluye parqueadero",val:incluyeParq,set:setIncluyeParq},{label:"Incluye depósito",val:incluyeDep,set:setIncluyeDep}].map((ck,i)=>(
                  <label key={i} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13, fontFamily:"'Montserrat',sans-serif", color:C.navy }}>
                    <input type="checkbox" checked={ck.val} onChange={e=>ck.set(e.target.checked)} style={{ accentColor:C.gold, width:16, height:16 }} />
                    <span style={{ fontWeight:ck.val?600:400 }}>{ck.label}</span>
                    {ck.val && <span style={{ fontSize:10, color:C.textTer }}>*</span>}
                  </label>
                ))}
              </div>
              {(incluyeParq || incluyeDep) && (
                <div style={{ padding:"8px 20px 12px", fontSize:10, color:C.textTer, fontFamily:"'Montserrat',sans-serif", fontStyle:"italic" }}>
                  * {incluyeParq && incluyeDep ? "Incluye parqueadero y depósito." : incluyeParq ? "Incluye parqueadero." : "Incluye depósito."} Asignación de unidad específica sujeta a disponibilidad de inventario.
                </div>
              )}
            </div>
            {/* Parking + Storage grid — for specific unit selection (optional) */}
            <div style={{ ...S.label, marginBottom:8, fontSize:11 }}>Selección específica de unidades (opcional — solo si aplica)</div>
            {/* Parking + Storage */}
            {[{title:"Parqueaderos",items:parking,sel:selectedParking,setSel:setSelectedParking},{title:"Depósitos",items:storage,sel:selectedStorage,setSel:setSelectedStorage}].map((sec,si)=>(
              <div key={si} style={{ ...S.card, marginBottom:16 }}>
                <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.borderLight}`, background:C.goldBg }}>
                  <span style={S.label}>{sec.title} {sec.sel.length>0&&`(${sec.sel.length})`}</span>
                </div>
                <div style={{ padding:"14px 20px", display:"flex", gap:8, flexWrap:"wrap" }}>
                  {sec.items.filter(p=>p.estado===ESTADOS.D).slice(0,12).map(p=>{
                    const s = sec.sel.find(x=>x.id===p.id);
                    return (
                      <div key={p.id} onClick={()=>sec.setSel(prev=>s?prev.filter(x=>x.id!==p.id):[...prev,p])}
                        style={{ padding:"8px 14px", border:`1.5px solid ${s?C.gold:C.border}`, borderRadius:8, cursor:"pointer", background:s?C.goldBg:C.white, transition:"all .2s", textAlign:"center", minWidth:90 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:s?C.gold:C.navy, fontFamily:"'Montserrat',sans-serif" }}>{p.numero}</div>
                        <div style={{ fontSize:11, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>{fmtS(p.precio)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* Total */}
            <div style={{ ...S.card, padding:"18px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", background:C.goldBg, borderColor:C.goldBorder }}>
              <div>
                <div style={S.label}>Valor total agrupación</div>
                <div style={{ fontSize:26, fontWeight:400, color:C.gold }}>{fmt(subtotal)}</div>
              </div>
              <button style={S.btn("primary")} onClick={()=>setStep(4)}>Continuar →</button>
            </div>
          </div>
        )}

        {/* ══════ STEP 4: BUYER (HubSpot fields) ══════ */}
        {step===4 && (
          <div className="fu">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
              <h1 style={{ ...S.sectionTitle, fontSize:22 }}>Datos del Comprador</h1>
              <button style={S.btn("outline")} onClick={()=>setStep(3)}>← Agrupación</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              {/* Buyer card */}
              <div style={{ ...S.card, padding:24 }}>
                <div style={{ ...S.label, marginBottom:16, fontSize:12, color:C.gold }}>Información del Comprador</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  {/* EMAIL FIRST — search field */}
                  <div style={{ gridColumn:"1/-1" }}>
                    <label style={{...S.label,display:"block",marginBottom:4}}>Email (campo de búsqueda)</label>
                    <div style={{ display:"flex", gap:8 }}>
                      <input style={{...S.input, flex:1, borderColor:emailError?C.red:contactExists?C.green:C.border}} type="email" placeholder="correo@ejemplo.com" value={email}
                        onChange={e=>{setEmail(e.target.value);setEmailError(e.target.value&&!validateEmail(e.target.value)?"Email inválido":"");setContactExists(false);setContactData(null);}} />
                      <button style={{...S.btn("sm"), whiteSpace:"nowrap", opacity:!email||emailError?.5:1}} disabled={!email||!!emailError}
                        onClick={()=>{
                          setContactLoading(true);
                          // MOCK: simulate HubSpot lookup by email via /api/hubspot/crm/v3/objects/contacts/search
                          setTimeout(()=>{
                            const found = email.includes("test") || email.includes("ejemplo");
                            setContactExists(found);
                            setContactData(found ? { firstname:"Pepito", lastname:"Pérez", cedula:"1.098.765.432", phone:"3001234567", canal:"Pauta Facebook-IG", proyectos:"Porto Sabbia" } : null);
                            if(found) { setNombre("Pepito"); setApellido("Pérez"); setCedula("1.098.765.432"); setPhone("3001234567"); }
                            setContactLoading(false);
                          }, 600);
                        }}>
                        {contactLoading ? "..." : "Buscar"}
                      </button>
                    </div>
                    {emailError && <div style={{ fontSize:10, color:C.red, fontFamily:"'Montserrat',sans-serif", marginTop:2 }}>{emailError}</div>}
                    {/* Lookup result */}
                    {(contactExists || (email && !emailError && !contactLoading && contactData===null && email.length>5)) && (
                      <div style={{ marginTop:8, padding:"10px 14px", borderRadius:6, background:contactExists?C.greenBg:C.yellowBg, border:`1px solid ${contactExists?C.greenBorder:C.yellowBorder}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontFamily:"'Montserrat',sans-serif", color:contactExists?C.green:C.yellow, fontWeight:600 }}>
                          <span>{contactExists?"✓":"⚠"}</span>
                          <span>{contactExists ? "Contacto encontrado en HubSpot" : "Contacto no encontrado — se creará al enviar cotización"}</span>
                        </div>
                        <div style={{ fontSize:10, color:C.textTer, fontFamily:"'Montserrat',sans-serif", marginTop:4 }}>
                          {contactExists
                            ? `Se agregará "${macro?.nombre}" a lista_proyectos_fx (append). ${contactData?.canal ? `Canal existente: ${contactData.canal} (no se toca).` : "Canal vacío — se llenará con el seleccionado abajo."}`
                            : `Se creará con datos del formulario + proyecto_activo_fx = "${macro?.nombre}" + lista_proyectos_fx = "${macro?.nombre}"`
                          }
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Rest of fields — precarged if contact found */}
                  <div>
                    <label style={{...S.label,display:"block",marginBottom:4}}>Nombre(s)</label>
                    <input style={S.input} placeholder="Nombre(s)" value={nombre} onChange={e=>setNombre(e.target.value)} />
                  </div>
                  <div>
                    <label style={{...S.label,display:"block",marginBottom:4}}>Apellido(s)</label>
                    <input style={S.input} placeholder="Apellido(s)" value={apellido} onChange={e=>setApellido(e.target.value)} />
                  </div>
                  <div style={{ gridColumn:"1/-1", display:"grid", gridTemplateColumns:"120px 1fr", gap:10 }}>
                    <div>
                      <label style={{...S.label,display:"block",marginBottom:4}}>Tipo Doc.</label>
                      <select style={S.select} value={tipoDoc} onChange={e=>setTipoDoc(e.target.value)}>
                        <option value="CC">C.C.</option><option value="CE">C.E.</option><option value="NIT">NIT</option><option value="PP">Pasaporte</option><option value="TI">T.I.</option>
                      </select>
                    </div>
                    <div>
                      <label style={{...S.label,display:"block",marginBottom:4}}>Número de Documento (cédula)</label>
                      <input style={S.input} placeholder="Se pide al cotizar, no en pauta" value={cedula} onChange={e=>setCedula(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label style={{...S.label,display:"block",marginBottom:4}}>Teléfono</label>
                    <div style={{ display:"flex", position:"relative" }}>
                      <div onClick={()=>setShowCcDrop(!showCcDrop)}
                        style={{ display:"flex", alignItems:"center", gap:4, padding:"11px 10px", background:C.goldBg, border:`1px solid ${C.border}`, borderRight:"none", borderRadius:"6px 0 0 6px", cursor:"pointer", fontSize:13, userSelect:"none", whiteSpace:"nowrap" }}>
                        <span>{phoneCc.flag}</span><span style={{ fontFamily:"'Montserrat',sans-serif", fontSize:12, fontWeight:500 }}>{phoneCc.code}</span>
                        <span style={{ fontSize:8, color:C.textTer }}>▼</span>
                      </div>
                      {showCcDrop && (
                        <div style={{ position:"absolute", top:"100%", left:0, background:C.white, border:`1px solid ${C.border}`, borderRadius:6, boxShadow:"0 4px 12px rgba(0,0,0,.1)", zIndex:20, maxHeight:200, overflow:"auto", width:220 }}>
                          {COUNTRIES.map(cc=>(
                            <div key={cc.code} onClick={()=>{setPhoneCc(cc);setShowCcDrop(false);}} className="rh"
                              style={{ padding:"8px 12px", cursor:"pointer", display:"flex", gap:8, alignItems:"center", fontSize:12, fontFamily:"'Montserrat',sans-serif" }}>
                              <span>{cc.flag}</span><span style={{fontWeight:500}}>{cc.code}</span><span style={{color:C.textSec}}>{cc.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <input style={{...S.input, borderRadius:"0 6px 6px 0", borderLeft:"none", borderColor:phoneError?C.red:C.border}}
                        placeholder={`${phoneCc.len} dígitos`} value={phone}
                        onChange={e=>{
                          const v = e.target.value.replace(/\D/g,"");
                          setPhone(v);
                          setPhoneError(v.length>0&&v.length!==phoneCc.len?`Debe tener ${phoneCc.len} dígitos`:"");
                        }} />
                    </div>
                    {phoneError && <div style={{ fontSize:10, color:C.red, fontFamily:"'Montserrat',sans-serif", marginTop:2 }}>{phoneError}</div>}
                  </div>
                  {/* Canal de atribución — only shown if contact doesn't exist or has no canal */}
                  {(!contactExists || (contactExists && !contactData?.canal)) && (
                  <div>
                    <label style={{...S.label,display:"block",marginBottom:4}}>Canal de Atribución</label>
                    <select style={S.select} value={canalAtribucion} onChange={e=>setCanalAtribucion(e.target.value)}>
                      {["Sala de Ventas Física","Pauta Facebook-IG","Pauta Google","Sitio Web","Referido","Feria Inmobiliaria","Canal WhatsApp","Llamada Telefónica","Aliado / Portal Inmobiliario","Recompra"].map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  )}
                </div>
              </div>
              {/* Asesor card — read-only from login (HubSpot OAuth) */}
              <div style={{ ...S.card, padding:24 }}>
                <div style={{ ...S.label, marginBottom:16, fontSize:12, color:C.gold }}>Asesor que Cotiza</div>
                <div style={{ padding:"16px 18px", background:C.goldBg, borderRadius:8, border:`1px solid ${C.goldBorder}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                    <div style={{ width:40, height:40, borderRadius:"50%", background:C.gold, display:"flex", alignItems:"center", justifyContent:"center", color:C.white, fontWeight:700, fontSize:15, fontFamily:"'Montserrat',sans-serif" }}>
                      {asesor.nombre.split(" ").map(n=>n[0]).slice(0,2).join("")}
                    </div>
                    <div>
                      <div style={{ fontSize:15, fontWeight:600, color:C.navy, fontFamily:"'Montserrat',sans-serif" }}>{asesor.nombre}</div>
                      <div style={{ fontSize:11, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>Sesión activa via HubSpot OAuth</div>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <div><span style={{...S.label,fontSize:9}}>ID SINCO</span><div style={{fontSize:12,fontWeight:600,fontFamily:"'Montserrat',sans-serif",color:C.navy}}>{asesor.id}</div></div>
                    <div><span style={{...S.label,fontSize:9}}>HUBSPOT OWNER</span><div style={{fontSize:12,fontWeight:600,fontFamily:"'Montserrat',sans-serif",color:C.navy}}>owner_{asesor.id}</div></div>
                  </div>
                  <div style={{ fontSize:10, color:C.textTer, fontFamily:"'Montserrat',sans-serif", marginTop:8, borderTop:`1px solid ${C.goldBorder}`, paddingTop:8 }}>
                    Precargado del login. El Deal se asignará a este asesor como owner + id_vendedor_sinco_fx para write-back.
                  </div>
                </div>
                <div style={{ ...S.card, marginTop:16, padding:16, background:C.white }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <div><div style={S.label}>Proyecto</div><div style={{ fontSize:13, fontWeight:600, fontFamily:"'Montserrat',sans-serif", color:C.navy }}>{macro?.nombre} — {torre?.nombre}</div></div>
                    <div><div style={S.label}>Unidad</div><div style={{ fontSize:13, fontWeight:600, fontFamily:"'Montserrat',sans-serif", color:C.navy }}>APT {selectedUnit?.numero} · {selectedUnit?.tipologia}</div></div>
                    <div><div style={S.label}>Valor</div><div style={{ fontSize:13, fontWeight:600, fontFamily:"'Montserrat',sans-serif", color:C.gold }}>{fmt(subtotal)}</div></div>
                    <div><div style={S.label}>Complementos</div><div style={{ fontSize:13, fontFamily:"'Montserrat',sans-serif", color:C.navy }}>{selectedParking.length} parq · {selectedStorage.length} dep</div></div>
                  </div>
                </div>
                <div style={{ marginTop:16 }}>
                  <label style={{...S.label,display:"block",marginBottom:4}}>Tipo de Venta</label>
                  <select style={S.select} value={tipoVenta} onChange={e=>setTipoVenta(+e.target.value)}>
                    <option value={0}>Contado</option><option value={1}>Crédito Hipotecario</option><option value={3}>Leasing</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{ marginTop:20, display:"flex", justifyContent:"flex-end" }}>
              <button style={S.btn("primary",!cedula||!nombre||!apellido)} disabled={!cedula||!nombre||!apellido} onClick={()=>setStep(5)}>Continuar →</button>
            </div>
          </div>
        )}

        {/* ══════ STEP 5: PLAN DE PAGOS ══════ */}
        {step===5 && (
          <div className="fu">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
              <h1 style={{ ...S.sectionTitle, fontSize:22 }}>Plan de Pagos</h1>
              <button style={S.btn("outline")} onClick={()=>setStep(4)}>← Comprador</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
              {/* Left: Config */}
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ ...S.card, padding:20 }}>
                  <div style={{ ...S.label, fontSize:12, color:C.gold, marginBottom:16 }}>Configuración Base</div>
                  <SliderInput label="Separación" value={separacionPct} onChange={setSeparacionPct} min={3} max={15} suffix="%" />
                  <SliderInput label="Cuota Inicial Total" value={ciPct} onChange={setCiPct} min={10} max={100} step={5} suffix="%" />
                  <SliderInput label="Número de Cuotas" value={numCuotas} onChange={setNumCuotas} min={1} max={48} />
                  <div style={{ padding:"10px 14px", background:C.goldBg, borderRadius:6, border:`1px solid ${C.goldBorder}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>Cuota mensual</span>
                    <span style={{ fontSize:18, fontWeight:600, color:C.gold, fontFamily:"'Montserrat',sans-serif" }}>{fmt(valorCuota)}</span>
                  </div>
                </div>

                {/* Descuentos — collapsible */}
                {!showDescuentos ? (
                  <div onClick={()=>setShowDescuentos(true)}
                    style={{ ...S.card, padding:"14px 20px", cursor:"pointer", display:"flex", alignItems:"center", gap:8, borderStyle:"dashed", borderColor:C.border }}>
                    <span style={{ width:22, height:22, borderRadius:"50%", background:C.redBg, border:`1px solid ${C.redBorder}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:C.red, fontWeight:600 }}>+</span>
                    <span style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif", fontWeight:500 }}>Agregar descuento</span>
                  </div>
                ) : (
                <div style={{ ...S.card, padding:20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <span style={{ ...S.label, fontSize:12, color:C.red, margin:0 }}>Descuentos</span>
                    <span onClick={()=>{setShowDescuentos(false);setDtoComercial(0);setDtoFinanciero(0);}}
                      style={{ fontSize:11, color:C.textTer, cursor:"pointer", fontFamily:"'Montserrat',sans-serif" }}>✕ Quitar</span>
                  </div>
                  {/* Dto Comercial — % and $ synced */}
                  <div style={{ marginBottom:12 }}>
                    <span style={{...S.label, display:"block", marginBottom:6}}>Dto. Comercial</span>
                    <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", gap:8 }}>
                      <div style={{ display:"flex", alignItems:"center" }}>
                        <input style={{...S.input, textAlign:"right", paddingRight:4}} placeholder="0" value={subtotal>0?Math.round(dtoComercial/subtotal*1000)/10||"":""}
                          onChange={e=>{const pct=parseFloat(e.target.value)||0; setDtoComercial(Math.round(subtotal*pct/100));}} />
                        <span style={{ padding:"11px 6px", background:C.redBg, border:`1px solid ${C.redBorder}`, borderLeft:"none", borderRadius:"0 6px 6px 0", fontSize:12, color:C.red, fontFamily:"'Montserrat',sans-serif" }}>%</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center" }}>
                        <span style={{ padding:"11px 10px", background:C.redBg, border:`1px solid ${C.redBorder}`, borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:13, color:C.red, fontFamily:"'Montserrat',sans-serif" }}>$</span>
                        <input style={{...S.input, borderRadius:"0 6px 6px 0", borderLeft:"none"}} placeholder="0" value={dtoComercial===0?"":dtoComercial.toLocaleString("es-CO")}
                          onChange={e=>{const v=parseInt(e.target.value.replace(/\D/g,""))||0; setDtoComercial(v);}} />
                      </div>
                    </div>
                  </div>
                  {/* Dto Financiero — % and $ synced */}
                  <div>
                    <span style={{...S.label, display:"block", marginBottom:6}}>Dto. Financiero (id:130)</span>
                    <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", gap:8 }}>
                      <div style={{ display:"flex", alignItems:"center" }}>
                        <input style={{...S.input, textAlign:"right", paddingRight:4}} placeholder="0" value={subtotal>0?Math.round(dtoFinanciero/subtotal*1000)/10||"":""}
                          onChange={e=>{const pct=parseFloat(e.target.value)||0; setDtoFinanciero(Math.round(subtotal*pct/100));}} />
                        <span style={{ padding:"11px 6px", background:C.redBg, border:`1px solid ${C.redBorder}`, borderLeft:"none", borderRadius:"0 6px 6px 0", fontSize:12, color:C.red, fontFamily:"'Montserrat',sans-serif" }}>%</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center" }}>
                        <span style={{ padding:"11px 10px", background:C.redBg, border:`1px solid ${C.redBorder}`, borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:13, color:C.red, fontFamily:"'Montserrat',sans-serif" }}>$</span>
                        <input style={{...S.input, borderRadius:"0 6px 6px 0", borderLeft:"none"}} placeholder="0" value={dtoFinanciero===0?"":dtoFinanciero.toLocaleString("es-CO")}
                          onChange={e=>{const v=parseInt(e.target.value.replace(/\D/g,""))||0; setDtoFinanciero(v);}} />
                      </div>
                    </div>
                  </div>
                  {totalDescuentos > 0 && (
                    <div style={{ marginTop:10, padding:"8px 12px", background:C.redBg, borderRadius:6, border:`1px solid ${C.redBorder}`, display:"flex", justifyContent:"space-between" }}>
                      <span style={{ fontSize:12, color:C.red, fontFamily:"'Montserrat',sans-serif" }}>Total descuentos</span>
                      <span style={{ fontSize:14, fontWeight:700, color:C.red, fontFamily:"'Montserrat',sans-serif" }}>-{fmt(totalDescuentos)}</span>
                    </div>
                  )}
                </div>
                )}

                {/* Abonos — dynamic array */}
                <div style={{ ...S.card, padding:20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:abonos.length>0?12:0 }}>
                    <span style={{ ...S.label, fontSize:12, color:C.green, margin:0 }}>Abonos a Cuota Inicial</span>
                    {abonos.length>0 && <span style={{ fontSize:12, fontWeight:700, color:C.green, fontFamily:"'Montserrat',sans-serif" }}>+{fmt(totalAbonos)}</span>}
                  </div>
                  {abonos.map(a=>(
                    <div key={a.id} style={{ display:"grid", gridTemplateColumns:"1fr 120px 90px 32px", gap:8, alignItems:"end", marginBottom:8 }}>
                      <div>
                        <span style={{...S.label, display:"block", marginBottom:4}}>{a.label} (id:{a.sincoId})</span>
                        <div style={{ display:"flex", alignItems:"center" }}>
                          <span style={{ padding:"11px 10px", background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:13, color:C.green, fontFamily:"'Montserrat',sans-serif" }}>$</span>
                          <input style={{ ...S.input, borderRadius:"0 6px 6px 0", borderLeft:"none" }} placeholder="0" value={a.valor===0?"":a.valor.toLocaleString("es-CO")}
                            onChange={e=>{const v=parseInt(e.target.value.replace(/\D/g,""))||0; updateAbono(a.id,"valor",v);}} />
                        </div>
                      </div>
                      <div>
                        <span style={{...S.label, display:"block", marginBottom:4}}>Cuota</span>
                        {a.fixedMes ? (
                          <div style={{ padding:"11px 8px", background:C.borderLight, borderRadius:6, fontSize:12, color:C.textTer, fontFamily:"'Montserrat',sans-serif", textAlign:"center" }}>Hoy</div>
                        ) : (
                          <select style={{...S.select, padding:"11px 8px"}} value={a.cuota} onChange={e=>updateAbono(a.id,"cuota",+e.target.value)}>
                            {Array.from({length:numCuotas},(_,i)=>i+1).map(m=><option key={m} value={m}>Cuota {m}</option>)}
                          </select>
                        )}
                      </div>
                      <div>
                        <span style={{...S.label, display:"block", marginBottom:4}}>Mes</span>
                        <div style={{ padding:"11px 8px", background:C.borderLight, borderRadius:6, fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif", textAlign:"center" }}>{a.fixedMes?"0":a.cuota}</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", paddingBottom:2 }}>
                        <span onClick={()=>removeAbono(a.id)} style={{ cursor:"pointer", color:C.red, fontSize:16, fontWeight:700, lineHeight:1 }}>×</span>
                      </div>
                    </div>
                  ))}
                  {/* + Agregar abono button with tipo selector */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:abonos.length>0?8:0 }}>
                    {ABONO_TIPOS.map(t=>(
                      <div key={t.sincoId} onClick={()=>addAbono(t)}
                        style={{ padding:"6px 12px", borderRadius:6, border:`1px dashed ${C.greenBorder}`, background:C.greenBg, cursor:"pointer", fontSize:11, color:C.green, fontFamily:"'Montserrat',sans-serif", fontWeight:500, transition:"all .2s" }}>
                        + {t.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Summary */}
              <div style={{ ...S.card, padding:20, position:"sticky", top:80, alignSelf:"flex-start" }}>
                <div style={{ ...S.label, fontSize:12, color:C.gold, marginBottom:16 }}>Resumen Financiero</div>
                {[
                  { l:"Valor agrupación", v:selectedUnit?.precio||0 },
                  ...(selectedParking.length>0?[{ l:`+ Parqueadero(s) (${selectedParking.length})`, v:selectedParking.reduce((s,p)=>s+p.precio,0) }]:[]),
                  ...(selectedStorage.length>0?[{ l:`+ Depósito(s) (${selectedStorage.length})`, v:selectedStorage.reduce((s,d)=>s+d.precio,0) }]:[]),
                  ...(selectedParking.length>0||selectedStorage.length>0?[{ l:"Subtotal", v:subtotal, bold:true }]:[]),
                  { l:"Descuentos", v:totalDescuentos, red:true, neg:true, hide:totalDescuentos===0 },
                  { l:totalDescuentos>0?"VALOR NETO":"VALOR TOTAL", v:valorNeto, bold:true, gold:true, sep:totalDescuentos>0 },
                  { l:`Separación (${separacionPct}%)`, v:separacion },
                  { l:`CI neta en ${numCuotas} cuotas`, v:Math.max(0,cuotaInicialNeta) },
                  { l:"Valor cuota mensual", v:valorCuota, bold:true },
                  { l:`Abonos extra (${abonos.filter(a=>a.valor>0).length})`, v:totalAbonos, green:true, hide:totalAbonos===0 },
                  { l:"Saldo final (crédito)", v:saldoFinal, bold:true, sep:true },
                ].filter(r=>!r.hide).map((r,i)=>(
                  <div key={i}>
                    {r.sep && <div style={{ borderTop:`2px solid ${C.goldBorder}`, margin:"8px 0" }} />}
                    <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", alignItems:"center" }}>
                      <span style={{ fontSize:12, color:r.gold?C.gold:r.red?C.red:r.green?C.green:C.textSec, fontWeight:r.bold?600:400, fontFamily:"'Montserrat',sans-serif" }}>{r.l}</span>
                      <span style={{ fontSize:r.bold?16:14, fontWeight:r.bold?700:500, color:r.gold?C.gold:r.red?C.red:r.green?C.green:C.navy, fontFamily:"'Montserrat',sans-serif" }}>{r.neg?`-${fmt(r.v)}`:fmt(r.v)}</span>
                    </div>
                  </div>
                ))}
                {/* Incluye parq/dep note */}
                {(incluyeParq || incluyeDep) && selectedParking.length===0 && selectedStorage.length===0 && (
                  <div style={{ fontSize:10, color:C.textTer, fontFamily:"'Montserrat',sans-serif", fontStyle:"italic", marginTop:4 }}>
                    * Valor {incluyeParq&&incluyeDep?"incluye parqueadero y depósito":incluyeParq?"incluye parqueadero":"incluye depósito"}. Asignación sujeta a disponibilidad.
                  </div>
                )}
                <div style={{ display:"flex", gap:10, marginTop:16 }}>
                  <button style={S.btn("outline")} onClick={()=>setShowPlan(!showPlan)}>{showPlan?"Ocultar":"Ver"} plan detallado</button>
                  <button style={S.btn("primary")} onClick={()=>setStep(6)}>Generar cotización →</button>
                </div>
              </div>
            </div>

            {showPlan && (
              <div style={S.card} className="fu">
                <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.borderLight}`, background:C.goldBg, display:"flex", justifyContent:"space-between" }}>
                  <span style={S.label}>Plan de Pagos Detallado</span>
                  <span style={{ fontSize:10, color:C.textTer, fontFamily:"'Montserrat',sans-serif" }}>{planRows.length} líneas · Mapeo ConceptoPlanDePagos Sinco</span>
                </div>
                <div style={{ maxHeight:360, overflow:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["Concepto","ID Sinco","Mes","Pago","Saldo"].map((h,i)=><th key={i} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {planRows.map((r,i)=>(
                        <tr key={i} className="rh">
                          <td style={{...S.td,fontWeight:r.concepto==="Separación"||r.concepto.includes("Saldo")?600:400,color:r.concepto==="Separación"?C.gold:r.sincoId>=5&&r.sincoId!==25?C.green:C.text}}>{r.concepto}</td>
                          <td style={{...S.td,color:C.textTer}}>{r.sincoId}</td>
                          <td style={S.td}>{r.mes===0?"Hoy":r.mes}</td>
                          <td style={{...S.td,fontWeight:600}}>{fmt(r.pago)}</td>
                          <td style={{...S.td,color:r.saldo===0?C.green:C.textSec}}>{fmt(r.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════ STEP 6: COTIZACIÓN FINAL ══════ */}
        {step===6 && (
          <div className="fu">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
              <h1 style={{ ...S.sectionTitle, fontSize:22 }}>Cotización Generada</h1>
              <button style={S.btn("outline")} onClick={()=>setStep(5)}>← Editar plan</button>
            </div>
            <div style={{ ...S.card, padding:28, border:`1px solid ${C.goldBorder}` }}>
              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", paddingBottom:18, borderBottom:`2px solid ${C.goldBorder}`, marginBottom:20 }}>
                <div>
                  <div style={{ fontSize:18, fontWeight:700, letterSpacing:"2px", color:C.navy, fontFamily:"'Montserrat',sans-serif" }}>CONSTRUCTORA JIMÉNEZ S.A.</div>
                  <div style={{ fontSize:11, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>NIT: 800.000.000-0 · Santa Marta, Colombia</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ ...S.label, color:C.gold }}>Cotización</div>
                  <div style={{ fontSize:22, fontWeight:300, color:C.navy }}>COT-{Date.now().toString().slice(-6)}</div>
                  <div style={{ fontSize:11, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>{new Date().toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"})}</div>
                  <div style={{ fontSize:10, color:C.textTer, fontFamily:"'Montserrat',sans-serif" }}>Vigencia: {CONFIG.vigencia_cotizacion} días</div>
                </div>
              </div>
              {/* 3 columns: buyer, property, advisor */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20, marginBottom:20 }}>
                <div>
                  <div style={{ ...S.label, marginBottom:8, color:C.gold }}>Comprador</div>
                  <div style={{ fontSize:15, fontWeight:600, color:C.navy, fontFamily:"'Montserrat',sans-serif" }}>{nombre} {apellido}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>{tipoDoc} {cedula}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>{email}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>{phoneCc.flag} {phoneCc.code} {phone}</div>
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom:8, color:C.gold }}>Inmueble</div>
                  <div style={{ fontSize:15, fontWeight:600, color:C.navy, fontFamily:"'Montserrat',sans-serif" }}>{macro?.nombre} — {torre?.nombre}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>Apto {selectedUnit?.numero} · Tipo {selectedUnit?.tipologia} · Piso {selectedUnit?.piso}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>{selectedUnit?.area} m² · {selectedUnit?.habs} hab · {selectedUnit?.banos} baños</div>
                  {selectedParking.length>0&&<div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>Parq: {selectedParking.map(p=>p.numero).join(", ")}</div>}
                  {selectedStorage.length>0&&<div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>Dep: {selectedStorage.map(d=>d.numero).join(", ")}</div>}
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom:8, color:C.gold }}>Asesor</div>
                  <div style={{ fontSize:15, fontWeight:600, color:C.navy, fontFamily:"'Montserrat',sans-serif" }}>{asesor.nombre}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>ID Sinco: {asesor.id}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'Montserrat',sans-serif" }}>Tipo venta: {tipoVenta===0?"Contado":tipoVenta===1?"Crédito":"Leasing"}</div>
                </div>
              </div>
              {/* Financial summary */}
              <div style={{ background:C.goldBg, borderRadius:8, padding:18, marginBottom:18, border:`1px solid ${C.goldBorder}` }}>
                <div style={{ display:"grid", gridTemplateColumns:`repeat(${[true, totalDescuentos>0, true, true, true, true, totalAbonos>0].filter(Boolean).length},1fr)`, gap:12 }}>
                  {[
                    {l:"Subtotal",v:fmt(subtotal),hide:totalDescuentos===0},
                    {l:"Descuentos",v:`-${fmt(totalDescuentos)}`,c:C.red,hide:totalDescuentos===0},
                    {l:totalDescuentos>0?"Valor Neto":"Valor Total",v:fmt(valorNeto),c:C.gold,bold:true},
                    {l:`Separación (${separacionPct}%)`,v:fmt(separacion)},
                    {l:`${numCuotas} cuotas de`,v:fmt(valorCuota)},
                    {l:`Saldo (${100-ciPct}%)`,v:fmt(saldoFinal)},
                    {l:"Abonos CI",v:fmt(totalAbonos),c:C.green,hide:totalAbonos===0},
                  ].filter(m=>!m.hide).map((m,i)=>(
                    <div key={i} style={{ textAlign:"center" }}>
                      <div style={{ ...S.label, fontSize:9, marginBottom:2 }}>{m.l}</div>
                      <div style={{ fontSize:15, fontWeight:m.bold?700:600, color:m.c||C.navy, fontFamily:"'Montserrat',sans-serif" }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Legal note */}
              <div style={{ fontSize:10, color:C.textTer, fontFamily:"'Montserrat',sans-serif", lineHeight:1.6, borderTop:`1px solid ${C.border}`, paddingTop:14 }}>
                * El cliente cancela el 100% de los Gastos de Registro e Impuestos de Registro y asume el 50% de los Derechos Notariales. Los precios y condiciones de venta pueden ser modificados sin previo aviso. Esta cotización no constituye reserva ni compromiso de venta. Vigencia: {CONFIG.vigencia_cotizacion} días calendario.
              </div>
              {/* Actions */}
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:18 }}>
                <button style={S.btn("outline")}>Descargar PDF</button>
                <button style={S.btn("primary")} onClick={()=>setShowSuccess(true)}>Enviar y crear Deal →</button>
              </div>
            </div>

            {/* Pipeline */}
            <div style={{ ...S.card, marginTop:16, padding:"16px 20px" }}>
              <div style={{ ...S.label, marginBottom:12, color:C.gold }}>Pipeline — Deal se creará en:</div>
              <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                {[{n:"Cotización enviada",p:"20%",a:true,amt:"$0"},{n:"Unidad bloqueada",p:"40%",amt:"$0"},{n:"Unidad separada",p:"70%",amt:"→ amount"},{n:"Negocio legalizado",p:"100%"},{n:"En cartera",p:"100%"}].map((s,i)=>(
                  <React.Fragment key={i}>
                    {i>0&&<span style={{color:C.textTer}}>→</span>}
                    <div style={{ padding:"6px 12px", borderRadius:6, background:s.a?C.goldBg:C.borderLight, border:`1px solid ${s.a?C.goldBorder:C.border}`, fontSize:11, fontFamily:"'Montserrat',sans-serif", color:s.a?C.gold:C.textSec }}>
                      {s.n} <span style={{opacity:.5}}>({s.p})</span>
                      {s.amt && <span style={{ marginLeft:4, fontSize:9, padding:"1px 5px", borderRadius:3, background:s.amt==="$0"?C.yellowBg:`${C.green}15`, color:s.amt==="$0"?C.yellow:C.green, border:`1px solid ${s.amt==="$0"?C.yellowBorder:C.greenBorder}` }}>{s.amt}</span>}
                    </div>
                  </React.Fragment>
                ))}
              </div>
              <div style={{ fontSize:10, color:C.textTer, fontFamily:"'Montserrat',sans-serif", marginTop:8 }}>
                Amount del Deal = $0 hasta Unidad Separada. Workflow WF-D2 copia valor_total_neto_fx → amount al separar. No infla forecast con cotizaciones.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ SUCCESS OVERLAY ══ */}
      {showSuccess && (
        <div style={{ position:"fixed", inset:0, background:"rgba(27,42,74,.85)", backdropFilter:"blur(12px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }} onClick={()=>setShowSuccess(false)}>
          <div style={{ textAlign:"center", maxWidth:440, padding:"48px 40px", background:C.white, borderRadius:12, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }} className="fu" onClick={e=>e.stopPropagation()}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:C.greenBg, border:`2px solid ${C.green}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", fontSize:24, color:C.green }}>✓</div>
            <h2 style={{ fontSize:24, fontWeight:400, color:C.navy, margin:"0 0 8px" }}>Cotización Enviada</h2>
            <p style={{ fontSize:13, color:C.textSec, fontFamily:"'Montserrat',sans-serif", marginBottom:20, lineHeight:1.6 }}>
              Deal creado en HubSpot etapa "Cotización Enviada (20%)" con amount = $0. PDF adjunto. Email y WhatsApp enviados a {nombre} {apellido}. Precio congelado en precio_cotizado_fx.
            </p>
            <div style={{ display:"flex", gap:6, justifyContent:"center", flexWrap:"wrap", marginBottom:12 }}>
              {[{l:"Deal creado (amount $0)",c:C.green,bg:C.greenBg,b:C.greenBorder},{l:"PDF generado",c:C.blue,bg:C.blueBg,b:`${C.blue}33`},{l:"Owner: "+asesor.nombre.split(" ")[0],c:C.gold,bg:C.goldBg,b:C.goldBorder},{l:"Email + WhatsApp",c:"#25D366",bg:"#F0FFF4",b:"#BBF7D0"}].map((t,i)=>(
                <span key={i} style={S.tag(t.bg,t.c,t.b)}>{t.l}</span>
              ))}
            </div>
            <button style={{ ...S.btn("primary"), marginTop:24 }} onClick={()=>{setShowSuccess(false);setStep(0);setMacro(null);setTorre(null);setSelectedUnit(null);setSelectedParking([]);setSelectedStorage([]);setCedula("");setNombre("");setApellido("");setEmail("");setPhone("");setDtoComercial(0);setDtoFinanciero(0);setAbonos([]);setShowPlan(false);setShowDescuentos(false);setContactExists(false);setContactData(null);}}>
              Nueva cotización
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign:"center", padding:"24px", borderTop:`1px solid ${C.border}` }}>
        <div style={{ fontSize:9, letterSpacing:"2px", textTransform:"uppercase", color:C.textTer, fontFamily:"'Montserrat',sans-serif" }}>
          Powered by FocuxAI Engine™ · Focux Digital Group S.A.S.
        </div>
      </div>
    </div>
  );
}
