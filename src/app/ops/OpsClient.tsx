// @ts-nocheck
"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   FOCUXAI OPS v8 — Multi-Client Implementation Engine
   v8: Rules engine, varsCalif with opciones, unified motivos,
       multiDealLogic, atribucionUTM, propiedadesEspejo,
       etapasContactoSync, workflows, reglas_nota,
       casoNoAutoriza, backward-compat with v5/v7/v8 JSONs.
   ═══════════════════════════════════════════════════════════ */

/* ═══ MULTI-CLIENT STORAGE ═══ */
const IDX_KEY = "focuxai-clients-idx";
const CL_PREFIX = "focuxai-cl:";
const VER_PREFIX = "focuxai-ver:";
const MAX_VERSIONS = 15;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function sGet(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } }
function sSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.error("storage set error", e); } }
function sDel(k) { try { localStorage.removeItem(k); } catch (e) { console.error("storage del error", e); } }

async function loadIndex() { return (await sGet(IDX_KEY)) || []; }
async function saveIndex(idx) { await sSet(IDX_KEY, idx); }
async function loadClient(id) { return await sGet(CL_PREFIX + id); }
async function saveClient(id, data) { await sSet(CL_PREFIX + id, data); }
async function deleteClient(id) { await sDel(CL_PREFIX + id); await sDel(VER_PREFIX + id); }
async function loadVersions(id) { return (await sGet(VER_PREFIX + id)) || []; }
async function saveVersions(id, vers) { await sSet(VER_PREFIX + id, vers); }

async function pushVersion(id, data, label) {
  const vers = await loadVersions(id);
  vers.unshift({ ts: Date.now(), label: label || "Auto-save", data: JSON.parse(JSON.stringify(data)) });
  if (vers.length > MAX_VERSIONS) vers.length = MAX_VERSIONS;
  await saveVersions(id, vers);
}

/* ═══ METHODOLOGY DEFAULTS v8 (Focux standard) ═══ */
const DEF_CH = ["Pauta Facebook","Pauta Instagram","Pauta Google","Sitio Web","Mail Marketing","Redes Sociales Orgánicas","Búsqueda Orgánica","Sala de Ventas Física","Referido","Importación Base de Datos","Feria Inmobiliaria","Canal WhatsApp","Llamada Telefónica","Aliado / Portal Inmobiliario","Recompra"];
const DEF_CT = ["Valla / Carro Valla","Volante","Emisora","Prensa / Revista","Activación Física","Vitrina Salas","Ascensores","SMS"];
const DEF_EP = ["Lead","Contactado","Contactado en seguimiento","Agendado","Visita","Opción","Negocio/Cierre","Perdida"];
const DEF_ES = [];
const DEF_PL = [{n:"Lead",p:5},{n:"Contactado",p:10},{n:"Contactado en seguimiento",p:20},{n:"Agendado",p:30},{n:"Visita",p:50},{n:"Opción",p:70},{n:"Negocio/Cierre",p:100},{n:"Perdida",p:0}];
const DEF_MOTIVOS_PERDIDA = ["Ingresos insuficientes","Crédito denegado","Centrales de riesgo","No salió préstamo","No salió subsidio","No aplican subsidios","Precio del proyecto","Ubicación","Área","Acabados","Tiempos de entrega","Parqueaderos","Compró en competencia","Compró en otro proyecto","Eligió otra unidad","No volvió a contestar","Nunca contestó","Datos errados","No interesado","Aplaza compra","Calamidad doméstica","Cambio de condiciones","No firma contratos","Licencia turismo"];
const DEF_NIVELES = ["AAA","A","B","C","D"];
const DEF_VARS = [
  {id:"interes_proyecto",label:"¿Le interesa el proyecto? (precio-zona-proyecto)",opciones:["Interesa SI","Interesa NO"],on:true},
  {id:"ingresos",label:"Rango de Ingresos",opciones:["Ingreso SUPERIOR","Ingreso INFERIOR","Ingreso NO RESPONDE"],on:true},
  {id:"ahorros",label:"Tiene Ahorros o Cesantías",opciones:["Con ahorros","Sin ahorros"],on:false},
  {id:"proposito",label:"Propósito de Compra (Vivienda/Inversión)",opciones:["Vivienda","Inversión"],on:true},
  {id:"credito",label:"Crédito Preaprobado",opciones:["Sí","No"],on:false},
  {id:"subsidios",label:"Aplica a Subsidios",opciones:["Sí","No"],on:false},
];
const DEF_ASIGNACIONES = ["Round robin → Asesor + Agente IA","Round robin → Solo asesor","Agente IA Outbound","Agente IA → Nurturing","Solo Nurturing email","No se asigna"];
const DEF_SLAS = ["<10 minutos","<30 minutos","<1 hora","<4 horas","Automático","Unsubscribe"];
const DEF_REGLAS = [
  {si:"Interesa SI",y:"Ingreso SUPERIOR",entonces:"AAA",asignacion:"Round robin → Asesor + Agente IA",sla:"<10 minutos"},
  {si:"Interesa SI",y:"Ingreso INFERIOR",entonces:"A",asignacion:"Round robin → Asesor + Agente IA",sla:"<1 hora"},
  {si:"Interesa SI",y:"Ingreso NO RESPONDE",entonces:"A",asignacion:"Round robin → Asesor + Agente IA",sla:"<1 hora"},
  {si:"Interesa NO",y:"Ingreso SUPERIOR",entonces:"B",asignacion:"Agente IA Outbound",sla:"Automático"},
  {si:"Interesa NO",y:"Ingreso INFERIOR",entonces:"B",asignacion:"Agente IA Outbound",sla:"Automático"},
  {si:"Interesa NO",y:"Ingreso NO RESPONDE",entonces:"C",asignacion:"Agente IA → Nurturing",sla:"Automático"},
];
const DEF_CASO_NO_AUTORIZA = {activo:true,entonces:"D",asignacion:"No se asigna",sla:"Unsubscribe"};
const DEF_MULTI_DEAL = {
  regla:"1 deal activo máximo por proyecto por contacto",
  comportamiento:"Si contacto ya tiene deal activo (no en Perdida/SICO) en el mismo proyecto, NO crear nuevo deal. Si es proyecto diferente, crear deal nuevo con owner del round robin de ese proyecto.",
  syncEtapas:{descripcion:"Etapas del contacto = etapas del deal. Contacto refleja el deal más avanzado.",cualquierCambioEtapa:"deal cambia etapa → contacto refleja esa etapa",deal_Perdida_sinOtrosDeals:"contacto → Perdida + copia motivo_perdida_fx",deal_Perdida_conOtrosDeals:"contacto → etapa del deal más avanzado restante"},
  ownerDeal:"Asignado por round robin dentro de [Focux]Creación_Deal en la rama del proyecto correspondiente. Owner del deal NUNCA se hereda del contacto.",
  ownerContacto:"Se maneja por [Focux]Reasignación_Multiproyecto cuando proyecto_activo_fx cambia."
};
const DEF_UTM = {
  descripcion:"Mapeo de utm_source a canal_origen_fx. El formulario lee utm_source de la URL y mapea automáticamente. Sin UTM = selección manual por asesor.",
  mapeo:[{utm_source:"facebook",canal:"Pauta Facebook"},{utm_source:"instagram",canal:"Pauta Instagram"},{utm_source:"google",utm_medium:"cpc",canal:"Pauta Google"},{utm_source:"google",utm_medium:"organic",canal:"Búsqueda Orgánica"},{utm_source:"email",canal:"Mail Marketing"},{utm_source:"whatsapp",canal:"Canal WhatsApp"},{utm_source:"referido",canal:"Referido"}],
  metaDinamico:"En Meta Ads Manager usar utm_source={{placement}} o [SOURCE_SITE_NAME] para distinguir Facebook vs Instagram automáticamente",
  dobleValidacion:"Usar propiedad nativa Original Source + Drill-Downs como referencia cruzada. No copiar, solo auditar."
};
const DEF_ESPEJO = {
  regla:"Toda propiedad _fx existe en AMBOS objetos (contacto y deal). Espejo completo bidireccional.",
  direccionCopia:{formSubmission_a_contacto:"Formulario escribe en contacto",contacto_a_deal:"Workflow [Focux]Creación_Deal copia TODAS las props _fx del contacto al deal. canal_origen_fx queda congelado en el deal.",deal_a_contacto:"Workflow [Focux]Sync_Etapa_Deal copia etapa + motivo_perdida_fx del deal al contacto cuando el deal cambia de etapa."},
  excepcionCanal:"canal_origen_fx del deal se congela al momento de creación. Si el contacto vuelve por otro canal, el deal anterior mantiene su canal original.",
  motivosPerdida:"Los motivos unificados aplican tanto para contacto como para deal. Misma propiedad, mismas opciones, espejo completo."
};
const DEF_ETAPAS_SYNC = {descripcion:"Las etapas del contacto son las MISMAS del pipeline del deal. El contacto siempre refleja la etapa de su deal más avanzado.",fuente:"pipeline",propiedad:"etapa_lead_fx"};
const DEF_WORKFLOWS = {
  namingConvention:"[Focux]Acción_Contexto",totalWorkflows:0,
  porProyecto:[{id:"WF-CALIF",nombre:"[Focux]Calificación_{NombreProyecto}",cantidad:0,tipo:"CONTACT_FLOW",trigger:"Form submission + proyecto_activo_fx = proyecto específico",logica:"Aplica reglas de calificación con rangoMinimo del proyecto. Escribe categoria_calificacion_fx.",branch:{}}],
  globales:[
    {id:"WF-DEAL",nombre:"[Focux]Creación_Deal",cantidad:1,tipo:"CONTACT_FLOW",trigger:"Form submission (mismo trigger que calificación)",logica:"Delay 2 minutos → Branch por proyecto_activo_fx → Verifica deal activo → Si no: crea deal + copia props _fx + round robin + tarea"},
    {id:"WF-SYNC",nombre:"[Focux]Sync_Etapa_Deal",cantidad:1,tipo:"DEAL_FLOW",trigger:"Deal cambia de etapa en el pipeline",logica:"Copia etapa del deal a etapa_lead_fx del contacto. Si deal Perdida: copia motivo + lógica multi-deal."},
    {id:"WF-REASIG",nombre:"[Focux]Reasignación_Multiproyecto",cantidad:1,tipo:"CONTACT_FLOW",trigger:"proyecto_activo_fx cambia de valor",logica:"Guarda owner en asesor_anterior_fx → Append lista_proyectos_fx → Reasigna owner contacto."},
    {id:"WF-NOTIF",nombre:"[Focux]Notificación_Asignación",cantidad:1,tipo:"CONTACT_FLOW",trigger:"Owner del deal cambia (post round robin)",logica:"Notifica al asesor por email/in-app con datos del lead."},
    {id:"WF-INACT",nombre:"[Focux]Alerta_Inactividad",cantidad:1,tipo:"CONTACT_FLOW",trigger:"3 días sin actividad registrada",logica:"Envía alerta al asesor owner del deal."},
    {id:"WF-NURT",nombre:"[Focux]Nurturing_Categoría",cantidad:1,tipo:"CONTACT_FLOW",trigger:"categoria_calificacion_fx = B o C",logica:"Envía secuencia de emails automatizados con material del proyecto."},
    {id:"WF-AGENT",nombre:"[Focux]Agente_Outbound",cantidad:1,tipo:"CONTACT_FLOW",trigger:"categoria_calificacion_fx = AAA, A, o B",logica:"WhatsApp template → Run Agent con contexto completo."},
  ]
};
const DEF_REGLAS_NOTA = {comparacion:"Ingreso SUPERIOR significa que el rango del lead es IGUAL o MAYOR al rangoMinimo del proyecto (>=). Ingreso INFERIOR significa MENOR (<).",ejemplo:"Ryos tiene rangoMinimo 'Entre $2M y $4M'. Si lead responde 'Entre $2M y $4M' → SUPERIOR (igual al mínimo). Si responde 'Menos de $2M' → INFERIOR."};

function makeBlankState() {
  return {
    step:0, nombreConst:"", dominio:"", nombrePipeline:"", triggerDeal:"Form Submission (Deal se crea al llenar formulario)",
    diasSinAct:3, pais:"Colombia",
    hubSales:"No", hubMarketing:"No", hubService:"No", hubContent:"No",
    tieneCotizador:false, tieneAgente:false,
    crmOrigen:"Ninguno", volRegistros:"", tieneAdj:false,
    macros:[],
    chStd:DEF_CH.map(n=>({n,a:true})), chTr:DEF_CT.map(n=>({n,a:false})), chCu:[],
    rangos:["Menos de $2M","Entre $2M y $4M","Entre $4M y $8M","Entre $8M y $15M","Entre $15M y $25M","Más de $25M"],
    niveles:[...DEF_NIVELES],
    varsCalif:DEF_VARS.map(v=>({...v,opciones:[...v.opciones]})),
    reglas:DEF_REGLAS.map(r=>({...r})),
    casoNoAutoriza:{...DEF_CASO_NO_AUTORIZA},
    usaCalif:true, umbral:75,
    etP:[...DEF_EP], etS:[...DEF_ES],
    pipeline:[...DEF_PL.map(p=>({...p}))],
    moD:[], moP:[],
    motivosPerdida:[...DEF_MOTIVOS_PERDIDA],
    nomAgente:"", tonoAgente:"Profesional y cálido", wabaNum:"", tiposAgente:[],
    ex:{}, vn:{},
    multiDealLogic:JSON.parse(JSON.stringify(DEF_MULTI_DEAL)),
    atribucionUTM:JSON.parse(JSON.stringify(DEF_UTM)),
    propiedadesEspejo:JSON.parse(JSON.stringify(DEF_ESPEJO)),
    etapasContactoSync:{...DEF_ETAPAS_SYNC},
    workflows:JSON.parse(JSON.stringify(DEF_WORKFLOWS)),
    reglas_nota:{...DEF_REGLAS_NOTA},
  };
}

/* ═══ BACKWARD COMPAT: normalize imported JSON ═══ */
function normalizeImport(raw) {
  const d = { ...makeBlankState(), ...raw, step: 0 };
  // v7 varsCalif without opciones → infer from known ids
  if (d.varsCalif && d.varsCalif.length > 0 && !d.varsCalif[0].opciones) {
    const opMap = {};
    DEF_VARS.forEach(v => { opMap[v.id] = [...v.opciones]; });
    d.varsCalif = d.varsCalif.map(v => ({
      ...v,
      opciones: v.opciones || opMap[v.id] || ["Sí", "No"],
    }));
  }
  // v7 reglas without asignacion/sla → add defaults
  if (d.reglas && d.reglas.length > 0 && !d.reglas[0].asignacion) {
    d.reglas = d.reglas.map(r => ({
      ...r,
      asignacion: r.asignacion || "",
      sla: r.sla || "",
    }));
  }
  // v7 moD/moP populated but no motivosPerdida → merge from raw
  // Check raw (not d) because d already has defaults from makeBlankState()
  if (!raw.motivosPerdida && (raw.moD?.length > 0 || raw.moP?.length > 0)) {
    d.motivosPerdida = [...new Set([...(raw.moD || []), ...(raw.moP || [])])];
  }
  // v7 chStd with "Pauta Facebook-IG" → split
  const fbigIdx = d.chStd.findIndex(c => c.n === "Pauta Facebook-IG");
  if (fbigIdx >= 0) {
    d.chStd.splice(fbigIdx, 1, {n:"Pauta Facebook",a:true}, {n:"Pauta Instagram",a:true});
  }
  // v7 niveles with "AA" → remove
  d.niveles = d.niveles.filter(n => n !== "AA");
  // Ensure casoNoAutoriza exists
  if (!d.casoNoAutoriza) d.casoNoAutoriza = {...DEF_CASO_NO_AUTORIZA};
  return d;
}

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

