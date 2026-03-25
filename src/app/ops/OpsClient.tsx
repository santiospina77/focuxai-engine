// @ts-nocheck
"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   FOCUXAI OPS v7 — Multi-Client Implementation Engine
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

/* ═══ METHODOLOGY DEFAULTS (Focux standard — NOT demo data) ═══ */
const DEF_CH = ["Pauta Facebook-IG","Pauta Google","Sitio Web","Mail Marketing","Redes Sociales Orgánicas","Búsqueda Orgánica","Sala de Ventas Física","Referido","Importación Base de Datos","Feria Inmobiliaria","Canal WhatsApp","Llamada Telefónica","Aliado / Portal Inmobiliario","Recompra"];
const DEF_CT = ["Valla / Carro Valla","Volante","Emisora","Prensa / Revista","Activación Física","Vitrina Salas","Ascensores","SMS"];
const DEF_EP = ["Lead Nuevo","Intento de Contacto","Contactado en Seguimiento","Calificado por Prospección","Presentación Virtual","Lead Descartado por Prospección"];
const DEF_ES = ["Lead Nuevo Sala de Ventas","Intento Contacto Sala","Contactado Sala en Seguimiento","Visitó Sala de Ventas","Cotización Enviada","Cliente Potencial (Opcionó)","Cliente Negocio Ganado","Lead Descartado por Ventas"];
const DEF_PL = [{n:"Cotización Solicitada",p:10},{n:"Opcionó",p:40},{n:"Consignó",p:60},{n:"Entregó Documentos",p:70},{n:"Se vinculó a Fiducia",p:80},{n:"Firmó Documentos",p:90},{n:"Venta Formalizada",p:100},{n:"Perdida",p:0}];
const DEF_MD = ["Ingresos insuficientes","Crédito Denegado","Centrales de Riesgo","Precio del proyecto","Ubicación","Área","Acabados","Tiempos de Entrega","Parqueaderos","Compró en competencia","No volvió a contestar","Datos Errados","No interesado","Aplaza Compra","No aplican subsidios","Licencia Turismo"];
const DEF_MP = ["Calamidad Doméstica","Compró en Otro Proyecto","Cambio condiciones","No firma contratos","Dejó de contestar","No salió préstamo","No salió subsidio","Eligió otra unidad"];
const DEF_NIVELES = ["AAA","AA","A","B","C","D"];
const DEF_VARS = [{id:"ingresos",label:"Rango de Ingresos",on:true},{id:"ahorros",label:"Tiene Ahorros o Cesantías",on:true},{id:"proposito",label:"Propósito de Compra (Vivienda/Inversión)",on:true},{id:"credito",label:"Crédito Preaprobado",on:false},{id:"subsidios",label:"Aplica a Subsidios",on:false}];
const DEF_REGLAS = [
  {si:"Cumple ingreso mínimo",y:"Con ahorros",entonces:"AAA"},
  {si:"Cumple ingreso mínimo",y:"Sin ahorros",entonces:"AA"},
  {si:"Un nivel debajo",y:"Con ahorros",entonces:"A"},
  {si:"Un nivel debajo",y:"Sin ahorros",entonces:"B"},
  {si:"No cumple requisito",y:"Cualquiera",entonces:"C"},
  {si:"Inversionista",y:"Cualquiera",entonces:"AAA"},
  {si:"No desea ser contactado",y:"Cualquiera",entonces:"D"},
];

