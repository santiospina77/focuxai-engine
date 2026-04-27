"use client";
import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from "react";
import { useInventoryData } from "./useInventoryData";
import type { UIMacro, UITorre, UIUnit, UIConfig } from "./useInventoryData";

/* ═══════════════════════════════════════════════════════════════
   FOCUXAI COTIZADOR v5 — Connected to HubSpot Real Inventory + Contact Search
   Powered by GET /api/engine/inventory + POST /api/engine/contacts/search
   ═══════════════════════════════════════════════════════════════ */

// ── DESIGN TOKENS (Bluebox Brand System — Agencia Bluebox / Jose Carlos Anaya) ──
const C = {
  gold: "#C2A360", goldDark: "#A8893E", goldLight: "#D4BE82", goldBg: "#FAF7F0",
  goldBorder: "#E4D5B4",
  navy: "#2D4051", navyLight: "#3D5468",
  bg: "#F4F0E5", white: "#FFFFFF", card: "#FFFFFF",
  border: "#E0DCD2", borderLight: "#EDE9E0",
  text: "#182633", textSec: "#5A6872", textTer: "#8C9AA4", textGold: "#A8893E",
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

// ── MOCK ASESORES (until HubSpot OAuth login — phase 2) ──
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

// ── ESTADOS — lowercase strings matching endpoint output ──
const ESTADOS = { D: "disponible", B: "bloqueada", V: "vendida", C: "cotizada" };

// ── CONSECUTIVE QUOTATION NUMBER GENERATOR ──
// Format: COT-{CÓDIGO_PROYECTO}-{AAMM}-{SECUENCIAL_4DIG}
// Example: COT-PSS-2604-0031
// In production: Engine queries HubSpot for max sequencial of the month per project
// In demo: derives from timestamp to guarantee uniqueness
const _cotCounters: Record<string,number> = {};
function generateCotNumber(torre: any) {
  const codigo = torre?.codigo || "XXX";
  const now = new Date();
  const aamm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth()+1).padStart(2,"0")}`;
  const key = `${codigo}-${aamm}`;
  if (!_cotCounters[key]) {
    // Seed from timestamp to simulate existing quotes this month
    _cotCounters[key] = Math.floor((now.getTime() % 100000) / 100);
  }
  _cotCounters[key]++;
  return `COT-${codigo}-${aamm}-${String(_cotCounters[key]).padStart(4,"0")}`;
}

// ── HELPERS ──
const fmt = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",minimumFractionDigits:0,maximumFractionDigits:0}).format(n);
const fmtS = n => { if(n>=1e9) return `$${(n/1e9).toFixed(1)}B`; if(n>=1e6) return `$${Math.round(n/1e6)}M`; return fmt(n); };
const eColor = e => e===ESTADOS.D?"#16A34A":e===ESTADOS.B?"#D97706":e===ESTADOS.C?"#2563EB":"#DC2626";
const eLabel = e => e===ESTADOS.D?"Disponible":e===ESTADOS.B?"Bloqueada":e===ESTADOS.C?"Cotizada":"Vendida";
const validatePhone = (num: string, country: any) => { const digits = num.replace(/\D/g,""); return digits.length === country.len; };
const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
// ── MES REAL: "Mes 1 (Mayo 2026)" ──
const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const mesLabel = (mesNum: number) => {
  if(mesNum===0) return "Hoy";
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + mesNum, 1);
  return `Mes ${mesNum} (${MESES_ES[target.getMonth()]} ${target.getFullYear()})`;
};

// ── EDITABLE SLIDER+INPUT COMPONENT ──
function SliderInput({ label, value, onChange, min, max, step=1, suffix="", prefix="", formatDisplay }: { label:string, value:number, onChange:(v:number)=>void, min:number, max:number, step?:number, suffix?:string, prefix?:string, formatDisplay?:(v:number)=>string }) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(String(value));
  const commit = () => {
    let v = parseFloat(inputVal);
    if(isNaN(v)) v = min;
    v = Math.max(min, Math.min(max, v));
    if(step >= 1) v = Math.round(v);
    else v = Math.round(v / step) * step; // snap to step for decimals
    onChange(v);
    setInputVal(String(v));
    setEditing(false);
  };
  useEffect(()=>{ if(!editing) setInputVal(String(value)); },[value, editing]);
  const displayVal = formatDisplay ? formatDisplay(value) : (step < 1 ? value.toFixed(1) : value);
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 6 }}>
        <span style={S.label}>{label}</span>
        {editing ? (
          <input autoFocus value={inputVal}
            onChange={e=>setInputVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e=>e.key==="Enter"&&commit()}
            style={{ width: 80, padding:"4px 8px", border:`1px solid ${C.gold}`, borderRadius:4, fontSize:14, fontWeight:600, color:C.navy, textAlign:"right", fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", outline:"none" }}
          />
        ) : (
          <span onClick={()=>setEditing(true)} style={{ fontSize:15, fontWeight:700, color:C.gold, cursor:"pointer", borderBottom:`1px dashed ${C.goldBorder}`, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>
            {prefix}{displayVal}{suffix}
          </span>
        )}
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))}
        style={{ width:"100%", appearance:"none", height:5, borderRadius:3, background:`linear-gradient(to right, ${C.gold} ${((value-min)/(max-min))*100}%, ${C.border} ${((value-min)/(max-min))*100}%)`, outline:"none", cursor:"pointer" }} />
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginTop:2 }}>
        <span>{prefix}{min}{suffix}</span><span>{prefix}{max}{suffix}</span>
      </div>
    </div>
  );
}

// ── STYLES ──
const S: any = {
  label: { fontSize:11, letterSpacing:"1.5px", textTransform:"uppercase", color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:600 },
  input: { width:"100%", padding:"11px 14px", background:C.white, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:14, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", outline:"none", boxSizing:"border-box", transition:"border 0.2s" },
  select: { width:"100%", padding:"11px 14px", background:C.white, border:`1px solid ${C.border}`, borderRadius:6, color:C.text, fontSize:13, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", outline:"none", appearance:"none", cursor:"pointer", boxSizing:"border-box", backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236B7280'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center" },
  btn: (variant="primary", disabled=false) => ({
    padding: variant==="sm"?"7px 14px":"12px 24px",
    background: disabled ? "#D4CFC5" : variant==="primary" ? C.gold : "transparent",
    color: disabled ? "#8B8578" : variant==="primary" ? C.white : C.gold,
    border: variant==="outline" ? `1.5px solid ${disabled?C.border:C.gold}` : "none",
    borderRadius:6, cursor:disabled?"not-allowed":"pointer",
    fontSize: variant==="sm"?11:12, fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase",
    fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", transition:"all 0.2s",
  }),
  card: { background:C.card, border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" },
  th: { padding:"10px 12px", textAlign:"left", fontSize:10, letterSpacing:"1.5px", textTransform:"uppercase", color:C.textSec, borderBottom:`1px solid ${C.border}`, fontWeight:600, background:C.goldBg, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" },
  td: { padding:"10px 12px", borderBottom:`1px solid ${C.borderLight}`, color:C.text, fontSize:13, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" },
  tag: (bg:string, color:string, border:string) => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:20, fontSize:11, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", background:bg, color, border:`1px solid ${border}`, fontWeight:500 }),
  dot: (color:string) => ({ display:"inline-block", width:8, height:8, borderRadius:"50%", background:color, marginRight:6 }),
  sectionTitle: { fontSize:26, fontWeight:300, lineHeight:1.3, color:C.navy, fontFamily:"'Carla Sans','AinslieSans',sans-serif" },
  sectionSub: { fontSize:13, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:400 },
  goldBar: { height:3, background:`linear-gradient(90deg, ${C.gold}, ${C.goldLight}, ${C.gold})`, borderRadius:2 },
};

// ── MAIN COMPONENT ──
export default function QuoterClient() {
  // ── Inventory data from endpoint ──
  const { data: inventory, loading: invLoading, error: invError } = useInventoryData('jimenez_demo');

  // Derive from inventory — replaces MACROS, TORRES, getUnits, getParking, getStorage, CONFIG
  const MACROS = inventory?.macros ?? [];
  const getTorres = (macroId: number) => inventory?.torresByMacro[macroId] ?? [];
  const getUnits = (torreId: number) => inventory?.getUnits(torreId) ?? [];
  const getParking = (torreId: number) => inventory?.getParking(torreId) ?? [];
  const getStorage = (torreId: number) => inventory?.getStorage(torreId) ?? [];
  const getConfig = (torreId: number): UIConfig => inventory?.getConfig(torreId) ?? {
    // Pre-fetch fallback — matches DEFAULT_CONFIG in useInventoryData.
    // Once inventory loads, getConfig always returns real config or hook's DEFAULT_CONFIG.
    separacion_pct: 5, cuota_inicial_pct: 30, cuotas_default: 24,
    financiacion_pct: 70, dias_bloqueo: 4, vigencia_cotizacion: 7,
    agrupaciones_preestablecidas: false,
  };
  const canalesAtribucion = inventory?.canalesAtribucion ?? [];

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
  // Plan — initialized with defaults, reset when torre changes
  const [separacionMode, setSeparacionMode] = useState<"%"|"$">("$"); // toggle: % or fixed $
  const [separacionFijo, setSeparacionFijo] = useState(3000000); // fixed value when mode="$", default $3M
  const [separacionPct, setSeparacionPct] = useState(5);
  const [ciPct, setCiPct] = useState(30);
  const [numCuotas, setNumCuotas] = useState(24);

  // Reset plan defaults when torre changes
  const prevTorreRef = useRef<number | null>(null);
  useEffect(() => {
    if (torre && torre.id !== prevTorreRef.current) {
      const cfg = getConfig(torre.id);
      setSeparacionPct(cfg.separacion_pct);
      setCiPct(cfg.cuota_inicial_pct);
      setNumCuotas(cfg.cuotas_default);
      prevTorreRef.current = torre.id;
    }
  }, [torre]);

  // Active config for current torre (used in vigencia, subtotal logic, etc.)
  const CONFIG = torre ? getConfig(torre.id) : getConfig(0);

  // Descuentos (fixed fields — map to valorDescuento/valorDescuentoFinanciero in Sinco)
  const [dtoComercial, setDtoComercial] = useState(0);
  const [dtoFinanciero, setDtoFinanciero] = useState(0);
  // Abonos — DYNAMIC ARRAY (each maps to a Sinco ConceptoPlanDePagos line)
  const ABONO_TIPOS = [
    { sincoId:5, label:"Cesantías", defaultMes:2 },
    { sincoId:271, label:"Cuota Extraordinaria", defaultMes:1 },
    { sincoId:7, label:"Primas", defaultMes:6 },
  ];
  const [abonos, setAbonos] = useState([]); // [{sincoId, label, valor, cuota}]
  const addAbono = (tipo) => setAbonos(prev=>[...prev, { ...tipo, valor:0, cuota:tipo.defaultMes, id:Date.now() }]);
  const updateAbono = (id, field, val) => setAbonos(prev=>prev.map(a=>a.id===id?{...a,[field]:val}:a));
  const removeAbono = (id) => setAbonos(prev=>prev.filter(a=>a.id!==id));
  const [observaciones, setObservaciones] = useState("");
  const [tipoVenta, setTipoVenta] = useState(1);
  // Canal de atribución (for new contacts or contacts without canal)
  const [canalAtribucion, setCanalAtribucion] = useState("");
  // Init canal de atribución con primer valor del endpoint
  useEffect(() => {
    if (canalesAtribucion.length > 0 && !canalAtribucion) {
      setCanalAtribucion(canalesAtribucion[0].value);
    }
  }, [canalesAtribucion, canalAtribucion]);
  // Contact lookup — email-first
  const [contactExists, setContactExists] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactData, setContactData] = useState(null); // precarged data from HubSpot
  const [contactSearched, setContactSearched] = useState(false); // true after a real search attempt
  const [contactError, setContactError] = useState(""); // error message if search fails
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
  const [invView, setInvView] = useState("torre"); // "torre" or "tabla"
  const [hoveredUnit, setHoveredUnit] = useState(null);
  const cotRef = useRef(null); // ref for PDF print
  const [cotNum, setCotNum] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [dealResult, setDealResult] = useState<{ hubspotDealId: string; dealUrl: string } | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const units = torre ? getUnits(torre.id) : [];
  const parking = torre ? getParking(torre.id) : [];
  const storage = torre ? getStorage(torre.id) : [];

  const filtered = useMemo(()=>units.filter(u=>{
    if(filterPiso!=="all"&&u.piso!==+filterPiso) return false;
    if(filterTipo!=="all"&&u.tipologia!==filterTipo) return false;
    if(filterHabs!=="all"&&u.habs!==+filterHabs) return false;
    return true;
  }),[units,filterPiso,filterTipo,filterHabs]);
  const pisos = useMemo(()=>Array.from(new Set(units.map((u:any)=>u.piso))).sort((a:any,b:any)=>a-b),[units]);
  const tipos = useMemo(()=>Array.from(new Set(units.map((u:any)=>u.tipologia))).sort(),[units]);
  const habsOpts = useMemo(()=>Array.from(new Set(units.map((u:any)=>u.habs))).sort((a:any,b:any)=>a-b),[units]);

  // Tower grid: build a map of floor-pos → unit
  const TOWER_FLOORS = useMemo(()=>pisos.slice().sort((a,b)=>b-a),[pisos]); // descending
  const TOWER_POSITIONS = useMemo(()=>{
    const positions = Array.from(new Set(units.map((u:any)=>u.pos).filter(Boolean))).sort();
    return positions.length > 0 ? positions : ["01","02","03","04"];
  },[units]);
  const unitMap = useMemo(()=>{
    const m = {};
    units.forEach(u => { if(u.pos) m[`${u.piso}-${u.pos}`] = u; });
    return m;
  },[units]);

  // PDF / Print
  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = cotNum || "Cotizacion";
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 1000);
  };

  // Calculations
  // FIX: agrupaciones_preestablecidas = precio ya incluye parq+dep
  const subtotal = useMemo(()=>{
    if(!selectedUnit) return 0;
    if(CONFIG.agrupaciones_preestablecidas) return selectedUnit.precio;
    return selectedUnit.precio + selectedParking.reduce((s,p)=>s+p.precio,0) + selectedStorage.reduce((s,d)=>s+d.precio,0);
  },[selectedUnit,selectedParking,selectedStorage,CONFIG.agrupaciones_preestablecidas]);

  const totalDescuentos = dtoComercial + dtoFinanciero;
  const totalAbonos = abonos.reduce((s,a)=>s+a.valor,0);
  const valorNeto = subtotal - totalDescuentos;
  const separacion = separacionMode === "$" ? separacionFijo : Math.round(valorNeto * separacionPct / 100);
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
    // Monthly installments — last cuota absorbs rounding residual
    const totalCuotasRedondeadas = valorCuota * (numCuotas - 1);
    const ultimaCuota = Math.max(0, cuotaInicialNeta) - totalCuotasRedondeadas;
    for(let i=1; i<=numCuotas; i++) {
      const pago = i < numCuotas ? valorCuota : Math.max(0, ultimaCuota);
      rows.push({ concepto:`Cuota ${i}`, sincoId:1, mes:i, pago, tipo:"cuota" });
    }
    // Valor Total Pagado (separación + cuotas + abonos = everything except saldo)
    const totalPagado = separacion + Math.max(0, cuotaInicialNeta) + totalAbonos;
    rows.push({ concepto:"Valor Total Pagado", sincoId:0, mes:numCuotas, pago:totalPagado, tipo:"total" });
    // Final balance
    rows.push({ concepto:"Saldo final — financiación", sincoId:3, mes:numCuotas+1, pago:saldoFinal, tipo:"fixed" });
    // Sort by month, then abonos first within same month
    rows.sort((a,b)=> a.mes!==b.mes ? a.mes-b.mes : (a.tipo==="abono"?-1:b.tipo==="abono"?1:0));
    // Calculate running balance
    let saldo = valorNeto;
    rows.forEach(r=>{ saldo -= r.pago; r.saldo = Math.max(saldo, 0); });
    return rows;
  },[selectedUnit,separacion,valorCuota,numCuotas,saldoFinal,valorNeto,abonos,cuotaInicialNeta]);

  // ── Orquestador: Persistir → PDF → Deal → Success ──
  const handleSubmitDeal = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");
    setDealResult(null);
    setPdfUrl(null);

    const currentCotNum = cotNum || generateCotNumber(torre);
    if (!cotNum) setCotNum(currentCotNum);

    try {
      // Step 1: Persistir cotización
      const persistRes = await fetch('/api/engine/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'jimenez_demo',
          cotNumber: currentCotNum,
          buyer: {
            name: nombre, lastname: apellido, docType: tipoDoc, docNumber: cedula,
            email, phone, phoneCc: phoneCc.code,
            hubspotContactId: contactData?.hubspotId || null,
          },
          property: {
            macroId: macro?.id, macroName: macro?.nombre,
            torreId: torre?.id, torreName: torre?.nombre,
            unitNumber: selectedUnit?.numero, unitTipologia: selectedUnit?.tipologia,
            unitPiso: selectedUnit?.piso, unitArea: selectedUnit?.area,
            unitHabs: selectedUnit?.habs, unitBanos: selectedUnit?.banos,
            unitPrice: selectedUnit?.precio,
            parking: selectedParking.map((p: any) => ({ numero: p.numero, price: p.precio })),
            storage: selectedStorage.map((d: any) => ({ numero: d.numero, price: d.precio })),
            includesParking: incluyeParq, includesStorage: incluyeDep,
          },
          advisor: { id: asesor.id, name: asesor.nombre },
          financial: {
            saleType: tipoVenta, subtotal,
            discountCommercial: dtoComercial, discountFinancial: dtoFinanciero,
            totalDiscounts: totalDescuentos, netValue: valorNeto,
            separationAmount: separacion,
            initialPaymentPct: CONFIG.cuota_inicial_pct,
            initialPaymentAmount: cuotaInicialTotal,
            numInstallments: numCuotas, installmentAmount: valorCuota,
            financedAmount: saldoFinal, financedPct: CONFIG.financiacion_pct,
            paymentPlan: planRows.map(r => ({ concepto: r.concepto, mes: mesLabel(r.mes), pago: r.pago, tipo: r.tipo })),
            bonuses: abonos,
          },
          observaciones: observaciones.trim() || undefined,
          config: {
            vigenciaDias: CONFIG.vigencia_cotizacion,
            separacionPct: CONFIG.separacion_pct,
            cuotaInicialPct: CONFIG.cuota_inicial_pct,
          },
        }),
      });
      if (!persistRes.ok) {
        const errData = await persistRes.json().catch(() => ({}));
        throw new Error(errData.message || `Error ${persistRes.status} guardando cotización`);
      }

      // Step 2: Generar PDF server-side (non-fatal)
      try {
        const pdfRes = await fetch('/api/engine/quotations/pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: 'jimenez_demo', cotNumber: currentCotNum }),
        });
        if (pdfRes.ok) {
          const blob = await pdfRes.blob();
          setPdfUrl(URL.createObjectURL(blob));
        }
      } catch { console.warn('PDF generation failed (non-fatal)'); }

      // Step 3: Crear Deal en HubSpot
      const dealRes = await fetch('/api/engine/quotations/deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: 'jimenez_demo', cotNumber: currentCotNum }),
      });
      if (!dealRes.ok) {
        const errData = await dealRes.json().catch(() => ({}));
        throw new Error(errData.message || `Error ${dealRes.status} creando Deal`);
      }
      const dealData = await dealRes.json();
      setDealResult(dealData.deal);
      setShowSuccess(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Error inesperado');
      console.error('[handleSubmitDeal]', err);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, cotNum, torre, macro, nombre, apellido, tipoDoc, cedula, email, phone, phoneCc, contactData, selectedUnit, selectedParking, selectedStorage, incluyeParq, incluyeDep, asesor, tipoVenta, subtotal, dtoComercial, dtoFinanciero, totalDescuentos, valorNeto, separacion, cuotaInicialTotal, numCuotas, valorCuota, saldoFinal, planRows, abonos, observaciones, CONFIG]);

  const allStats = useMemo(()=>{
    if(!macro) return { total:0, disp:0, bloq:0, vend:0 };
    const torresIds = getTorres(macro.id).map(t=>t.id);
    const all = torresIds.flatMap(tid => getUnits(tid));
    return { total:all.length, disp:all.filter(u=>u.estado===ESTADOS.D).length, bloq:all.filter(u=>u.estado===ESTADOS.B).length, vend:all.filter(u=>u.estado===ESTADOS.V).length };
  },[macro]);

  const torreStats = useMemo(()=>{
    if(!torre) return null;
    return { total:units.length, disp:units.filter(u=>u.estado===ESTADOS.D).length, bloq:units.filter(u=>u.estado===ESTADOS.B).length, vend:units.filter(u=>u.estado===ESTADOS.V).length };
  },[torre,units]);

  const steps = ["Macroproyecto","Proyecto","Inventario","Agrupación","Comprador","Plan de Pagos","Cotización"];

  const MoneyInput = ({ label, value, onChange, placeholder }: { label:string, value:number, onChange:(v:number)=>void, placeholder?:string }) => (
    <div>
      <span style={S.label}>{label}</span>
      <div style={{ display:"flex", alignItems:"center", marginTop:4 }}>
        <span style={{ padding:"11px 10px", background:C.goldBg, border:`1px solid ${C.border}`, borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:13, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>$</span>
        <input style={{ ...S.input, borderRadius:"0 6px 6px 0", borderLeft:"none" }} placeholder={placeholder||"0"} value={value===0?"":value.toLocaleString("es-CO")}
          onChange={e=>{const v=parseInt(e.target.value.replace(/\D/g,""))||0; onChange(v);}} />
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", background:C.bg, minHeight:"100vh", color:C.text }}>
      <style>{`
        @font-face{font-family:'Carla Sans';src:url('/fonts/CarlaSansBold.ttf') format('truetype');font-weight:700;font-style:normal;font-display:swap}
        @font-face{font-family:'Carla Sans';src:url('/fonts/CarlaSansSemibold.ttf') format('truetype');font-weight:600;font-style:normal;font-display:swap}
        @font-face{font-family:'AinslieSans';src:url('/fonts/AinslieSans-NorLig.otf') format('opentype');font-weight:300;font-style:normal;font-display:swap}
        @font-face{font-family:'AinslieSans';src:url('/fonts/AinslieSans-NorReg.otf') format('opentype');font-weight:400;font-style:normal;font-display:swap}
        @font-face{font-family:'AinslieSans';src:url('/fonts/AinslieSans-NorMed.otf') format('opentype');font-weight:500;font-style:normal;font-display:swap}
        @font-face{font-family:'AinslieSans';src:url('/fonts/AinslieSans-NorBol.otf') format('opentype');font-weight:700;font-style:normal;font-display:swap}
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
        @media print{
          body{-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0}
          header,.no-print,.step-bar-wrap{display:none!important}
          .print-area{padding:20px!important;max-width:100%!important;border:none!important;box-shadow:none!important}
          .print-area *{font-size:10px!important;line-height:1.4!important}
          .print-area h1,.print-area h2{font-size:14px!important}
          .print-area table{font-size:9px!important}
          .print-area table td,.print-area table th{padding:4px 6px!important}
          .fin-summary{grid-template-columns:repeat(3,1fr)!important;gap:8px!important}
          .fin-summary>div{margin-bottom:4px!important}
          .print-area div[style*="grid-template-columns: 1fr 1fr 1fr"]{grid-template-columns:1fr 1fr 1fr!important;gap:12px!important}
          .print-area div[style*="grid-template-columns"]{gap:8px!important}
          @page{size:letter;margin:1.5cm}
        }
      `}</style>

      {/* ══ HEADER ══ */}
      <header className="no-print" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 24px", borderBottom:`1px solid ${C.border}`, background:C.white, position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <img src="/assets/logo-jimenez-horizontal.png" alt="Constructora Jiménez" style={{ height:40, width:"auto", objectFit:"contain" }} onError={e=>{(e.target as HTMLImageElement).style.display="none"}} />
          <img src="/assets/sello-40-anos.png" alt="40 Años" style={{ height:36, width:"auto", objectFit:"contain" }} onError={e=>{(e.target as HTMLImageElement).style.display="none"}} />
          <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:12, marginLeft:2 }}>
            <div style={{ fontSize:10, letterSpacing:"2.5px", color:C.gold, textTransform:"uppercase", fontFamily:"'Carla Sans','AinslieSans',sans-serif", fontWeight:600 }}>Lo hacemos realidad</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", letterSpacing:"1px" }}>ASESOR</div>
            <div style={{ fontSize:12, color:C.navy, fontWeight:600, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{asesor.nombre}</div>
          </div>
          <span style={{ ...S.tag(C.goldBg, C.textGold, C.goldBorder), fontSize:9, letterSpacing:"1.5px" }}>COTIZADOR FOCUXAI</span>
        </div>
      </header>

      <div style={{ maxWidth:1160, margin:"0 auto", padding:"20px 20px 60px" }}>
        {/* ══ STEP BAR ══ */}
        <div className="no-print step-bar-wrap">
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, padding:"0 2px" }}>
          {steps.map((s,i)=>(
            <span key={i} style={{ fontSize:9, letterSpacing:"1.5px", textTransform:"uppercase", fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:i===step?C.gold:i<step?C.textSec:C.textTer, fontWeight:i===step?700:400, cursor:i<step?"pointer":"default" }}
              onClick={()=>i<step&&setStep(i)}>{s}</span>
          ))}
        </div>
        <div style={{ display:"flex", gap:3, marginBottom:28 }}>
          {steps.map((_,i)=><div key={i} style={{ flex:1, height:3, borderRadius:2, background:i<step?C.gold:i===step?C.goldLight:`${C.border}`, transition:"all .4s" }} />)}
        </div>
        </div>

        {/* ══ LOADING / ERROR ══ */}
        {invLoading && (
          <div className="fu" style={{ textAlign:"center", padding:"80px 20px" }}>
            <div style={{ width:48, height:48, border:`3px solid ${C.border}`, borderTopColor:C.gold, borderRadius:"50%", animation:"spin 1s linear infinite", margin:"0 auto 24px" }} />
            <div style={{ fontSize:15, color:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:500 }}>Cargando inventario desde HubSpot...</div>
            <div style={{ fontSize:12, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginTop:6 }}>Conectando con el Engine</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {invError && !invLoading && (
          <div className="fu" style={{ textAlign:"center", padding:"60px 20px" }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:C.redBg, border:`2px solid ${C.red}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", fontSize:24, color:C.red }}>!</div>
            <div style={{ fontSize:18, fontWeight:500, color:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginBottom:8 }}>Error al cargar inventario</div>
            <div style={{ fontSize:13, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", maxWidth:480, margin:"0 auto 20px", lineHeight:1.6 }}>{invError}</div>
            <button style={S.btn("primary")} onClick={()=>window.location.reload()}>Reintentar</button>
          </div>
        )}

        {/* ══════ STEP 0: MACROPROYECTO ══════ */}
        {step===0 && !invLoading && !invError && (
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
                      <span style={{ fontSize:11, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>ID: {m.id}</span>
                    </div>
                    <div style={{ fontSize:22, fontWeight:400, color:C.navy, marginBottom:4, fontFamily:"'Carla Sans','AinslieSans',sans-serif" }}>{m.nombre}</div>
                    <div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{m.zona}, {m.ciudad}</div>
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
                  <div style={{ fontSize:26, fontWeight:300, color:m.c, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontVariantNumeric:"lining-nums" }}>{m.v}</div>
                  <div style={{ fontSize:9, letterSpacing:"2px", textTransform:"uppercase", color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginTop:2 }}>{m.l}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:16 }}>
              {getTorres(macro.id).map(t=>{
                const sel = torre?.id===t.id;
                const tu = getUnits(t.id);
                const isEmpty = tu.length === 0;
                const disp = tu.filter(u=>u.estado===ESTADOS.D).length;
                const vend = tu.filter(u=>u.estado===ESTADOS.V).length;
                const pctVend = tu.length>0 ? Math.round(vend/tu.length*100) : 0;
                return (
                  <div key={t.id} onClick={()=>{if(!isEmpty){setTorre(t);setSelectedUnit(null);setSelectedParking([]);setSelectedStorage([]);}}}
                    style={{ ...S.card, padding:24, cursor:isEmpty?"not-allowed":"pointer", borderColor:sel?C.gold:C.border, background:sel?C.goldBg:isEmpty?"#F5F3EE":C.white, opacity:isEmpty?.55:1, transition:"all .2s" }}>
                    <div style={{ fontSize:10, letterSpacing:"2px", textTransform:"uppercase", color:isEmpty?C.textTer:C.gold, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:700, marginBottom:6 }}>{t.codigo}</div>
                    <div style={{ fontSize:20, fontWeight:400, color:isEmpty?C.textTer:C.navy, marginBottom:4, fontFamily:"'Carla Sans','AinslieSans',sans-serif" }}>{t.nombre}</div>
                    <div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginBottom:10 }}>{t.tipo} · {t.areaDesde} — {t.areaHasta} m²</div>
                    {isEmpty ? (
                      <div style={{ padding:"10px 14px", background:C.yellowBg, borderRadius:6, border:`1px solid ${C.yellowBorder}`, fontSize:11, color:C.yellow, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:500, textAlign:"center" }}>
                        Sin inventario sincronizado
                      </div>
                    ) : (
                    <Fragment>
                    {/* Absorption bar */}
                    <div style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:11, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.textSec }}>{vend} vendidas · {disp} disponibles</span>
                        <span style={{ fontSize:12, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:700, color:pctVend>70?C.red:pctVend>40?C.yellow:C.green }}>{pctVend}%</span>
                      </div>
                      <div style={{ height:6, background:C.borderLight, borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pctVend}%`, background:pctVend>70?C.red:pctVend>40?C.gold:C.green, borderRadius:3, transition:"width 0.4s ease" }} />
                      </div>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div><span style={{ fontSize:11, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Desde </span><span style={{ fontSize:18, fontWeight:600, color:C.gold, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{fmtS(t.precioDesde)}</span></div>
                      <span style={S.tag(C.greenBg, C.green, C.greenBorder)}>{disp} disp.</span>
                    </div>
                    </Fragment>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop:24, display:"flex", justifyContent:"flex-end" }}>
              <button style={S.btn("primary",!torre)} disabled={!torre} onClick={()=>setStep(2)}>Ver inventario →</button>
            </div>
          </div>
        )}

        {/* ══════ STEP 2: INVENTORY (Torre + Tabla) ══════ */}
        {step===2 && torre && (
          <div className="fu">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
              <div>
                <h1 style={{ ...S.sectionTitle, fontSize:22 }}>{torre.nombre} — Inventario</h1>
                <p style={S.sectionSub}>{macro.nombre} · {torreStats?.disp} disponibles de {torreStats?.total} · Data Sinco producción</p>
              </div>
              <button style={S.btn("outline")} onClick={()=>setStep(1)}>← Torres</button>
            </div>
            {/* Absorption bar */}
            {torreStats && torreStats.total>0 && (()=>{
              const pctV = Math.round(torreStats.vend/torreStats.total*100);
              return (
                <div style={{ ...S.card, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:16 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ height:8, background:C.borderLight, borderRadius:4, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pctV}%`, background:pctV>70?C.red:pctV>40?C.gold:C.green, borderRadius:4, transition:"width 0.4s" }} />
                    </div>
                  </div>
                  <span style={{ fontSize:13, fontWeight:700, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:pctV>70?C.red:pctV>40?C.gold:C.green, whiteSpace:"nowrap" }}>{pctV}% vendido</span>
                  <span style={{ fontSize:12, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.textSec, whiteSpace:"nowrap" }}>{torreStats.vend}/{torreStats.total} uds</span>
                </div>
              );
            })()}
            {/* View toggle */}
            <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center" }}>
              {[["torre","Vista Torre"],["tabla","Vista Tabla"]].map(([v,l])=>(
                <button key={v} onClick={()=>setInvView(v)} style={{
                  padding:"8px 16px", fontSize:11, fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase",
                  fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", borderRadius:6, cursor:"pointer", transition:"all 0.2s",
                  background: invView===v ? C.gold : "transparent",
                  color: invView===v ? C.white : C.gold,
                  border: invView===v ? "none" : `1.5px solid ${C.gold}`,
                }}>{l}</button>
              ))}
              <div style={{ flex:1 }} />
              <span style={{ fontSize:12, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{units.filter(u=>u.estado===ESTADOS.D).length} disponibles · {units.filter(u=>u.estado===ESTADOS.V).length} vendidas</span>
            </div>

            {/* ── TOWER VIEW ── */}
            {invView==="torre" && (
              <div style={{ ...S.card, padding:"18px 16px" }}>
                {/* Legend */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <span style={S.label}>Mapa de Torre — Pisos {Math.min(...pisos)} al {Math.max(...pisos)}</span>
                  <div style={{ display:"flex", gap:16, fontSize:11, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>
                    <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:14, height:14, borderRadius:3, background:C.greenBg, border:`2px solid ${C.green}` }}/> Disponible</span>
                    <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:14, height:14, borderRadius:3, background:C.redBg, border:`2px solid ${C.red}` }}/> Vendida</span>
                    <span style={{ display:"flex", alignItems:"center", gap:5 }}><span style={{ width:14, height:14, borderRadius:3, background:C.borderLight, border:`1px solid ${C.border}` }}/> Sin data</span>
                  </div>
                </div>
                <div style={{ overflowX:"auto" }}>
                  <div style={{ minWidth:700 }}>
                    {/* Column headers */}
                    <div style={{ display:"flex", gap:3, marginBottom:6, paddingLeft:46 }}>
                      {TOWER_POSITIONS.map(p=>(
                        <div key={p} style={{ width:36, textAlign:"center", fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:700 }}>{p}</div>
                      ))}
                    </div>
                    {/* Floor rows */}
                    {TOWER_FLOORS.map(floor=>(
                      <div key={floor} style={{ display:"flex", gap:3, marginBottom:3, alignItems:"center" }}>
                        <div style={{ width:42, fontSize:12, color:C.textSec, textAlign:"right", paddingRight:6, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:700 }}>P{floor}</div>
                        {TOWER_POSITIONS.map(pos=>{
                          const key = `${floor}-${pos}`;
                          const unit = unitMap[key];
                          if(!unit) return <div key={pos} style={{ width:36, height:30, background:C.borderLight, borderRadius:4, border:`1px solid ${C.border}` }} />;
                          const isDisp = unit.estado===ESTADOS.D;
                          const isHov = hoveredUnit?.id===unit.id;
                          const isSel = selectedUnit?.id===unit.id;
                          return (
                            <div key={pos}
                              onMouseEnter={()=>setHoveredUnit(unit)}
                              onMouseLeave={()=>setHoveredUnit(null)}
                              onClick={()=>{ if(isDisp){setSelectedUnit(unit);setStep(3);} }}
                              style={{
                                width:36, height:30, borderRadius:4,
                                cursor: isDisp ? "pointer" : "default",
                                background: isDisp ? C.greenBg : C.redBg,
                                border: isSel ? `2.5px solid ${C.gold}` : isHov ? `2px solid ${isDisp?C.green:C.red}` : `1.5px solid ${isDisp?C.greenBorder:C.redBorder}`,
                                transition:"all 0.12s ease",
                                transform: isHov ? "scale(1.15)" : "scale(1)",
                                zIndex: isHov ? 2 : 1,
                                position:"relative",
                              }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Hover detail bar */}
                {hoveredUnit && (
                  <div style={{ marginTop:14, padding:"12px 16px", background:C.goldBg, borderRadius:8, border:`1px solid ${C.goldBorder}`, display:"flex", gap:20, alignItems:"center", flexWrap:"wrap" }}>
                    {[
                      {l:"Unidad", v:`APT-${hoveredUnit.numero}`, bold:true},
                      {l:"Piso", v:hoveredUnit.piso},
                      {l:"Área", v:`${hoveredUnit.area} m²`},
                      {l:"Tipo", v:hoveredUnit.tipologia},
                      {l:"Precio", v:fmtS(hoveredUnit.precio)},
                      {l:"Estado", v:eLabel(hoveredUnit.estado), c:eColor(hoveredUnit.estado)},
                      {l:"ID Sinco", v:hoveredUnit.sincoId||hoveredUnit.id},
                    ].map((d,i)=>(
                      <div key={i}>
                        <div style={{ fontSize:9, letterSpacing:"1.5px", textTransform:"uppercase", color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{d.l}</div>
                        <div style={{ fontSize:d.bold?15:13, fontWeight:d.bold?700:600, color:d.c||C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{d.v}</div>
                      </div>
                    ))}
                    {hoveredUnit.estado===ESTADOS.D && (
                      <button style={{...S.btn("sm"), marginLeft:"auto"}} onClick={()=>{setSelectedUnit(hoveredUnit);setStep(3);}}>Seleccionar →</button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── TABLE VIEW (original) ── */}
            {invView==="tabla" && (
              <>
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
                    <span style={{ fontSize:12, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{filtered.length} unidades</span>
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
              </>
            )}
          </div>
        )}
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
                  <div key={i}><div style={{...S.label,marginBottom:2}}>{d.l}</div><div style={{ fontSize:15, fontWeight:600, color:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{d.v}</div></div>
                ))}
              </div>
              {/* Incluye parq/dep checkboxes */}
              <div style={{ padding:"12px 20px", borderTop:`1px solid ${C.borderLight}`, display:"flex", gap:20 }}>
                {[{label:"Incluye parqueadero",val:incluyeParq,set:setIncluyeParq},{label:"Incluye depósito",val:incluyeDep,set:setIncluyeDep}].map((ck,i)=>(
                  <label key={i} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.navy }}>
                    <input type="checkbox" checked={ck.val} onChange={e=>ck.set(e.target.checked)} style={{ accentColor:C.gold, width:16, height:16 }} />
                    <span style={{ fontWeight:ck.val?600:400 }}>{ck.label}</span>
                    {ck.val && <span style={{ fontSize:10, color:C.textTer }}>*</span>}
                  </label>
                ))}
              </div>
              {(incluyeParq || incluyeDep) && (
                <div style={{ padding:"8px 20px 12px", fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontStyle:"italic" }}>
                  * {incluyeParq && incluyeDep ? "Incluye parqueadero y depósito." : incluyeParq ? "Incluye parqueadero." : "Incluye depósito."} Asignación de unidad específica sujeta a disponibilidad de inventario.
                </div>
              )}
            </div>
            {/* ── Render + Plano por tipología ── */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
              {[{label:"Render",file:`render-${selectedUnit.tipologia}`},{label:"Plano",file:`plano-${selectedUnit.tipologia}`}].map((img,idx)=>(
                <div key={idx} style={{ ...S.card, overflow:"hidden" }}>
                  <div style={{ padding:"10px 16px", background:C.goldBg, borderBottom:`1px solid ${C.borderLight}` }}>
                    <span style={S.label}>{img.label} — Tipo {selectedUnit.tipologia}</span>
                  </div>
                  <div style={{ position:"relative", minHeight:200, display:"flex", alignItems:"center", justifyContent:"center", background:"#F5F3EE" }}>
                    <img src={`/assets/${img.file}.png`} alt={`${img.label} ${selectedUnit.tipologia}`}
                      style={{ width:"100%", height:"auto", maxHeight:320, objectFit:"contain", display:"block" }}
                      onError={e=>{
                        const el = e.target as HTMLImageElement;
                        el.style.display="none";
                        const fb = el.nextElementSibling as HTMLElement;
                        if(fb) fb.style.display="flex";
                      }} />
                    <div style={{ display:"none", flexDirection:"column", alignItems:"center", gap:8, padding:32, color:C.textTer }}>
                      <div style={{ width:48, height:48, borderRadius:"50%", background:C.borderLight, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>📷</div>
                      <span style={{ fontSize:12, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", textAlign:"center" }}>{img.label} no disponible para tipo {selectedUnit.tipologia}</span>
                      <span style={{ fontSize:10, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.textTer }}>Se cargará desde HubSpot File Manager</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
                        <div style={{ fontSize:13, fontWeight:600, color:s?C.gold:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{p.numero}</div>
                        <div style={{ fontSize:11, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{fmtS(p.precio)}</div>
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
                <div style={{ fontSize:26, fontWeight:400, color:C.gold, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{fmt(subtotal)}</div>
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
                        onChange={e=>{setEmail(e.target.value);setEmailError(e.target.value&&!validateEmail(e.target.value)?"Email inválido":"");setContactExists(false);setContactData(null);setContactSearched(false);setContactError("");}} />
                      <button style={{...S.btn("primary"), padding:"10px 18px", fontSize:11, letterSpacing:"1.5px", whiteSpace:"nowrap", opacity:!email||emailError?.5:1}} disabled={!email||!!emailError}
                        onClick={async ()=>{
                          setContactLoading(true);
                          setContactError("");
                          try {
                            // TODO: clientId debería venir de un contexto/config del Quoter, no hardcodeado
                            const res = await fetch("/api/engine/contacts/search", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ clientId: "jimenez_demo", email: email.trim().toLowerCase() }),
                            });
                            const data = await res.json();
                            if (!res.ok) {
                              console.error("[Cotizador] Contact search error:", data);
                              setContactExists(false);
                              setContactData(null);
                              setContactError(data.message || "Error buscando contacto");
                            } else if (data.found) {
                              const c = data.contact;
                              setContactExists(true);
                              setContactData({
                                firstname: c.firstname,
                                lastname: c.lastname,
                                cedula: c.cedula,
                                phone: c.phone,
                                canal: c.canal,
                                proyectos: c.listaProyectos,
                              });
                              if (c.firstname) setNombre(c.firstname);
                              if (c.lastname) setApellido(c.lastname);
                              if (c.cedula) setCedula(c.cedula);
                              if (c.phone) setPhone(c.phone);
                              if (c.tipoDocumento) setTipoDoc(c.tipoDocumento);
                            } else {
                              setContactExists(false);
                              setContactData(null);
                            }
                          } catch (err) {
                            console.error("[Cotizador] Contact search failed:", err);
                            setContactExists(false);
                            setContactData(null);
                            setContactError("No se pudo conectar con el servidor");
                          } finally {
                            setContactSearched(true);
                            setContactLoading(false);
                          }
                        }}>
                        {contactLoading ? "..." : "Buscar"}
                      </button>
                    </div>
                    {emailError && <div style={{ fontSize:10, color:C.red, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginTop:2 }}>{emailError}</div>}
                    {/* Search error */}
                    {contactError && <div style={{ marginTop:6, fontSize:10, color:C.red, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", padding:"6px 10px", background:C.redBg, borderRadius:4, border:`1px solid ${C.redBorder}` }}>⚠ {contactError}</div>}
                    {/* Lookup result — only shown after a real search attempt */}
                    {contactSearched && !contactLoading && !contactError && (
                      <div style={{ marginTop:8, padding:"10px 14px", borderRadius:6, background:contactExists?C.greenBg:C.yellowBg, border:`1px solid ${contactExists?C.greenBorder:C.yellowBorder}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:contactExists?C.green:C.yellow, fontWeight:600 }}>
                          <span>{contactExists?"✓":"⚠"}</span>
                          <span>{contactExists ? "Contacto encontrado en HubSpot" : "Contacto no encontrado — se creará al enviar cotización"}</span>
                        </div>
                        <div style={{ fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginTop:4 }}>
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
                      <input style={S.input} placeholder="" value={cedula} onChange={e=>setCedula(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label style={{...S.label,display:"block",marginBottom:4}}>Teléfono</label>
                    <div style={{ display:"flex", position:"relative" }}>
                      <div onClick={()=>setShowCcDrop(!showCcDrop)}
                        style={{ display:"flex", alignItems:"center", gap:4, padding:"11px 10px", background:C.goldBg, border:`1px solid ${C.border}`, borderRight:"none", borderRadius:"6px 0 0 6px", cursor:"pointer", fontSize:13, userSelect:"none", whiteSpace:"nowrap" }}>
                        <span>{phoneCc.flag}</span><span style={{ fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontSize:12, fontWeight:500 }}>{phoneCc.code}</span>
                        <span style={{ fontSize:8, color:C.textTer }}>▼</span>
                      </div>
                      {showCcDrop && (
                        <div style={{ position:"absolute", top:"100%", left:0, background:C.white, border:`1px solid ${C.border}`, borderRadius:6, boxShadow:"0 4px 12px rgba(0,0,0,.1)", zIndex:20, maxHeight:200, overflow:"auto", width:220 }}>
                          {COUNTRIES.map(cc=>(
                            <div key={cc.code} onClick={()=>{setPhoneCc(cc);setShowCcDrop(false);}} className="rh"
                              style={{ padding:"8px 12px", cursor:"pointer", display:"flex", gap:8, alignItems:"center", fontSize:12, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>
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
                    {phoneError && <div style={{ fontSize:10, color:C.red, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginTop:2 }}>{phoneError}</div>}
                  </div>
                  {/* Canal de atribución — only shown if contact doesn't exist or has no canal */}
                  {(!contactExists || (contactExists && !contactData?.canal)) && (
                  <div>
                    <label style={{...S.label,display:"block",marginBottom:4}}>Canal de Atribución</label>
                    <select style={S.select} value={canalAtribucion} onChange={e=>setCanalAtribucion(e.target.value)}>
                      {canalesAtribucion.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
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
                    <div style={{ width:40, height:40, borderRadius:"50%", background:C.gold, display:"flex", alignItems:"center", justifyContent:"center", color:C.white, fontWeight:700, fontSize:15, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>
                      {asesor.nombre.split(" ").map(n=>n[0]).slice(0,2).join("")}
                    </div>
                    <div>
                      <div style={{ fontSize:15, fontWeight:600, color:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{asesor.nombre}</div>
                      <div style={{ fontSize:11, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Sesión activa via HubSpot OAuth</div>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <div><span style={{...S.label,fontSize:9}}>ID SINCO</span><div style={{fontSize:12,fontWeight:600,fontFamily:"'AinslieSans','Helvetica Neue',sans-serif",color:C.navy}}>{asesor.id}</div></div>
                    <div><span style={{...S.label,fontSize:9}}>HUBSPOT OWNER</span><div style={{fontSize:12,fontWeight:600,fontFamily:"'AinslieSans','Helvetica Neue',sans-serif",color:C.navy}}>owner_{asesor.id}</div></div>
                  </div>
                  <div style={{ fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginTop:8, borderTop:`1px solid ${C.goldBorder}`, paddingTop:8 }}>
                    Precargado del login. El Deal se asignará a este asesor como owner + id_vendedor_sinco_fx para write-back.
                  </div>
                </div>
                <div style={{ ...S.card, marginTop:16, padding:16, background:C.white }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <div><div style={S.label}>Proyecto</div><div style={{ fontSize:13, fontWeight:600, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.navy }}>{macro?.nombre} — {torre?.nombre}</div></div>
                    <div><div style={S.label}>Unidad</div><div style={{ fontSize:13, fontWeight:600, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.navy }}>APT {selectedUnit?.numero} · {selectedUnit?.tipologia}</div></div>
                    <div><div style={S.label}>Valor</div><div style={{ fontSize:13, fontWeight:600, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.gold }}>{fmt(subtotal)}</div></div>
                    <div><div style={S.label}>Complementos</div><div style={{ fontSize:13, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.navy }}>{selectedParking.length>0?`${selectedParking.length} parq seleccionado${selectedParking.length>1?"s":""}`:incluyeParq?"Parq. incluido *":"Sin parq."} · {selectedStorage.length>0?`${selectedStorage.length} dep seleccionado${selectedStorage.length>1?"s":""}`:incluyeDep?"Dep. incluido *":"Sin dep."}</div></div>
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
                  {/* Separación con toggle %/$ */}
                  <div style={{ marginBottom:20 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <span style={S.label}>Separación</span>
                      <div style={{ display:"flex", gap:0, borderRadius:6, overflow:"hidden", border:`1.5px solid ${C.gold}` }}>
                        {(["%","$"] as const).map(m=>(
                          <button key={m} onClick={()=>setSeparacionMode(m)} style={{
                            padding:"4px 14px", fontSize:12, fontWeight:700, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif",
                            background:separacionMode===m?C.gold:"transparent", color:separacionMode===m?C.white:C.gold,
                            border:"none", cursor:"pointer", transition:"all .2s"
                          }}>{m}</button>
                        ))}
                      </div>
                    </div>
                    {separacionMode==="%" ? (
                      <SliderInput label="" value={separacionPct} onChange={setSeparacionPct} min={0} max={15} step={0.5} suffix="%" />
                    ) : (
                      <div style={{ display:"flex", alignItems:"center" }}>
                        <span style={{ padding:"11px 10px", background:C.goldBg, border:`1px solid ${C.goldBorder}`, borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:13, color:C.gold, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:700 }}>$</span>
                        <input style={{ ...S.input, borderRadius:"0 6px 6px 0", borderLeft:"none", fontSize:16, fontWeight:600, color:C.gold }} 
                          value={separacionFijo===0?"":separacionFijo.toLocaleString("es-CO")}
                          onChange={e=>{const v=parseInt(e.target.value.replace(/\D/g,""))||0; setSeparacionFijo(v);}} />
                      </div>
                    )}
                    <div style={{ fontSize:11, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginTop:4 }}>
                      {separacionMode==="$" ? `= ${valorNeto>0?(separacionFijo/valorNeto*100).toFixed(1):"0"}% del valor neto` : `= ${fmt(separacion)}`}
                    </div>
                  </div>
                  <SliderInput label="Cuota Inicial Total" value={ciPct} onChange={setCiPct} min={0} max={100} step={0.5} suffix="%" />
                  <SliderInput label="Número de Cuotas" value={numCuotas} onChange={setNumCuotas} min={1} max={60} />
                  <div style={{ padding:"10px 14px", background:C.goldBg, borderRadius:6, border:`1px solid ${C.goldBorder}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Cuota mensual</span>
                    <span style={{ fontSize:18, fontWeight:600, color:C.gold, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{fmt(valorCuota)}</span>
                  </div>
                </div>

                {/* Descuentos — collapsible */}
                {!showDescuentos ? (
                  <div onClick={()=>setShowDescuentos(true)}
                    style={{ ...S.card, padding:"14px 20px", cursor:"pointer", display:"flex", alignItems:"center", gap:8, borderStyle:"dashed", borderColor:C.border }}>
                    <span style={{ width:22, height:22, borderRadius:"50%", background:C.redBg, border:`1px solid ${C.redBorder}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:C.red, fontWeight:600 }}>+</span>
                    <span style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:500 }}>Agregar descuento</span>
                  </div>
                ) : (
                <div style={{ ...S.card, padding:20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <span style={{ ...S.label, fontSize:12, color:C.red, margin:0 }}>Descuentos</span>
                    <span onClick={()=>{setShowDescuentos(false);setDtoComercial(0);setDtoFinanciero(0);}}
                      style={{ fontSize:11, color:C.textTer, cursor:"pointer", fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>✕ Quitar</span>
                  </div>
                  {/* Dto Comercial — % and $ synced */}
                  <div style={{ marginBottom:12 }}>
                    <span style={{...S.label, display:"block", marginBottom:6}}>Descuento Comercial (Referido, Cliente Antiguo, Campañas, Promociones)</span>
                    <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", gap:8 }}>
                      <div style={{ display:"flex", alignItems:"center" }}>
                        <input style={{...S.input, textAlign:"right", paddingRight:4}} placeholder="0" value={subtotal>0?Math.round(dtoComercial/subtotal*1000)/10||"":""}
                          onChange={e=>{const pct=parseFloat(e.target.value)||0; setDtoComercial(Math.round(subtotal*pct/100));}} />
                        <span style={{ padding:"11px 6px", background:C.redBg, border:`1px solid ${C.redBorder}`, borderLeft:"none", borderRadius:"0 6px 6px 0", fontSize:12, color:C.red, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>%</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center" }}>
                        <span style={{ padding:"11px 10px", background:C.redBg, border:`1px solid ${C.redBorder}`, borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:13, color:C.red, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>$</span>
                        <input style={{...S.input, borderRadius:"0 6px 6px 0", borderLeft:"none"}} placeholder="0" value={dtoComercial===0?"":dtoComercial.toLocaleString("es-CO")}
                          onChange={e=>{const v=parseInt(e.target.value.replace(/\D/g,""))||0; setDtoComercial(v);}} />
                      </div>
                    </div>
                  </div>
                  {/* Dto Financiero — % and $ synced */}
                  <div>
                    <span style={{...S.label, display:"block", marginBottom:6}}>Descuento Financiero (Pronto Pago)</span>
                    <div style={{ display:"grid", gridTemplateColumns:"100px 1fr", gap:8 }}>
                      <div style={{ display:"flex", alignItems:"center" }}>
                        <input style={{...S.input, textAlign:"right", paddingRight:4}} placeholder="0" value={subtotal>0?Math.round(dtoFinanciero/subtotal*1000)/10||"":""}
                          onChange={e=>{const pct=parseFloat(e.target.value)||0; setDtoFinanciero(Math.round(subtotal*pct/100));}} />
                        <span style={{ padding:"11px 6px", background:C.redBg, border:`1px solid ${C.redBorder}`, borderLeft:"none", borderRadius:"0 6px 6px 0", fontSize:12, color:C.red, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>%</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center" }}>
                        <span style={{ padding:"11px 10px", background:C.redBg, border:`1px solid ${C.redBorder}`, borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:13, color:C.red, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>$</span>
                        <input style={{...S.input, borderRadius:"0 6px 6px 0", borderLeft:"none"}} placeholder="0" value={dtoFinanciero===0?"":dtoFinanciero.toLocaleString("es-CO")}
                          onChange={e=>{const v=parseInt(e.target.value.replace(/\D/g,""))||0; setDtoFinanciero(v);}} />
                      </div>
                    </div>
                  </div>
                  {totalDescuentos > 0 && (
                    <div style={{ marginTop:10, padding:"8px 12px", background:C.redBg, borderRadius:6, border:`1px solid ${C.redBorder}`, display:"flex", justifyContent:"space-between" }}>
                      <span style={{ fontSize:12, color:C.red, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Total descuentos</span>
                      <span style={{ fontSize:14, fontWeight:700, color:C.red, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>-{fmt(totalDescuentos)}</span>
                    </div>
                  )}
                </div>
                )}

                {/* Abonos — dynamic array */}
                <div style={{ ...S.card, padding:20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:abonos.length>0?12:0 }}>
                    <span style={{ ...S.label, fontSize:12, color:C.green, margin:0 }}>Cuotas Extraordinarias</span>
                    {abonos.length>0 && <span style={{ fontSize:12, fontWeight:700, color:C.green, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>+{fmt(totalAbonos)}</span>}
                  </div>
                  {abonos.map(a=>(
                    <div key={a.id} style={{ display:"grid", gridTemplateColumns:"1fr 120px 90px 32px", gap:8, alignItems:"end", marginBottom:8 }}>
                      <div>
                        <span style={{...S.label, display:"block", marginBottom:4}}>{a.label} (id:{a.sincoId})</span>
                        <div style={{ display:"flex", alignItems:"center" }}>
                          <span style={{ padding:"11px 10px", background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderRight:"none", borderRadius:"6px 0 0 6px", fontSize:13, color:C.green, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>$</span>
                          <input style={{ ...S.input, borderRadius:"0 6px 6px 0", borderLeft:"none" }} placeholder="0" value={a.valor===0?"":a.valor.toLocaleString("es-CO")}
                            onChange={e=>{const v=parseInt(e.target.value.replace(/\D/g,""))||0; updateAbono(a.id,"valor",v);}} />
                        </div>
                      </div>
                      <div>
                        <span style={{...S.label, display:"block", marginBottom:4}}>Cuota</span>
                        {a.fixedMes ? (
                          <div style={{ padding:"11px 8px", background:C.borderLight, borderRadius:6, fontSize:12, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", textAlign:"center" }}>Hoy</div>
                        ) : (
                          <select style={{...S.select, padding:"11px 8px"}} value={a.cuota} onChange={e=>updateAbono(a.id,"cuota",+e.target.value)}>
                            {Array.from({length:numCuotas},(_,i)=>i+1).map(m=><option key={m} value={m}>Cuota {m}</option>)}
                          </select>
                        )}
                      </div>
                      <div>
                        <span style={{...S.label, display:"block", marginBottom:4}}>Mes</span>
                        <div style={{ padding:"11px 8px", background:C.borderLight, borderRadius:6, fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", textAlign:"center" }}>{a.fixedMes?"0":a.cuota}</div>
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
                        style={{ padding:"6px 12px", borderRadius:6, border:`1px dashed ${C.greenBorder}`, background:C.greenBg, cursor:"pointer", fontSize:11, color:C.green, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:500, transition:"all .2s" }}>
                        + {t.label}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Observaciones del asesor — opcional */}
                <div style={{ ...S.card, padding:20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <span style={{ ...S.label, fontSize:12, color:C.gold, margin:0 }}>Observaciones</span>
                    <span style={{ fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{observaciones.length}/2000</span>
                  </div>
                  <textarea
                    style={{ ...S.input, minHeight:72, resize:"vertical", lineHeight:1.5 }}
                    placeholder="Notas adicionales del asesor sobre la cotización (opcional)"
                    value={observaciones}
                    onChange={e=>setObservaciones(e.target.value)}
                    maxLength={2000}
                  />
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
                  { l:separacionMode==="%"?`Separación (${separacionPct}%)`:`Separación (${fmt(separacionFijo)})`, v:separacion },
                  { l:`Cuota Inicial (${ciPct}%)`, v:cuotaInicialTotal, bold:true },
                  { l:`  └ Neto CI en ${numCuotas} cuotas`, v:Math.max(0,cuotaInicialNeta) },
                  { l:"Valor cuota mensual", v:valorCuota, bold:true },
                  { l:`Cuotas extraordinarias (${abonos.filter(a=>a.valor>0).length})`, v:totalAbonos, green:true, hide:totalAbonos===0 },
                  { l:`Saldo final — financiación (${100-ciPct}%)`, v:saldoFinal, bold:true, sep:true },
                ].filter(r=>!r.hide).map((r,i)=>(
                  <div key={i}>
                    {r.sep && <div style={{ borderTop:`2px solid ${C.goldBorder}`, margin:"8px 0" }} />}
                    <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", alignItems:"center" }}>
                      <span style={{ fontSize:12, color:r.gold?C.gold:r.red?C.red:r.green?C.green:C.textSec, fontWeight:r.bold?600:400, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{r.l}</span>
                      <span style={{ fontSize:r.bold?16:14, fontWeight:r.bold?700:500, color:r.gold?C.gold:r.red?C.red:r.green?C.green:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{r.neg?`-${fmt(r.v)}`:fmt(r.v)}</span>
                    </div>
                  </div>
                ))}
                {/* Incluye parq/dep note */}
                {(incluyeParq || incluyeDep) && selectedParking.length===0 && selectedStorage.length===0 && (
                  <div style={{ fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontStyle:"italic", marginTop:4 }}>
                    * Valor {incluyeParq&&incluyeDep?"incluye parqueadero y depósito":incluyeParq?"incluye parqueadero":"incluye depósito"}. Asignación sujeta a disponibilidad.
                  </div>
                )}
                <div style={{ display:"flex", gap:10, marginTop:16 }}>
                  <button style={S.btn("outline")} onClick={()=>setShowPlan(!showPlan)}>{showPlan?"Ocultar":"Ver"} plan detallado</button>
                  <button style={S.btn("primary")} onClick={()=>{if(!cotNum)setCotNum(generateCotNumber(torre));setStep(6);}}>Generar cotización →</button>
                </div>
              </div>
            </div>

            {showPlan && (
              <div style={S.card} className="fu">
                <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.borderLight}`, background:C.goldBg, display:"flex", justifyContent:"space-between" }}>
                  <span style={S.label}>Plan de Pagos Detallado</span>
                  <span style={{ fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{planRows.length} líneas · Mapeo ConceptoPlanDePagos Sinco</span>
                </div>
                <div style={{ maxHeight:360, overflow:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <thead><tr>{["Concepto","ID Sinco","Mes","Pago"].map((h,i)=><th key={i} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {planRows.filter(r=>!r.concepto.includes("Saldo")).map((r,i)=>(
                        <tr key={i} className="rh">
                          <td style={{...S.td,fontWeight:r.concepto==="Separación"||r.concepto.includes("Total Pagado")?600:400,color:r.concepto==="Separación"?C.gold:r.sincoId>=5?C.green:r.concepto.includes("Total Pagado")?C.navy:C.text}}>{r.concepto}</td>
                          <td style={{...S.td,color:C.textTer}}>{r.sincoId}</td>
                          <td style={S.td}>{mesLabel(r.mes)}</td>
                          <td style={{...S.td,fontWeight:600}}>{fmt(r.pago)}</td>
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
            <div className="no-print" style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:16 }}>
              <h1 style={{ ...S.sectionTitle, fontSize:22 }}>Cotización Generada</h1>
              <button style={S.btn("outline")} onClick={()=>setStep(5)}>← Editar plan</button>
            </div>
            <div className="print-area" ref={cotRef} style={{ ...S.card, padding:28, border:`1px solid ${C.goldBorder}` }}>
              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", paddingBottom:18, borderBottom:`2px solid ${C.goldBorder}`, marginBottom:20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                  <img src="/assets/logo-jimenez-horizontal.png" alt="Constructora Jiménez" style={{ height:44, width:"auto", objectFit:"contain" }}
                    onError={e=>{(e.target as HTMLImageElement).style.display="none"}} />
                  <img src="/assets/sello-40-anos.png" alt="40 Años" style={{ height:36, width:"auto", objectFit:"contain" }}
                    onError={e=>{(e.target as HTMLImageElement).style.display="none"}} />
                  <div>
                    <div style={{ fontSize:16, fontWeight:700, letterSpacing:"2px", color:C.navy, fontFamily:"'Carla Sans','AinslieSans',sans-serif" }}>CONSTRUCTORA JIMÉNEZ S.A.</div>
                    <div style={{ fontSize:11, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>NIT: 802.021.085-1 · Santa Marta, Colombia</div>
                    <div style={{ fontSize:9, letterSpacing:"2px", color:C.gold, textTransform:"uppercase", fontFamily:"'Carla Sans','AinslieSans',sans-serif", fontWeight:600, marginTop:2 }}>Lo hacemos realidad</div>
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ ...S.label, color:C.gold }}>Cotización</div>
                  <div style={{ fontSize:22, fontWeight:300, color:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{cotNum}</div>
                  <div style={{ fontSize:11, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{new Date().toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"})}</div>
                  <div style={{ fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Vigencia: {CONFIG.vigencia_cotizacion} días</div>
                </div>
              </div>
              {/* 3 columns: buyer, property, advisor */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20, marginBottom:20 }}>
                <div>
                  <div style={{ ...S.label, marginBottom:8, color:C.gold }}>Comprador</div>
                  <div style={{ fontSize:15, fontWeight:600, color:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{nombre} {apellido}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{tipoDoc} {cedula}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{email}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{phoneCc.flag} {phoneCc.code} {phone}</div>
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom:8, color:C.gold }}>Inmueble</div>
                  <div style={{ fontSize:15, fontWeight:600, color:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{macro?.nombre} — {torre?.nombre}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Apto {selectedUnit?.numero} · Tipo {selectedUnit?.tipologia} · Piso {selectedUnit?.piso}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{selectedUnit?.area} m² · {selectedUnit?.habs} hab · {selectedUnit?.banos} baños</div>
                  {selectedParking.length>0&&<div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Parq: {selectedParking.map((p:any)=>p.numero).join(", ")}</div>}
                  {selectedStorage.length>0&&<div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Dep: {selectedStorage.map((d:any)=>d.numero).join(", ")}</div>}
                  {selectedParking.length===0&&incluyeParq&&<div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Parqueadero incluido *</div>}
                  {selectedStorage.length===0&&incluyeDep&&<div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Depósito incluido *</div>}
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom:8, color:C.gold }}>Asesor</div>
                  <div style={{ fontSize:15, fontWeight:600, color:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{asesor.nombre}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>ID Sinco: {asesor.id}</div>
                  <div style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>Tipo venta: {tipoVenta===0?"Contado":tipoVenta===1?"Crédito":"Leasing"}</div>
                </div>
              </div>
              {/* Render + Plano por tipología */}
              <div id="img-grid-pdf" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
                {[{label:"Render",file:`render-${selectedUnit?.tipologia}`},{label:"Plano",file:`plano-${selectedUnit?.tipologia}`}].map((img,idx)=>(
                  <div key={idx} data-img-pdf style={{ borderRadius:8, overflow:"hidden", border:`1px solid ${C.borderLight}` }}>
                    <div style={{ padding:"8px 12px", background:C.goldBg, borderBottom:`1px solid ${C.borderLight}` }}>
                      <span style={{ fontSize:9, letterSpacing:"1.5px", textTransform:"uppercase" as const, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", fontWeight:600 }}>{img.label} — Tipo {selectedUnit?.tipologia}</span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", background:"#F5F3EE" }}>
                      <img src={`/assets/${img.file}.png`} alt={`${img.label} ${selectedUnit?.tipologia}`}
                        style={{ width:"100%", height:"auto", maxHeight:220, objectFit:"contain", display:"block" }}
                        onError={e=>{
                          const card = (e.target as HTMLElement).closest("[data-img-pdf]") as HTMLElement;
                          if(card) card.style.display="none";
                          const grid = document.getElementById("img-grid-pdf");
                          if(grid && !grid.querySelector("[data-img-pdf]:not([style*='display: none'])")) grid.style.display="none";
                        }} />
                    </div>
                  </div>
                ))}
              </div>
              {/* Financial summary */}
              <div style={{ background:C.goldBg, borderRadius:8, padding:18, marginBottom:18, border:`1px solid ${C.goldBorder}` }}>
                <div className="fin-summary" style={{ display:"grid", gridTemplateColumns:`repeat(${[true, totalDescuentos>0, true, true, true, true, totalAbonos>0].filter(Boolean).length},1fr)`, gap:12 }}>
                  {[
                    {l:"Subtotal",v:fmt(subtotal),hide:totalDescuentos===0},
                    {l:"Descuentos",v:`-${fmt(totalDescuentos)}`,c:C.red,hide:totalDescuentos===0},
                    {l:totalDescuentos>0?"Valor Neto":"Valor Total",v:fmt(valorNeto),c:C.gold,bold:true},
                    {l:separacionMode==="%"?`Separación (${separacionPct}%)`:`Separación (${fmt(separacionFijo)})`,v:fmt(separacion)},
                    {l:`CI (${ciPct}%)`,v:fmt(cuotaInicialTotal),bold:true},
                    {l:`${numCuotas} cuotas de`,v:fmt(valorCuota)},
                    {l:`Financiación (${100-ciPct}%)`,v:fmt(saldoFinal)},
                    {l:"Cuotas Extra",v:fmt(totalAbonos),c:C.green,hide:totalAbonos===0},
                  ].filter((m:any)=>!m.hide).map((m:any,i:number)=>(
                    <div key={i} style={{ textAlign:"center" }}>
                      <div style={{ ...S.label, fontSize:9, marginBottom:2 }}>{m.l}</div>
                      <div style={{ fontSize:15, fontWeight:m.bold?700:600, color:m.c||C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── PLAN DE PAGOS DETALLADO (inside print area) ── */}
              <div style={{ marginBottom:18 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ ...S.label, color:C.gold, margin:0 }}>Plan de Pagos</div>
                  <span style={{ fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>{planRows.length} conceptos</span>
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      {["#","Concepto","Mes","Valor"].map((h,i)=>(
                        <th key={i} style={{ padding:"8px 10px", textAlign:i>=3?"right":"left", fontSize:9, letterSpacing:"1.5px", textTransform:"uppercase" as const, color:C.textSec, borderBottom:`2px solid ${C.goldBorder}`, fontWeight:700, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", background:C.goldBg }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {planRows.map((r:any,i:number)=>{
                      const isSep = r.concepto==="Separación";
                      const isSaldo = r.concepto.includes("Saldo");
                      const isTotal = r.tipo==="total";
                      const isAbono = r.tipo==="abono";
                      return (
                        <tr key={i} style={{ background: isSep||isSaldo||isTotal ? C.goldBg : isAbono ? C.greenBg : i%2===0 ? C.white : C.bg }}>
                          <td style={{ padding:"6px 10px", fontSize:11, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", borderBottom:`1px solid ${C.borderLight}` }}>{i+1}</td>
                          <td style={{ padding:"6px 10px", fontSize:12, fontWeight:isSep||isSaldo||isTotal?700:400, color:isSep?C.gold:isAbono?C.green:isSaldo||isTotal?C.navy:C.text, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", borderBottom:`1px solid ${C.borderLight}` }}>{r.concepto}</td>
                          <td style={{ padding:"6px 10px", fontSize:11, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", borderBottom:`1px solid ${C.borderLight}` }}>{mesLabel(r.mes)}</td>
                          <td style={{ padding:"6px 10px", fontSize:12, fontWeight:isSep||isSaldo||isTotal?700:500, color:isSep?C.gold:isAbono?C.green:C.navy, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", textAlign:"right", borderBottom:`1px solid ${C.borderLight}` }}>{fmt(r.pago)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Observaciones — only if present */}
              {observaciones.trim() && (
                <div style={{ background:C.goldBg, borderRadius:8, padding:"14px 18px", marginBottom:18, border:`1px solid ${C.borderLight}` }}>
                  <div style={{ ...S.label, fontSize:9, color:C.gold, marginBottom:6 }}>Observaciones</div>
                  <div style={{ fontSize:11, color:C.text, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", lineHeight:1.5, whiteSpace:"pre-wrap" }}>{observaciones.trim()}</div>
                </div>
              )}
              {/* Legal note */}
              <div style={{ fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", lineHeight:1.6, borderTop:`1px solid ${C.border}`, paddingTop:14 }}>
                <p style={{ margin:"0 0 6px" }}>* El cliente cancela el 100% de los Gastos de Registro e Impuestos de Registro y asume el 50% de los Derechos Notariales. Los precios y condiciones de venta pueden ser modificados sin previo aviso. Esta cotización no constituye reserva ni compromiso de venta.</p>
                <p style={{ margin:0, fontWeight:600, color:C.textSec }}>Vigencia de esta cotización: {CONFIG.vigencia_cotizacion} días calendario a partir de la fecha de emisión.</p>
              </div>
              {/* Footer branding — visible in print */}
              <div style={{ marginTop:18, paddingTop:12, borderTop:`1px solid ${C.borderLight}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontSize:9, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", letterSpacing:"1px" }}>
                  Generado por FocuxAI Engine™ · {new Date().toLocaleString("es-CO")}
                </div>
                <div style={{ fontSize:9, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>
                  {cotNum}
                </div>
              </div>
              {/* Actions — hidden in print */}
              <div className="no-print" style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:18 }}>
                <button style={S.btn("outline")} onClick={handlePrint}>Imprimir / PDF</button>
                <button style={S.btn("primary", submitting)} onClick={handleSubmitDeal} disabled={submitting}>
                  {submitting ? "Procesando..." : "Enviar y crear Deal →"}
                </button>
                {submitError && <div style={{ color:C.red, fontSize:11, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginTop:6 }}>{submitError}</div>}
              </div>
            </div>

            {/* Pipeline — hidden in print */}
            <div className="no-print" style={{ ...S.card, marginTop:16, padding:"16px 20px" }}>
              <div style={{ ...S.label, marginBottom:12, color:C.gold }}>Pipeline — Deal se creará en:</div>
              <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                {[{n:"Cotización enviada",p:"20%",a:true,amt:"$0"},{n:"Unidad bloqueada",p:"40%",amt:"$0"},{n:"Unidad separada",p:"70%",amt:"→ amount"},{n:"Negocio legalizado",p:"100%"},{n:"En cartera",p:"100%"}].map((s:any,i:number)=>(
                  <Fragment key={i}>
                    {i>0&&<span style={{color:C.textTer}}>→</span>}
                    <div style={{ padding:"6px 12px", borderRadius:6, background:s.a?C.goldBg:C.borderLight, border:`1px solid ${s.a?C.goldBorder:C.border}`, fontSize:11, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:s.a?C.gold:C.textSec }}>
                      {s.n} <span style={{opacity:.5}}>({s.p})</span>
                      {s.amt && <span style={{ marginLeft:4, fontSize:9, padding:"1px 5px", borderRadius:3, background:s.amt==="$0"?C.yellowBg:`${C.green}15`, color:s.amt==="$0"?C.yellow:C.green, border:`1px solid ${s.amt==="$0"?C.yellowBorder:C.greenBorder}` }}>{s.amt}</span>}
                    </div>
                  </Fragment>
                ))}
              </div>
              <div style={{ fontSize:10, color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginTop:8 }}>
                Amount del Deal = $0 hasta Unidad Separada. Workflow WF-D2 copia valor_total_neto_fx → amount al separar. No infla forecast con cotizaciones.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ SUCCESS OVERLAY ══ */}
      {showSuccess && (
        <div style={{ position:"fixed", inset:0, background:"rgba(27,42,74,.85)", backdropFilter:"blur(12px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }} onClick={()=>setShowSuccess(false)}>
          <div style={{ textAlign:"center", maxWidth:500, padding:"48px 40px", background:C.white, borderRadius:12, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }} className="fu" onClick={e=>e.stopPropagation()}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:C.greenBg, border:`2px solid ${C.green}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px", fontSize:24, color:C.green }}>✓</div>
            <h2 style={{ fontSize:24, fontWeight:400, color:C.navy, margin:"0 0 4px", fontFamily:"'Carla Sans','AinslieSans',sans-serif" }}>Cotización Enviada</h2>
            <div style={{ fontSize:18, fontWeight:300, color:C.gold, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginBottom:16, letterSpacing:"1px" }}>{cotNum}</div>

            {/* Resumen inmueble */}
            <div style={{ background:C.goldBg, borderRadius:8, padding:"14px 18px", marginBottom:16, border:`1px solid ${C.goldBorder}`, textAlign:"left" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div><span style={{...S.label,fontSize:9}}>PROYECTO</span><div style={{ fontSize:13, fontWeight:600, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.navy }}>{torre?.nombre}</div></div>
                <div><span style={{...S.label,fontSize:9}}>UNIDAD</span><div style={{ fontSize:13, fontWeight:600, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.navy }}>APT {selectedUnit?.numero} · {selectedUnit?.tipologia}</div></div>
                <div><span style={{...S.label,fontSize:9}}>COMPRADOR</span><div style={{ fontSize:13, fontWeight:600, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.navy }}>{nombre} {apellido}</div></div>
                <div><span style={{...S.label,fontSize:9}}>VALOR NETO</span><div style={{ fontSize:13, fontWeight:600, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", color:C.gold }}>{fmt(valorNeto)}</div></div>
              </div>
            </div>

            <p style={{ fontSize:12, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", marginBottom:16, lineHeight:1.6 }}>
              {dealResult ? (
                <>Deal creado en HubSpot · ID: {dealResult.hubspotDealId}<br/>Etapa &quot;Cotización Enviada (20%)&quot; · Amount $0 · Precio congelado</>
              ) : (
                <>Cotización guardada · Deal pendiente de creación</>
              )}
            </p>

            <div style={{ display:"flex", gap:6, justifyContent:"center", flexWrap:"wrap", marginBottom:16 }}>
              {[{l:"Deal creado",c:C.green,bg:C.greenBg,b:C.greenBorder},{l:"PDF generado",c:C.blue,bg:C.blueBg,b:`${C.blue}33`},{l:`Owner: ${asesor.nombre.split(" ")[0]}`,c:C.gold,bg:C.goldBg,b:C.goldBorder},{l:"Email + WhatsApp",c:"#25D366",bg:"#F0FFF4",b:"#BBF7D0"}].map((t,i)=>(
                <span key={i} style={S.tag(t.bg,t.c,t.b)}>{t.l}</span>
              ))}
            </div>

            {/* Acciones — PDF + Link + Deal */}
            <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:20, flexWrap:"wrap" }}>
              {pdfUrl && (
                <a href={pdfUrl} download={`${cotNum}.pdf`} style={{...S.btn("outline"), fontSize:10, padding:"8px 16px", textDecoration:"none", display:"inline-flex", alignItems:"center"}}>
                  Descargar PDF
                </a>
              )}
              <button style={{...S.btn("outline"), fontSize:10, padding:"8px 16px"}} onClick={()=>{
                const link = `${window.location.origin}/cotizacion/${cotNum}`;
                navigator.clipboard.writeText(link).then(()=>{ alert(`Link copiado: ${link}`); });
              }}>Copiar link</button>
              {dealResult?.dealUrl && (
                <a href={dealResult.dealUrl} target="_blank" rel="noopener noreferrer" style={{...S.btn("outline"), fontSize:10, padding:"8px 16px", textDecoration:"none", display:"inline-flex", alignItems:"center"}}>
                  Ver Deal en HubSpot
                </a>
              )}
              <button style={{...S.btn("outline"), fontSize:10, padding:"8px 16px"}} onClick={handlePrint}>Imprimir</button>
            </div>

            {/* Mensaje de cierre — Constructora Jiménez */}
            <div style={{ background:C.bg, borderRadius:8, padding:"14px 18px", marginBottom:16, border:`1px solid ${C.border}`, textAlign:"center" }}>
              <p style={{ fontSize:13, color:C.navy, fontFamily:"'Carla Sans','AinslieSans',sans-serif", fontWeight:600, margin:"0 0 4px", letterSpacing:"0.5px" }}>Gracias por confiar en Constructora Jiménez</p>
              <p style={{ fontSize:11, color:C.textSec, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif", margin:0, lineHeight:1.5 }}>40 años construyendo legado · Lo hacemos realidad</p>
            </div>

            <button style={{ ...S.btn("primary") }} onClick={()=>{setShowSuccess(false);setStep(0);setMacro(null);setTorre(null);setSelectedUnit(null);setSelectedParking([]);setSelectedStorage([]);setCedula("");setNombre("");setApellido("");setEmail("");setPhone("");setDtoComercial(0);setDtoFinanciero(0);setAbonos([]);setShowPlan(false);setShowDescuentos(false);setContactExists(false);setContactData(null);setContactSearched(false);setContactError("");setCotNum("");setSeparacionMode("$");setSeparacionFijo(3000000);}}>
              Nueva cotización
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign:"center", padding:"24px", borderTop:`1px solid ${C.border}` }}>
        <div style={{ fontSize:9, letterSpacing:"2px", textTransform:"uppercase", color:C.textTer, fontFamily:"'AinslieSans','Helvetica Neue',sans-serif" }}>
          Powered by FocuxAI Engine™ · Focux Digital Group S.A.S.
        </div>
      </div>
    </div>
  );
}