const FOCUX_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAOa0lEQVR42u2de3Bc5XnGn/f9vrNnV7u6W7Zk+SbjGHBMCRkm4NjGgAOYBMO0Uy2XklIHmkAbboE0TRqQ3AwdIG1ISKAEYq6hSVcwUwLTuCSOSRt7Bgy2MbFjydgytixLsnXfy9lzzve9/WNXsuk0M7QI2XL2mdk/dnZn9pzfvpfnfc85QEkllVRSSSWVVFJJJZVUUkkllVRSSSWVVFJJJZVUUkkllVTSB5KIEESoROL/Aa5lo2gAcIqvkj4guBVFcMX35Q8fGGl5smfwdRFpGI/Kkt6vFhFesXHjceDS9T/oTt+zasvI3jM7RB4c6cuISFUJ4P8CDilRx8CN1N3/brrl0rdGemduF6GNnlx9dCh8wu/pFpH4ZAHUUyFVqRW0lsgSACvex77ZmV+zfCvWdFC8/kgmD8mnw2WNAS2ohcplWMHBpEWePonBcRtARGQUIEMycNa39kbWXLAtvGkXVZQPjQZgZEPHiqpJWH3enEA844BJJvU49UkJrq0Arvi+8d6OgQcu3Rq5ehfieng0C8dmQ5esEiZtreDieT7KlCBjBYD6wwSYSolCMzAGrj2dP/tIILc8ti137VP9FRVdkRCuZMIyiLLMmqCQDS0+1RjitFqLnE9gDQB/YBGYElE7AUmOgRtMf+I9L3LXtgG+znMVv7otjaBaTKzOsoSkLQEMi8AqzIiFWDrHR94ADIE9AcevTyS4ZOsxcB0D2RUdOf7zN0fUDUFEq7wBtr8+bIaPKnamkwpAcAAIEUQYsAYXNYWIa8ALBXyCDIue5PpGbQAnicw4uKHcJe0ZdduWtL7CuIThjCAaWnN0wFcde6EchyEiIAgEBAaQDQXnNoRYUGvhBQATASKnLsAxcMX6ZqJgvD6cvbwrx1/dmnMu8hhIZ6ywZ20EigOxauuOAEY0HLIQMACACQgsMD3mY/mcAIE5FnkEAkSsQOwpA1BEqBVQRBQCMCISfQNm9YZM123bRtxlECCTtpYYoglKLCvHtXhnZxZHBxiuC0h4LDdJCGItLpxnUBYR5MPCCViINYCBE3WUnyufzE6iJwFcKEek/L+qs9f/qx2+pZ3tWS/yQazJ1EtMXMsMBRCsADoC9Az4aO+wiDgOREzREQsYjFxo8cl6HwvrAngBQ4mxIVg46qpaFeXq0Os6nWOPAMhChIg+elOoP8JUDUWkaoPJ3fgM+v96QEWb8mA8n/6NGfI8cpXDYkQJCAQLBQVjA2x9O0BoNRxtitspAUEhsAbVZQbL5oUIA7LWWqhEOdeCUefnO5ts+P2Ld1Y9RefQ0JRM4RYRJiJbTNWZvzK5Lzxu+r6YUxWz+wE4yJjd2V7qMH1qrp5WKPpCILYQS3Bci7d35nHkKCEaKUSkABASEACyBhfNCWzMAQI3ztPBmBHK5gWCf1nWVf1jOo2GAeA3b/zu9KVVaj8tXJifUgDXElkRmfvv4dDN6zD4hbQqmz4IRoj+0IXirAnVfwS7C4OCz2OVH2IJWhN6+wPsahdEHA0LMz5RaALyfmAXTvNp0awyjkqI+rzZNB/8wIpo/BVCIU3XrTt4XvfBqrWvPd5fv/QJOR8QAqZACosIA8CGYPBvn0b6G0e0jo8iC6A/ZEAxSGsQfuG1o58yBWpjllcAIoKFxfYdHkKj4TgCK1yoimRt2lNcU+Nw8gwHZ4Vmc31OP3hhRfylEAAYWPdE9+Wd+2K37NipP8sHEipyeHgL6VleAeAUiMDW4uuABKsPIBI3GPYZcADSFoIYHLzjd+OtsAuaIwjhHwcfiEQJv/2dh54+BTcKwIqQiPWJVSxSruoSOVw5y9/0Z9q9p741+mtaS1bkwIIfPuqc+V6Xvm3njqrPBEYjSGdMYrdvnOlERJPXhj80wF1oI6KkeTzsO6IhIoACCqegoDBiPazP7wF47KQKhlgAuA6hfyCPnbsNHFeJNcYa6yg3EVUz1Ki3eObQS6s+wc8sn1n587sBiLzpPDrj0DVr7y2/c3Sk7FwvUPD9tFWOFtVpIEFUEfHUNNJkRZMq+IaxJHXB2JB7F4OSBpMDwdinBZQGIbbuyEngO5a0VrG4q+rcbK6xZvDZZad7D1+xcOauewGI7K28/9tq9d99o+orea/ynFwOCMKMVQxxHKWox0D3BobV5A8kE+4DC/AsYnCx2+/Bm+FBMOti3NF47kYjkJ27PHuop0xVVkZUnTs6cvZ823b+4vzDS2pqdgDAiHhnfm+fve2rD/iXhwfjc32rEYZZwySkiVgIEA9w9uVBrGFJQJO8Uph4I20BxQqjxsP63O6iDSlGHQFsIUrBdg9YtfdgmVrY4PcsmT+6fvki8/dnVFd0AkBHevCcdYdif7nqbfUX6cNu7OxeBwnPN1blialovEnAzFCdPiRPgC46o6k7CzNQXCmVwcH6XDv6kAazA4iABGKttXCscnRMBb3p/iWN6pGvrco+AgSjRHNy7UeHz/vREfWVa35Lq9+NuDHqEnxyfyYEg0GkCn8EQWBBWkA9BrrHQrQGiZniy4Rik3BZYXf+MN4w+6E5AlgroRgLV6uaaEItz1WNrvRnPX/jJe634hTv/jqATX3ZFV/a6d2c3C1/ss+JRrIZIJpBeHaPpxwLDRCOv8pBDHCOofb5sIrBYlG021N5G2OhwEiHIV7NdwAEG0oocJWa6daqc72Krsu8+h//VWzhDxXR/jsB/KIvfUVbn3PLmj208lDEcb084OZhIho863CoK0YFgVOwwyRFZycWYAbv98E5ApyxxjEGkGVKAjQWcJXCy94+e1gGgFhCNeg4lmYr37sKTeuuj87+PhEN3Qngxczw6n/bH731zv2RS/ZZIPAEjmdMjBQHDFWZFszu9WG5gGOciBRqne410IcJ4hSLLggEsTCAMZO745ywH6viiH0DPXazOuDMSzTiU9mKjuW2/v4vJ077KRHlrheJPe31/unPVNftL1J+2SujFRhJw5YRxCViC1YCQFlgbnceyggME6iYlZYAUQKVJ6DTB0hBwCDAklHCrJ14OSNW7w/ZQJjG1jgnO8A2NIsCYTAcbditevjKcMbmq7H4u9eV1f+MiPJfFql8yu++4QbTftdrbm5BDAorR2FtNpQYazV2hiyEQANze0LUjBgY/f5xgoqLB+o00BkGHLHWiDg2ptxyAuLDbzctHfpJ8o7Ys6+9BhaBoUkoiR/6J1pEeC2RfSS9527HoUO3uQt+4hVm5JrHzaE1G2Tozs0619gFDyoIzO2qiTib4H/eUgVAjx+AJSDuCRbvycExhWwVCIgF9Z2EMg/QRwH9jm8Ma4pIjN2EReWc0T218zL33fSP+553oheFYX5ym8iE/0ciUvVkePhvXtUjX/xPZGsPIw3AGBhDV9qZvMKpwd4M8OyWWojo8blEGFi0N4+6IQNfH9cKiDC9K0RVvzK0PVDRbAUiFTno6uHNC87L/+jza6tfIlU1AAs0N4tKpWAnY5E6YQBFhAhAZx6nv+T03PiKdF+zXcmso0gDVowD4oANLQwSuE7NA3OIoxmNJ7fUQESDRRBowpzeEPO78rBMxbZQMN5C1jbsV1S3tYxs74CZdoa89rHzgsevb21IBV7hGJqRUm1otpOxvprwGphEG2u62vxDdsdDL3FkVR9GAIhRIAZDGQhihnEpN0D9zy2JAIYJ5VlBY48Pw4UlQ8GSw/oBw0nEORGMoLaie/0Fd3Dbsqsee5porQWEUs3g5kLEnRgXXTzWD9lECtGyF1nuw1CoLIUMUhYgC4K1BhfLdMzmKDyE7w/6oj9uOuTDCQVEAEFMPrDG6DjPnKZ42Rxv88rVmc/du77x8mVX1T+XpFZqgTBASLaRmcx0/chsTMHHUkggLQwzFkUGBqdJAufqWuQkAI9PxQQWIK+A2X0BakZCCRRsGFqORhPqtHpgXuXQps8ssg8vmbPhRaKkAYSJKMBJpgnzgZZlfJU1BjUWMlZxAzQEwfiCXUAChEyoyFppPOzZnGgVVTE1qzKPWdXDL1z76ehzH59W9fMCMKHmVEq1JcnIJF1pO+HbGGbAWIMVaMAsLkMWheiT4zbREDENh0VVOuWqumLI/NHs/K8+t9j5zuIZVevvK34vlRKVTJJpS8IUgvzkgjexC9XjBn0jBvNNAktULTzxwePjRKGzhmWE+TmtFuX7B5aeFfvlH5/rPNcUS7xylwBoTqlUqhnNOLHNYdIBHts1C1yrcJmqBzMQCEMZgbBAKwUC2+pdCJM89Nitq9RD1U3x/bcWB91Uqo2TyaRJTqE7myfsAgLZQouwxmC51GEuYvCNAQuBlCBCjPxmkUPJCI8ms+l7LvvuXdVN1ftbNoou3MtMkkwmDaaYJiwCVeGuPTSFcXyapyEHC1YWDjSyGxT6HtFI/5KgR8sQWZSj9u5rq0Ra+wGYk7G2TTrAgI04hnGpqkNcAzkLeC876HtUI/NrDQ4Y0QqBqTIgIdTHfUNEMtUfRdATUwcIviK6UNXYBUEZ+lKE4ccI+U0OlEQQKRdImcBYgAKNU0kf/mxad0pebOTu7o5GbJzNe7+X8XPbiRVFyE0QDIfHblGjwr0up5I+fBNZ2yoAwpWb3Afd74y2c3tVxCkrJyRsGCAUCnFKawK6MAnQV/bZ5Lzn73srs/KMa7tvLZ8zeCCq4pp8JgtrCmtlOSUBTkhBIpqRbm5OKaI5hwD8IJvd9/LDa/K3HtoWvdkcqYlng7RoTbbgBgUn4urZSe8D29qSRkSoZYXoWKyp62s/nfn1m54eWjLj/CNPx6eByMQVWbJEVk7VaJxQdW4brAIAOMAL/3TwonsuOLrxSzNGZI0WuePMniNDQzuqC3Nx6YnK36tUc0oBhScsnRjwTOuez7esGOq+/ePv+XLgQE0J4AcFmRIFCIlItUjPyhceevebz357e7wE7/+ybBiHRadSDzlREFu4RKOkkkoqaerrvwENMEQmtJJLkAAAAABJRU5ErkJggg==";
const FOCUX_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAERCAYAAADBmZoGAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAADQ0RVh0Q29tbWVudABSZXNpemVkIG9uIGh0dHBzOi8vZXpnaWYuY29tL3Jlc2l6ZSBieSBBSTMxumkAAAAASUVORK5CYII=";

/* ═══ UI PRIMITIVES ═══ */
const ss = {
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
          <p style={{ fontSize:11, color:tk.textTer, margin:0 }}>Copia un rango de celdas desde Excel o Google Sheets y pégalo aquí.</p>
          <div style={{ marginTop:8, padding:8, background:tk.card, borderRadius:6, fontFamily:"monospace", fontSize:11, color:tk.textSec, overflowX:"auto", whiteSpace:"pre" }}>{example}</div>
        </div>
        <textarea value={txt} onChange={e => setTxt(e.target.value)} placeholder="Pega tus datos aquí..."
          style={{ width:"100%", height:160, padding:12, borderRadius:10, border:`1.5px solid ${tk.border}`, fontSize:13, fontFamily:"monospace", resize:"vertical", boxSizing:"border-box", outline:"none" }}
          onFocus={e => e.target.style.borderColor = tk.accent} onBlur={e => e.target.style.borderColor = tk.border} />
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14 }}>
          <span style={{ fontSize:12, color:tk.textTer }}>{txt.trim() ? `${txt.trim().split("\n").filter(Boolean).length} filas detectadas` : "Sin datos"}</span>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={onClose} style={{ padding:"9px 20px", borderRadius:8, border:`1.5px solid ${tk.border}`, background:tk.card, fontSize:13, cursor:"pointer", fontFamily:font, fontWeight:600, color:tk.textSec }}>Cancelar</button>
            <button onClick={go} disabled={!txt.trim()} style={{ padding:"9px 24px", borderRadius:8, border:"none", background: txt.trim() ? `linear-gradient(135deg, ${tk.teal}, ${tk.blue})` : tk.border, color:"#fff", fontSize:13, cursor: txt.trim() ? "pointer" : "default", fontWeight:600, fontFamily:font, transition:"all 0.2s" }}>Importar datos</button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