function makeBlankState() {
  return {
    step:0, nombreConst:"", dominio:"", nombrePipeline:"", triggerDeal:"Cotización Solicitada",
    diasSinAct:7, pais:"Colombia",
    hubSales:"No", hubMarketing:"No", hubService:"No", hubContent:"No",
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
    nomAgente:"", tonoAgente:"Profesional y cálido", wabaNum:"", tiposAgente:[],
    ex:{}, vn:{},
  };
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


const FOCUX_ICON = "data:image/png;base64,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";
const FOCUX_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAERCAYAAADBmZoGAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAA3PklEQVR42u3dd5xU1dkH8N9zzr3TtgELy9KlCAJqRBQVlV0SuybGmFljSTTFksQSX7uos4OI3XR7YizxTWaMiWlqYl7YYIvBLghK72wvs9PuPed5/5hdQAPsomIQnu/nsx9Fd/Yud2Z+85znnnMuLV++fC8IIYQQQohPDjEzyWkQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCiE8eM235xxiz+vB/E0KIXSy3mBBjBQBu4c9KzooQYpfSyI2lVXPmOAAQBjC/OX3ET9c2/2N1vvMQ6g4yIYT4b0sw60eYizQA5vSw21ZmHtn/5Q7v2/UdzJweAQms3Zojp0B8VoZ/lISqITLMnGlb13ne0W+aG17OFg0ZGLLYu7S1Y269k5MzJYElxH89qIjIaMD8rj497bQFnTf/2xRNXd6eQ9Dr8KvH+dqw1iVFRVJZSWAJ8d8RTbAmIgPAMKcmXf4+rr9iKZ+ykovA2U7fsUZ/bqDVlaWGvAwQkVMmgSXEpy3BrGuITLKGDHPn4JnL6JzqN/TVr/mBks5MB4eona3STlATJg1l9g3BJQAs504CS4hPefhXQ2RKNPDIhs7zahboG+akA0Oa0jm4nDJBpTQRKOsRpgw3GBjJIW0VABkNSmAJ8SkFVU1Xn4oAsyyVOe7WNbj6sjVu1bJ2C9d2mghIGSINAJ4FBgQ9HDjIQ9YQWCsoGDmRElhC7Pzh3+Y+FQ++eFHqktPfw5Wv50LwM+0mrJRiIr0pjgjwfeCg4YSSoEEmT1BaRoMSWELs7OEfAV3TFAL3rU1deMwbmatfMcUD2tpSHHTbbZAczcybRnsEwDPAoCKDfSs95HwCEWQ4KIElxE5DsTlzNBH5IQU8Vt96VM2C9lte9ksnr27LIcAdJqyVJuNoS4xC7UQgMIgIbICDh3kIuQYZT0HBgqW+ksASYmcM/2qITHz6dJ+ZB9y8uPOeG1aFTl2c0eBcyo8o1paUZgBMvHkMCACkkPcNhvdhjC+3yPqAIpax4B5GFouKT2P4p2LMXbPU5zjP1ee+89sV5p2/LgmfurA1Y4NeygY0ORZqm2M7YgBEOHxoHlpJUEmFJcQnH1SUROHqHwC81uCd/OQ6dZ1fpA6a/4aHxnU5E5xAGl6hjtpWBikCMj5jfLnBXn2BrGEokr6VBJYQn5A5c9ghIh+AWdmRm/hWp751gadP9AG0rvXM4ndzyu1DmpnAtP0ulGUgoCwOG+LBEEMxpM8uQ0IhPr5EgjWYafp08pm5ck6juePFFufVRugT2zqsNZ617y3zdCpDpJUCeHthRVDEyPnAvv0NBpUxPGMBkpetVFhCfLzhn0oCVFNYpIwXm/2Lfr/RXplx1NCWHIOy1gQc0q3tPpau8BFwNZgBpkJ/amsbwhAYhhVKXB8HDbMwlkGQNTgSWEJ89KD6QJ9qYWvm6GX5QGyZUYe3ZgHOW18TNEBaOcDC93LIZTUivXjlETHyeYUpwywqIh6yXve8KyGBJcSODv+2mKW+PscTF7T5V7zWoc/Oa0JnyhoHrBQpxzLguoTGhjxWriK4AQab7ScPgeFboG/IYNIQA88wJK2ENAPEDosxK8S6pylweE599voXGu2/17Nzdlvaci4F4xJpkCIGAWTBsFiwyMBaoGtJ4HbCyoKVQt4oHDQ4j74BD54l6bMLqbDEjg3/agEdJ/IJwOsdudP+sN6Pp93guJYMoNj4SimHwJo3PwaBgMLa9R7WbvThug4sG/R0mc83jCGRPParZGQNQZGC9K6EBJboZVDN1V3TFPx3G7LjlvvOLYtz+sstPmBT8DVZDWgHH1ooQwCMYSxYnAdDo3upzXYrLNJg32DyECDiGmS8wtVCISSwxHZt0afy08zD/96Rv+S1Vue8vKuKU83WuAARkbO1qZ/MQDAALF2ZR32DQiBA2HIx89bDCsj7wPBSi/EVHvJeryeJSqJJYIk9uKpSpMh276bwAnLfv8OsnJFWfcvHZkuRyRrjdq372zoLRQr5vMHCxQaktz2kK9RcDN6UZBaHDDVwCchBgbY3U4sBY9kYwCGSrvzuTpru4j+Gf11VlQ0w4VXOnvor0zb/bTh3JbxF5StbVhuXwSDS2ytp2Co4AWDpyhxaWgHHKVRcWw0dAAwFBUbeUxjd12JUPw85a0HbGApS4Zc1WQUuCpXpAdAtgyKRrNwBWiossYcE1RZ9KrM8l5v0ps7d8SL8z6e0wnLvfX9hdrU+VO2tfdXz2MzRQGfG4N0lDNfRINuLTWCY4Cofhw3NF2ouJoA2jyC7u1/Elj2QDUaK9BDjY7Sf+dX0SP9YX6Wa2VoikoaXBJbYbW3Zp2Lm4r/b9uuf5s5Lm7V2M7bVRJSm5/MrHKsLbfMe++YM6ADjvUV5pFIKwQBvs7raVOqTRdoQDhzgY2gfRm4rjXbFgAF8qx2nIliiB3m5uYej6LoxgcALXakrYSWBJXbvqqqwnIaZ+8xD5ov3m8ZYu46MbkUntLUmolz9nlePRaYBUBq2hzqpu7pqbfexdJmF61LPozQCLCsUaR9ThvrwLX8gDwmAgfXzBD0gXOpUel7L/oYuneKWPkJEnGDWCwCOE1l5Vndv0sPaQ4Oqq6riOJFd4mVP+b1tf/M18CPrtBrdYduMC2ZWSvtsUZddAUsW6HEdX2GfKqUZi97zkMmpHq/wcdeLMOdbHDDQx4AiwPgAq+4kszZvYYvCZc5YN0Kfy9ubv+O6+x7iBB8mImZmWlBby3HpXElgid12+Mc1RIYzPPLPpv0vzzm5J99QueGNaDGEnFUK2jBTGA7eya/HCtMMF26PP5uY4LhAY7PB8lUWbmAbq5q3qJ0UCD4DfQMWkwZb5LqGm2TBvrU+FRWrgaGQGu/z41FEjv9SsORaoqJ1CWYdi7FasKC+KB6PW4BsjGPyepYhodhNqipVi66bPqznon+Ud1z+gGq5tFE5ZZ02ZV1FIGyepkDkIGM9/DO/DNC2V5OcuqulhYvz8I1CQBdmum//E9PC8wmTh3noG7ZIewwC+cYhpyLQ1xnoZ+fvAx07zC36a3fgRgGuqQGSSbLxOFKJROOUNW/nZuz7s/bvAvF1LL0sCSzxma+qDAD8y09HH0XLrEYdHNuMNBQyxlH4wBQFC0YRNOblV2Ajt0FToNC74u0FIhB0gTX1eaxex3BdBbYEoHsoubX6ipFjxsAIsN8gi5zHxoJVn0g/pyKXap7g+bdPc0t+TESZGM9xalHNycIeNhYA3nlneeVTfyi54l/PF13iLHH1MVHnfHm2JbDEZ1wNkVnF+YNftrkbXlH2pCZYGLT6DqAZ/7kSWUOhzaTxvLcSRM7mCZ3bm6EOgs8GCxaZTd/KPVxOJADwNSYPT1vXMVCBUl2R9e0Y699/MvreSQF6vztwF9TCUhwAyDK39PnZT+jMh3/lzsjbyKDMijQqGnId2VEZ6WRJYInP8DCQAAT+6DfN+pPtuKxduZRCu3FBpEAObyVADBgROPi//Eq0cQqagrDo3jhv29VVIAAsX+WhvsEg4DrbHQp2x1jOgitLcuZzwyNOERmM8PCPA7V7/QQdeQkAYsxOLWBqq+dSvG66UQq4++4NX5g1U9/Z3FLyuc6MB22yXmi1dWxIaXnGJbDEZzisiIhXdnaWL4vg8kZ4UMj67laC6gPDOig02BRe9dZAKRc9TqBCYf2f5xksfD8LpQLoaVmfAsNaZXwLffS+fZy9uePtkZ57y+eDkcftFn2qZBJMNcQA/GeeWbvP/JfLZixeqM7K5EKwJmUoCKXXWoc6QLZIAWl53nd3clVlN9fJzJ7xOnThet12l9NYYmjSeD67DJ3IQbGCpZ6CEQgEqLAEp1nD0aqnjDOepwyHI3raIJs5JZSfcY56f3J1MPK4ZVbMrBbUgonI1tSQYX63ZPbM1hn/+Fu/+Rsbis7qTBuGzVhyWDsZIrXWAtoBMSMiT7dUWGJ3QBo9TKJiMILQWOO34nWzDoo0DDF6ulepUkA6Y7DofQulHQCm63Nw86MKSWk4b8nqQJEeMYAwriL1xPmHoracQguwuaqyNTVQySQZ5pi6c/aFX7rmitDsXL54fCqThaYOo5SrGZY0aWCdBWUYVlsQWymwpMISe1SsAZiTWwYPFgSFHi4MghlwAoT3lubQkWI4Gl2z2rcMK2a2bDIcpH79ivW4ylzdt77gf3nWCSXR8pKSBTFmpzD5cy4RESeTZB55ZPUhs2deMWd9Q/nv2zrC49OZTl+TYUBrsAUrBtIEtd4HNKFwzVD67VJhiT0CgxGAgyVeAxb5G6GV6uUSHEJHu4/3lxs4/7EdA4FhjW9JB0MRPa5Pe8O0celbT5vU54dEZAFWXNim3cYL93X2n332jYr5rwy5/vX5oQs8r8jJ+Z1GU/d+W1t8ypKCWu1BZQm9mM8qJLDE7hRXYALDYk5uOaxiqE07g26nFGOG49jCEpwMfWiBs7U+M5xgiR5WnM8dNjz12HerctcTVaz/Gphic+Y4qIYlAgPEzPPdn9099KK//734Mi9XNDiTzUKplNG05ZW/rl2zHIJuZ6h6D3BcEFvZuU8CS+wpDIAIOXg7vwYrbBOUcnqYnU6FoaBLaGzxsXyl7brHIAOwbC1Z5RbrvkUehpakHzlrcnr21NEDFn+PgdgcdmqrYam22mI6WWZ2Hv7luqOvvbqoNuuVTsmkDBidviKlwR+epqDAMCAo6NUetOfAurLNqASW2KNoKOTYw9zccvTYYe+qdIgL28EsXOQjZxiBgAEM+VaFnUiJ1oOKsi9Wj8nfevYhZX/8CQMAqwSDfj4XICIbBvAM88m3/LXz5lUvh8eTWwqTTxlSUATHKcToB3tSFoDWCmgGVIMBOwrEBNmuTwJL7CEKS3AcvJBfg/W2DUq7Pa79KzTagdX1PtastXAdGM9zVLgk5JSHOtdOqOBbrjl28X1EB3mIseJaoPuO0IXHt4656v3wnRe+ZE4a9k6RGuF3sqFOJqX15mj6zxRSXUNXvSYLsk7hvjzMUmJJYIk9AXdVV22cwbz8cpDSIEvgHtcMEywDCxdnrW9dBCNFutLN8Pih7b84/9jGGZU0euO1MVaJBOsFUTDVAoiTYc6Mvmdt4NzDXjHnv63dPpUr8oh0pi0crQoJxdv/ZV1AbbDQTQTrFopBIYEl9pTAYkaQXMzLLUGrTUHrQA9XBhkwCsEA8+plnl3TGNblfVyM6Nfx7PH7+jedMK7fvBiAqtgcpy5Ofg2zApEtJuDnG7Inf2MB3T83pyrWpBXKs8YMazWaFSls54bOm7ZEJgZ8DWdVFlYp6K7FQmLPI/Ow9tDqyoVGk+nAy/nVoB4b7YXFzdDGdOQMLV/j6lHl/uKj92k97eenlh53/Lh+8zjKmplVxcRqTrzzTiBAZOe3pA48Y0HurzNXBf/waFOgorEJfojAw+qNDuQNfN1TLdf1yzoM2uAB7QqkerVaSEiFJXanwHJIY15uOTqRhca2q6uuRc/WWI91WZEOrHW86orcY2d+Yd0PiMa2I8YKcXAiARApCzAS3DL87SW5y769mL71Ptyw32FtsQL5QeX07WAMaPFhlIJjezElQQHIOnBX58Bud10l1ZUEltjtdc9BD0Bhnd+KN7y1IOX+R1jRpuqG2LCxCDl6XLACx/mD6y4cNeDasfuEXjwLQCLBGkgCq6LBGqIM8xznthVTv/H513T8TV8PbUsDIYYJOKSZCcTA4Po8lGH4mj7wO20rWdklOCs9UMYCDkEuC0pgiT2EBaC4cCfluvwy5JSBxtYDyzIb1p4eUNRXT8v0fe+c/D4zzwgO/fWP4QPRhI4lolyTBFBTY5g5N681XXPWO+q6OdnAfo2dAFlrwlAKBA0mGAX0b7MobzMwmno1g4I1Q6cAvc7AaiWNdiGBtWcNBRkBCmCp14h3vfVQ+oO9KyIGLFlDFuHSYn1Yrjh1Zn7kvd8K7z2TiDoKU7CYagB036Emw61jzl+Yu/Ff+fDX3u0AyLMmQFBgpbuLISbAscDQeq9wp+bedE6ZoUiB1vrgHKGXO90ICSyxu1AADCzmZZfBJ4Zm2lRdEYMtW0tFIT3JluKIdPlDP4lMmUVEy76Nwm4KQBJUCy5MU+Cy2cvzVx39Gv3gzZwbznZaG9QK6L59/RYjN6OAimaD0s5Co11ZwPbQcGcH0B2A2uCDHNV1VVASSwJL7CHDQUYYAbyVX48ltgFKO7BgKAs2sJZdpUeE++upubJ5l/DYWUcUDfzbTwGAE5oRLRRLVGOKFeGBDZnzvvSWveaVfGCvhnYgRNYEtdrqXlsMIOQBQzd6gC1sR9NTz7ywv6kCrfbgeAomAJC1kGa7kMDaAxC4cDst4+P53FKwImhowBjja6NLi0v1kbl+687wRt10RnDYvURkNwdVEkRkCcAibj3q/jWh2mtXBw9fnQa0D1NMUBZbDytiwGigvMlHUaeBcajnPlRXo123eNANBtZRIFuIsG1dx0ShFy83UZXAEp91ERT2aQ/DwcveaqzldmgKWN94CJSE9cG5ouxJmWH33RDebyYRNZ/ZNfxbgLlEm5bT8PAL/SXXXmFXfme9v79e3mRNaVCRJWizvapOAQEPGLbRAyvqXdOcAGUN9EqGsgTj2MKawW2lmyLmvGONyRWRJinBJLDEZ1kj0tBQaOEcXsyvZICtCVg9LjgQR2b6/DGuJlw1JFS6KAYgygmdQJQJtQyKG2aO/K/fdOPxePucfzqZfqegLzo608ZRYW2x/Y5Sd3U1tNFDKGd7VV1R9zSGjQxqsbAOg1htLdNgiZmYLXlBXVIWQvnejf8+8GjXk3kPEljiM0yTUhFy8BdvhWngZj2wrBLT02VLzvL3uaomUvnkg2CgEFT4eVdVVQzCX/zms79i3vzBvx06YA02Yu9cqZkUKNVLldWWqMcWuK+BSIYxsNHvZXVFYGVBHgGr/a4Jq7TVCgxsDTxHu8ESXTSoee2YQ1puPWvW0HtQ2OYBchNVCSzxGXUAyilhV+LtwEZ9nNkr8/Xs2HvPiIy4gYhSYFAMTHPnzqWa6eQDQDbLY69w3rv9Ir3mS28hBdi8CbCjqvVAzdTL3RG67lA/tN5DKG/h9VRdFSZ+wboKoVUG1M5dk0Q/9GOJLfvEri7TxQNTfr9R63/41R/5twzvM7z56zfJc70nkLWEu7lsBG5rpt49Ozsk+XT46Mlnhvf6HyJKJZj1e+CSZrzv1k2f7jPzmB+atT8/wvn3a/frti+9ZRuMhrFQRu+LMhqmipCHBW2jTcQALG0eCpZ1MiqbfeR72WiHYqgcgdb6AKkt667CvvAM3/HDqqxvWA/dr/mvX7w8M+1/fjX4yuF9hjfHqthhuYQoFZb47Op+977etrrt4sDo6v3C5S/eBQCJhE5Eo6gp7FLVXgoHj/rrL/qqWThzrs71aUIHlCXjktI+LILWweFUDktmuy8Wwhb7/xEwpN4DGQY5vcgRBthVcFf5QCdArgWzAsjCMhnyHR2OhJxQecubex9pas+ZXfkH7zdAFKwTDEtEflyecgks8VlOrEJdM7XP8GYAL3ZNU0BtYTM9PwTgrVzm2zG9/Kzr9cbqFWgFYH0NrVmh0FRnHwfxAAxWYXSyQYCoxyGh0YUlOP1b/d5NYwAADag0oNf5gNZdrShr2NcqoIt1uLK1pd/IdO0PfrnkAaKpGYCJYyCKk5HrgjIkFLsRZqZEIqGBKBORiRP5zDzhwvySX5weWPTgb3R79Qo0+RrMCuRYMHXfsr7UBjCVypEni94Gg2JgcL0HZXu33TKYAaXgrvbAOQZr37JRxkWRDpZ6GDmt6YmaOxsOv/Ship8QHZaNxeY4ADHFSeZdSYUldr9CixgMCwIz89CfeqvPOdq8ec3Lrh9JodUqaCYo5z/e/WwwFQPQV7nIwEdvWkRGAQNbDPq2+7CKenwEMQGaoFI+aAMxiIzyI04gbFE2rO2f4z/fec3Xrtnrxdw9QKxqjhOvIz8ehy/PqgSW2E3FmNXtpOyf/NR3v2+X3Z5wm4oakQIsjEOONvSfOzUYNhhgg5hMfeHBbGeW+aY6CYoBt2uBM6hwcwjazr4x3dMWiBhqlTWchQ4VlzrhQW1LRx7cefu3bxl2n3kKQNemzVRHElRCAmt3Hgp2/WtZY37ho+fqhScuQwqFPpXSVkGbD8WQ4sKGfZYZU1GOYnKQhg+1ncDqDqa8C4zYaBBJG5ge510RwAom4Fs0E0INpTpY2ZapGN/0s4vvj9wVCPfbYPKsEtEk1STJSJtKbHqNyinYnUeDxGs7O/f6p5s/cZlttS6IVWH4R9vKEZ8MhnIRDlB9kYeB6mFgR10br4dzwKAGr1dDR8XMPoyBF1FFjVYNmtD+5Ok3+dWXPFBxJVHxhmsPmeMAZGuSNUaeRiGBtYcUWQDQSdn6lJ9KEbnKgNHjzu0WqMIABIjg9+ISX/f+VkMbPISzBlDbHgoSGMxs8nAoUlqkR/fvXLr/5JZjr/xz2an7Te//SqxqjsPMFK+bLsM/IUPCPZHHxjBYMXXvz77tvdsNG4zjEuyjSpDvGgr2mIoKCOUYAxu9wvVF3mrhBiZrsz5xJFKkK4rSzQcP7PzhD47JPEg0YkPhp4DjdeTHZfwnpMLak5/g3k5IYDgMHEH9ocj2agVOYYNSYNhGH67HsPTheopAsNa3MD7CamhlWB82ovPJ2Ue3H3TpscWziAZuiEYTGiArdxoUUmGJ3oYaDHzsZ/tgpI4gywZqWznX1WTvHgoWZxj9W7zCPu1bfht5sNb1fR12ios0xlemF592CP360MriG2MWiCZYJ6Kw3VvYCCGBJXpZWzFCxsERakDhT9vbjaFrYXP3EpxhGz24ftegbvM3mUzeQWlZ2CkPdS47fLz52XkHld5NRDlEEzo2IcrxGrn6JySwxEeprtjHJAzAEBVGGl6P0xhU4UbM6NtuUd5itgwr6zNDu0V6XCUwsX/q7h98ofk6ohEt56NwW7CaGjKy7k9IYIkdRgAsLEqsi6mqHH7XNIbtVT7EhduFaS4scFZsYZVlto5hN+T0DVjsXdH693OmBX91wICSxy81hdvXz62tNjL8ExJY4mNFFrPBFAzEAATQ2VVd9cRqoH+rQb92H4ZgfBPQpX2CTmUk/dbho7Kzv3NI+W9vZWDOOxuLqydWdBKRT1JWCQks8dGHgoCFQbkN4BDqi1zXEpztVWNA4aqgaxiD63M25wOBkiI9oqizc/yg9M1XfaHtTqKRWSCmEolamr4vpeRMi0/6dSv2QFxYDY3DMQClpOGR7fHFoABYsty/ydiibEQNrQyrg4Y1Pzormp509VH9biIamS3cvj5ua2pk+CekwhKfyECwUF0NshEcSH2RJrOdRnth7Q1bhiFGEGEa26Zo0pDOf1V9zsS/NKb86dkAYnPYqa2G9KmEBJb45CNLWWAaDUBQETKbdk/YyndaDd8ylEMMBLBfe+fyiSPVbd8/5s4HiOIWMVYxAPHpsuunkMASO6m6Gs1F2FcVd01j2PpgkA3A2iCoNMxSZRpvK3bGNG586NKnht/30AHsJhK1JNMUhASW+ETxpmqpcJdkzcARNACFu8bTBwd/DMAymABHa6ADaPq5g5afKESaA0gf76hrfVaoBkufSnzapOm+hz3ZhgwmcBnGUjHysNhyOxhlFIwxIA2ElIvOJxRWVgXQfo0LnXKhywH2rYmTbE8spMISO3EYCBQmiQYsYRr1hyUGgwrNdmawYZBjEEIAuVcIq2/SSD/tQjsKqr8C5RmFzYnlM05IYIlPIbYMfBzM5Riiw8h0bR9jjAUpwHUU/PUK9bcR2n8VBDo13BICg2F9g82bPkhxJSSwxE5iwczMABjF1sVU1R8+WxAXwsjRBORdtD4ItN3pwC4LQPe1oFKADXdFHUH2fhESWGKnqe3aN8/VwUiQXA3k+BBUogJBpHwfjstwoJH+m0LjLEL++SBUkQYNsCBPbQorIXYl0pDYfQOLAUCx8XIwtpjDdLDtg5zyEXQJdpGLDd/QWPvlAPxXwnDKCeRawEOPGykLIRWW2CkVVlg5EVjWh6i+3D/goLPVQfOPgfa7XZgmDbessPMVyy7qQios8d+usJ5LbUgNDgTzU1U5Gh/XWDVNoSXuAjkHTl+CZQuWPrqQCkv8dwOrlgBw//JQ8LAXS4obbyxB53M5E3BD2ikH4BuwTyDIvp9CKizxXxanuI0hpk7E8JVDf2puUm9wPlLUV9sg+2x8sASVkMASu1RoIW6JYP8nMey642e3Ti+f2PHvYCDi2LxmkAwEhQSW2OUQL3+1pc9J3xr64qwX5laPqqq/qWSwBecjii37UmgJCSyxS9nrgDdS0WhCE52cvuKJgdcddk5z1ZCDWt+LhIsd48ESwdJ2tpgRYlchTfc9ocaiTbd+pyqeo0+fMWIe85qpt57adMXq1wJXZRrCgJPzSbEjU7CEVFhiV8F1mO4noqyJhjZd9bsV1x96dtP0gZ9rWRbSRY7NK1PobUlqCQkssYuoSZJhZkreVeF8PT5y7uwXVh24z5eaHyqp1Jq9iGLAlzvHCwkssQsNE4lrLhueWfXiqjBqJ3f8T6L8W9O/V//V8r3blgadYsf62sqVRCGBJXYpww7ThPPWhfw0q1MuG/a7215rmTz0kIZ7i/pCYVO1Je14IYEldolKa0iahgxJA2RjVXMcotFtM56p+O6Bpzd8ud/eqRVBVeQY31qrLDMABdkVWUhgiV1AvG66z8xUZdj51q0jnrryb62Hj5ze/ptwmVaccTUAa5WWEyUksMSuUnER14H8aJT1gAEj1l39p7LTD/92+5nDJuc7lIFij5iZ1eBxMkoUnz6ZhyW2Ktl1JbGGoM65hR73sh1v/+ispns6/c6uEutVOUlCiF3PG2+sLwIBzGuHr1i0fiQAMLNUWEKIXZUElBDis0eCSwghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQnyTZ2+gTUlUVc1C3ow8C6uriBnKrZSGEEEIqLNGFmYmI+NlnX6j431+8cmmqwzoKxD1uJ6wAWMAtIjPlyKF3XnJJTUP3z5KzKsS2yV1zPoba2loCwBs2tPZ58+V1VzetycBVGsYymO22Pw0IMNaiT0UE++4/MAmgoftnyVkVQgJrp8qTb42fzRubU2yJXTfo6oADslvUsfyfgRUIaChjJaSEkMD6tAfX7DAAJ6TVgdVDHxg4sN/8bNbTWqtt3Ntdww1Y2yccXAoA8Xj8YwUXg6kmmlT19Qs+UNhVVEzkRCJqd/ZwMxaLqYULF1J9/QRCHYCqwn+vrobt+rvxJ3Wc7n/fkZ+75eNqa2t5R8/Hlo/vOrbt4RmhWKyWev/9Quxk3S/iBx55asz+Qy40g3CuP67kYj4zOuvET/d3iPbi/vFRvTNu1dV1Dnr8udFe/Y5CSIX1aZVYm2odP+OVVVXFnK7z62/vUR9nWkMUUR2Pxw0U8Mxfn+n3h8dXHtLU2DRxw8ZGJ1wU4L5lRe3DRvd/6/YfXvA6EaUBQgwxFccn9WlfOH4gSLjj9j+MXPjq2iMa6luGtba26OLSsBk4oH/L0JH9X7l+5hlvEJHZxgC59+H40EOhxc+uHm3ShsN9NE2Zss/KCy+sSfX0M5mZvnnGjWM68oFAkRvAgD6m4c57r6jv7e8Si8VC8+ebcRGtPR0J06BBfutdd81oApDbSqVGRMSX3nB7/3WL1UCTbmN4Rif+qhcQSZUlgbUr0mTq6mr9qqoY6uri/s5KyCSSZuZ1D46b88ySyy//5l+/5HdyhZ8FrAWY8lA6jbdfaMCcP1627KTq63551xPf+OnY/mPbY7E5zsyZ033+eIM0BSTNFZfeV/Xmi+uuv3fWc1P9lA37noZlA1AejtuKQGQpnk6++VbNyTfe/ds/XHd/4Q0eU9iB0IzFYioej9uORZnxC19qeq2jKcNl/YpoRGXqOADPRqMJlUzWmG18ijAA9e5r659tXGdGaieEaSeMvp+Zv1dDSSRRY7Z3jqPRhPrahYPdp6c//mjLStrPkuGSfsGNiy9cFv3fRx55ORaL2e7hXuFKb42yNlE5dfxl/6hflxqndRAjJgR+B9xRAyzUQNLIG+RjvejEZ/F5Y2ZET4pdnLj/zVdXvJ76TvP6dEVbu4ec5wOKAcvIZz20NHdiw7LUqHdeap511mEPvPa98+444qabvuDfe+989yN2ywiI6mDQtcdNu/bGpx5+c+7CfzV8obU+E+5MG1hmKE1QYOTSPlobO7FqUev+r/69/t4j9rv8mUVr5/dnrv1ot7pPA7l2H7mUtbl2i5wf7PVDMymyuQ5GvpWRSpk8gN4EJtfXL6CJA4/sOGC/8ecrRZxpN17TSlt53pd/euGsm2b68fjCTX+P6upaDUqaE4645rz6pf64bLsxjsMN1SdM/j4R2RgmyAUWCaw9rm/mMDNqTpp94+t1bT9uq89FfJNHcUkII8aG3x8/tf+vxk0pnzHusD43jplU8lT/QeFm7WqYnJdf/35q9D+fWvW3b5xx07Tzzz/Ii0Z3vK8URY3STtIcc8Q1D7w/P31dutnzCQZl/QN2zKSyv086auCsaV8eO2PSMQNvGD2p7Pf9KopSjnLgpfO5VQs6j/nmUY//CUAREfFHCS2lCAQCqR1775MuPE47hGw+lyUirseCHo9fVxf3rf2qfuC3F700Zv8+9wScUMByOrdxNZ32zdNmn8KcQDQa1bFYTNXVxf3bZ90zYfWSzDVpL+0Vl5ToA6b2v2zGjDM2RqMJ/ckNxWVIKD7BXpY1rIEqZ8WKFc6my2Wo7vrnXFShGnXY8d5VNBrVM2fG/VRDZc2bz6+fkevI5ZmcQFllqGHyEZWXPJy48ndKU5673hbaAR595LmBj9wz59olr7VdnO9Mey0bbfj1ufW/e+ihP+/3zW+etLF7uNW74yd0MlljvnpU7GtvPN/ynVw6nSMVDA4aHVxw6jn7fveGG78zL/f65h+lHeDeHyXGPHrfyw+sWJCt1tZk1y/1Dz1p2g03MfMVNVTjA/h0h0gMEKkd+qBmTliiWvXnf/5gxpRR8S9uWK6HdLZ2mtdfqr+7rW11XTKZbI1Go8TMNP2Aa+5pq8+4rnJRMUo/k3x61qNVqHKSyRpf3htSYe1iUcVQpNC3vLwNqPNXrno4C9T5ha9411edX4e4jx1uPDMlk0lr7fqi//vLotmZtjwTtOpT4TZdcO2RJz/yxFX/S0R5tlVOVVXMqULMMX6Vc8YZR218/o07Ljnx9Ak/VIGA64DzzWvy/X99z7w7lAIv3GJIs/03LVMyWWOXNi8tW76o5cfZVM4A2h00Orz6vsTXj71qxrfm5bJHOlWIFY5fVTj+uRfWLKl7685jh48Nv21Abi6fza1a3H7e44/PHZlE0nx4usAu+bwScTQ6kbTu13rIcSMujpRFlAL8xpV+Zc1xP7tZa7LJZNKcfsqsr61flppmmE1JhWo/8Zv7n+/lfaqOVUtlJRXWrhhYpLK5HK9ZUn9RzXEzjzfWJQazsoWPBmJiwx4FI0Fv6tF7z7rooq80FXpCPc8Jqqqq1XPnsjnvrB+dlWqi0QacixQ5wQMOHXzVxRd/5aWzvxELPfxwPAvU+XV1dR8ImokTa9wfPfDdq9/695X7LHu783jf5v2Nq3OnPfTQkzPPPvsr7/WmyqqurtUA/Ou+kYi2baQKgPPhPqHA5OmVF0+aNGltNBoLJJPxfB3qsOUi8Gg0oQGY6NlH/OTBn9Q9kEt7muHiycfrTgcQmzu3e6HSrq3Q1I/qu++79A9fmHLNb5fMN6f5fja/5n193nfPvfOxn95z6csHDL34jlSHb8JFYT1hcvmMq39w9qpotOtKrpDA2rUwACLjWX77hYZjCfpY+tD0JIKChxz6Dy7FSV/53P8CaEpEk6om2fOwqK6u8KZetrDhK7lUmhVUoM9AvfLRP1z16GN0tXr44Xhu29VB1BCRmXHVfbM3rl5wfHuzZ9OtNvDkr984FsB7vQmNujpYpQnr17af4uXyzKBAv0q1/O77Lnv6nvs7VCJZ6xHiW3ujWyIwM/9y+cblizvbWIVCIbjabOzqEX1m3syx2ASOx6Fm/rDm6u/WPFLdtJrKO5py/PLfV93xxc9f90b7RjtYkcagvWhe4s83/JzoHZ1MylVBCaxdtL4CGMSEQMiB4zj4zwk6gLIBhCMu3B2+Rhe3QG2wqbF9HwaRoxyU9Qs9R4ryQJVTGHZuXSKZsGAQgPl//92lqzuaaZiXY7Q25A4F4ad1dQt5+0MigDlujc/hKWMu29dYQ45yUFxW/DwR5YAqh0D+dpIcRGQBzNvW//8siMfjNhpN6MMOm7Tim6ffcs3zT63/ZS6dNg0reErzWm+K52dt38pic8xp+55PRByLxTgel3eGBNYuW2OxdUKOmvz5EXcPGFTyr2wWSqvNlQuRYmafAmFl4AYXAkBNsqYXw6HCsPGxx57s5/u23MJnNxAktwgLwEBVVTW2HAZuZajKICjHRfaQ8dcuU8gNMzYPNmVjgyEHuUxyu7+DtYWdJP40909F2YzXl2HhOArFEfU+gK6LCD1vBtY1PAQATJiwgD+Ly1WSyRpTVRVzfvn4Vb8+bOIPTl6/KHgyTMb3DTgUDjrDxpfNuCF27rtVVTEnHo9Lo10Ca1cOLGLHVdCh7NM/e/DKP2/ve396X+8rjFgMFI+Di/sOGRwMhIsssp5Wyu1T1n+HhhtKEUoDAcWwIBCM9SOKev4dqGtk++qS963veQZQUArI+6a50GADerN54TYmd+4Ab/PgG0APiwi2UgF39/c/Xo5UVCxkIsonEk9dPuviOSc2byBlYdXgIcUtf/m/+GNEpObOrTVEUl5JYH0GWlkmZ0p7WpqzI0ty4vHC9zVtaGzM5bIZBRVkNkh1pnboV7OWkfFzBoWZTLDWprv2itj+0paubxg7sFJpvUwxDNgSlNbFO3RqPjTv6uMuyFaKaAcO/YlVc/X1E0gpwkN3v35yR0deK2hfw9qm9fk+Z546++tA/Lbq6p6XZYmP8JzLKdgJNJmuJTl+XV18q1870rvpXkLz7W+f2KAUtSlA+R6Q7TSjC+E3t1cNNi/PbqozPdiCoIngumpFLucDiKqeQhgAzvjiGdlgOJhWIBgfIKLxzKBeHL8rn4i3/Nrh06oVgRQAhmVGuiPXq4ptHdaFTJ6LAO76q3z0l333BNHZtQ9NXLuo+ZZcp2dJa5eVdjKdabz94vrrfvbgEyPq6uKfiSkbEljiE9e9/s4JqHSoOLRIIcDG99DRnJrmBjSA7c/ziUYTCgB+cucT+2bbeW9G3iNXo7Rf8FVYoKpqAvV8fCgnoFKBMN514LKxHhrWt+wfCCnu6fjdsbdk/ZKKV999d3B9/cJBc+a83qf3Z6AWADBq3F7GcTUTLPs5wppVawYATB/eUmdzuDAxMyXueWEYMQ20sP7HedEzMy1cuJCYOfjMkwsfaNmQdxyl9YRDy5+J9KU2grYt9Sj53T3z7wsENS9cuFB29JXA2jNVVUEZj1G5V+g5NxggCz/f3mAOiF/z2ElA3E6efJ67rTfZgmRSkwL/8TcvX9zRZEmBKFRmeL9DK/8IFPas6vn4scLxB5c8p4KaLDyvvZ72v/bq+w8C4jYWm7PV9kKi0Ginyy768YSzpt/33rePuv/dL0755ZJH733mSlDXzTt6iqvaQmF0wQUnrXADfjNBOfksI9XifxFEnEqt32ow/PnP52si4nf/ufGofIq02vaVzF6prq7WyWTSfP2rN1+0bknuMAO2pQP1mr8+P/OLYyeV3+e4QU02l1u3JHPsV06qPT2ZTJotLzQI6WHtMaqrYevqgJpvHPrYbW//7ersehXqbDH8xGOv3MzM/yCiDFDlVFVVo6JiIgNAffLn1LWtS/7s024+9aWnV53NvvFArls5vOTZO+68cCHQu6U53cf/8tcnP7b4nb9fl99ATrrV18/9bvGdzPx5IvIn4zx3VPQoO2HCAi4Exnpdk6wxTgD82gtrZ65Z1F5m4JmS0oiuHFH5R/Dmn9urCtNVbUdOvOq1xpV8lLFZs2Y5vvTgw7/Z9zvf+No7wHluVdUgrqiYyMnkAp6M9fq1V+/3mHnQwaMv+14mnWdVGE9+5KFgbW2teeBnvx/7oxv/77pUKu8Xl0ScAw6vvIKIfOaOOw8dV/vV9e9l90q3eWbBSw13zZkzZ8706dPrZb9+sUv44AZ+F3Vt4HcRn3Zy7WldVckn+oEQRVQrBXwrevuto4MX83CclxmqvstH7n/VSw8++PQ40lutsAJnnXLXpfuUX5gbhgu8oTjfnzjw++nLL//xaAC0I32WKKIaBJxyTPy2UYFLeDjOzYwKXsxfnHbDE8w8YGtxwMzu146/7ZaxJRfzcJyfGeFcyMcdcU1COwTswKZ+3ZXKJef/7PQxRZfyCHw7N4wu4EPGXfH+PT9OTNDOlgFX6Nq183sDjj3s+meH6nN5CM6zI3CeN8q5mE894eY7AaAKO/T8EDOrY6ZcUzdcXcAj9Pe5+oArnmVmNRmF6vbCc+86anyfS3gYzs2NdC7kE6uu/W3hOZHNC6XC2iXxprbuzpBE0kRPTehfJKI3Hj3l2gOWvsHHwMvlVr+TOvSua//y7y9MufaP5f1Lnus3qLShranFyXTwIYfuc/WXmtakJ+Y7c8ZC6T79AjjiuOEX3XnnJUt3dNlIAglLXKuefPaGG4484PIjVr4dOCyfy2ffeqnx1MPGXjb51OPivxg+Zti/mtpSq8nk++Xb8wdN3feKMxuWZ6dk0/ks4IYqh7srLp59/PefmXazwg5st1KYEhFTP7r3+0/Of/nSZ1e8GT7WZT+3/r22MffcOm/+cVPjv6kYXjwvUhxuCDg0cMnCjfscMfyn0cbV+RHFZRqOG/A7GjPqo7zgo9GETiSi+NqX4+csX9g2zbe+X9Jf56pOHlHYNibGGBVv0b/49VXPVR905WMLnjdn+X4+/97r7TXnnnXbQ/c/fOUz0WhUZr1LYO0ail2XyVLhyh8z+8Q7LbUmTFjARDUpZj7rqIOv/fmqd1U03ZlBS70p6ay3Z64Md5ypwhvAeQsv4yNvfABkFQV0+WCVmnz44O/f/8gVj0zjKieZTO5QT4cKtzADEeXmzZt34lUX/CG5YYn3hVwujdXve3s1rMjf+M6LLTAqY+ArjXwA2WwWBpZdJxgaMia87CvfOfD4E6ZNa9iRXSI2V7QAEeWam5vPrzn29n8seq1jNJk8N63LBdvXr//mkoj7TbgavufD72RkYdCnTxBHfHHwrDeeX3d8a6P+nGX2me0Obh5YY/715hsjF7zSNDuVMtlIKBSacGD/W+LxC5cUJoiSz2CqTdeqE+494QffO+HxYzeu0H2y7V5+ft3aHzPzAYUhe+/WjYptk6b7JyCfZ+0GgwHHCQYDoYjjsBPcWceKx+O20BNB43P/nn3aIcdWnl85qnRJSWkJyGFkMwYdzVmkUz6sdRCOBNGnIuTte3j/p86/YtrhDyWueYQ5quu2s5Snp5FRLBajI488suWFd+447uiaUbcO3Ku0oagoDN9YpFo9pJtJZ9o1cjkfwbCLfoPD6VGTIj9+9C8XTL3iitPfi2HHw6r77w4w9e/ff+VdT5xw8LiDSu7tOzjiB0NBBTjIdFqkW/PIdxoEioDhY4pXfm5a6dkPPnLVDYbNyIAbcILBkAOyxb0/5kJaxS+Grzrn0YfTLU5FOBgMVY4MrXjy2dgdQFTPnVtrusM8joV06L6HNB10xIhLS/oG3IDrBlL1wbHHTbvmfmamKGrk/SYV1n9P951uPM9bv+/Bg2aMnOA5RaVBGjWmz2t4qncN5Y8UGV0NXCIoAPcz86Pf+85PjlqzMn1UY2Pz0LByRmQy+aZgxF03cEjJG4dOn/jMlVedsvjp5xlRRHXyY27T2x0cROQ7Lq5evOitH8av/tvnG+o7q9qaOwaHA87gbN42FZWF1kXKgi+edMq4v5173ldXjh59G/Cx95Qntha0/4gjW7TGd++9988/+evv3zi6ozl38IYN9U4g4KJiYEXH4GHF837x6wvqiCKruGZ/fVDVPrXtTZl+oUAA5UNK5gJAdQy2bjuT0bua5Wbp3MvLxo4fVjdgsPe3UCSsBw0N/YWI2mKxmPpgMz1pbrg+pmbe+D+/PvPUO4qsh0HGgw2WKrMCK4JJJLP4GHvaC7Eb+GBDV2kgFHHguPjwvWzUzrhrzoerdOVs6/hR/ZG2Rd5OmADQW4xXN39tedSd1PDm7Z9LmX8lFdYujaqqYpveGIV1ZJ9WryJpAKZoNKmSyZ+TNRWcTSdt4U1TpaqqqrvvDWh30vvIMjPV1HQd36/jrO9v7fiG6JM7ftf5NbFYTM2dC/Xh2fZVVdXdz4Mp/HnzFcHN56P34di1H9imx1N8u0t9+MNXiHfizUiEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEKIPQgxM8lpEEIIIYT4JCushx56aC85DUKIz4L/B1NXSRKVEh9sAAAAAElFTkSuQmCC";

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

function calcOverallPct(d) {
  const pcts = Array.from({length:10},(_,i)=>calcPct(d,i));
  return Math.round(pcts.reduce((a,b)=>a+b,0)/10);
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
function genPrompts(d) {
  const P=[], ms=d.macros||[];
  const mn = ms.map(m=>m.nombre).filter(Boolean).join(", ");
  const tn = ms.flatMap(m=>(m.torres||[]).map(t=>`${m.nombre} ${t.nombre}`)).filter(Boolean).join(", ");
  const allCh = [...d.chStd.filter(c=>c.a).map(c=>c.n),...d.chTr.filter(c=>c.a).map(c=>c.n),...d.chCu.filter(Boolean)].join(", ");
  const allEt = [...d.etP,...d.etS].filter(Boolean).join(", ");
  const pn = d.nombrePipeline||"Pipeline Ventas";
  const plStages = d.pipeline.map(s=>`${s.n} (${s.p}%)`).join(", ");

  P.push({id:"PRE-01",cat:"0. Setup Base",tp:"spec",pr:`MANUAL — Setup del Portal\n\n1. Crear usuarios:\n${ms.flatMap(m=>(m.asesores||[]).map(a=>`   ${a.nombre}: ${a.email}`)).join("\n")}\n2. Asignar permisos (Marketing, Ventas, Admin)\n3. Conectar correo corporativo\n4. Conectar dominio: ${d.dominio}\n5. Instalar tracking code\n6. Integrar Meta Ads + Google Ads\n7. Crear grupo de propiedades "Focux":\n   Config → Propiedades → Contactos → Groups → Crear → "Focux"\n   Config → Propiedades → Negocios → Groups → Crear → "Focux"`});

  let pb = `Crea estas propiedades en el grupo "Focux". Usa el internal name exacto.\n\nCONTACTOS\n`;
  [["Lista de Proyectos","lista_proyectos_fx","dropdown",mn],["Canal de Atribución","canal_atribucion_fx","dropdown",allCh],["Etapa del Lead","etapa_lead_fx","dropdown",allEt],["Tipo de Lead","tipo_lead_fx","dropdown",d.niveles.join(", ")],["Motivo de Descarte","motivo_descarte_fx","dropdown",d.moD.join(", ")],["Rango de Ingresos","rango_ingresos_fx","dropdown",d.rangos.join(", ")],["Tiene Ahorros","tiene_ahorros_fx","dropdown","Sí, No"],["Propósito de Compra","proposito_compra_fx","dropdown","Vivienda, Inversión"],["Horizonte de Compra","horizonte_compra_fx","dropdown","Inmediata, Semanas, Meses, Próximo año"],["Horario de Contacto","horario_contacto_fx","dropdown","Mañana (9-12), Almuerzo (12-2), Tarde (2-6), Noche (6-8)"],["Crédito Preaprobado","credito_preaprobado_fx","dropdown","Sí, No"],["Aplica a Subsidios","aplica_subsidios_fx","dropdown","Sí, No"],["Cédula","cedula_fx","texto",""],["ID Externo","id_externo_fx","texto",""]].forEach(([l,n,t,o])=>{pb+=`- ${l} | ${n} | ${t}${o?` | ${o}`:""}\n`});
  pb += `\nNEGOCIOS\n`;
  [["Macroproyecto","macroproyecto_fx","dropdown",mn],["Proyecto Torre","proyecto_torre_fx","dropdown",tn],["Nro Cotización","nro_cotizacion_fx","texto",""],["Valor Cotización","valor_cotizacion_fx","moneda",""],["Unidad Principal","unidad_principal_fx","texto",""],["Tipo Unidad","tipo_unidad_fx","dropdown","Apartamento, Casa, Local, Lote, Bodega"],["Área m2","area_m2_fx","número",""],["Habitaciones","habitaciones_fx","número",""],["Baños","banos_fx","número",""],["Parqueadero","parqueadero_fx","texto",""],["Depósito","deposito_fx","texto",""],["Fecha Entrega","fecha_entrega_fx","fecha",""],["Motivo Pérdida","motivo_perdida_fx","dropdown",d.moP.join(", ")],["ID Externo","id_externo_deal_fx","texto",""],["Canal Atribución","canal_deal_fx","dropdown",allCh],["Tipo Lead","tipo_lead_deal_fx","dropdown",d.niveles.join(", ")],["Propósito Compra","proposito_deal_fx","dropdown","Vivienda, Inversión"],["Cédula Comprador 1","cedula_comp1_fx","texto",""],["Nombre Comprador 2","nombre_comp2_fx","texto",""],["Apellido Comprador 2","apellido_comp2_fx","texto",""],["Teléfono Comprador 2","tel_comp2_fx","texto",""],["Email Comprador 2","email_comp2_fx","texto",""],["Cédula Comprador 2","cedula_comp2_fx","texto",""]].forEach(([l,n,t,o])=>{pb+=`- ${l} | ${n} | ${t}${o?` | ${o}`:""}\n`});
  pb += `\nDevuélveme resumen con internal name y link de cada propiedad.`;
  P.push({id:"PROP-01",cat:"1. Propiedades",tp:"exec",pr:pb});

  P.push({id:"PL-01",cat:"2. Pipeline",tp:"exec",pr:`Crea pipeline "${pn}" con etapas: ${plStages}\n\nDevuélveme resumen con link.`});

  let tb=`MANUAL — Equipos de Venta\nConfig → Usuarios y equipos → Equipos\n\n`;
  ms.forEach(m=>{if(m.nombre&&(m.asesores||[]).length){tb+=`Equipo ${m.nombre}: ${m.asesores.map(a=>a.email).filter(Boolean).join(", ")}\n`}});
  P.push({id:"EQ-01",cat:"3. Equipos",tp:"spec",pr:tb});

  ms.forEach((m,i)=>{if(m.nombre)P.push({id:`WF-A${i+1}`,cat:"4. Workflows",tp:"exec",pr:`Workflow "Asignación ${m.nombre}":\nTrigger: lista_proyectos_fx = ${m.nombre}\nAcción: round robin Equipo ${m.nombre}`})});

  if(d.usaCalif) {
    ms.forEach((m,i)=>{
      if(!m.nombre||!m.rangoMinimo) return;
      const rIdx=d.rangos.indexOf(m.rangoMinimo);
      const below=rIdx>0?d.rangos[rIdx-1]:null;
      d.reglas.forEach((r,ri)=>{
        let trigger="", action=r.entonces;
        if(r.si==="Cumple ingreso mínimo") trigger=`lista_proyectos_fx=${m.nombre} Y rango_ingresos_fx=${m.rangoMinimo} Y tiene_ahorros_fx=${r.y==="Con ahorros"?"Sí":"No"}`;
        else if(r.si==="Un nivel debajo" && below) trigger=`lista_proyectos_fx=${m.nombre} Y rango_ingresos_fx=${below} Y tiene_ahorros_fx=${r.y==="Con ahorros"?"Sí":"No"}`;
        else if(r.si==="Inversionista") trigger=`proposito_compra_fx=Inversión`;
        if(trigger) P.push({id:`WF-Q${i+1}${String.fromCharCode(97+ri)}`,cat:"4. Workflows",tp:"exec",pr:`Workflow "Calif ${m.nombre} → ${action}":\nTrigger: ${trigger}\nAcción: tipo_lead_fx = ${action}`});
      });
    });
  }

  P.push({id:"WF-D1",cat:"4. Workflows",tp:"exec",pr:`Workflow "Crear Deal":\nTrigger: etapa_lead_fx = ${d.triggerDeal}\nAcciones:\n1) Crear negocio en ${pn}, Amount=0\n2) Copiar: lista_proyectos_fx→macroproyecto_fx, canal_atribucion_fx→canal_deal_fx, tipo_lead_fx→tipo_lead_deal_fx, proposito_compra_fx→proposito_deal_fx, cedula_fx→cedula_comp1_fx\n3) Notificar propietario: "Nuevo negocio {lista_proyectos_fx} - {firstname} {lastname} ({tipo_lead_fx})"`});
  P.push({id:"WF-D2",cat:"4. Workflows",tp:"exec",pr:`Workflow "Valor al Opcionar":\nTrigger: etapa → Opcionó\nAcción: valor_cotizacion_fx → Amount`});
  P.push({id:"WF-D3",cat:"4. Workflows",tp:"exec",pr:`Workflow "Alerta ${d.diasSinAct}d":\nTrigger: ${d.diasSinAct} días sin actividad\nAcción: tarea + notificación`});

  P.push({id:"LS-01",cat:"5. Lead Scoring",tp:"spec",pr:`MANUAL — Config → HubSpot Score\n\nEmail mktg abrió:+15 | clic:+20 | respondió:+25\nEmail ventas apertura:+15 | clic:+20 | respuesta:+30\nVisitó ${d.dominio}:+15 | Redes:+20 | Form:+50\nDecay: 30%/3m | Umbral: ${d.umbral}pts`});

  ms.forEach((m,i)=>{if(!m.nombre)return;const v=m.tipo==="VIS";const filtro=m.preguntaFiltroCustom||(v?`${m.nombre} en ${m.ciudad}, áreas ${m.areaDesde}. ¿Se acomoda?`:`${m.nombre} en ${m.ciudad}, ${m.areaDesde}, ${m.precioDesde}, cuotas ${m.cuotaDesde}. ¿Te interesa?`);
  P.push({id:`FM-${i+1}`,cat:"6. Formularios",tp:"spec",pr:`MANUAL — Form "${m.nombre}" (${m.tipo})\nFiltro: "${filtro}"\nCampos: ${v?"Email,Nombre,Apellido,Cédula,Cel":"Nombre,Apellido,Email,Cel"}\nCalificación: Rango Ingresos${v?"":", Ahorros, Propósito"}\nHidden: lista_proyectos_fx=${m.nombre}, canal_atribucion_fx=Sitio Web`})});

  P.push({id:"RPT-01",cat:"7. Informes",tp:"spec",pr:`MANUAL — 8 Informes:\n1.Embudo ${pn} 2.Ganados vs Perdidos/mes 3.Tiempo×etapa 4.Pipeline×Macro 5.Conversión×Canal 6.Cerrados×Asesor 7.Actividad ventas 8.Motivos pérdida`});

  P.push({id:"SEQ-01",cat:"8. Productividad",tp:"spec",pr:`MANUAL — Secuencia + Templates + Snippets + Playbook\n\nSecuencia: Día0:Email Día2:Llamada Día4:Email Día7:Cierre\nTemplates: Primer contacto, Brochure, Post-cotización\nSnippets: ${ms.map(m=>`#${(m.nombre||"").toLowerCase().replace(/\s/g,"_")}`).join(", ")}\nPlaybook: Calificación inmobiliaria\n\nNurturing Proyecto×Buyer:\n${ms.map(m=>(m.buyers||[]).map(b=>`${m.nombre} × ${b.nombre}`).join(", ")).filter(Boolean).join("\n")}`});

  ms.forEach((m,i)=>{if(m.nombre)P.push({id:`LP-${i+1}`,cat:"9. Landing Pages",tp:"spec",pr:`PROMPT IA HubSpot — Landing "${m.nombre}"\n${m.ciudad} | ${m.tipo} | Áreas ${m.areaDesde} | ${m.precioDesde}\n${m.amenities?`Amenidades: ${m.amenities}`:""}\nEstructura: Hero→Beneficios→Galería→Tipologías→Ubicación→Form→Footer`})});

  if(d.tieneAgente&&d.nomAgente){const info=ms.map(m=>`${m.nombre}: ${m.ciudad}, ${m.precioDesde}, ${m.tipologias}`).join(". ");
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
      prompt: `Visita https://${dm} y extrae TODOS los proyectos en comercialización de ${nm}.\n\nDevuelve una tabla con EXACTAMENTE 8 columnas separadas por TAB, en este orden:\n\nCOL1: Nombre del proyecto\nCOL2: Ciudad / ubicación\nCOL3: Tipo → "VIS" si precio < $187M COP, "No VIS" si mayor, "Mixto" si ambos\nCOL4: Precio desde (formato: $XXX.XXX.XXX o vacío)\nCOL5: Área desde (formato: "XX m2" o vacío)\nCOL6: Cuota mensual desde (formato: $X.XXX.XXX o vacío)\nCOL7: Tipos de unidad\nCOL8: Amenidades principales\n\nREGLAS ESTRICTAS:\n- EXACTAMENTE 8 columnas por fila. Dato faltante = celda VACÍA.\n- Separador: TAB. SIN encabezados. Solo filas de datos.\n- NO inventes datos. Solo lo visible en la web.\n- Una fila por proyecto.`,
    },
    torres: {
      title: "FocuxAI Scraping — Torres / Etapas",
      headers: ["Macroproyecto (exacto)","Torre/Etapa","Fecha Entrega","Meses Cuota Inicial","% Separación","% Cuota Inicial","Total Unidades"],
      examples: [
        ["Firenze","Torre 1","2028-06-15","35","1","30","120"],
        ["Firenze","Torre 2","2029-01-20","35","1","30","95"],
      ],
      prompt: `Visita https://${dm} y para CADA proyecto de ${nm}, extrae las torres o etapas disponibles.\n\nDevuelve una tabla con EXACTAMENTE 7 columnas separadas por TAB.\n\nREGLAS ESTRICTAS:\n- EXACTAMENTE 7 columnas por fila. Dato faltante = celda vacía.\n- Si un proyecto no tiene torres individuales, una fila con "Torre Única".\n- Separador: TAB. SIN encabezados. Solo datos.`,
    },
    equipos: {
      title: "FocuxAI Scraping — Equipo Comercial",
      headers: ["Macroproyecto (exacto)","Nombre Asesor","Email Corporativo","Meeting Link"],
      examples: [
        ["Firenze","María Gómez","maria@constructora.com",""],
        ["Caoba","Ana Martínez","ana@constructora.com",""],
      ],
      prompt: `Visita https://${dm} y busca información del equipo comercial de ${nm}.\n\nDevuelve una tabla con EXACTAMENTE 4 columnas separadas por TAB.\n\nREGLAS: Si no encuentras asesores por proyecto, usa el contacto general. EXACTAMENTE 4 columnas. SIN encabezados.`,
    },
    buyers: {
      title: "FocuxAI Scraping — Buyer Personas",
      headers: ["Macroproyecto (exacto)","Nombre Buyer Persona","Descripción"],
      examples: [
        ["Firenze","Familia Joven","Parejas 28-38, primer hogar, ingreso $6-12M, buscan 2-3 hab cerca a colegios"],
        ["Firenze","Inversionista","Profesional 35-55, compra para renta, busca ROI y valorización, prefiere 1-2 hab"],
      ],
      prompt: `Basándote en los proyectos de ${nm} (https://${dm}), genera 2-3 buyer personas por proyecto.\n\nDevuelve una tabla con EXACTAMENTE 3 columnas separadas por TAB.\n\nREGLAS: EXACTAMENTE 3 columnas. SIN encabezados. Una fila por buyer persona.`,
    },
    pipeline: {
      title: "FocuxAI Scraping — Pipeline de Ventas",
      headers: ["Nombre Etapa","% Probabilidad"],
      examples: [
        ["Cotización Solicitada","10"],["Opcionó","40"],["Consignó","60"],["Entregó Documentos","70"],
        ["Se vinculó a Fiducia","80"],["Firmó Documentos","90"],["Venta Formalizada","100"],["Perdida","0"],
      ],
      prompt: `Pipeline estándar Focux para constructoras del sector inmobiliario colombiano.\n\nSi ${nm} tiene un proceso diferente al estándar, ajusta las etapas.\n\nFormato: columnas separadas por TAB, sin encabezados, solo datos.`,
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
      prompt: `Motivos de descarte (lead) y pérdida (negocio) estándar del sector inmobiliario.\n\nSi conoces motivos específicos de ${nm}, agrégalos.\n\nFormato: columnas separadas por TAB, sin encabezados, solo datos.`,
    },
  };
  return templates[type] || null;
}

/* ═══ TEMPLATE MODAL ═══ */
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
        <Inp label="Nombre de la Constructora" value={d.nombreConst} onChange={v=>u("nombreConst",v)} required placeholder="Nombre de la constructora" />
        <Inp label="Dominio web principal" value={d.dominio} onChange={v=>u("dominio",v)} required placeholder="dominio.com.co" />
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
        <Inp label="Nombre del Pipeline" value={d.nombrePipeline} onChange={v=>u("nombrePipeline",v)} required placeholder="Pipeline Ventas [Constructora]" />
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
        <Chk label="Módulo 4: Agente IA" desc="Requiere Service Hub Pro o Enterprise" checked={d.tieneAgente} onChange={v=>u("tieneAgente",v)} />
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
        example={"Familia Joven\tParejas 28-38, primer hogar, ingreso $6-12M\nInversionista\tProfesional 35-55, compra para renta, busca ROI"} />
      {ms.map((m,i) => (
        <Card key={i} title={m.nombre||`Macroproyecto ${i+1}`} subtitle={m.ciudad ? `${m.ciudad} · ${m.tipo}` : ""} onRemove={()=>rm(i)} accent>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px"}}>
            <Inp label="Nombre del Macroproyecto" value={m.nombre} onChange={v=>up(i,"nombre",v)} required placeholder="Nombre del proyecto" />
            <Inp label="Ciudad / Ubicación" value={m.ciudad} onChange={v=>up(i,"ciudad",v)} required placeholder="Ciudad, sector" />
            <Sel label="Tipo de Proyecto" value={m.tipo} onChange={v=>up(i,"tipo",v)} required options={["No VIS","VIS","Mixto"]} />
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

/* ═══ STEPS 2-4: Torres, Equipos, Canales ═══ */
function S2({d,u}) {
  const ms=d.macros||[];const[sp,setSp]=useState(false);const[pt,sPt]=useState(0);const[tplModal,setTplModal]=useState(null);
  const up=(mi,ti,f,v)=>{const n=[...ms];n[mi]={...n[mi],torres:[...(n[mi].torres||[])]};n[mi].torres[ti]={...n[mi].torres[ti],[f]:v};u("macros",n)};
  const add=mi=>{const n=[...ms];n[mi]={...n[mi],torres:[...(n[mi].torres||[]),{nombre:"",fechaEntrega:"",mesesCI:"",pctSep:"1",pctCI:"30",totalU:""}]};u("macros",n)};
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
                <Inp label="Fecha de Entrega" value={t.fechaEntrega} onChange={v=>up(mi,ti,"fechaEntrega",v)} type="date" required />
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
  const up=(mi,ai,f,v)=>{const n=[...ms];n[mi]={...n[mi],asesores:[...(n[mi].asesores||[])]};n[mi].asesores[ai]={...n[mi].asesores[ai],[f]:v};u("macros",n)};
  const add=mi=>{const n=[...ms];n[mi]={...n[mi],asesores:[...(n[mi].asesores||[]),{nombre:"",email:"",ml:""}]};u("macros",n)};
  const rm=(mi,ai)=>{const n=[...ms];n[mi]={...n[mi],asesores:[...n[mi].asesores]};n[mi].asesores.splice(ai,1);u("macros",n)};
  const paste=rows=>{const n=[...ms];n[pt]={...n[pt],asesores:[...(n[pt].asesores||[]),...rows.map(r=>({nombre:r[0]||"",email:r[1]||"",ml:r[2]||""}))]};u("macros",n)};
  if(!ms.length) return <InfoBox type="warn">Agrega macroproyectos primero en el Paso 2.</InfoBox>;
  return (
    <div>
      <BulkBar onPaste={null} onTemplate={()=>setTplModal(getTemplate("equipos",d.nombreConst,d.dominio))} templateLabel="FocuxAI Scraping — Equipos" />
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
      <PasteModal open={sp} onClose={()=>setSp(false)} onParse={paste} title={`Importar Asesores → ${ms[pt]?.nombre||""}`}
        description="Nombre del asesor, email corporativo, enlace de agendamiento (opcional)"
        cols={[{label:"Nombre",required:true},{label:"Email",required:true},{label:"Meeting Link"}]} example="María Gómez\tmaria@constructora.com\tmeetings.hubspot.com/maria" />
      {ms.map((m,mi) => (
        <div key={mi} style={{marginBottom:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h3 style={{margin:0,fontSize:15,fontWeight:700,color:tk.navy}}>Equipo {m.nombre||mi+1}</h3>
            <button onClick={()=>{sPt(mi);setSp(true)}} style={{padding:"5px 12px",borderRadius:6,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.textSec,fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:600}}>📋 Pegar asesores</button>
          </div>
          {(m.asesores||[]).map((a,ai) => (
            <Card key={ai} title={a.nombre||`Asesor ${ai+1}`} onRemove={()=>rm(mi,ai)}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0 10px"}}>
                <Inp label="Nombre" value={a.nombre} onChange={v=>up(mi,ai,"nombre",v)} required placeholder="Nombre completo" />
                <Inp label="Email" value={a.email} onChange={v=>up(mi,ai,"email",v)} required placeholder="email@constructora.com" type="email" />
                <Inp label="Meeting Link" value={a.ml} onChange={v=>up(mi,ai,"ml",v)} placeholder="Opcional" note="Se configura después de crear equipos" />
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
          <input value={c} onChange={e=>{const n=[...d.chCu];n[i]=e.target.value;u("chCu",n)}} placeholder="Nombre del canal personalizado"
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
        <SectionHead sub="Variables que se capturan en el formulario">Variables de Calificación</SectionHead>
        {d.varsCalif.map((v,i)=>(
          <Chk key={i} label={v.label} checked={v.on} onChange={val=>{const n=[...d.varsCalif];n[i]={...n[i],on:val};u("varsCalif",n)}} />
        ))}
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
        title="Importar Etapas del Lead" description="Si incluyes columna Fase, las etapas se distribuyen automáticamente"
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
        title="Importar Etapas del Pipeline" description="Nombre de la etapa y probabilidad de cierre (%)"
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
        title="Importar Motivos" description="Si incluyes columna Tipo (Descarte/Pérdida), se distribuyen automáticamente"
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
  const ex=d.ex||{};const cats=[...new Set(prms.map(p=>p.cat))];const totE=Object.values(ex).filter(Boolean).length;
  const[mode,setM]=useState(false);const[ci,setCi]=useState(0);
  const cp=t=>navigator.clipboard.writeText(t).catch(()=>{});
  const expJ=()=>{const b=new Blob([JSON.stringify(d,null,2)],{type:"application/json"});const u2=URL.createObjectURL(b);const a=document.createElement("a");a.href=u2;a.download=`${d.nombreConst||"config"}_hubspot.json`;a.click()};
  const genCSV=(type)=>{
    let cols=[];
    if(type==="contactos") cols=["email","firstname","lastname","phone","cedula_fx","lista_proyectos_fx","canal_atribucion_fx","tipo_lead_fx","rango_ingresos_fx","tiene_ahorros_fx","proposito_compra_fx","etapa_lead_fx","horizonte_compra_fx","horario_contacto_fx","id_externo_fx"];
    else cols=["dealname","macroproyecto_fx","proyecto_torre_fx","valor_cotizacion_fx","tipo_unidad_fx","area_m2_fx","pipeline","dealstage","cedula_comp1_fx","nombre_comp2_fx","apellido_comp2_fx","tel_comp2_fx","email_comp2_fx","cedula_comp2_fx","id_externo_deal_fx"];
    const csv=cols.join(",")+"\n"+cols.map(()=>"").join(",")+"\n";
    const b=new Blob([csv],{type:"text/csv"});const u2=URL.createObjectURL(b);const a=document.createElement("a");a.href=u2;a.download=`plantilla_migracion_${type}_${d.nombreConst||"constructora"}.csv`;a.click();
  };
  const [tplModal,setTplModal]=useState(null);
  const eP=prms.filter(p=>p.tp==="exec").length, sP=prms.filter(p=>p.tp==="spec").length;

  if(mode){const cur=prms[ci];
    if(!cur) return(<div style={{textAlign:"center",padding:40}}><p style={{fontSize:20,color:tk.green,fontWeight:700}}>🎉 ¡Implementación completa!</p><p style={{color:tk.textSec,marginTop:8}}>Todos los {prms.length} pasos ejecutados.</p><button onClick={()=>setM(false)} style={{marginTop:16,padding:"10px 24px",borderRadius:8,border:"none",background:tk.navy,color:"#fff",cursor:"pointer",fontWeight:600,fontFamily:font,fontSize:14}}>Ver resumen</button></div>);
    return(
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><Badge text={cur.tp==="exec"?"⚡ Breeze":"📋 Manual"} color={cur.tp==="exec"?tk.accent:tk.amber} /><span style={{fontSize:12,color:tk.textSec}}>Paso {ci+1} de {prms.length}</span></div>
          <button onClick={()=>setM(false)} style={{fontSize:12,color:tk.textSec,background:"none",border:`1.5px solid ${tk.border}`,borderRadius:6,padding:"5px 12px",cursor:"pointer",fontFamily:font}}>Salir modo guiado</button>
        </div>
        <div style={{background:tk.border,borderRadius:6,padding:2,marginBottom:14}}><div style={{height:4,borderRadius:4,background:`linear-gradient(90deg,${tk.teal},${tk.cyan})`,width:`${((ci+1)/prms.length)*100}%`,transition:"width 0.4s ease"}}/></div>
        <h3 style={{color:tk.navy,fontSize:16,fontWeight:700,margin:"0 0 10px"}}>{cur.id}</h3>
        <div style={{background:tk.bg,border:`1.5px solid ${tk.border}`,borderRadius:10,padding:16,marginBottom:14}}>
          <pre style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:tk.text,whiteSpace:"pre-wrap",margin:0,lineHeight:1.6}}>{cur.pr}</pre>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>cp(cur.pr)} style={{padding:"9px 20px",borderRadius:8,border:"none",background:tk.accent,color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600,fontFamily:font}}>📋 Copiar</button>
          <button onClick={()=>{u("ex",{...ex,[cur.id]:true});setCi(ci+1)}} style={{padding:"9px 20px",borderRadius:8,border:"none",background:tk.green,color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600,fontFamily:font}}>✅ Hecho → Siguiente</button>
          <button onClick={()=>setCi(ci+1)} style={{padding:"9px 20px",borderRadius:8,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.textSec,fontSize:13,cursor:"pointer",fontFamily:font}}>Saltar</button>
        </div>
        <div style={{marginTop:14}}><Inp label="Notas de verificación" value={(d.vn||{})[cur.id]||""} onChange={v=>u("vn",{...(d.vn||{}),[cur.id]:v})} placeholder="Pega aquí el resumen de Breeze o tus notas..." /></div>
      </div>
    );
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <p style={{margin:0,fontSize:13,fontWeight:600,color:tk.text}}>{prms.length} pasos · <span style={{color:tk.green}}>{totE} hechos</span> · <span style={{color:tk.amber}}>{prms.length-totE} pendientes</span></p>
          <p style={{margin:"2px 0 0",fontSize:11,color:tk.textTer}}>⏱ Estimado: ~{Math.round((eP*1.5+sP*5)/60*10)/10} horas</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>{setM(true);const idx=prms.findIndex(p=>!ex[p.id]);setCi(idx>=0?idx:0)}} style={{padding:"8px 16px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${tk.teal},${tk.blue})`,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>▶ Modo Guiado</button>
          <button onClick={expJ} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.text,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>📥 JSON</button>
          <button onClick={()=>genCSV("contactos")} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.text,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>📄 CSV Contactos</button>
          <button onClick={()=>genCSV("negocios")} style={{padding:"8px 16px",borderRadius:8,border:`1.5px solid ${tk.border}`,background:tk.card,color:tk.text,fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:font}}>📄 CSV Negocios</button>
        </div>
      </div>
      <TemplateModal open={!!tplModal} onClose={()=>setTplModal(null)} template={tplModal} />
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
                    <input type="checkbox" checked={!!ex[pr.id]} onChange={()=>u("ex",{...ex,[pr.id]:!ex[pr.id]})} style={{accentColor:tk.green,width:14,height:14}} />✓
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

/* ═══ STEP 12: OBJECIONES ═══ */
function S12() {
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

/* ═══════════════════════════════════════════════════════════
   HOME SCREEN — Multi-Client Central
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
        <p style={{ margin:0, color:"rgba(255,255,255,0.6)", fontSize:13, fontWeight:500 }}>HubSpot Implementation Engine — Central de Clientes</p>
      </div>

      <div style={{ maxWidth:900, margin:"-28px auto 0", padding:"0 20px 40px" }}>
        <div style={{ display:"flex", gap:10, marginBottom:24, flexWrap:"wrap" }}>
          <button onClick={onNew} style={{
            padding:"12px 24px", borderRadius:10, border:"none",
            background:`linear-gradient(135deg, ${tk.teal}, ${tk.blue})`,
            color:"#fff", fontSize:14, cursor:"pointer", fontWeight:700, fontFamily:font,
            boxShadow:"0 4px 14px rgba(13,122,181,0.35)", transition:"all 0.2s",
          }}>+ Nuevo Cliente</button>
          <button onClick={()=>fileRef.current?.click()} style={{
            padding:"12px 24px", borderRadius:10, border:`1.5px solid ${tk.border}`,
            background:tk.card, color:tk.textSec, fontSize:14, cursor:"pointer", fontWeight:600, fontFamily:font,
            transition:"all 0.2s",
          }}>📥 Importar JSON</button>
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
                <div key={cl.id} style={{
                  background:tk.card, borderRadius:14, border:`1.5px solid ${tk.border}`, overflow:"hidden",
                  cursor:"pointer", transition:"all 0.2s", position:"relative",
                }} onClick={() => onOpen(cl.id)}
                   onMouseOver={e => { e.currentTarget.style.borderColor = tk.accent; e.currentTarget.style.boxShadow = "0 4px 20px rgba(13,122,181,0.12)"; }}
                   onMouseOut={e => { e.currentTarget.style.borderColor = tk.border; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ height:4, background:tk.borderLight }}>
                    <div style={{ height:4, background:pctColor, width:`${pct}%`, transition:"width 0.3s" }} />
                  </div>
                  <div style={{ padding:"16px 18px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:tk.navy, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {cl.name || "Sin nombre"}
                        </h3>
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
                        <button onClick={() => onExport(cl.id)} title="Exportar JSON" style={{
                          background:"none", border:`1px solid ${tk.border}`, borderRadius:6, width:28, height:28,
                          fontSize:12, cursor:"pointer", color:tk.textSec, display:"flex", alignItems:"center", justifyContent:"center",
                        }} onMouseOver={e=>e.currentTarget.style.borderColor=tk.accent} onMouseOut={e=>e.currentTarget.style.borderColor=tk.border}>📤</button>
                        <button onClick={() => setConfirm(cl.id)} title="Eliminar" style={{
                          background:"none", border:`1px solid ${tk.border}`, borderRadius:6, width:28, height:28,
                          fontSize:12, cursor:"pointer", color:tk.textTer, display:"flex", alignItems:"center", justifyContent:"center",
                        }} onMouseOver={e=>{e.currentTarget.style.borderColor=tk.red;e.currentTarget.style.color=tk.red}} onMouseOut={e=>{e.currentTarget.style.borderColor=tk.border;e.currentTarget.style.color=tk.textTer}}>🗑</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", display:"flex", justifyContent:"center", alignItems:"center", zIndex:1000, backdropFilter:"blur(4px)" }}>
          <div style={{ background:tk.card, borderRadius:16, padding:24, maxWidth:400, textAlign:"center", boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <p style={{ fontSize:36, margin:"0 0 12px" }}>⚠️</p>
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

/* ═══════════════════════════════════════════════════════════
   VERSION PANEL
   ═══════════════════════════════════════════════════════════ */
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
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={() => onRestore(v.data)} style={{
                  padding:"5px 14px", borderRadius:6, border:`1.5px solid ${tk.accent}`, background:tk.card,
                  color:tk.accent, fontSize:11, cursor:"pointer", fontWeight:600, fontFamily:font,
                }}>Restaurar</button>
                <span style={{ fontSize:10, color:tk.textTer, paddingTop:4 }}>
                  {v.data.nombreConst || "Sin nombre"} · {(v.data.macros||[]).length} proy · {calcOverallPct(v.data)}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   WIZARD SHELL — Client workspace
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
    // Update index metadata
    const idx = await loadIndex();
    const ci = idx.findIndex(c => c.id === clientId);
    if (ci >= 0) {
      idx[ci] = { ...idx[ci], name: nd.nombreConst, domain: nd.dominio, macros: (nd.macros||[]).length, sales: nd.hubSales, pct: calcOverallPct(nd), updatedAt: Date.now() };
      await saveIndex(idx);
    }
    // Auto-snapshot every 90 seconds
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
    setD({...makeBlankState(), ...data});
    await persist({...makeBlankState(), ...data}, "Restauración manual");
    setVerOpen(false);
  };

  const exportJSON = () => {
    const b = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const u2 = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = u2; a.download = `${d.nombreConst || "config"}_focuxai.json`; a.click();
  };

  const Comps = [S0, S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13];
  const Cur = Comps[d.step] || S0;

  return (
    <div style={{ fontFamily: font, background: tk.bg, minHeight: "100vh", color: tk.text }}>
      <VersionPanel open={verOpen} onClose={() => setVerOpen(false)} versions={versions} onRestore={restoreVersion} />

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${tk.navy} 0%, ${tk.blue} 50%, ${tk.teal} 100%)`, padding: "0 24px", height: 52, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={async () => { await pushVersion(clientId, d, "Salida manual"); onBack(); }} style={{
            background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, width: 32, height: 32,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", fontSize: 16,
          }} title="Volver al Home">←</button>
          <img src={FOCUX_ICON} alt="Focux" style={{ height:28, borderRadius:4 }} />
          <div>
            <h1 style={{ margin: 0, color: "#fff", fontSize: 14, fontWeight: 800, letterSpacing: "0.05em" }}>FOCUXAI OPS</h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 500 }}>HubSpot Implementation Engine</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>Guardando...</span>}
          <button onClick={openVersions} style={{
            background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, padding: "5px 10px",
            color: "rgba(255,255,255,0.8)", fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: font,
          }} title="Historial de versiones">🕐 Versiones</button>
          <button onClick={exportJSON} style={{
            background: "rgba(255,255,255,0.12)", border: "none", borderRadius: 6, padding: "5px 10px",
            color: "rgba(255,255,255,0.8)", fontSize: 11, cursor: "pointer", fontWeight: 600, fontFamily: font,
          }} title="Exportar JSON">📤 JSON</button>
          {d.nombreConst && <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, marginLeft: 4 }}>{d.nombreConst}</span>}
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
                transition: "all 0.15s", fontFamily: font,
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

/* ═══════════════════════════════════════════════════════════
   MAIN APP — Router between Home and Wizard
   ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [ready, setReady] = useState(false);
  const [clients, setClients] = useState([]);
  const [activeClient, setActiveClient] = useState(null); // { id, data }

  const refreshClients = useCallback(async () => {
    const idx = await loadIndex();
    setClients(idx);
  }, []);

  // Migrate from old single-client storage
  useEffect(() => {
    (async () => {
      const idx = await loadIndex();
      if (idx.length === 0) {
        // Check for legacy data
        try {
          const old = await sGet("focuxai-v4");
          if (old && old.nombreConst) {
            const id = uid();
            const data = { ...makeBlankState(), ...old };
            await saveClient(id, data);
            const meta = { id, name: old.nombreConst, domain: old.dominio, macros: (old.macros||[]).length, sales: old.hubSales, pct: calcOverallPct(data), updatedAt: Date.now() };
            await saveIndex([meta]);
            await pushVersion(id, data, "Migración v6→v7");
            setClients([meta]);
          }
        } catch {}
      } else {
        setClients(idx);
      }
      setReady(true);
    })();
  }, []);

  const openClient = async (id) => {
    const data = await loadClient(id);
    if (data) {
      setActiveClient({ id, data: { ...makeBlankState(), ...data } });
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
    const data = { ...makeBlankState(), ...jsonData, step: 0 };
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
    const b = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const u2 = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = u2; a.download = `${data.nombreConst || "config"}_focuxai.json`; a.click();
  };

  if (!ready) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: tk.bg, fontFamily: font }}>
      <div style={{ textAlign: "center" }}>
        <img src={FOCUX_ICON} alt="Focux" style={{ width:48, height:48, animation:"spin 0.8s linear infinite", margin:"0 auto 12px", display:"block" }} />
        <p style={{ color: tk.textSec, fontSize: 13 }}>Cargando FocuxAI Ops...</p>
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