function TemplateModal({ open, onClose, template }) {
  const [copied, setCopied] = useState("");
  if (!open || !template) return null;
  const copyPrompt = () => { navigator.clipboard.writeText(template.prompt).then(() => { setCopied("prompt"); setTimeout(() => setCopied(""), 2000); }).catch(() => {}); };
  const copyTable = () => { const rows = template.examples.map(r => r.join("\t")).join("\n"); navigator.clipboard.writeText(template.headers.join("\t") + "\n" + rows).then(() => { setCopied("table"); setTimeout(() => setCopied(""), 2000); }).catch(() => {}); };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:1000, backdropFilter:"blur(4px)" }}>
      <div style={{ background:tk.card, borderRadius:16, padding:24, width:"94%", maxWidth:720, maxHeight:"90vh", overflow:"auto", boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:20}}>⚡</span>
            <div>
              <h3 style={{margin:0,color:tk.navy,fontSize:16,fontWeight:700}}>{template.title}</h3>
              <p style={{margin:"2px 0 0",fontSize:11,color:tk.textSec}}>Prompt optimizado para Gemini con acceso web</p>
            </div>
          </div>
          <button onClick={onClose} style={{background:tk.bg,border:"none",width:32,height:32,borderRadius:8,fontSize:18,cursor:"pointer",color:tk.textSec,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>
              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:"50%",background:tk.accent,color:"#fff",fontSize:10,fontWeight:800,marginRight:6}}>1</span>
              Prompt para Gemini
            </p>
            <button onClick={copyPrompt} style={{padding:"5px 14px",borderRadius:6,border:`1.5px solid ${tk.border}`,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:font,transition:"all 0.2s",background:copied==="prompt"?tk.greenBg:tk.card,color:copied==="prompt"?tk.green:tk.textSec}}>
              {copied==="prompt" ? "✓ Copiado" : "Copiar prompt"}
            </button>
          </div>
          <div style={{padding:14,background:tk.bg,borderRadius:10,border:`1px solid ${tk.border}`,maxHeight:200,overflow:"auto"}}>
            <pre style={{fontFamily:"monospace",fontSize:11,color:tk.text,whiteSpace:"pre-wrap",margin:0,lineHeight:1.5}}>{template.prompt}</pre>
          </div>
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.navy,textTransform:"uppercase",letterSpacing:"0.05em"}}>
              <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:"50%",background:tk.accent,color:"#fff",fontSize:10,fontWeight:800,marginRight:6}}>2</span>
              Formato esperado (ejemplo)
            </p>
            <button onClick={copyTable} style={{padding:"5px 14px",borderRadius:6,border:`1.5px solid ${tk.border}`,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:font,transition:"all 0.2s",background:copied==="table"?tk.greenBg:tk.card,color:copied==="table"?tk.green:tk.textSec}}>
              {copied==="table" ? "✓ Copiado" : "Copiar ejemplo"}
            </button>
          </div>
          <div style={{overflowX:"auto", borderRadius:10, border:`1px solid ${tk.border}`}}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:11}}>
              <thead><tr style={{background:tk.navy}}>{template.headers.map((h,i) => <th key={i} style={{padding:"8px 10px", color:"#fff", fontWeight:600, textAlign:"left", whiteSpace:"nowrap", fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>{template.examples.map((row,ri) => <tr key={ri} style={{background:ri%2===0?tk.bg:tk.card, borderBottom:`1px solid ${tk.border}`}}>{row.map((cell,ci) => <td key={ci} style={{padding:"6px 10px", color:tk.text, whiteSpace:"nowrap", fontSize:11}}>{cell || <span style={{color:tk.textTer,fontStyle:"italic"}}>—</span>}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
        <div style={{padding:12, background:tk.accentLight, borderRadius:10, border:`1px solid ${tk.accent}30`}}>
          <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.navy,marginBottom:4}}>
            <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:"50%",background:tk.accent,color:"#fff",fontSize:10,fontWeight:800,marginRight:6}}>3</span>
            Pegar resultado
          </p>
          <p style={{margin:0,fontSize:12,color:tk.text,lineHeight:1.5}}>
            Cuando Gemini devuelva los datos, selecciona las filas → copia → vuelve a esta app → usa el botón <strong>"Importar desde Excel"</strong> para pegar.
          </p>
        </div>
        <div style={{display:"flex", justifyContent:"flex-end", marginTop:16}}>
          <button onClick={onClose} style={{padding:"9px 24px", borderRadius:8, border:"none", background:tk.navy, color:"#fff", fontSize:13, cursor:"pointer", fontWeight:600, fontFamily:font}}>Entendido</button>
        </div>
      </div>
    </div>
  );
}

function getTemplate(type, constructoraName, domain) {
  const nm = constructoraName || "[nombre constructora]";
  const dm = domain || "[dominio.com]";
  const templates = {
    macroproyectos: {
      title: "FocuxAI Scraping — Macroproyectos",
      headers: ["Nombre","Ciudad","Tipo (VIS/No VIS/Mixto)","Precio Desde","Área Desde","Cuota Desde","Tipos de Unidad","Amenities"],
      examples: [["Firenze","Medellín, El Poblado","No VIS","$350,000,000","45 m2","$3,500,000","1,2,3 hab","Piscina, gym, coworking"],["Caoba","Villavicencio","VIS","$150,000,000","51 m2","","2,3 hab","Zona BBQ, parque infantil"]],
      prompt: `Visita https://${dm} y extrae TODOS los proyectos en comercialización de ${nm}.\n\nDevuelve una tabla con EXACTAMENTE 8 columnas separadas por TAB.\n\nREGLAS: EXACTAMENTE 8 columnas. SIN encabezados. Una fila por proyecto.`,
    },
    torres: {
      title: "FocuxAI Scraping — Torres / Etapas",
      headers: ["Macroproyecto (exacto)","Torre/Etapa","Fecha Entrega","Meses Cuota Inicial","% Separación","% Cuota Inicial","Total Unidades"],
      examples: [["Firenze","Torre 1","2028-06-15","35","1","30","120"],["Firenze","Torre 2","2029-01-20","35","1","30","95"]],
      prompt: `Visita https://${dm} y para CADA proyecto de ${nm}, extrae las torres o etapas disponibles.\n\nREGLAS: EXACTAMENTE 7 columnas. SIN encabezados.`,
    },
    equipos: {
      title: "FocuxAI Scraping — Equipo Comercial",
      headers: ["Macroproyecto (exacto)","Nombre Asesor","Email Corporativo","Meeting Link"],
      examples: [["Firenze","María Gómez","maria@constructora.com",""],["Caoba","Ana Martínez","ana@constructora.com",""]],
      prompt: `Visita https://${dm} y busca información del equipo comercial de ${nm}.\n\nREGLAS: EXACTAMENTE 4 columnas. SIN encabezados.`,
    },
    buyers: {
      title: "FocuxAI Scraping — Buyer Personas",
      headers: ["Macroproyecto (exacto)","Nombre Buyer Persona","Descripción"],
      examples: [["Firenze","Familia Joven","Parejas 28-38, primer hogar"],["Firenze","Inversionista","Profesional 35-55, compra para renta"]],
      prompt: `Basándote en los proyectos de ${nm} (https://${dm}), genera 2-3 buyer personas por proyecto.\n\nREGLAS: EXACTAMENTE 3 columnas. SIN encabezados.`,
    },
    pipeline: {
      title: "FocuxAI Scraping — Pipeline de Ventas",
      headers: ["Nombre Etapa","% Probabilidad"],
      examples: [["Lead","5"],["Contactado","10"],["Visita","50"],["Negocio/Cierre","100"],["Perdida","0"]],
      prompt: `Pipeline estándar Focux para constructoras del sector inmobiliario colombiano.\n\nFormato: columnas separadas por TAB, sin encabezados.`,
    },
    etapas_lead: {
      title: "FocuxAI Scraping — Etapas del Lead",
      headers: ["Fase (Prospección/Sala)","Nombre Etapa"],
      examples: [["Prospección","Lead"],["Prospección","Contactado"],["Prospección","Agendado"],["Prospección","Visita"]],
      prompt: `Etapas del ciclo de vida del lead para ${nm}.\n\nFormato: columnas separadas por TAB, sin encabezados.`,
    },
    motivos: {
      title: "FocuxAI Scraping — Motivos de Pérdida",
      headers: ["Motivo"],
      examples: [["Ingresos insuficientes"],["Crédito denegado"],["Compró en competencia"],["No interesado"]],
      prompt: `Motivos de pérdida unificados (lead y negocio) estándar del sector inmobiliario.\n\nFormato: 1 motivo por fila, sin encabezados.`,
    },
  };
  return templates[type] || null;
}

/* ═══ EXPORT PAYLOAD BUILDER (single source of truth for all export points) ═══ */
const UTM_DEFAULTS = {
  "Pauta Facebook":{utm_source:"facebook"},
  "Pauta Instagram":{utm_source:"instagram"},
  "Pauta Google":{utm_source:"google",utm_medium:"cpc"},
  "Búsqueda Orgánica":{utm_source:"google",utm_medium:"organic"},
  "Mail Marketing":{utm_source:"email"},
  "Canal WhatsApp":{utm_source:"whatsapp"},
  "Referido":{utm_source:"referido"},
  "Sitio Web":{utm_source:"direct"},
  "Redes Sociales Orgánicas":{utm_source:"social"},
};

function buildExportPayload(d) {
  const out = JSON.parse(JSON.stringify(d));
  // Sync etapasContactoSync — preserve user's choice of fuente
  const fuente = d.etapasContactoSync?.fuente || "pipeline";
  out.etapasContactoSync = {
    descripcion: fuente === "pipeline"
      ? "Las etapas del contacto son las MISMAS del pipeline del deal. El contacto siempre refleja la etapa de su deal más avanzado."
      : "Las etapas del contacto son independientes del pipeline del deal. Prospección y sala de ventas tienen flujos separados.",
    fuente,
    propiedad: "etapa_lead_fx",
  };
  // Recalculate workflow counts
  const numProjects = (out.macros||[]).filter(m=>m.nombre).length;
  if (out.workflows) {
    if (out.workflows.porProyecto && out.workflows.porProyecto[0]) {
      out.workflows.porProyecto[0].cantidad = numProjects;
    }
    out.workflows.totalWorkflows = numProjects + (out.workflows.globales||[]).length;
  }
  // Only sync etP with pipeline if fuente === "pipeline"
  if (fuente === "pipeline" && out.pipeline?.length > 0) {
    out.etP = out.pipeline.map(p => p.n);
  }
  // Auto-generate UTM mapeo from active channels
  const activeCanales = [...(out.chStd||[]).filter(c=>c.a).map(c=>c.n),...(out.chTr||[]).filter(c=>c.a).map(c=>c.n),...(out.chCu||[]).filter(Boolean)];
  const autoMapeo = activeCanales.map(canal => {
    const def = UTM_DEFAULTS[canal];
    return def ? {utm_source:def.utm_source, ...(def.utm_medium?{utm_medium:def.utm_medium}:{}), canal} : null;
  }).filter(Boolean);
  out.atribucionUTM = {
    descripcion: "Mapeo de utm_source a canal_origen_fx. Auto-generado desde canales activos.",
    mapeo: autoMapeo,
    metaDinamico: "En Meta Ads Manager usar utm_source={{placement}} para distinguir Facebook vs Instagram automáticamente",
    dobleValidacion: "Usar propiedad nativa Original Source + Drill-Downs como referencia cruzada. No copiar, solo auditar.",
  };
  return out;
}

function downloadJSON(data, filename) {
  const b = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = u; a.download = filename; a.click();
}

/* ═══ COMPLETENESS v8 ═══ */
function calcPct(d, s) {
  const checks = [
    /* 0  Setup      */ () => { let t=0,f=0; ["nombreConst","dominio","nombrePipeline"].forEach(k=>{t++;if(d[k])f++}); return Math.round(f/t*100); },
    /* 1  Macros     */ () => { if(!d.macros.length)return 0; let t=0,f=0; d.macros.forEach(m=>{["nombre","ciudad","precioDesde"].forEach(k=>{t++;if(m[k])f++})}); return Math.round(f/t*100); },
    /* 2  Torres     */ () => d.macros.length===0?0:(d.macros.some(m=>(m.torres||[]).length>0)?100:0),
    /* 3  Equipos    */ () => d.macros.length===0?0:(d.macros.some(m=>(m.asesores||[]).length>0)?100:0),
    /* 4  Canales    */ () => d.chStd.some(c=>c.a)?100:0,
    /* 5  Calif      */ () => d.usaCalif && d.niveles.length>=2 && d.reglas.length>=1 ? 100 : (!d.usaCalif ? 100 : 0),
    /* 6  Etapas     */ () => {
      const fuente = d.etapasContactoSync?.fuente || "pipeline";
      if (fuente === "pipeline") return d.pipeline?.length >= 2 ? 100 : 0;
      return d.etP.length > 0 ? (d.etS?.length > 0 ? 100 : 50) : 0;
    },
    /* 7  Pipeline   */ () => d.pipeline.length>=2 ? 100 : 0,
    /* 8  Motivos    */ () => (d.motivosPerdida||[]).length>0 ? 100 : 50,
    /* 9  Agente     */ () => !d.tieneAgente ? 100 : (d.nomAgente ? 100 : 0),
    /* 10 Métricas   */ () => 100,
    /* 11 Validación */ () => { const {e}=validate(d); return e.length===0 ? 100 : 0; },
    /* 12 Ejecución  */ () => { const prms=genPrompts(buildExportPayload(d)); const en=Object.values(d.ex||{}).filter(Boolean).length; return prms.length===0?100:Math.round(en/prms.length*100); },
  ];
  return (checks[s] || (() => -1))();
}

function calcOverallPct(d) {
  const numChecks = 10;
  const pcts = Array.from({length:numChecks},(_,i)=>calcPct(d,i));
  return Math.round(pcts.reduce((a,b)=>a+b,0)/numChecks);
}

/* ═══ VALIDATE v8 ═══ */
function validate(d) {
  const w=[], e=[];
  if(!d.nombreConst) e.push("Falta nombre de la constructora");
  if(!d.dominio) e.push("Falta dominio web");
  if(!d.nombrePipeline) e.push("Falta nombre del pipeline");
  if(!d.macros.length) e.push("No hay macroproyectos");
  if(d.pipeline.length<2) e.push("Pipeline necesita al menos 2 etapas");
  if(d.usaCalif && d.reglas.length===0) e.push("Calificación activa pero sin reglas definidas");
  if(!(d.motivosPerdida||[]).length) w.push("Sin motivos de pérdida unificados");
  d.macros.forEach((m,i) => {
    if(!m.nombre) e.push(`Macro ${i+1}: sin nombre`);
    if(!(m.torres||[]).length) w.push(`${m.nombre||`M${i+1}`}: sin torres/etapas`);
    if(!(m.asesores||[]).length) w.push(`${m.nombre||`M${i+1}`}: sin asesores`);
    if(d.usaCalif && !m.rangoMinimo) w.push(`${m.nombre||`M${i+1}`}: sin rango de ingreso mínimo`);
    if(!(m.buyers||[]).length) w.push(`${m.nombre||`M${i+1}`}: sin buyer personas`);
  });
  if(d.tieneAgente && !d.nomAgente) e.push("Agente activado sin nombre");
  if(!(d.atribucionUTM?.mapeo||[]).length) w.push("Sin mapeo UTM definido");
  return {w,e};
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
  {c:"Tiempo",q:"¿Cuánto demora todo esto?",a:"El deployment técnico toma <5 minutos por API. El taller de kickoff 3-4 horas. La habilitación del equipo 4 sesiones de 1 hora. En 2-3 semanas están operando."},
  {c:"Tiempo",q:"No tenemos tiempo para un taller de 4 horas",a:"El taller es una inversión de 4 horas que ahorra 6 meses. Sin el taller, implementamos algo genérico. Con el taller, implementamos algo que refleja exactamente cómo venden ustedes."},
];

/* ═══ PROMPT GENERATOR v8 ═══ */
function genPrompts(d) {
  const P=[], ms=d.macros||[];
  const mn = ms.map(m=>m.nombre).filter(Boolean).join(", ");
  const tn = ms.flatMap(m=>(m.torres||[]).map(t=>`${m.nombre} ${t.nombre}`)).filter(Boolean).join(", ");
  const allCh = [...d.chStd.filter(c=>c.a).map(c=>c.n),...d.chTr.filter(c=>c.a).map(c=>c.n),...d.chCu.filter(Boolean)].join(", ");
  const allEt = d.etP.filter(Boolean).join(", ");
  const pn = d.nombrePipeline||"Pipeline Ventas";
  const plStages = d.pipeline.map(s=>`${s.n} (${s.p}%)`).join(", ");

  P.push({id:"PRE-01",cat:"0. Setup Base",tp:"spec",pr:`MANUAL — Setup del Portal\n\n1. Crear usuarios:\n${ms.flatMap(m=>(m.asesores||[]).map(a=>`   ${a.nombre}: ${a.email||a.correo||""}`)).join("\n")}\n2. Asignar permisos\n3. Conectar correo corporativo\n4. Conectar dominio: ${d.dominio}\n5. Instalar tracking code\n6. Integrar Meta Ads + Google Ads\n7. Crear grupo de propiedades "Focux"`});

  let pb = `Crea estas propiedades en el grupo "Focux". Usa el internal name exacto.\n\nCONTACTOS & DEALS (espejo — crear en ambos)\n`;
  [["Proyecto Activo","proyecto_activo_fx","dropdown",mn],["Lista de Proyectos","lista_proyectos_fx","checkboxes",mn],["Canal Origen","canal_origen_fx","dropdown",allCh],["Etapa Lead","etapa_lead_fx","dropdown",allEt],["Categoría Calificación","categoria_calificacion_fx","dropdown",d.niveles.join(", ")],["Motivo Pérdida","motivo_perdida_fx","dropdown",(d.motivosPerdida||[]).join(", ")],["Rango de Ingresos","rango_ingresos_fx","dropdown",d.rangos.join(", ")],["Propósito de Compra","proposito_compra_fx","dropdown","Vivienda, Inversión"],["Asesor Anterior","asesor_anterior_fx","hubspot_owner",""],["Cédula","cedula_fx","texto",""],["ID Externo","id_externo_fx","texto",""]].forEach(([l,n,t,o])=>{pb+=`- ${l} | ${n} | ${t}${o?` | ${o}`:""}\n`});
  d.varsCalif.filter(v=>v.on).forEach(v=>{
    if(!["ingresos","proposito"].includes(v.id)) pb+=`- ${v.label} | ${v.id}_fx | dropdown | ${(v.opciones||[]).join(", ")}\n`;
  });
  pb += `\nDevuélveme resumen con internal name y link de cada propiedad.`;
  P.push({id:"PROP-01",cat:"1. Propiedades",tp:"exec",pr:pb});

  P.push({id:"PL-01",cat:"2. Pipeline",tp:"exec",pr:`Crea pipeline "${pn}" con etapas: ${plStages}\n\nDevuélveme resumen con link.`});

  let tb=`MANUAL — Equipos de Venta\nConfig → Usuarios y equipos → Equipos\n\n`;
  ms.forEach(m=>{if(m.nombre&&(m.asesores||[]).length){tb+=`Equipo ${m.nombre}: ${m.asesores.map(a=>a.email||a.correo||"").filter(Boolean).join(", ")}\n`}});
  P.push({id:"EQ-01",cat:"3. Equipos",tp:"spec",pr:tb});

  if(d.usaCalif) {
    ms.forEach((m,i)=>{
      if(!m.nombre||!m.rangoMinimo) return;
      P.push({id:`WF-Q${i+1}`,cat:"4. Workflows",tp:"spec",pr:`Workflow "[Focux]Calificación_${m.nombre.replace(/\s+/g,"")}":\nTrigger: Form submission + proyecto_activo_fx = ${m.nombre}\nRango mínimo: ${m.rangoMinimo}\nReglas: ${d.reglas.length} combinaciones → escribe categoria_calificacion_fx\nCaso no autoriza: → ${d.casoNoAutoriza?.entonces||"D"}`});
    });
  }

  (d.workflows?.globales||[]).forEach((wf,i)=>{
    P.push({id:`WF-G${i+1}`,cat:"4. Workflows",tp:"spec",pr:`Workflow "${wf.nombre}":\nTipo: ${wf.tipo}\nTrigger: ${wf.trigger}\nLógica: ${wf.logica}`});
  });

  P.push({id:"LS-01",cat:"5. Lead Scoring",tp:"spec",pr:`MANUAL — Config → HubSpot Score\n\nEmail mktg abrió:+15 | clic:+20 | respondió:+25\nEmail ventas apertura:+15 | clic:+20 | respuesta:+30\nVisitó ${d.dominio}:+15 | Redes:+20 | Form:+50\nDecay: 30%/3m | Umbral: ${d.umbral}pts`});

  ms.forEach((m,i)=>{if(!m.nombre)return;
    const filtro=m.preguntaFiltroCustom||(m.tipo==="VIS"?`${m.nombre} en ${m.ciudad}, áreas ${m.areaDesde}. ¿Se acomoda?`:`${m.nombre} en ${m.ciudad}, ${m.areaDesde}, ${m.precioDesde}. ¿Te interesa?`);
    P.push({id:`FM-${i+1}`,cat:"6. Formularios",tp:"spec",pr:`MANUAL — Form "${m.nombre}" (${m.tipo})\nFiltro: "${filtro}"\nCampos: Nombre, Apellido, Email, Cel\nCalificación: ${d.varsCalif.filter(v=>v.on).map(v=>v.label).join(", ")}\nHidden: proyecto_activo_fx=${m.nombre}, canal_origen_fx=Sitio Web`});
  });

  P.push({id:"RPT-01",cat:"7. Informes",tp:"spec",pr:`MANUAL — Informes:\n1.Embudo ${pn} 2.Ganados vs Perdidos/mes 3.Tiempo×etapa 4.Pipeline×Macro 5.Conversión×Canal 6.Cerrados×Asesor 7.Actividad ventas 8.Motivos pérdida`});
  P.push({id:"SEQ-01",cat:"8. Productividad",tp:"spec",pr:`MANUAL — Secuencia + Templates + Snippets + Playbook\n\nSecuencia: Día0:Email Día2:Llamada Día4:Email Día7:Cierre\nTemplates: Primer contacto, Brochure, Post-cotización\nSnippets: ${ms.map(m=>`#${(m.nombre||"").toLowerCase().replace(/\s/g,"_")}`).join(", ")}`});
  ms.forEach((m,i)=>{if(m.nombre)P.push({id:`LP-${i+1}`,cat:"9. Landing Pages",tp:"spec",pr:`PROMPT IA HubSpot — Landing "${m.nombre}"\n${m.ciudad} | ${m.tipo} | Áreas ${m.areaDesde} | ${m.precioDesde}\n${m.amenities?`Amenidades: ${m.amenities}`:""}\nEstructura: Hero→Beneficios→Galería→Tipologías→Ubicación→Form→Footer`})});
  if(d.tieneAgente&&d.nomAgente){const info=ms.map(m=>`${m.nombre}: ${m.ciudad}, ${m.precioDesde}`).join(". ");
  P.push({id:"AI-01",cat:"10. Agente IA",tp:"spec",pr:`Breeze Studio — "${d.nomAgente}" (${d.tonoAgente})\nWABA: ${d.wabaNum}\nProyectos: ${info}\nReglas: NO descuentos/precios exactos/fechas/legal\nActivar: ${d.tiposAgente.join(", ")}`})};
  return P;
}

/* ═══ STEP DEFINITIONS v8 (18 steps: 13 config + 5 reference) ═══ */
const STEPS = [
  /* ── CONFIGURACIÓN (el consultor llena) ── */
  {t:"Setup General",i:"⚙️",d:"Datos base, suscripción y migración",section:"config"},
  {t:"Macroproyectos",i:"🏗️",d:"Proyectos en comercialización + buyers",section:"config"},
  {t:"Torres / Etapas",i:"🏠",d:"Subdivisiones por macroproyecto",section:"config"},
  {t:"Equipos de Venta",i:"👥",d:"Asesores por proyecto",section:"config"},
  {t:"Canales",i:"📡",d:"Fuentes de atribución",section:"config"},
  {t:"Calificación",i:"⭐",d:"Motor de reglas, variables y matriz",section:"config"},
  {t:"Etapas del Lead",i:"🔄",d:"Ciclo de vida del prospecto",section:"config"},
  {t:"Pipeline de Ventas",i:"📊",d:"Etapas del negocio + probabilidad",section:"config"},
  {t:"Motivos de Pérdida",i:"📋",d:"Lista unificada contacto + deal",section:"config"},
  {t:"Agente IA",i:"🤖",d:"Configuración del asistente virtual",section:"config"},
  {t:"Métricas",i:"📈",d:"Resumen de la configuración",section:"config"},
  {t:"Validación",i:"✅",d:"Revisión pre-ejecución",section:"config"},
  {t:"Ejecución",i:"🚀",d:"Prompts, guías y plantillas",section:"config"},
  /* ── REFERENCIA (generado por el Ops, read-only) ── */
  {t:"Atribución UTM",i:"🔗",d:"Mapeo utm_source → canal_origen_fx",section:"ref"},
  {t:"Multi-Deal",i:"🔀",d:"Lógica de deals por proyecto",section:"ref"},
  {t:"Propiedades Espejo",i:"🪞",d:"Sincronización contacto ↔ deal",section:"ref"},
  {t:"Workflows",i:"⚡",d:"Automatizaciones por proyecto y globales",section:"ref"},
  {t:"Objeciones",i:"💡",d:"Base de conocimiento para kickoff",section:"ref"},
];

/* ═══ STEP 0: SETUP ═══ */
function S0({d,u}) {
  return (
    <div>
      <SectionHead sub="Información base que se usa en todos los módulos">Datos de la Constructora</SectionHead>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Inp label="Nombre de la Constructora" value={d.nombreConst} onChange={v=>u("nombreConst",v)} required placeholder="Nombre de la constructora" />
        <Inp label="Dominio web principal" value={d.dominio} onChange={v=>u("dominio",v)} required placeholder="dominio.com.co" />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Inp label="Nombre del Pipeline" value={d.nombrePipeline} onChange={v=>u("nombrePipeline",v)} required placeholder="Pipeline Ventas [Constructora]" />
        <Inp label="Días sin actividad para alerta" value={d.diasSinAct} onChange={v=>u("diasSinAct",v)} type="number" required />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
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
        <Chk label="Módulo 4: Agente IA" desc="Requiere Service Hub Pro o Enterprise" checked={d.tieneAgente} onChange={v=>u("tieneAgente",v)} />
      </div>
      <SectionHead sub="Para planificar el Módulo 5">Migración de Datos</SectionHead>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Sel label="CRM actual del cliente" value={d.crmOrigen} onChange={v=>u("crmOrigen",v)} options={["Ninguno","SmartHome","Pipedrive","Sinco CRM","SICO","Excel/Sheets","Bitrix24","Otro"]} />
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
  const paste=rows=>u("macros",[...ms,...rows.map(r=>({nombre:r[0]||"",ciudad:r[1]||"",tipo:r[2]||"No VIS",precioDesde:r[3]||"",areaDesde:r[4]||"",cuotaDesde:r[5]||"",tipologias:r[6]||"",amenities:r[7]||"",rangoMinimo:"",preguntaFiltroCustom:"",buyers:[],torres:[],asesores:[]}))])
  const pasteBuyers=(rows)=>{const mi=bpModal.mi;const n=[...ms];n[mi]={...n[mi],buyers:[...(n[mi].buyers||[]),...rows.map(r=>({nombre:r[0]||"",desc:r[1]||""}))]};u("macros",n)};
  const filtroAuto=(m)=>m.tipo==="VIS"?`${m.nombre} se encuentra en ${m.ciudad||"..."} con áreas ${m.areaDesde||"..."}. ¿Se acomoda a tus necesidades?`:`El proyecto ${m.nombre} está en ${m.ciudad||"..."}, áreas ${m.areaDesde||"..."}, valor ${m.precioDesde||"..."}, cuotas ${m.cuotaDesde||"..."}. ¿Te interesa?`;
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
        example={"Familia Joven\tParejas 28-38, primer hogar\nInversionista\tProfesional 35-55, compra para renta"} />
      {ms.map((m,i) => (
        <Card key={i} title={m.nombre||`Macroproyecto ${i+1}`} subtitle={m.ciudad ? `${m.ciudad} · ${m.tipo}` : ""} onRemove={()=>rm(i)} accent>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
            <Inp label="Nombre del Macroproyecto" value={m.nombre} onChange={v=>up(i,"nombre",v)} required placeholder="Nombre del proyecto" />
            <Inp label="Ciudad / Ubicación" value={m.ciudad} onChange={v=>up(i,"ciudad",v)} required placeholder="Ciudad, sector" />
            <Sel label="Tipo de Proyecto" value={m.tipo} onChange={v=>up(i,"tipo",v)} required options={["No VIS","VIS","VIP","Mixto"]} />
            <Sel label="Ingreso mínimo requerido" value={m.rangoMinimo||""} onChange={v=>up(i,"rangoMinimo",v)} options={["",...d.rangos]} note="De los rangos definidos en Calificación (Paso 6)" />
            <Inp label="Precio Desde" value={m.precioDesde} onChange={v=>up(i,"precioDesde",v)} placeholder="$000.000.000" />
            <Inp label="Área Desde" value={m.areaDesde} onChange={v=>up(i,"areaDesde",v)} placeholder="Desde XX m2" />
            <Inp label="Cuota Mensual Desde" value={m.cuotaDesde} onChange={v=>up(i,"cuotaDesde",v)} placeholder="$0.000.000" />
            <Inp label="Tipos de Unidad / Habitaciones" value={m.tipologias} onChange={v=>up(i,"tipologias",v)} placeholder="Tipos de unidad" />
          </div>
          <Inp label="Amenities principales" value={m.amenities} onChange={v=>up(i,"amenities",v)} placeholder="Amenidades del proyecto" />
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
              <input value={b.nombre} onChange={e=>upBuyer(i,bi,"nombre",e.target.value)} placeholder="Nombre del buyer persona"
                style={{...ss.input, flex:"0 0 180px", padding:"8px 10px", fontSize:12}} />
              <input value={b.desc} onChange={e=>upBuyer(i,bi,"desc",e.target.value)} placeholder="Descripción del perfil"
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

/* ═══ STEPS 2-4: Torres, Equipos, Canales (identical to v7) ═══ */
function S2({d,u}) {
  const ms=d.macros||[];const[sp,setSp]=useState(false);const[pt,sPt]=useState(0);const[tplModal,setTplModal]=useState(null);
  const up=(mi,ti,f,v)=>{const n=[...ms];n[mi]={...n[mi],torres:[...(n[mi].torres||[])]};n[mi].torres[ti]={...n[mi].torres[ti],[f]:v};u("macros",n)};
  const add=mi=>{const n=[...ms];n[mi]={...n[mi],torres:[...(n[mi].torres||[]),{nombre:"",fechaEntrega:"",mesesCI:"",pctSep:"1",pctCI:"30",totalU:""}]};u("macros",n)};
  const rm=(mi,ti)=>{const n=[...ms];n[mi]={...n[mi],torres:[...(n[mi].torres||[])]};n[mi].torres.splice(ti,1);u("macros",n)};
  const paste=(rows)=>{const n=[...ms];rows.forEach(r=>{const mi=n.findIndex(m=>m.nombre&&r[0]&&m.nombre.toLowerCase()===r[0].toLowerCase());if(mi>=0){n[mi]={...n[mi],torres:[...(n[mi].torres||[]),{nombre:r[1]||"",fechaEntrega:r[2]||"",mesesCI:r[3]||"",pctSep:r[4]||"1",pctCI:r[5]||"30",totalU:r[6]||""}]}}});u("macros",n)};
  return (
    <div>
      <BulkBar onPaste={()=>setSp(true)} onTemplate={()=>setTplModal(getTemplate("torres",d.nombreConst,d.dominio))} />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={sp} onClose={()=>setSp(false)} onParse={paste} title="Importar Torres / Etapas"
        description="Incluye la columna Macroproyecto para asignar automáticamente"
        cols={[{label:"Macroproyecto",required:true},{label:"Torre/Etapa",required:true},{label:"Fecha Entrega"},{label:"Meses CI"},{label:"% Separación"},{label:"% Cuota Inicial"},{label:"Total Unidades"}]}
        example={"Firenze\tTorre 1\t2028-06-15\t35\t1\t30\t120\nFirenzeT2\t2029-01-20\t35\t1\t30\t95"} />
      {ms.length===0 && <InfoBox type="warn">Agrega macroproyectos en el Paso 1 primero.</InfoBox>}
      {ms.map((m,i)=>(m.nombre?(
        <Card key={i} title={m.nombre} subtitle={`${(m.torres||[]).length} torres/etapas`}>
          {(m.torres||[]).map((t,ti)=>(
            <div key={ti} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 80px 80px 80px 40px",gap:"0 6px",marginBottom:6,alignItems:"center"}}>
              <input value={t.nombre} onChange={e=>up(i,ti,"nombre",e.target.value)} placeholder="Torre / Etapa" style={{...ss.input,padding:"7px 8px",fontSize:12}} />
              <input type="date" value={t.fechaEntrega} onChange={e=>up(i,ti,"fechaEntrega",e.target.value)} style={{...ss.input,padding:"7px 8px",fontSize:12}} />
              <input value={t.mesesCI} onChange={e=>up(i,ti,"mesesCI",e.target.value)} placeholder="Meses CI" style={{...ss.input,padding:"7px 8px",fontSize:12}} />
              <input value={t.pctSep} onChange={e=>up(i,ti,"pctSep",e.target.value)} placeholder="% Sep" style={{...ss.input,padding:"7px 8px",fontSize:12,textAlign:"center"}} />
              <input value={t.pctCI} onChange={e=>up(i,ti,"pctCI",e.target.value)} placeholder="% CI" style={{...ss.input,padding:"7px 8px",fontSize:12,textAlign:"center"}} />
              <input value={t.totalU} onChange={e=>up(i,ti,"totalU",e.target.value)} placeholder="Uds" style={{...ss.input,padding:"7px 8px",fontSize:12,textAlign:"center"}} />
              <button onClick={()=>rm(i,ti)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
            </div>
          ))}
          <button onClick={()=>add(i)} style={{fontSize:12,color:tk.accent,background:"none",border:"none",cursor:"pointer",fontWeight:600,fontFamily:font,padding:"4px 0"}}>+ Agregar torre/etapa</button>
        </Card>
      ):null))}
    </div>
  );
}

function S3({d,u}) {
  const ms=d.macros||[];const[sp,setSp]=useState(false);const[tplModal,setTplModal]=useState(null);
  const up=(mi,ai,f,v)=>{const n=[...ms];n[mi]={...n[mi],asesores:[...(n[mi].asesores||[])]};n[mi].asesores[ai]={...n[mi].asesores[ai],[f]:v};u("macros",n)};
  const add=mi=>{const n=[...ms];n[mi]={...n[mi],asesores:[...(n[mi].asesores||[]),{nombre:"",email:"",correo:""}]};u("macros",n)};
  const rm=(mi,ai)=>{const n=[...ms];n[mi]={...n[mi],asesores:[...(n[mi].asesores||[])]};n[mi].asesores.splice(ai,1);u("macros",n)};
  const paste=(rows)=>{const n=[...ms];rows.forEach(r=>{const mi=n.findIndex(m=>m.nombre&&r[0]&&m.nombre.toLowerCase()===r[0].toLowerCase());if(mi>=0){n[mi]={...n[mi],asesores:[...(n[mi].asesores||[]),{nombre:r[1]||"",email:r[2]||"",correo:r[2]||""}]}}});u("macros",n)};
  return (
    <div>
      <BulkBar onPaste={()=>setSp(true)} onTemplate={()=>setTplModal(getTemplate("equipos",d.nombreConst,d.dominio))} />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={sp} onClose={()=>setSp(false)} onParse={paste} title="Importar Asesores"
        description="Incluye la columna Macroproyecto para asignar automáticamente"
        cols={[{label:"Macroproyecto",required:true},{label:"Nombre Asesor",required:true},{label:"Email Corporativo",required:true},{label:"Meeting Link"}]}
        example={"Firenze\tMaría Gómez\tmaria@constructora.com\t"} />
      {ms.length===0 && <InfoBox type="warn">Agrega macroproyectos en el Paso 1 primero.</InfoBox>}
      {ms.map((m,i)=>(m.nombre?(
        <Card key={i} title={m.nombre} subtitle={`${(m.asesores||[]).length} asesores`}>
          {(m.asesores||[]).map((a,ai)=>(
            <div key={ai} style={{display:"grid",gridTemplateColumns:"1fr 1fr 40px",gap:"0 8px",marginBottom:6}}>
              <input value={a.nombre} onChange={e=>up(i,ai,"nombre",e.target.value)} placeholder="Nombre" style={{...ss.input,padding:"7px 8px",fontSize:12}} />
              <input value={a.email||a.correo||""} onChange={e=>{up(i,ai,"email",e.target.value);up(i,ai,"correo",e.target.value)}} placeholder="Email corporativo" style={{...ss.input,padding:"7px 8px",fontSize:12}} />
              <button onClick={()=>rm(i,ai)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
            </div>
          ))}
          <button onClick={()=>add(i)} style={{fontSize:12,color:tk.accent,background:"none",border:"none",cursor:"pointer",fontWeight:600,fontFamily:font,padding:"4px 0"}}>+ Agregar asesor</button>
        </Card>
      ):null))}
    </div>
  );
}

function S4({d,u}) {
  const[tplModal,setTplModal]=useState(null);
  return (
    <div>
      <SectionHead sub="Canales de marketing digital y tradicional">Canales Estándar</SectionHead>
      {d.chStd.map((c,i)=>(
        <Chk key={i} label={c.n} checked={c.a} onChange={v=>{const n=[...d.chStd];n[i]={...n[i],a:v};u("chStd",n)}} />
      ))}
      <SectionHead sub="Canales de marketing offline">Canales Tradicionales</SectionHead>
      {d.chTr.map((c,i)=>(
        <Chk key={i} label={c.n} checked={c.a} onChange={v=>{const n=[...d.chTr];n[i]={...n[i],a:v};u("chTr",n)}} />
      ))}
      <SectionHead sub="Canales específicos de esta constructora">Canales Personalizados</SectionHead>
      {d.chCu.map((c,i)=>(
        <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
          <input value={c} onChange={e=>{const n=[...d.chCu];n[i]=e.target.value;u("chCu",n)}}
            style={{...ss.input, flex:1, padding:"8px 10px", fontSize:12}} />
          <button onClick={()=>{const n=[...d.chCu];n.splice(i,1);u("chCu",n)}} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
        </div>
      ))}
      <AddBtn onClick={()=>u("chCu",[...d.chCu,""])} label="Agregar canal personalizado" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   STEP 5: CALIFICACIÓN — MOTOR DE REGLAS v8
   Variables con opciones customizables, matriz auto-generada,
   caso especial no autoriza, asignación + SLA por regla.
   ═══════════════════════════════════════════════════════════ */
function S5({d,u}) {
  const vars = d.varsCalif || [];
  const activeVars = vars.filter(v=>v.on);
  const eje1 = activeVars[0] || null;
  const eje2 = activeVars[1] || null;
  const niveles = d.niveles || [];
  const caso = d.casoNoAutoriza || DEF_CASO_NO_AUTORIZA;

  const upVar=(i,f,v)=>{const n=[...vars];n[i]={...n[i],[f]:v};u("varsCalif",n)};
  const upVarOpt=(vi,oi,v)=>{const n=[...vars];n[vi]={...n[vi],opciones:[...(n[vi].opciones||[])]};n[vi].opciones[oi]=v;u("varsCalif",n)};
  const addVarOpt=(vi)=>{const n=[...vars];n[vi]={...n[vi],opciones:[...(n[vi].opciones||[]),""]};u("varsCalif",n)};
  const rmVarOpt=(vi,oi)=>{const n=[...vars];n[vi]={...n[vi],opciones:[...(n[vi].opciones||[])]};n[vi].opciones.splice(oi,1);u("varsCalif",n)};
  const addVar=()=>u("varsCalif",[...vars,{id:`custom_${Date.now()}`,label:"",opciones:["Sí","No"],on:false}]);
  const rmVar=(i)=>{const n=[...vars];n.splice(i,1);u("varsCalif",n)};
  const moveVar=(i,dir)=>{const n=[...vars];const t=n[i];n[i]=n[i+dir];n[i+dir]=t;u("varsCalif",n)};

  const upRegla=(i,f,v)=>{const n=[...d.reglas];n[i]={...n[i],[f]:v};u("reglas",n)};
  const upCaso=(f,v)=>u("casoNoAutoriza",{...caso,[f]:v});

  const autoGen=()=>{
    if(!eje1||!eje2) return;
    const combos=[];
    (eje1.opciones||[]).forEach(o1=>{
      (eje2.opciones||[]).forEach(o2=>{
        combos.push({si:o1,y:o2,entonces:niveles[Math.min(combos.length,niveles.length-1)]||"",asignacion:"",sla:""});
      });
    });
    u("reglas",combos);
  };

  const allAsig = [...new Set([...DEF_ASIGNACIONES,...d.reglas.map(r=>r.asignacion).filter(Boolean)])];
  const allSla = [...new Set([...DEF_SLAS,...d.reglas.map(r=>r.sla).filter(Boolean)])];

  return (
    <div>
      <Chk label="Esta constructora usa calificación de leads" desc="Si no califica, se saltan los workflows de calificación" checked={d.usaCalif} onChange={v=>u("usaCalif",v)} />
      {d.usaCalif && <>
        <InfoBox>Los rangos de ingreso son comunes a toda la constructora. El ingreso mínimo por proyecto se define en cada macroproyecto (Paso 2).</InfoBox>

        {/* ── RANGOS DE INGRESO ── */}
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

        {/* ── NIVELES (CATEGORÍAS) ── */}
        <SectionHead sub="Etiquetas de prioridad del lead — personalizables">Niveles de Calificación</SectionHead>
        <ChipEditor items={niveles} onChange={v=>u("niveles",v)} placeholder="Ej: Gold" note="Estándar Focux: AAA, A, B, C, D. Edita, agrega o elimina según la constructora." />

        {/* ── VARIABLES DE CALIFICACIÓN ── */}
        <SectionHead sub="Preguntas que se capturan en el formulario. Cada una tiene sus opciones de respuesta.">Variables de Calificación</SectionHead>
        <InfoBox>Las 2 primeras variables activas se convierten en los ejes de la matriz. Las demás se capturan pero no cruzan.</InfoBox>
        {vars.map((v,i)=>{
          const isEje = v.on && (activeVars.indexOf(v) === 0 || activeVars.indexOf(v) === 1);
          const ejeNum = isEje ? activeVars.indexOf(v)+1 : 0;
          return (
            <Card key={v.id||i} accent={isEje}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                  <Chk label="" checked={v.on} onChange={val=>upVar(i,"on",val)} />
                  <input value={v.label} onChange={e=>upVar(i,"label",e.target.value)} placeholder="Pregunta del formulario"
                    style={{...ss.input,flex:1,padding:"7px 10px",fontSize:13,fontWeight:500}} />
                </div>
                <div style={{display:"flex",gap:4,marginLeft:8}}>
                  {isEje && <Badge text={`Eje ${ejeNum}`} color={tk.accent} />}
                  {i>0 && <button onClick={()=>moveVar(i,-1)} style={{background:"none",border:`1px solid ${tk.border}`,borderRadius:4,width:24,height:24,fontSize:11,cursor:"pointer",color:tk.textSec}}>↑</button>}
                  {i<vars.length-1 && <button onClick={()=>moveVar(i,1)} style={{background:"none",border:`1px solid ${tk.border}`,borderRadius:4,width:24,height:24,fontSize:11,cursor:"pointer",color:tk.textSec}}>↓</button>}
                  <button onClick={()=>rmVar(i)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
                </div>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginLeft:26}}>
                <span style={{fontSize:11,color:tk.textTer,paddingTop:4,marginRight:4}}>Opciones:</span>
                {(v.opciones||[]).map((o,oi)=>(
                  <div key={oi} style={{display:"flex",alignItems:"center",gap:2}}>
                    <input value={o} onChange={e=>upVarOpt(i,oi,e.target.value)} style={{...ss.input,width:140,padding:"4px 8px",fontSize:11}} />
                    <button onClick={()=>rmVarOpt(i,oi)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:13,padding:"0 2px"}}>×</button>
                  </div>
                ))}
                <button onClick={()=>addVarOpt(i)} style={{fontSize:11,color:tk.accent,background:"none",border:`1px dashed ${tk.accent}40`,borderRadius:4,padding:"3px 8px",cursor:"pointer"}}>+</button>
              </div>
              <div style={{marginLeft:26,marginTop:4}}>
                <input value={v.id} onChange={e=>upVar(i,"id",e.target.value)} style={{...ss.input,width:200,padding:"3px 8px",fontSize:10,color:tk.textTer,fontFamily:"monospace"}} />
                <span style={{fontSize:10,color:tk.textTer,marginLeft:4}}>internal id</span>
              </div>
            </Card>
          );
        })}
        <AddBtn onClick={addVar} label="Agregar variable de calificación" />

        {/* ── CASO ESPECIAL: NO AUTORIZA DATOS ── */}
        <SectionHead sub="Regla fija independiente de la matriz">Caso Especial: No Autoriza Tratamiento de Datos</SectionHead>
        <Card>
          <Chk label="El formulario tiene checkbox de autorización de datos (habeas data)" desc="Si el lead no marca este checkbox, se asigna automáticamente la categoría más baja" checked={caso.activo} onChange={v=>upCaso("activo",v)} />
          {caso.activo && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0 12px",marginTop:8,marginLeft:26}}>
              <div>
                <label style={ss.label}>Categoría</label>
                <select value={caso.entonces} onChange={e=>upCaso("entonces",e.target.value)} style={{...ss.input,padding:"7px 10px",fontSize:12}}>
                  {niveles.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={ss.label}>Asignación</label>
                <select value={caso.asignacion} onChange={e=>upCaso("asignacion",e.target.value)} style={{...ss.input,padding:"7px 10px",fontSize:12}}>
                  {allAsig.map(a=><option key={a} value={a}>{a}</option>)}
                  <option value="__custom">+ Custom...</option>
                </select>
              </div>
              <div>
                <label style={ss.label}>SLA</label>
                <select value={caso.sla} onChange={e=>upCaso("sla",e.target.value)} style={{...ss.input,padding:"7px 10px",fontSize:12}}>
                  {allSla.map(s=><option key={s} value={s}>{s}</option>)}
                  <option value="__custom">+ Custom...</option>
                </select>
              </div>
            </div>
          )}
        </Card>

        {/* ── MATRIZ AUTO-GENERADA ── */}
        <SectionHead sub="Las combinaciones se generan a partir de los 2 ejes activos">Matriz de Calificación</SectionHead>
        {(!eje1||!eje2) ? (
          <InfoBox type="warn">Activa al menos 2 variables arriba para generar la matriz. La primera variable activa = filas, la segunda = columnas.</InfoBox>
        ) : (
          <>
            <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
              <span style={{fontSize:12,color:tk.textSec}}>
                Eje 1 (filas): <strong style={{color:tk.navy}}>{eje1.label}</strong> ({(eje1.opciones||[]).length} opciones) ×
                Eje 2 (cols): <strong style={{color:tk.navy}}>{eje2.label}</strong> ({(eje2.opciones||[]).length} opciones)
                = <strong style={{color:tk.accent}}>{(eje1.opciones||[]).length*(eje2.opciones||[]).length} combinaciones</strong>
              </span>
              <button onClick={autoGen} style={{padding:"5px 14px",borderRadius:6,border:`1.5px solid ${tk.accent}`,background:tk.card,color:tk.accent,fontSize:11,cursor:"pointer",fontWeight:600,fontFamily:font,marginLeft:"auto"}}>
                Auto-generar matriz
              </button>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:tk.navy}}>
                    {[eje1.label,eje2.label,"Categoría","Asignación","SLA",""].map((h,i)=>(
                      <th key={i} style={{padding:"8px 10px",color:"#fff",fontWeight:600,textAlign:"left",fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.reglas.map((r,i)=>(
                    <tr key={i} style={{background:i%2===0?tk.bg:tk.card,borderBottom:`1px solid ${tk.border}`}}>
                      <td style={{padding:"6px 8px"}}>
                        <select value={r.si} onChange={e=>upRegla(i,"si",e.target.value)} style={{...ss.input,padding:"5px 8px",fontSize:12,border:`1px solid ${tk.borderLight}`}}>
                          <option value="">—</option>
                          {(eje1.opciones||[]).map(o=><option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td style={{padding:"6px 8px"}}>
                        <select value={r.y} onChange={e=>upRegla(i,"y",e.target.value)} style={{...ss.input,padding:"5px 8px",fontSize:12,border:`1px solid ${tk.borderLight}`}}>
                          <option value="">—</option>
                          {(eje2.opciones||[]).map(o=><option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td style={{padding:"6px 8px"}}>
                        <select value={r.entonces} onChange={e=>upRegla(i,"entonces",e.target.value)} style={{...ss.input,padding:"5px 8px",fontSize:12,border:`1px solid ${tk.borderLight}`,fontWeight:600}}>
                          {niveles.map(n=><option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                      <td style={{padding:"6px 8px"}}>
                        <select value={r.asignacion||""} onChange={e=>upRegla(i,"asignacion",e.target.value)} style={{...ss.input,padding:"5px 8px",fontSize:11,border:`1px solid ${tk.borderLight}`}}>
                          <option value="">Seleccionar...</option>
                          {allAsig.map(a=><option key={a} value={a}>{a}</option>)}
                        </select>
                      </td>
                      <td style={{padding:"6px 8px"}}>
                        <select value={r.sla||""} onChange={e=>upRegla(i,"sla",e.target.value)} style={{...ss.input,padding:"5px 8px",fontSize:11,border:`1px solid ${tk.borderLight}`}}>
                          <option value="">Seleccionar...</option>
                          {allSla.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{padding:"6px 4px",width:30}}>
                        <button onClick={()=>{const n=[...d.reglas];n.splice(i,1);u("reglas",n)}} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:14}}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={()=>u("reglas",[...d.reglas,{si:"",y:"",entonces:niveles[0]||"",asignacion:"",sla:""}])} style={{fontSize:12,color:tk.accent,background:"none",border:"none",cursor:"pointer",fontWeight:600,fontFamily:font,padding:"8px 0",marginTop:4}}>+ Agregar regla manual</button>
          </>
        )}

        {/* ── NOTA DE INTERPRETACIÓN ── */}
        <SectionHead sub="Documenta cómo se interpretan las condiciones">Nota de Interpretación</SectionHead>
        <Inp label="Comparación" value={(d.reglas_nota||{}).comparacion||""} onChange={v=>u("reglas_nota",{...(d.reglas_nota||{}),comparacion:v})} placeholder="Ej: Ingreso SUPERIOR = rango del lead IGUAL o MAYOR al rangoMinimo del proyecto (>=)" />
        <Inp label="Ejemplo" value={(d.reglas_nota||{}).ejemplo||""} onChange={v=>u("reglas_nota",{...(d.reglas_nota||{}),ejemplo:v})} placeholder="Ej: Ryos rangoMinimo 'Entre $2M y $4M'. Lead responde 'Entre $2M y $4M' → SUPERIOR" />

        {/* ── LEAD SCORING ── */}
        <SectionHead sub="Puntos acumulativos por engagement">Lead Scoring</SectionHead>
        <Inp label="Umbral de Lead Scoring (puntos)" value={d.umbral} onChange={v=>u("umbral",v)} type="number" required note="Cuando el lead alcanza este puntaje se dispara alerta al asesor. Estándar Focux: 75." />
      </>}
    </div>
  );
}

/* ═══ STEP 6: ETAPAS LEAD v8 (sin etS, pipeline-sync) ═══ */
function S6({d,u}) {
  const sync = d.etapasContactoSync || DEF_ETAPAS_SYNC;
  const isEspejo = sync.fuente === "pipeline";
  const setFuente = (fuente) => u("etapasContactoSync", {...sync, fuente});

  const edP=(i,v)=>{const n=[...d.etP];n[i]=v;u("etP",n)};
  const rmP=(i)=>{const n=[...d.etP];n.splice(i,1);u("etP",n)};
  const edS=(i,v)=>{const n=[...(d.etS||[])];n[i]=v;u("etS",n)};
  const rmS=(i)=>{const n=[...(d.etS||[])];n.splice(i,1);u("etS",n)};

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
    if(newS.length && !isEspejo) u("etS",[...(d.etS||[]),...newS.filter(Boolean)]);
  };

  const pipelineNames = (d.pipeline||[]).map(p=>p.n).filter(Boolean);

  return (
    <div>
      {/* ── TOGGLE ESPEJO VS INDEPENDIENTE ── */}
      <SectionHead sub="Define si las etapas del contacto son las mismas del deal o independientes">Modelo de Etapas</SectionHead>
      <div style={{display:"flex",gap:10,marginBottom:16}}>
        <button onClick={()=>setFuente("pipeline")} style={{
          flex:1,padding:"14px 16px",borderRadius:10,cursor:"pointer",fontFamily:font,fontSize:13,fontWeight:600,
          border:`2px solid ${isEspejo?tk.accent:tk.border}`,background:isEspejo?tk.accentLight:tk.card,color:isEspejo?tk.navy:tk.textSec,
          transition:"all 0.2s",textAlign:"left",
        }}>
          <span style={{fontSize:16,marginRight:6}}>🪞</span> Espejo (sync con pipeline)
          <span style={{display:"block",fontSize:11,fontWeight:400,color:tk.textTer,marginTop:2}}>
            Las etapas del contacto = etapas del deal. Se sincronizan automáticamente. Modelo Nivel.
          </span>
        </button>
        <button onClick={()=>setFuente("independiente")} style={{
          flex:1,padding:"14px 16px",borderRadius:10,cursor:"pointer",fontFamily:font,fontSize:13,fontWeight:600,
          border:`2px solid ${!isEspejo?tk.accent:tk.border}`,background:!isEspejo?tk.accentLight:tk.card,color:!isEspejo?tk.navy:tk.textSec,
          transition:"all 0.2s",textAlign:"left",
        }}>
          <span style={{fontSize:16,marginRight:6}}>🔀</span> Independientes (prospección + sala)
          <span style={{display:"block",fontSize:11,fontWeight:400,color:tk.textTer,marginTop:2}}>
            Etapas de prospección y sala de ventas separadas del pipeline del deal. Modelo Jiménez.
          </span>
        </button>
      </div>

      {isEspejo ? (
        <>
          <InfoBox type="success">Las etapas del contacto se sincronizan automáticamente con el pipeline del deal via workflow <code style={{fontFamily:"monospace",fontSize:11}}>[Focux]Sync_Etapa_Deal</code>. No necesitas editarlas aquí — se derivan del pipeline (Paso 8).</InfoBox>
          <SectionHead>Etapas del Lead (auto-sync con pipeline)</SectionHead>
          {pipelineNames.length > 0 ? (
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {pipelineNames.map((name,i)=>(
                <span key={i} style={{padding:"6px 12px",borderRadius:8,fontSize:12,fontWeight:500,background:tk.accentLight,color:tk.navy,border:`1px solid ${tk.accent}30`}}>
                  {i+1}. {name}
                </span>
              ))}
            </div>
          ) : (
            <InfoBox type="warn">Define el pipeline en el Paso 8 para ver las etapas sincronizadas aquí.</InfoBox>
          )}
        </>
      ) : (
        <>
          <InfoBox>Las etapas del contacto son independientes del pipeline del deal. Define las fases de prospección (marketing/BDR) y sala de ventas (equipo comercial) por separado.</InfoBox>
          <BulkBar onPaste={()=>setSpE(true)} onTemplate={()=>setTplModal(getTemplate("etapas_lead",d.nombreConst,d.dominio))} templateLabel="FocuxAI Scraping — Etapas" />
          <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
          <PasteModal open={spE} onClose={()=>setSpE(false)} onParse={pasteEtapas}
            title="Importar Etapas del Lead" description="Si incluyes columna Fase, las etapas se distribuyen automáticamente"
            cols={[{label:"Fase (Prospección/Sala)",required:false},{label:"Nombre Etapa",required:true}]}
            example={"Prospección\tLead Nuevo\nProspección\tIntento de Contacto\nSala\tVisitó Sala de Ventas\nSala\tCotización Enviada"} />

          <SectionHead>Fase Prospección (Marketing / BDR)</SectionHead>
          {d.etP.map((e,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
              <span style={{minWidth:24,color:tk.textTer,fontSize:12,fontWeight:600,textAlign:"right"}}>{i+1}</span>
              <input value={e} onChange={ev=>edP(i,ev.target.value)} style={{...ss.input,flex:1,padding:"8px 10px",fontSize:12}} />
              <button onClick={()=>rmP(i)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
            </div>
          ))}
          <AddBtn onClick={()=>u("etP",[...d.etP,""])} label="Agregar etapa de prospección" />

          <SectionHead>Fase Sala de Ventas (Equipo Comercial)</SectionHead>
          {(d.etS||[]).map((e,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
              <span style={{minWidth:24,color:tk.textTer,fontSize:12,fontWeight:600,textAlign:"right"}}>{i+1}</span>
              <input value={e} onChange={ev=>edS(i,ev.target.value)} style={{...ss.input,flex:1,padding:"8px 10px",fontSize:12}} />
              <button onClick={()=>rmS(i)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
            </div>
          ))}
          <AddBtn onClick={()=>u("etS",[...(d.etS||[]),""])} label="Agregar etapa de sala" />
        </>
      )}
    </div>
  );
}

/* ═══ STEP 7: PIPELINE (identical to v7) ═══ */
function S7({d,u}) {
  const upPl=(i,f,v)=>{const n=[...d.pipeline];n[i]={...n[i],[f]:v};u("pipeline",n)};
  const rmPl=i=>{const n=[...d.pipeline];n.splice(i,1);u("pipeline",n)};
  const [spPl,setSpPl]=useState(false);const[tplModal,setTplModal]=useState(null);
  const pastePipeline=(rows)=>{const newStages=rows.map(r=>({n:r[0]||"",p:parseInt(r[1])||0})).filter(s=>s.n);u("pipeline",[...d.pipeline,...newStages]);};
  return (
    <div>
      <InfoBox>Las etapas del pipeline representan el avance del negocio (deal) desde la cotización hasta el cierre. Cada etapa tiene una probabilidad de cierre que alimenta el forecast.</InfoBox>
      <BulkBar onPaste={()=>setSpPl(true)} onTemplate={()=>setTplModal(getTemplate("pipeline",d.nombreConst,d.dominio))} templateLabel="FocuxAI Scraping — Pipeline" />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={spPl} onClose={()=>setSpPl(false)} onParse={pastePipeline}
        title="Importar Etapas del Pipeline" description="Nombre de la etapa y probabilidad de cierre (%)"
        cols={[{label:"Nombre Etapa",required:true},{label:"% Probabilidad",required:true}]}
        example={"Lead\t5\nContactado\t10\nVisita\t50\nNegocio/Cierre\t100\nPerdida\t0"} />
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

      {/* ── TRIGGER CREACIÓN DE DEAL ── */}
      <SectionHead sub="¿En qué momento del ciclo de vida se crea el negocio (deal)?">Trigger Creación de Deal</SectionHead>
      <div style={{marginBottom:16}}>
        <select value={d.triggerDeal} onChange={e=>u("triggerDeal",e.target.value)}
          style={{...ss.input, background:tk.card, cursor:"pointer", appearance:"auto"}}>
          <option value="Form Submission (Deal se crea al llenar formulario)">Form Submission (Deal se crea al llenar formulario)</option>
          {d.etP.filter(Boolean).length > 0 && <optgroup label="Etapas del Lead">
            {d.etP.filter(Boolean).map(e=><option key={`etP-${e}`} value={e}>{e}</option>)}
          </optgroup>}
          {(d.etS||[]).filter(Boolean).length > 0 && <optgroup label="Etapas Sala de Ventas">
            {d.etS.filter(Boolean).map(e=><option key={`etS-${e}`} value={e}>{e}</option>)}
          </optgroup>}
          {d.pipeline.filter(s=>s.n).length > 0 && <optgroup label="Etapas del Pipeline">
            {d.pipeline.filter(s=>s.n).map(s=><option key={`pl-${s.n}`} value={s.n}>{s.n} ({s.p}%)</option>)}
          </optgroup>}
        </select>
        <p style={{fontSize:11, color:tk.textTer, margin:"4px 0 0"}}>Selecciona la etapa del lead o del pipeline que dispara la creación del deal. Las opciones vienen de las etapas definidas arriba y en el Paso 7.</p>
      </div>
    </div>
  );
}

/* ═══ STEP 8: MOTIVOS DE PÉRDIDA (unified v8) ═══ */
function S8({d,u}) {
  const motivos = d.motivosPerdida || [];
  const ed=(i,v)=>{const n=[...motivos];n[i]=v;u("motivosPerdida",n)};
  const rm=(i)=>{const n=[...motivos];n.splice(i,1);u("motivosPerdida",n)};
  const [spM,setSpM]=useState(false);const[tplModal,setTplModal]=useState(null);
  const pasteMotivos=(rows)=>{const newM=rows.map(r=>r[0]||"").filter(Boolean);u("motivosPerdida",[...motivos,...newM]);};
  return (
    <div>
      <InfoBox>Lista unificada de motivos de pérdida. La misma propiedad <code style={{fontFamily:"monospace",fontSize:11}}>motivo_perdida_fx</code> aplica tanto al contacto (descarte) como al deal (pérdida). Espejo completo.</InfoBox>
      <BulkBar onPaste={()=>setSpM(true)} onTemplate={()=>setTplModal(getTemplate("motivos",d.nombreConst,d.dominio))} templateLabel="FocuxAI Scraping — Motivos" />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={spM} onClose={()=>setSpM(false)} onParse={pasteMotivos}
        title="Importar Motivos de Pérdida" description="Un motivo por fila"
        cols={[{label:"Motivo",required:true}]}
        example={"Ingresos insuficientes\nCrédito denegado\nCompró en competencia\nNo interesado"} />
      <SectionHead sub={`${motivos.length} motivos definidos — aplican a contacto y deal`}>Motivos de Pérdida Unificados</SectionHead>
      {motivos.map((m,i)=>(
        <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
          <span style={{minWidth:24,color:tk.textTer,fontSize:12,fontWeight:600,textAlign:"right",paddingTop:9}}>{i+1}</span>
          <input value={m} onChange={e=>ed(i,e.target.value)} style={{...ss.input,flex:1,padding:"8px 10px",fontSize:12}} />
          <button onClick={()=>rm(i)} style={{background:"none",border:"none",color:tk.textTer,cursor:"pointer",fontSize:16}} onMouseOver={e=>e.target.style.color=tk.red} onMouseOut={e=>e.target.style.color=tk.textTer}>×</button>
        </div>
      ))}
      <AddBtn onClick={()=>u("motivosPerdida",[...motivos,""])} label="Agregar motivo" />
    </div>
  );
}

/* ═══ STEP 9: AGENTE IA (same as v7) ═══ */
function S9({d,u}) {
  if(!d.tieneAgente) return <InfoBox type="warn">El Módulo 4 (Agente IA) no está activado. Puedes activarlo en el Paso 1 (Setup).</InfoBox>;
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Inp label="Nombre del Agente" value={d.nomAgente} onChange={v=>u("nomAgente",v)} required placeholder="Nombre del agente" />
        <Sel label="Tono" value={d.tonoAgente} onChange={v=>u("tonoAgente",v)} required options={["Profesional y cálido","Formal y corporativo","Cercano y juvenil"]} />
      </div>
      <Inp label="Número WhatsApp WABA" value={d.wabaNum} onChange={v=>u("wabaNum",v)} required placeholder="+57 300 000 0000" />
      <SectionHead>Tipos de Lead que activan el Agente outbound</SectionHead>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        {(d.niveles.length?d.niveles:DEF_NIVELES).map(t=>(
          <Chk key={t} label={t} checked={d.tiposAgente.includes(t)} onChange={v=>u("tiposAgente",v?[...d.tiposAgente,t]:d.tiposAgente.filter(x=>x!==t))} />
        ))}
      </div>
    </div>
  );
}

/* ═══ STEP 10: ATRIBUCIÓN UTM ═══ */
function S10_UTM({d,u}) {
  const utm = d.atribucionUTM || DEF_UTM;
  const activeCanales=[...d.chStd.filter(c=>c.a).map(c=>c.n),...d.chTr.filter(c=>c.a).map(c=>c.n),...d.chCu.filter(Boolean)];

  const defaultMap = {
    "Pauta Facebook":{utm_source:"facebook"},
    "Pauta Instagram":{utm_source:"instagram"},
    "Pauta Google":{utm_source:"google",utm_medium:"cpc"},
    "Búsqueda Orgánica":{utm_source:"google",utm_medium:"organic"},
    "Mail Marketing":{utm_source:"email"},
    "Canal WhatsApp":{utm_source:"whatsapp"},
    "Referido":{utm_source:"referido"},
    "Sitio Web":{utm_source:"direct"},
    "Redes Sociales Orgánicas":{utm_source:"social"},
  };

  const autoMapeo = activeCanales.map(canal => {
    const def = defaultMap[canal];
    return def ? {utm_source:def.utm_source, utm_medium:def.utm_medium||"", canal} : {utm_source:"", utm_medium:"", canal, custom:true};
  });

  return (
    <div>
      <InfoBox type="success">La atribución UTM se genera automáticamente a partir de los canales activos (Paso 5). Cuando un lead llega por una URL con utm_source, el formulario asigna el canal correcto. Sin UTM = selección manual por el asesor.</InfoBox>

      <SectionHead sub={`${activeCanales.length} canales activos → ${autoMapeo.filter(m=>m.utm_source).length} con mapeo UTM automático`}>Mapeo UTM Auto-Generado</SectionHead>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:tk.navy}}>
            <th style={{padding:"8px 10px",color:"#fff",fontWeight:600,textAlign:"left",fontSize:11}}>Canal activo</th>
            <th style={{padding:"8px 10px",color:"#fff",fontWeight:600,textAlign:"left",fontSize:11}}>utm_source</th>
            <th style={{padding:"8px 10px",color:"#fff",fontWeight:600,textAlign:"left",fontSize:11}}>utm_medium</th>
            <th style={{padding:"8px 10px",color:"#fff",fontWeight:600,textAlign:"center",fontSize:11}}>Estado</th>
          </tr></thead>
          <tbody>
            {autoMapeo.map((m,i)=>(
              <tr key={i} style={{background:i%2===0?tk.bg:tk.card,borderBottom:`1px solid ${tk.border}`}}>
                <td style={{padding:"7px 10px",fontWeight:500,color:tk.navy}}>{m.canal}</td>
                <td style={{padding:"7px 10px"}}>{m.utm_source ? <code style={{fontFamily:"monospace",fontSize:11,padding:"2px 6px",background:tk.accentLight,borderRadius:4,color:tk.accent}}>{m.utm_source}</code> : <span style={{color:tk.textTer,fontStyle:"italic",fontSize:11}}>Sin UTM (manual)</span>}</td>
                <td style={{padding:"7px 10px"}}>{m.utm_medium ? <code style={{fontFamily:"monospace",fontSize:11,padding:"2px 6px",background:tk.bg,borderRadius:4,color:tk.textSec}}>{m.utm_medium}</code> : <span style={{color:tk.textTer,fontSize:11}}>—</span>}</td>
                <td style={{padding:"7px 10px",textAlign:"center"}}>{m.utm_source ? <Badge text="Auto" color={tk.green} /> : <Badge text="Manual" color={tk.amber} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:16}}>
        <div style={{padding:12,borderRadius:10,background:tk.accentLight,border:`1px solid ${tk.accent}25`}}>
          <p style={{fontSize:12,fontWeight:700,color:tk.navy,margin:"0 0 6px"}}>Meta Ads: Facebook vs Instagram</p>
          <p style={{fontSize:11,color:tk.navy,margin:0,lineHeight:1.5}}>En Meta Ads Manager usar <code style={{fontFamily:"monospace",fontSize:10}}>utm_source={"{{placement}}"}</code> para distinguir automáticamente. Meta envía "facebook" o "instagram" según dónde se mostró el anuncio.</p>
        </div>
        <div style={{padding:12,borderRadius:10,background:tk.bg,border:`1px solid ${tk.border}`}}>
          <p style={{fontSize:12,fontWeight:700,color:tk.navy,margin:"0 0 6px"}}>Doble validación</p>
          <p style={{fontSize:11,color:tk.textSec,margin:0,lineHeight:1.5}}>HubSpot tiene propiedades nativas <code style={{fontFamily:"monospace",fontSize:10}}>Original Source</code> y Drill-Downs. Se usan como referencia cruzada para auditar, no para copiar.</p>
        </div>
      </div>

      <div style={{padding:10,background:tk.bg,borderRadius:8,marginTop:12,border:`1px solid ${tk.border}`}}>
        <p style={{margin:0,fontSize:10,color:tk.textTer,lineHeight:1.5}}>Los canales sin mapeo UTM (Sala de Ventas Física, Referido presencial, Feria, etc.) requieren selección manual por el asesor al registrar el lead. El formulario web siempre intenta leer UTM primero.</p>
      </div>
    </div>
  );
}

/* ═══ STEP 11: MULTI-DEAL LOGIC ═══ */
function S11_MULTI({d,u}) {
  const mdl = d.multiDealLogic || DEF_MULTI_DEAL;
  const upMDL=(f,v)=>u("multiDealLogic",{...mdl,[f]:v});
  const upSync=(f,v)=>u("multiDealLogic",{...mdl,syncEtapas:{...(mdl.syncEtapas||{}),[f]:v}});
  return (
    <div>
      <InfoBox>Define cómo se manejan múltiples deals por contacto. Cada proyecto puede tener su propio deal activo. El contacto siempre refleja el estado del deal más avanzado.</InfoBox>
      <Inp label="Regla principal" value={mdl.regla||""} onChange={v=>upMDL("regla",v)} note="Ej: 1 deal activo máximo por proyecto por contacto" />
      <Inp label="Comportamiento" value={mdl.comportamiento||""} onChange={v=>upMDL("comportamiento",v)} />
      <SectionHead>Sincronización de Etapas (Deal → Contacto)</SectionHead>
      <Inp label="Descripción" value={(mdl.syncEtapas||{}).descripcion||""} onChange={v=>upSync("descripcion",v)} />
      <Inp label="Cualquier cambio de etapa" value={(mdl.syncEtapas||{}).cualquierCambioEtapa||""} onChange={v=>upSync("cualquierCambioEtapa",v)} />
      <Inp label="Deal Perdida sin otros deals" value={(mdl.syncEtapas||{}).deal_Perdida_sinOtrosDeals||""} onChange={v=>upSync("deal_Perdida_sinOtrosDeals",v)} />
      <Inp label="Deal Perdida con otros deals" value={(mdl.syncEtapas||{}).deal_Perdida_conOtrosDeals||""} onChange={v=>upSync("deal_Perdida_conOtrosDeals",v)} />
      <SectionHead>Ownership</SectionHead>
      <Inp label="Owner del Deal" value={mdl.ownerDeal||""} onChange={v=>upMDL("ownerDeal",v)} note="Cómo se asigna el owner del deal" />
      <Inp label="Owner del Contacto" value={mdl.ownerContacto||""} onChange={v=>upMDL("ownerContacto",v)} note="Cómo se reasigna el owner del contacto" />
    </div>
  );
}

/* ═══ STEP 12: PROPIEDADES ESPEJO ═══ */
function S12_ESPEJO({d,u}) {
  const numProps = 11;
  const triggerLabel = d.triggerDeal || "Form Submission";
  const motivos = (d.motivosPerdida||[]).length;
  const isEspejo = (d.etapasContactoSync?.fuente || "pipeline") === "pipeline";

  const FlowArrow = ({label, color=tk.accent}) => (
    <div style={{display:"flex",alignItems:"center",gap:6,margin:"6px 0"}}>
      <div style={{flex:1,height:1,background:color}} />
      <span style={{fontSize:10,color,fontWeight:600,whiteSpace:"nowrap",flexShrink:0}}>{label}</span>
      <div style={{width:0,height:0,borderTop:"5px solid transparent",borderBottom:"5px solid transparent",borderLeft:`8px solid ${color}`,flexShrink:0}} />
    </div>
  );

  const PropBadge = ({name}) => (
    <span style={{display:"inline-block",padding:"3px 8px",borderRadius:6,fontSize:10,fontFamily:"monospace",fontWeight:500,background:tk.accentLight,color:tk.navy,border:`1px solid ${tk.accent}25`,margin:"2px"}}>{name}</span>
  );

  return (
    <div>
      <InfoBox type="success">Las propiedades espejo son automáticas. El Adapter v4 crea toda propiedad _fx en AMBOS objetos (contacto y deal). No hay nada que configurar — esta sección es una referencia visual de cómo funciona la sincronización.</InfoBox>

      {/* ── VISUAL FLOW ── */}
      <div style={{border:`1.5px solid ${tk.border}`,borderRadius:14,padding:24,background:tk.card,marginBottom:16}}>
        <p style={{fontSize:13,fontWeight:700,color:tk.navy,margin:"0 0 16px",textAlign:"center",textTransform:"uppercase",letterSpacing:"0.05em"}}>Flujo de datos — Propiedades Espejo</p>

        <div style={{display:"grid",gridTemplateColumns:"1fr 40px 1fr 40px 1fr",alignItems:"center",gap:0}}>
          {/* FORM */}
          <div style={{padding:16,borderRadius:10,background:`${tk.teal}08`,border:`1.5px solid ${tk.teal}30`,textAlign:"center"}}>
            <div style={{fontSize:24,marginBottom:4}}>📝</div>
            <p style={{fontSize:12,fontWeight:700,color:tk.teal,margin:"0 0 4px"}}>Formulario</p>
            <p style={{fontSize:10,color:tk.textTer,margin:0}}>Captura datos del lead</p>
          </div>
          {/* Arrow 1 */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:0,height:0,borderTop:"6px solid transparent",borderBottom:"6px solid transparent",borderLeft:`10px solid ${tk.accent}`}} />
          </div>
          {/* CONTACTO */}
          <div style={{padding:16,borderRadius:10,background:`${tk.accent}08`,border:`2px solid ${tk.accent}40`,textAlign:"center",position:"relative"}}>
            <div style={{fontSize:24,marginBottom:4}}>👤</div>
            <p style={{fontSize:12,fontWeight:700,color:tk.accent,margin:"0 0 4px"}}>Contacto</p>
            <p style={{fontSize:10,color:tk.textTer,margin:0}}>Todas las _fx viven aquí</p>
            <div style={{position:"absolute",top:-8,right:-8,background:tk.accent,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>ORIGEN</div>
          </div>
          {/* Arrow 2 */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2}}>
            <div style={{display:"flex",alignItems:"center"}}>
              <div style={{width:0,height:0,borderTop:"6px solid transparent",borderBottom:"6px solid transparent",borderLeft:`10px solid ${tk.green}`}} />
            </div>
            <div style={{transform:"rotate(180deg)",display:"flex",alignItems:"center"}}>
              <div style={{width:0,height:0,borderTop:"6px solid transparent",borderBottom:"6px solid transparent",borderLeft:`10px solid ${tk.amber}`}} />
            </div>
          </div>
          {/* DEAL */}
          <div style={{padding:16,borderRadius:10,background:`${tk.navy}06`,border:`1.5px solid ${tk.navy}25`,textAlign:"center",position:"relative"}}>
            <div style={{fontSize:24,marginBottom:4}}>💰</div>
            <p style={{fontSize:12,fontWeight:700,color:tk.navy,margin:"0 0 4px"}}>Deal</p>
            <p style={{fontSize:10,color:tk.textTer,margin:0}}>Espejo completo</p>
            <div style={{position:"absolute",top:-8,right:-8,background:tk.navy,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>ESPEJO</div>
          </div>
        </div>

        {/* Flow descriptions */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginTop:16}}>
          <div style={{padding:10,borderRadius:8,background:tk.bg}}>
            <FlowArrow label="ESCRIBE" color={tk.teal} />
            <p style={{fontSize:10,color:tk.textSec,margin:0,lineHeight:1.4}}>El formulario escribe directamente en el contacto. El deal no existe aún.</p>
          </div>
          <div style={{padding:10,borderRadius:8,background:tk.greenBg}}>
            <FlowArrow label="COPIA" color={tk.green} />
            <p style={{fontSize:10,color:tk.textSec,margin:0,lineHeight:1.4}}><strong style={{color:tk.green}}>[Focux]Creación_Deal</strong> copia TODAS las _fx del contacto al deal al crearse.</p>
          </div>
          <div style={{padding:10,borderRadius:8,background:tk.amberBg}}>
            <FlowArrow label="SYNC" color={tk.amber} />
            <p style={{fontSize:10,color:tk.textSec,margin:0,lineHeight:1.4}}><strong style={{color:tk.amber}}>[Focux]Sync_Etapa_Deal</strong> copia etapa + motivo_perdida_fx del deal al contacto.</p>
          </div>
        </div>
      </div>

      {/* ── EXCEPTIONS ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div style={{padding:14,borderRadius:10,border:`1.5px solid ${tk.amber}30`,background:tk.amberBg}}>
          <p style={{fontSize:12,fontWeight:700,color:"#92400E",margin:"0 0 6px"}}>Excepción: canal_origen_fx</p>
          <p style={{fontSize:11,color:"#92400E",margin:0,lineHeight:1.5}}>El canal del deal se <strong>congela</strong> al momento de creación. Si el contacto vuelve por otro canal después, el deal anterior mantiene su canal original. Esto preserva la atribución correcta por negocio.</p>
        </div>
        <div style={{padding:14,borderRadius:10,border:`1.5px solid ${tk.accent}30`,background:tk.accentLight}}>
          <p style={{fontSize:12,fontWeight:700,color:tk.navy,margin:"0 0 6px"}}>Motivos de pérdida</p>
          <p style={{fontSize:11,color:tk.navy,margin:0,lineHeight:1.5}}>Los <strong>{motivos} motivos unificados</strong> aplican tanto para contacto como para deal. Una sola propiedad <code style={{fontFamily:"monospace",fontSize:10}}>motivo_perdida_fx</code>, mismas opciones, espejo completo.</p>
        </div>
      </div>

      {/* ── PROPERTIES LIST ── */}
      <div style={{padding:14,borderRadius:10,border:`1px solid ${tk.border}`,background:tk.bg}}>
        <p style={{fontSize:12,fontWeight:700,color:tk.navy,margin:"0 0 8px"}}>Propiedades espejo principales</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
          {["proyecto_activo_fx","lista_proyectos_fx","canal_origen_fx","categoria_calificacion_fx","rango_ingresos_fx","etapa_lead_fx","motivo_perdida_fx","proposito_compra_fx","asesor_anterior_fx","cedula_fx","id_externo_fx"].map(p=><PropBadge key={p} name={p} />)}
        </div>
        <p style={{fontSize:10,color:tk.textTer,margin:"8px 0 0"}}>Todas estas propiedades se crean en contacto Y en deal por el Adapter v4. Variables de calificación activas también se incluyen como espejo.</p>
      </div>

      {/* ── STATUS ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginTop:14}}>
        <div style={{padding:10,borderRadius:8,background:tk.greenBg,textAlign:"center",border:`1px solid ${tk.green}25`}}>
          <p style={{margin:0,fontSize:18,fontWeight:800,color:tk.green,fontFamily:font}}>{isEspejo ? "Sync" : "Manual"}</p>
          <p style={{margin:"2px 0 0",fontSize:10,color:tk.green}}>Modelo etapas</p>
        </div>
        <div style={{padding:10,borderRadius:8,background:tk.accentLight,textAlign:"center",border:`1px solid ${tk.accent}25`}}>
          <p style={{margin:0,fontSize:18,fontWeight:800,color:tk.accent,fontFamily:font}}>{motivos}</p>
          <p style={{margin:"2px 0 0",fontSize:10,color:tk.accent}}>Motivos unificados</p>
        </div>
        <div style={{padding:10,borderRadius:8,background:`${tk.navy}08`,textAlign:"center",border:`1px solid ${tk.navy}20`}}>
          <p style={{margin:0,fontSize:18,fontWeight:800,color:tk.navy,fontFamily:font}}>2x</p>
          <p style={{margin:"2px 0 0",fontSize:10,color:tk.navy}}>Cada _fx en ambos objetos</p>
        </div>
      </div>
    </div>
  );
}

/* ═══ STEP 13: WORKFLOWS ═══ */
function S13_WF({d,u}) {
  const wf = d.workflows || DEF_WORKFLOWS;
  const upWF=(f,v)=>u("workflows",{...wf,[f]:v});
  const upGlobal=(i,f,v)=>{const n=[...(wf.globales||[])];n[i]={...n[i],[f]:v};upWF("globales",n)};
  const rmGlobal=(i)=>{const n=[...(wf.globales||[])];n.splice(i,1);upWF("globales",n)};
  const upProyecto=(i,f,v)=>{const n=[...(wf.porProyecto||[])];n[i]={...n[i],[f]:v};upWF("porProyecto",n)};
  const numCalif = (d.macros||[]).filter(m=>m.nombre).length;
  const totalWf = numCalif + (wf.globales||[]).length;
  return (
    <div>
      <InfoBox>Naming convention: <code style={{fontFamily:"monospace",fontSize:11}}>[Focux]Acción_Contexto</code>. Total estimado: {totalWf} workflows ({numCalif} por proyecto + {(wf.globales||[]).length} globales).</InfoBox>
      <Inp label="Naming Convention" value={wf.namingConvention||""} onChange={v=>upWF("namingConvention",v)} mono />

      <SectionHead sub={`Se clona 1 por cada proyecto activo = ${numCalif} workflows`}>Workflows por Proyecto</SectionHead>
      {(wf.porProyecto||[]).map((wp,i)=>(
        <Card key={i} title={wp.nombre||`WF por proyecto ${i+1}`} accent>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Inp label="Nombre template" value={wp.nombre||""} onChange={v=>upProyecto(i,"nombre",v)} mono />
            <Inp label="Tipo" value={wp.tipo||""} onChange={v=>upProyecto(i,"tipo",v)} />
          </div>
          <Inp label="Trigger" value={wp.trigger||""} onChange={v=>upProyecto(i,"trigger",v)} />
          <Inp label="Lógica" value={wp.logica||""} onChange={v=>upProyecto(i,"logica",v)} />
          <div style={{marginTop:8}}>
            <p style={{fontSize:11,color:tk.textSec,margin:0}}>Proyectos que generan este workflow:</p>
            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
              {(d.macros||[]).filter(m=>m.nombre).map((m,mi)=>(
                <Badge key={mi} text={m.nombre} color={tk.accent} />
              ))}
            </div>
          </div>
        </Card>
      ))}

      <SectionHead sub="Workflows que aplican a todos los proyectos">Workflows Globales</SectionHead>
      {(wf.globales||[]).map((wg,i)=>(
        <Card key={i} title={wg.nombre||`WF global ${i+1}`} onRemove={()=>rmGlobal(i)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Inp label="Nombre" value={wg.nombre||""} onChange={v=>upGlobal(i,"nombre",v)} mono />
            <Inp label="Tipo" value={wg.tipo||""} onChange={v=>upGlobal(i,"tipo",v)} />
          </div>
          <Inp label="Trigger" value={wg.trigger||""} onChange={v=>upGlobal(i,"trigger",v)} />
          <Inp label="Lógica" value={wg.logica||""} onChange={v=>upGlobal(i,"logica",v)} />
        </Card>
      ))}
      <AddBtn onClick={()=>upWF("globales",[...(wf.globales||[]),{id:`WF-G${(wf.globales||[]).length+1}`,nombre:"[Focux]",cantidad:1,tipo:"CONTACT_FLOW",trigger:"",logica:""}])} label="Agregar workflow global" />
    </div>
  );
}

/* ═══ STEP 14: VALIDATION v8 ═══ */
function S14({d}) {
  const {w,e}=validate(d);
  const fillSteps=10;
  const allConfigSteps=13;
  const fillPcts=Array.from({length:fillSteps},(_,i)=>calcPct(d,i));
  const allPcts=Array.from({length:allConfigSteps},(_,i)=>calcPct(d,i));
  const avgFill=Math.round(fillPcts.reduce((a,b)=>a+b,0)/fillSteps);
  const execPct=calcPct(d,12);
  return (
    <div>
      <div style={{padding:16,background:avgFill===100?tk.greenBg:avgFill>70?tk.amberBg:tk.redBg,borderRadius:12,marginBottom:16,textAlign:"center"}}>
        <p style={{fontSize:32,fontWeight:800,color:avgFill===100?tk.green:avgFill>70?tk.amber:tk.red,margin:0,fontFamily:font}}>{avgFill}%</p>
        <p style={{fontSize:13,color:tk.text,margin:"4px 0 0"}}>Completitud de la configuración</p>
      </div>
      <p style={{fontSize:11,color:tk.textTer,margin:"0 0 8px",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.05em"}}>Pasos de llenado</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:12}}>
        {STEPS.slice(0,fillSteps).map((s,i)=>{const p=fillPcts[i];return(
          <div key={i} style={{padding:8,borderRadius:8,background:p===100?tk.greenBg:p>50?tk.amberBg:tk.redBg,textAlign:"center",border:`1px solid ${p===100?tk.green+"30":p>50?tk.amber+"30":tk.red+"30"}`}}>
            <p style={{margin:0,fontSize:16}}>{s.i}</p>
            <p style={{margin:"2px 0 0",fontSize:14,fontWeight:700,color:p===100?tk.green:p>50?tk.amber:tk.red}}>{p}%</p>
          </div>
        )})}
      </div>
      <p style={{fontSize:11,color:tk.textTer,margin:"12px 0 8px",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.05em"}}>Estado de proceso</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:20}}>
        {STEPS.slice(fillSteps,allConfigSteps).map((s,i)=>{const p=allPcts[fillSteps+i];return(
          <div key={i} style={{padding:8,borderRadius:8,background:p===100?tk.greenBg:p>50?tk.amberBg:tk.bg,textAlign:"center",border:`1px solid ${p===100?tk.green+"30":p>50?tk.amber+"30":tk.border}`}}>
            <p style={{margin:0,fontSize:16}}>{s.i}</p>
            <p style={{margin:"2px 0 0",fontSize:12,fontWeight:700,color:p===100?tk.green:p>50?tk.amber:tk.textTer}}>{p}%</p>
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
      {!e.length&&!w.length&&<div style={{textAlign:"center",padding:20}}><p style={{fontSize:16,color:tk.green,fontWeight:700}}>Todo validado. Listo para ejecutar.</p></div>}
    </div>
  );
}

/* ═══ STEP 15: EXECUTION (same structure as v7 S11) ═══ */
function S15({d,u}) {
  const enriched=useMemo(()=>buildExportPayload(d),[d]);
  const prms=useMemo(()=>genPrompts(enriched),[enriched]);
  const ex=d.ex||{};const cats=[...new Set(prms.map(p=>p.cat))];const totE=Object.values(ex).filter(Boolean).length;
  const[mode,setM]=useState(false);const[ci,setCi]=useState(0);
  const cp=t=>navigator.clipboard.writeText(t).catch(()=>{});
  const expJ=()=>downloadJSON(buildExportPayload(d),`${d.nombreConst||"config"}_focuxai.json`);
  const eP=prms.filter(p=>p.tp==="exec").length, sP=prms.filter(p=>p.tp==="spec").length;

  if(mode){const cur=prms[ci];
    if(!cur) return(<div style={{textAlign:"center",padding:40}}><p style={{fontSize:20,color:tk.green,fontWeight:700}}>Implementación completa!</p><p style={{color:tk.textSec,marginTop:8}}>Todos los {prms.length} pasos ejecutados.</p><button onClick={()=>setM(false)} style={{marginTop:16,padding:"10px 24px",borderRadius:8,border:"none",background:tk.navy,color:"#fff",cursor:"pointer",fontWeight:600,fontFamily:font,fontSize:14}}>Ver resumen</button></div>);
    return(
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><Badge text={cur.tp==="exec"?"Breeze":"Manual"} color={cur.tp==="exec"?tk.accent:tk.amber} /><span style={{fontSize:12,color:tk.textSec}}>Paso {ci+1} de {prms.length}</span></div>
          <button onClick={()=>setM(false)} style={{fontSize:12,color:tk.textSec,background:"none",border:`1.5px solid ${tk.border}`,borderRadius:6,padding:"5px 12px",cursor:"pointer",fontFamily:font}}>Salir modo guiado</button>
        </div>
        <div style={{background:tk.border,borderRadius:6,padding:2,marginBottom:14}}><div style={{height:4,borderRadius:4,background:`linear-gradient(90deg,${tk.teal},${tk.cyan})`,width:`${((ci+1)/prms.length)*100}%`,transition:"width 0.4s ease"}}/></div>
        <h3 style={{color:tk.navy,fontSize:16,fontWeight:700,margin:"0 0 10px"}}>{cur.id}</h3>
        <div style={{background:tk.bg,border:`1.5px solid ${tk.border}`,borderRadius:10,padding:16,marginBottom:14}}>
          <pre style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:tk.text,whiteSpace:"pre-wrap",margin:0,lineHeight:1.6}}>{cur.pr}</pre>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>cp(cur.pr)} style={{padding:"9px 20px",borderRadius:8,border:"none",background:tk.accent,color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600,fontFamily:font}}>Copiar</button>
          <button onClick={()=>{u("ex",{...ex,[cur.id]:true});setCi(ci+1)}} style={{padding:"9px 20px",borderRadius:8,border:"none",background:tk.green,color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600,fontFamily:font}}>Hecho → Siguiente</button>
          <button onClick={()=>setCi(ci+1)} style={{padding:"9px 20px",borderRadius:8,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.textSec,fontSize:13,cursor:"pointer",fontFamily:font}}>Saltar</button>
        </div>
        <div style={{marginTop:14}}><Inp label="Notas de verificación" value={(d.vn||{})[cur.id]||""} onChange={v=>u("vn",{...(d.vn||{}),[cur.id]:v})} placeholder="Pega aquí el resumen o tus notas..." /></div>
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <p style={{margin:0,fontSize:13,fontWeight:600,color:tk.text}}>{prms.length} pasos · <span style={{color:tk.green}}>{totE} hechos</span> · <span style={{color:tk.amber}}>{prms.length-totE} pendientes</span></p>
          <p style={{margin:"2px 0 0",fontSize:11,color:tk.textTer}}>Estimado: ~{Math.round((eP*1.5+sP*5)/60*10)/10} horas</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>{setM(true);const idx=prms.findIndex(p=>!ex[p.id]);setCi(idx>=0?idx:0)}} style={{padding:"8px 16px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${tk.teal},${tk.blue})`,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>Modo Guiado</button>
          <button onClick={expJ} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.text,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>JSON</button>
        </div>
      </div>
      {cats.map(cat=>{const ps=prms.filter(p=>p.cat===cat);return(
        <div key={cat} style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:6,marginBottom:8,borderBottom:`1.5px solid ${tk.border}`}}>
            <h3 style={{margin:0,fontSize:13,fontWeight:700,color:tk.navy}}>{cat}</h3>
            <span style={{fontSize:11,color:tk.textTer,fontWeight:600}}>{ps.filter(p=>ex[p.id]).length}/{ps.length}</span>
          </div>
          {ps.map(pr=>(
            <div key={pr.id} style={{border:`1.5px solid ${ex[pr.id]?tk.green+"40":tk.border}`,borderRadius:8,padding:10,marginBottom:8,background:ex[pr.id]?tk.greenBg:tk.card,transition:"all 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:tk.navy}}>{pr.id}</span><Badge text={pr.tp==="exec"?"Breeze":"Manual"} color={pr.tp==="exec"?tk.accent:tk.amber} /></div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>cp(pr.pr)} style={{padding:"3px 10px",borderRadius:5,border:`1.5px solid ${tk.accent}30`,background:tk.card,color:tk.accent,fontSize:10,cursor:"pointer",fontWeight:600}}>Copiar</button>
                  <label style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:tk.green,cursor:"pointer",fontWeight:600}}>
                    <input type="checkbox" checked={!!ex[pr.id]} onChange={()=>u("ex",{...ex,[pr.id]:!ex[pr.id]})} style={{accentColor:tk.green,width:14,height:14}} />
                  </label>
                </div>
              </div>
              <pre style={{fontFamily:"monospace",fontSize:10,color:tk.textSec,margin:0,whiteSpace:"pre-wrap",lineHeight:1.5,maxHeight:100,overflow:"auto"}}>{pr.pr}</pre>
            </div>
          ))}
        </div>
      )})}
    </div>
  );
}

/* ═══ STEP 16: OBJECIONES (same as v7 S12) ═══ */
function S16({d,u}) {
  const[f,sF]=useState("Todas");
  const cs=["Todas",...new Set(OBJS.map(o=>o.c))];
  const fl=f==="Todas"?OBJS:OBJS.filter(o=>o.c===f);
  return(
    <div>
      <p style={{fontSize:13,color:tk.textSec,marginBottom:14,lineHeight:1.5}}>Respuestas probadas a las objeciones más comunes durante talleres de kickoff e implementación.</p>
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

/* ═══ STEP 17: METRICS v8 ═══ */
function S17({d}) {
  const ms=d.macros||[];const enriched=buildExportPayload(d);const prms=genPrompts(enriched);const en=Object.values(d.ex||{}).filter(Boolean).length;
  const eP=prms.filter(p=>p.tp==="exec").length,sP=prms.filter(p=>p.tp==="spec").length;
  const totalBuyers=ms.reduce((a,m)=>a+(m.buyers||[]).length,0);
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
        {[["Macroproyectos",ms.length,"🏗️"],["Torres",ms.reduce((a,m)=>a+(m.torres||[]).length,0),"🏠"],["Asesores",ms.reduce((a,m)=>a+(m.asesores||[]).length,0),"👥"],["Buyer Personas",totalBuyers,"🎯"],
          ["Canales",d.chStd.filter(c=>c.a).length+d.chTr.filter(c=>c.a).length+d.chCu.filter(Boolean).length,"📡"],["Total Pasos",prms.length,"🚀"],["Ejecutados",en,"✅"],["Pendientes",prms.length-en,"⏳"],
          ["Niveles Calif",d.niveles.length,"⭐"],["Etapas Pipeline",d.pipeline.length,"📊"],["Motivos Pérdida",(d.motivosPerdida||[]).length,"📋"],["Workflows",(d.workflows?.globales||[]).length+(d.macros||[]).filter(m=>m.nombre).length,"⚡"]].map(([l,v,icon],i)=>(
          <div key={i} style={{padding:14,background:tk.card,borderRadius:10,textAlign:"center",border:`1px solid ${tk.border}`}}>
            <p style={{margin:0,fontSize:20}}>{icon}</p>
            <p style={{margin:"4px 0 0",fontSize:22,fontWeight:800,color:tk.navy,fontFamily:font}}>{v}</p>
            <p style={{margin:"2px 0 0",fontSize:10,color:tk.textTer,fontWeight:600}}>{l}</p>
          </div>
        ))}
      </div>
      <Card>
        <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.navy}}>Proyectos</p>
        {ms.map((m,i)=>(
          <p key={i} style={{margin:"4px 0 0",fontSize:12,color:tk.textSec}}>
            {m.nombre||`Macro ${i+1}`}: {m.ciudad} · {m.tipo} · {(m.torres||[]).length} torres · {(m.asesores||[]).length} asesores · {(m.buyers||[]).length} buyers
          </p>
        ))}
      </Card>
      <Card>
        <p style={{margin:0,fontSize:12,fontWeight:700,color:tk.navy}}>Suscripción</p>
        <p style={{margin:"4px 0 0",fontSize:12,color:tk.textSec}}>Sales: {d.hubSales} · Marketing: {d.hubMarketing} · Service: {d.hubService} · Content: {d.hubContent}</p>
      </Card>
      <div style={{padding:14,background:tk.bg,borderRadius:10,textAlign:"center",marginTop:12,border:`1px solid ${tk.border}`}}>
        <p style={{margin:0,fontSize:13,fontWeight:700,color:tk.navy}}>Tiempo estimado de ejecución técnica</p>
        <p style={{margin:"4px 0 0",fontSize:24,fontWeight:800,color:tk.accent,fontFamily:font}}>~{Math.round((eP*1.5+sP*5)/60*10)/10} horas</p>
        <p style={{margin:"6px 0 0",fontSize:10,color:tk.textTer,lineHeight:1.4}}>
          {eP} pasos automatizados (×1.5 min) + {sP} pasos manuales (×5 min). Tiempo que toma el consultor ejecutando los prompts y configuraciones en HubSpot. No incluye kickoff, capacitación ni reuniones.
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HOME SCREEN — Multi-Client Central (same as v7)
   ═══════════════════════════════════════════════════════════ */
function fmtDate(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function HomeScreen({ clients, onOpen, onNew, onDelete, onImport, onExport }) {
  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);
  return (
    <div style={{ fontFamily:font, background:tk.bg, minHeight:"100vh", color:tk.text }}>
      <div style={{ background:`linear-gradient(135deg, ${tk.navy} 0%, ${tk.blue} 50%, ${tk.teal} 100%)`, padding:"40px 24px 48px", textAlign:"center" }}>
        <img src={FOCUX_LOGO} alt="Focux" style={{ height:60, marginBottom:12, filter:"brightness(0) invert(1)" }} />
        <h1 style={{ margin:0, color:"#fff", fontSize:22, fontWeight:800, letterSpacing:"0.05em" }}>FOCUXAI OPS</h1>
        <p style={{ margin:0, color:"rgba(255,255,255,0.6)", fontSize:13, fontWeight:500 }}>HubSpot Implementation Engine v8 — Central de Clientes</p>
      </div>
      <div style={{ maxWidth:900, margin:"-28px auto 0", padding:"0 20px 40px" }}>
        <div style={{ display:"flex", gap:10, marginBottom:24, flexWrap:"wrap" }}>
          <button onClick={onNew} style={{ padding:"12px 24px", borderRadius:10, border:"none", background:`linear-gradient(135deg, ${tk.teal}, ${tk.blue})`, color:"#fff", fontSize:14, cursor:"pointer", fontWeight:700, fontFamily:font, boxShadow:"0 4px 14px rgba(13,122,181,0.35)", transition:"all 0.2s" }}>+ Nuevo Cliente</button>
          <button onClick={()=>fileRef.current?.click()} style={{ padding:"12px 24px", borderRadius:10, border:`1.5px solid ${tk.border}`, background:tk.card, color:tk.textSec, fontSize:14, cursor:"pointer", fontWeight:600, fontFamily:font, transition:"all 0.2s" }}>Importar JSON</button>
          <input ref={fileRef} type="file" accept=".json" style={{display:"none"}} onChange={e => {
            const file = e.target.files?.[0]; if(!file) return;
            const reader = new FileReader();
            reader.onload = ev => { try { onImport(JSON.parse(ev.target.result)); } catch { alert("Archivo JSON inválido"); } };
            reader.readAsText(file); e.target.value = "";
          }} />
        </div>
        {clients.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 20px", background:tk.card, borderRadius:16, border:`1.5px dashed ${tk.border}` }}>
            <img src={FOCUX_ICON} alt="Focux" style={{ width:64, height:64, margin:"0 auto 12px", display:"block", opacity:0.3 }} />
            <p style={{ fontSize:16, fontWeight:700, color:tk.navy, margin:"0 0 6px" }}>Sin clientes configurados</p>
            <p style={{ fontSize:13, color:tk.textSec, margin:0 }}>Crea tu primer cliente para comenzar una implementación HubSpot.</p>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:14 }}>
            {clients.map(cl => {
              const pct = cl.pct || 0;
              const pctColor = pct === 100 ? tk.green : pct > 50 ? tk.amber : pct > 0 ? tk.accent : tk.textTer;
              return (
                <div key={cl.id} style={{ background:tk.card, borderRadius:14, border:`1.5px solid ${tk.border}`, overflow:"hidden", cursor:"pointer", transition:"all 0.2s", position:"relative" }}
                  onClick={() => onOpen(cl.id)}
                  onMouseOver={e => { e.currentTarget.style.borderColor = tk.accent; e.currentTarget.style.boxShadow = "0 4px 20px rgba(13,122,181,0.12)"; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = tk.border; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ height:4, background:tk.borderLight }}><div style={{ height:4, background:pctColor, width:`${pct}%`, transition:"width 0.3s" }} /></div>
                  <div style={{ padding:"16px 18px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:tk.navy, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{cl.name || "Sin nombre"}</h3>
                        {cl.domain && <p style={{ margin:"2px 0 0", fontSize:11, color:tk.textTer }}>{cl.domain}</p>}
                      </div>
                      <span style={{ fontSize:14, fontWeight:800, color:pctColor, flexShrink:0, marginLeft:8 }}>{pct}%</span>
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                      {cl.macros > 0 && <Badge text={`${cl.macros} proy`} color={tk.accent} />}
                      {cl.sales && cl.sales !== "No" && <Badge text={`Sales ${cl.sales}`} color={tk.teal} />}
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <p style={{ margin:0, fontSize:10, color:tk.textTer }}>{cl.updatedAt ? fmtDate(cl.updatedAt) : "—"}</p>
                      <div style={{ display:"flex", gap:4 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => onExport(cl.id)} title="Exportar JSON" style={{ background:"none", border:`1px solid ${tk.border}`, borderRadius:6, width:28, height:28, fontSize:12, cursor:"pointer", color:tk.textSec, display:"flex", alignItems:"center", justifyContent:"center" }} onMouseOver={e=>e.currentTarget.style.borderColor=tk.accent} onMouseOut={e=>e.currentTarget.style.borderColor=tk.border}>📤</button>
                        <button onClick={() => setConfirm(cl.id)} title="Eliminar" style={{ background:"none", border:`1px solid ${tk.border}`, borderRadius:6, width:28, height:28, fontSize:12, cursor:"pointer", color:tk.textTer, display:"flex", alignItems:"center", justifyContent:"center" }} onMouseOver={e=>{e.currentTarget.style.borderColor=tk.red;e.currentTarget.style.color=tk.red}} onMouseOut={e=>{e.currentTarget.style.borderColor=tk.border;e.currentTarget.style.color=tk.textTer}}>🗑</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {confirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:1000, backdropFilter:"blur(4px)" }}>
          <div style={{ background:tk.card, borderRadius:16, padding:24, maxWidth:400, textAlign:"center", boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <h3 style={{ margin:"0 0 8px", color:tk.navy, fontSize:16, fontWeight:700 }}>¿Eliminar este cliente?</h3>
            <p style={{ margin:"0 0 20px", fontSize:13, color:tk.textSec }}>Esta acción eliminará toda la configuración y versiones guardadas. No se puede deshacer.</p>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={() => setConfirm(null)} style={{ padding:"10px 24px", borderRadius:8, border:`1.5px solid ${tk.border}`, background:tk.card, color:tk.textSec, fontSize:13, cursor:"pointer", fontWeight:600, fontFamily:font }}>Cancelar</button>
              <button onClick={() => { onDelete(confirm); setConfirm(null); }} style={{ padding:"10px 24px", borderRadius:8, border:"none", background:tk.red, color:"#fff", fontSize:13, cursor:"pointer", fontWeight:600, fontFamily:font }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ VERSION PANEL ═══ */
function VersionPanel({ open, onClose, versions, onRestore }) {
  if (!open) return null;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", display:"flex", justifyContent:"flex-end", zIndex:1000, backdropFilter:"blur(4px)" }} onClick={onClose}>
      <div style={{ width:380, maxWidth:"90vw", background:tk.card, height:"100%", overflow:"auto", padding:24, boxShadow:"-8px 0 30px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h3 style={{ margin:0, color:tk.navy, fontSize:16, fontWeight:700 }}>Historial de Versiones</h3>
          <button onClick={onClose} style={{ background:tk.bg, border:"none", width:32, height:32, borderRadius:8, fontSize:18, cursor:"pointer", color:tk.textSec, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
        {versions.length === 0 ? (
          <p style={{ fontSize:13, color:tk.textTer, textAlign:"center", padding:20 }}>No hay versiones guardadas aún.</p>
        ) : (
          versions.map((v, i) => (
            <div key={i} style={{ padding:12, background:i===0?tk.accentLight:tk.bg, borderRadius:10, marginBottom:8, border:`1px solid ${i===0?tk.accent+"30":tk.border}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <span style={{ fontSize:12, fontWeight:700, color:tk.navy }}>{v.label}</span>
                {i === 0 && <Badge text="Más reciente" color={tk.green} />}
              </div>
              <p style={{ margin:"0 0 8px", fontSize:11, color:tk.textTer }}>{fmtDate(v.ts)}</p>
              <button onClick={() => onRestore(v.data)} style={{ padding:"5px 14px", borderRadius:6, border:`1.5px solid ${tk.accent}`, background:tk.card, color:tk.accent, fontSize:11, cursor:"pointer", fontWeight:600, fontFamily:font }}>Restaurar</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   WIZARD SHELL — Client workspace (updated Comps array)
   ═══════════════════════════════════════════════════════════ */
function WizardShell({ clientId, initialData, onBack, onSave }) {
  const [d, setD] = useState(initialData);
  const [saving, sSv] = useState(false);
  const [verOpen, setVerOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const lastSnap = useRef(Date.now());

  const persist = useCallback(async (nd, label) => {
    sSv(true);
    await saveClient(clientId, nd);
    const idx = await loadIndex();
    const ci = idx.findIndex(c => c.id === clientId);
    if (ci >= 0) {
      idx[ci] = { ...idx[ci], name: nd.nombreConst, domain: nd.dominio, macros: (nd.macros||[]).length, sales: nd.hubSales, pct: calcOverallPct(nd), updatedAt: Date.now() };
      await saveIndex(idx);
    }
    const now = Date.now();
    if (now - lastSnap.current > 90000) {
      await pushVersion(clientId, nd, label || "Auto-save");
      lastSnap.current = now;
    }
    onSave();
    setTimeout(() => sSv(false), 400);
  }, [clientId, onSave]);

  const u = useCallback((f, v) => { setD(prev => { const next = { ...prev, [f]: v }; persist(next); return next; }); }, [persist]);
  const goTo = step => { const next = { ...d, step }; setD(next); persist(next, `Paso ${step}: ${STEPS[step]?.t||""}`); };

  const openVersions = async () => { setVersions(await loadVersions(clientId)); setVerOpen(true); };
  const restoreVersion = async (data) => {
    await pushVersion(clientId, d, "Pre-restauración");
    const normalized = normalizeImport(data);
    setD(normalized);
    await persist(normalized, "Restauración manual");
    setVerOpen(false);
  };

  const exportJSON = () => downloadJSON(buildExportPayload(d), `${d.nombreConst || "config"}_focuxai.json`);

  const Comps = [S0, S1, S2, S3, S4, S5, S6, S7, S8, S9, S17, S14, S15, S10_UTM, S11_MULTI, S12_ESPEJO, S13_WF, S16];
  const Cur = Comps[d.step] || S0;

  return (
    <div style={{ fontFamily: font, background: tk.bg, minHeight: "100vh", color: tk.text }}>
      <VersionPanel open={verOpen} onClose={() => setVerOpen(false)} versions={versions} onRestore={restoreVersion} />
      <div style={{ background: `linear-gradient(135deg, ${tk.navy} 0%, ${tk.blue} 50%, ${tk.teal} 100%)`, padding: "0 24px", height: 52, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={async () => { await pushVersion(clientId, d, "Salida manual"); onBack(); }} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", fontSize: 16 }} title="Volver al Home">←</button>
          <img src={FOCUX_ICON} alt="Focux" style={{ height:28, borderRadius:4 }} />
          <div>
            <h1 style={{ margin: 0, color: "#fff", fontSize: 14, fontWeight: 800, letterSpacing: "0.05em" }}>FOCUXAI OPS v8</h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 500 }}>HubSpot Implementation Engine</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Guardando...</span>}
          <button onClick={openVersions} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, padding: "5px 10px", color: "rgba(255,255,255,0.8)", fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: font }} title="Historial de versiones">Versiones</button>
          <button onClick={exportJSON} style={{ background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, padding: "5px 10px", color: "rgba(255,255,255,0.8)", fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: font }} title="Exportar JSON">JSON</button>
          {d.nombreConst && <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, marginLeft: 4 }}>{d.nombreConst}</span>}
        </div>
      </div>
      <div style={{ display: "flex", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ width: 220, minHeight: "calc(100vh - 52px)", background: tk.card, borderRight: `1px solid ${tk.border}`, padding: "16px 0", flexShrink: 0, overflow: "auto" }}>
          {STEPS.map((s, i) => {
            const pct = calcPct(d, i);
            const active = d.step === i;
            const isRef = s.section === "ref";
            const isFirstRef = isRef && (i === 0 || STEPS[i-1].section !== "ref");
            return (
              <div key={i}>
                {isFirstRef && (
                  <div style={{padding:"12px 16px 6px",display:"flex",alignItems:"center",gap:8}}>
                    <div style={{flex:1,height:1,background:tk.border}} />
                    <span style={{fontSize:9,fontWeight:700,color:tk.textTer,textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap"}}>Referencia</span>
                    <div style={{flex:1,height:1,background:tk.border}} />
                  </div>
                )}
                <button onClick={() => goTo(i)} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px",
                  background: active ? tk.accentLight : "transparent",
                  border: "none", cursor: "pointer", textAlign: "left",
                  borderRight: active ? `3px solid ${tk.accent}` : "3px solid transparent",
                  transition: "all 0.15s", fontFamily: font,
                  opacity: isRef ? 0.75 : 1,
                }}>
                  <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{s.i}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: active ? 700 : 500, color: active ? tk.navy : tk.textSec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.t}</p>
                    {pct >= 0 && !isRef && (
                      <div style={{ height: 3, borderRadius: 2, background: tk.borderLight, marginTop: 4 }}>
                        <div style={{ height: 3, borderRadius: 2, background: pct === 100 ? tk.green : pct > 50 ? tk.amber : tk.red, width: `${pct}%`, transition: "width 0.3s" }} />
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, padding: "28px 32px", maxWidth: 820, overflow: "auto" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>{STEPS[d.step].i}</span>
              <h2 style={{ margin: 0, color: tk.navy, fontSize: 22, fontWeight: 800 }}>{STEPS[d.step].t}</h2>
            </div>
            <p style={{ margin: 0, color: tk.textTer, fontSize: 13 }}>{STEPS[d.step].d}</p>
          </div>
          <Cur d={d} u={u} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, paddingTop: 20, borderTop: `1px solid ${tk.border}` }}>
            <button onClick={() => goTo(Math.max(0, d.step - 1))} disabled={d.step === 0}
              style={{ padding: "10px 24px", borderRadius: 8, border: `1.5px solid ${tk.border}`, background: tk.card, color: d.step === 0 ? tk.textTer : tk.text, fontSize: 13, cursor: d.step === 0 ? "default" : "pointer", fontWeight: 600, fontFamily: font, opacity: d.step === 0 ? 0.5 : 1, transition: "all 0.2s" }}>← Anterior</button>
            <button onClick={() => goTo(Math.min(STEPS.length - 1, d.step + 1))} disabled={d.step === STEPS.length - 1}
              style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: d.step === STEPS.length - 1 ? tk.border : `linear-gradient(135deg, ${tk.teal}, ${tk.blue})`, color: "#fff", fontSize: 13, cursor: d.step === STEPS.length - 1 ? "default" : "pointer", fontWeight: 600, fontFamily: font, transition: "all 0.2s", boxShadow: d.step === STEPS.length - 1 ? "none" : "0 2px 8px rgba(13,122,181,0.3)" }}>Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN APP — Router (uses normalizeImport for backward compat)
   ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [ready, setReady] = useState(false);
  const [clients, setClients] = useState([]);
  const [activeClient, setActiveClient] = useState(null);

  const refreshClients = useCallback(async () => {
    const idx = await loadIndex();
    setClients(idx);
  }, []);

  useEffect(() => {
    (async () => {
      const idx = await loadIndex();
      if (idx.length === 0) {
        try {
          const old = await sGet("focuxai-v4");
          if (old && old.nombreConst) {
            const id = uid();
            const data = normalizeImport(old);
            await saveClient(id, data);
            const meta = { id, name: data.nombreConst, domain: data.dominio, macros: (data.macros||[]).length, sales: data.hubSales, pct: calcOverallPct(data), updatedAt: Date.now() };
            await saveIndex([meta]);
            await pushVersion(id, data, "Migración v4→v8");
            setClients([meta]);
          } else { setClients([]); }
        } catch { setClients([]); }
      } else {
        setClients(idx);
      }
      setReady(true);
    })();
  }, []);

  const openClient = async (id) => {
    const data = await loadClient(id);
    if (data) {
      setActiveClient({ id, data: normalizeImport(data) });
    }
  };

  const newClient = async () => {
    const id = uid();
    const data = makeBlankState();
    await saveClient(id, data);
    const meta = { id, name: "", domain: "", macros: 0, sales: "No", pct: 0, updatedAt: Date.now() };
    const idx = await loadIndex();
    idx.unshift(meta);
    await saveIndex(idx);
    await pushVersion(id, data, "Creación");
    setClients(idx);
    setActiveClient({ id, data });
  };

  const deleteClientHandler = async (id) => {
    await deleteClient(id);
    const idx = (await loadIndex()).filter(c => c.id !== id);
    await saveIndex(idx);
    setClients(idx);
  };

  const importJSON = async (jsonData) => {
    const id = uid();
    const data = normalizeImport(jsonData);
    await saveClient(id, data);
    const meta = { id, name: data.nombreConst, domain: data.dominio, macros: (data.macros||[]).length, sales: data.hubSales, pct: calcOverallPct(data), updatedAt: Date.now() };
    const idx = await loadIndex();
    idx.unshift(meta);
    await saveIndex(idx);
    await pushVersion(id, data, "Importación JSON");
    setClients(idx);
    setActiveClient({ id, data });
  };

  const exportClient = async (id) => {
    const data = await loadClient(id);
    if (!data) return;
    downloadJSON(buildExportPayload(data), `${data.nombreConst || "config"}_focuxai.json`);
  };

  if (!ready) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: tk.bg, fontFamily: font }}>
      <div style={{ textAlign: "center" }}>
        <img src={FOCUX_ICON} alt="Focux" style={{ width:48, height:48, animation:"spin 0.8s linear infinite", margin:"0 auto 12px", display:"block" }} />
        <p style={{ color: tk.textSec, fontSize: 13 }}>Cargando FocuxAI Ops v8...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  if (activeClient) {
    return (
      <WizardShell
        clientId={activeClient.id}
        initialData={activeClient.data}
        onBack={() => { refreshClients(); setActiveClient(null); }}
        onSave={refreshClients}
      />
    );
  }

  return (
    <HomeScreen
      clients={clients}
      onOpen={openClient}
      onNew={newClient}
      onDelete={deleteClientHandler}
      onImport={importJSON}
      onExport={exportClient}
    />
  );
}
