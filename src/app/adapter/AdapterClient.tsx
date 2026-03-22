// @ts-nocheck
"use client";
import { useState, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   FOCUXAI ENGINE™ — HUBSPOT ADAPTER v2
   Config JSON → HubSpot API (Properties + Pipeline + Workflows)
   Deterministic. Auditable. Unstoppable.
   ═══════════════════════════════════════════════════════════ */

/* API calls go through /api/hubspot/ proxy → api.hubapi.com */
const font = "'Plus Jakarta Sans', system-ui, sans-serif";
const tk = {
  navy:"#211968", blue:"#1A4BA8", teal:"#0D7AB5", cyan:"#2099D8",
  bg:"#0B0E1A", card:"#12162B", cardHover:"#1A1F38", border:"#2A2F4A",
  text:"#E8ECF4", textSec:"#8B92A8", textTer:"#5A6078",
  green:"#10B981", red:"#EF4444", amber:"#F59E0B",
  greenBg:"#10B98115", redBg:"#EF444415", amberBg:"#F59E0B15",
  accent:"#0D7AB5", accentGlow:"#0D7AB530",
};

/* ═══ API HELPER ═══ */
async function hubspotAPI(token, method, path, body=null) {
  const opts = {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api/hubspot${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { status: res.status, message: data.message || JSON.stringify(data), category: data.category };
  return data;
}

/* ═══ OPTION VALUE NORMALIZER ═══ */
function optVal(label) {
  return label.toLowerCase().replace(/[^a-záéíóúñ0-9]+/g, "_").replace(/^_|_$/g, "");
}

/* ═══ PROPERTY BUILDERS (unchanged from v1) ═══ */
function buildContactProperties(config) {
  const macroNames = config.macros.map(m => m.nombre).filter(Boolean);
  const torreNames = config.macros.flatMap(m => (m.torres||[]).map(t => `${m.nombre} ${t.nombre}`)).filter(Boolean);
  const channels = [...(config.chStd||[]).filter(c=>c.a).map(c=>c.n), ...(config.chTr||[]).filter(c=>c.a).map(c=>c.n), ...(config.chCu||[]).filter(Boolean)];
  const etapas = [...(config.etP||[]), ...(config.etS||[])].filter(Boolean);
  const getVarOpts = (id) => {
    const v = (config.varsCalif||[]).find(v => v.id === id);
    return v && v.on && (v.opts||[]).length ? v.opts : null;
  };
  const props = [
    { name:"lista_proyectos_fx", label:"Lista de Proyectos", type:"enumeration", fieldType:"checkbox", options: macroNames },
    { name:"canal_atribucion_fx", label:"Canal de Atribución", type:"enumeration", fieldType:"select", options: channels },
    { name:"etapa_lead_fx", label:"Etapa del Lead", type:"enumeration", fieldType:"select", options: etapas },
    { name:"tipo_lead_fx", label:"Tipo de Lead", type:"enumeration", fieldType:"select", options: config.niveles || [] },
    { name:"motivo_descarte_fx", label:"Motivo de Descarte", type:"enumeration", fieldType:"select", options: config.moD || [] },
    { name:"rango_ingresos_fx", label:"Rango de Ingresos", type:"enumeration", fieldType:"select", options: config.rangos || [] },
    { name:"tiene_ahorros_fx", label:"Tiene Ahorros", type:"enumeration", fieldType:"booleancheckbox", options: getVarOpts("ahorros") || ["Sí","No"] },
    { name:"proposito_compra_fx", label:"Propósito de Compra", type:"enumeration", fieldType:"select", options: getVarOpts("proposito") || ["Vivienda","Inversión"] },
    { name:"horizonte_compra_fx", label:"Horizonte de Compra", type:"enumeration", fieldType:"select", options: getVarOpts("horizonte") || ["Inmediato","Antes de 3 meses","De 3 a 6 meses","Más de 6 meses"] },
    { name:"horario_contacto_fx", label:"Horario de Contacto", type:"enumeration", fieldType:"select", options: getVarOpts("horario") || ["Lunes a Viernes 9am-12m","Lunes a Viernes 12m-2pm","Lunes a Viernes 2pm-6pm","Lunes a Viernes 6pm-8pm","Sábados en la Mañana"] },
    { name:"credito_preaprobado_fx", label:"Crédito Preaprobado", type:"enumeration", fieldType:"booleancheckbox", options: getVarOpts("credito") || ["Sí","No"] },
    { name:"aplica_subsidios_fx", label:"Aplica Subsidios", type:"enumeration", fieldType:"booleancheckbox", options: getVarOpts("subsidios") || ["Sí","No"] },
    { name:"cedula_fx", label:"Cédula", type:"string", fieldType:"text" },
    { name:"id_externo_fx", label:"ID Externo (Migración)", type:"string", fieldType:"text" },
  ];
  (config.varsCalif||[]).filter(v => v.on && v.id.startsWith("custom_") && (v.opts||[]).length).forEach(v => {
    const internalName = v.label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")+"_fx";
    props.push({ name: internalName, label: v.label, type:"enumeration", fieldType:"select", options: v.opts });
  });
  return props;
}

function buildDealProperties(config) {
  const macroNames = config.macros.map(m => m.nombre).filter(Boolean);
  const torreNames = config.macros.flatMap(m => (m.torres||[]).map(t => `${m.nombre} ${t.nombre}`)).filter(Boolean);
  const channels = [...(config.chStd||[]).filter(c=>c.a).map(c=>c.n), ...(config.chTr||[]).filter(c=>c.a).map(c=>c.n), ...(config.chCu||[]).filter(Boolean)];
  return [
    { name:"macroproyecto_fx", label:"Macroproyecto", type:"enumeration", fieldType:"select", options: macroNames },
    { name:"proyecto_torre_fx", label:"Proyecto / Torre", type:"enumeration", fieldType:"select", options: torreNames },
    { name:"nro_cotizacion_fx", label:"Número de Cotización", type:"string", fieldType:"text" },
    { name:"valor_cotizacion_fx", label:"Valor Cotización", type:"number", fieldType:"number" },
    { name:"unidad_principal_fx", label:"Unidad Principal", type:"string", fieldType:"text" },
    { name:"tipo_unidad_fx", label:"Tipo Unidad", type:"enumeration", fieldType:"select", options:["Apartamento","Casa","Local","Lote","Bodega","Apartasuite"] },
    { name:"area_m2_fx", label:"Área m2", type:"number", fieldType:"number" },
    { name:"habitaciones_fx", label:"Habitaciones", type:"number", fieldType:"number" },
    { name:"banos_fx", label:"Baños", type:"number", fieldType:"number" },
    { name:"parqueadero_fx", label:"Parqueadero", type:"string", fieldType:"text" },
    { name:"deposito_fx", label:"Depósito", type:"string", fieldType:"text" },
    { name:"fecha_entrega_fx", label:"Fecha Entrega", type:"date", fieldType:"date" },
    { name:"motivo_perdida_fx", label:"Motivo Pérdida", type:"enumeration", fieldType:"select", options: config.moP || [] },
    { name:"id_externo_deal_fx", label:"ID Externo", type:"string", fieldType:"text" },
    { name:"canal_deal_fx", label:"Canal Atribución", type:"enumeration", fieldType:"select", options: channels },
    { name:"tipo_lead_deal_fx", label:"Tipo Lead", type:"enumeration", fieldType:"select", options: config.niveles || [] },
    { name:"proposito_deal_fx", label:"Propósito Compra", type:"enumeration", fieldType:"select", options:["Vivienda","Inversión"] },
    { name:"cedula_comp1_fx", label:"Cédula Comprador 1", type:"string", fieldType:"text" },
    { name:"nombre_comp2_fx", label:"Nombre Comprador 2", type:"string", fieldType:"text" },
    { name:"apellido_comp2_fx", label:"Apellido Comprador 2", type:"string", fieldType:"text" },
    { name:"tel_comp2_fx", label:"Teléfono Comprador 2", type:"string", fieldType:"text" },
    { name:"email_comp2_fx", label:"Email Comprador 2", type:"string", fieldType:"text" },
    { name:"cedula_comp2_fx", label:"Cédula Comprador 2", type:"string", fieldType:"text" },
  ];
}

function buildPropertyPayload(prop) {
  const payload = { groupName: "focux", name: prop.name, label: prop.label, type: prop.type, fieldType: prop.fieldType };
  if (prop.options && prop.options.length) {
    payload.options = prop.options.map((opt, i) => ({ label: opt, value: optVal(opt), displayOrder: i }));
  }
  return payload;
}

function buildPipelinePayload(config) {
  return {
    displayOrder: 0,
    label: config.nombrePipeline || "Pipeline Ventas",
    stages: (config.pipeline || []).map((s, i) => ({
      label: s.n, displayOrder: i, metadata: { probability: String(s.p / 100) },
    })),
  };
}

/* ═══════════════════════════════════════════════════════════
   WORKFLOW BUILDERS — API v4
   ═══════════════════════════════════════════════════════════ */

/* Helper: build LIST_BASED enrollment with AND filters on contact properties */
function listEnrollment(filters, shouldReEnroll = true) {
  return {
    shouldReEnroll,
    type: "LIST_BASED",
    listFilterBranch: {
      filterBranches: [{
        filterBranches: [],
        filters: filters.map(f => {
          // TIME_RANGED filters use a completely different structure
          if (f.operationType === "TIME_RANGED") {
            return {
              property: f.property,
              operation: {
                operator: "IS_BETWEEN",
                includeObjectsWithNoValueSet: false,
                lowerBoundEndpointBehavior: "INCLUSIVE",
                upperBoundEndpointBehavior: "INCLUSIVE",
                propertyParser: "VALUE",
                lowerBoundTimePoint: f.lowerBoundTimePoint,
                upperBoundTimePoint: f.upperBoundTimePoint,
                type: "TIME_RANGED",
                operationType: "TIME_RANGED",
              },
              filterType: "PROPERTY",
            };
          }
          // HAS_PROPERTY → check if property has any value
          if (f.operator === "HAS_PROPERTY") {
            return {
              property: f.property,
              operation: {
                operator: "HAS_PROPERTY",
                includeObjectsWithNoValueSet: false,
                operationType: "MULTISTRING",
              },
              filterType: "PROPERTY",
            };
          }
          // Standard MULTISTRING filters
          // LIST_BASED only supports IS_EQUAL_TO — for multiple values it works as "is any of"
          return {
            property: f.property,
            operation: {
              operator: "IS_EQUAL_TO",
              includeObjectsWithNoValueSet: false,
              values: f.values || [],
              operationType: f.operationType || "MULTISTRING",
            },
            filterType: "PROPERTY",
          };
        }),
        filterBranchType: "AND",
        filterBranchOperator: "AND",
      }],
      filters: [],
      filterBranchType: "OR",
      filterBranchOperator: "OR",
    },
    unEnrollObjectsNotMeetingCriteria: false,
    reEnrollmentTriggersFilterBranches: [],
  };
}

/* Helper: build EVENT_BASED enrollment on property changed */
function eventEnrollment(propertyName, shouldReEnroll = true) {
  return {
    shouldReEnroll,
    type: "EVENT_BASED",
    eventFilterBranches: [{
      filterBranches: [],
      filters: propertyName ? [{
        property: propertyName,
        operation: { operator: "HAS_EVER_BEEN_ANY_OF", includeObjectsWithNoValueSet: false, operationType: "ENUMERATION" },
        filterType: "PROPERTY",
      }] : [],
      eventTypeId: "4-655002",
      operator: "HAS_COMPLETED",
      filterBranchType: "UNIFIED_EVENTS",
      filterBranchOperator: "AND",
    }],
    listMembershipFilterBranches: [],
  };
}

/* Action: set a property value */
function setPropertyAction(actionId, propName, value, nextActionId) {
  const action = {
    type: "SINGLE_CONNECTION",
    actionId: String(actionId),
    actionTypeVersion: 0,
    actionTypeId: "0-5",
    fields: {
      property_name: propName,
      value: { staticValue: optVal(value) },
    },
  };
  if (nextActionId) {
    action.connection = { edgeType: "STANDARD", nextActionId: String(nextActionId) };
  }
  return action;
}

/* Action: rotate record to owner (round robin) */
function rotateOwnerAction(actionId, userIds, nextActionId) {
  const action = {
    type: "SINGLE_CONNECTION",
    actionId: String(actionId),
    actionTypeVersion: 0,
    actionTypeId: "0-11",
    fields: {
      property_name: "hubspot_owner_id",
      user_ids: userIds.map(String),
    },
  };
  if (nextActionId) {
    action.connection = { edgeType: "STANDARD", nextActionId: String(nextActionId) };
  }
  return action;
}

/* Action: create task */
function createTaskAction(actionId, subject, nextActionId) {
  const action = {
    type: "SINGLE_CONNECTION",
    actionId: String(actionId),
    actionTypeVersion: 0,
    actionTypeId: "0-3",
    fields: {
      task_type: "TODO",
      subject,
      body: `<p>${subject}</p>`,
      associations: [{
        target: { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 10 },
        value: { type: "ENROLLED_OBJECT" },
      }],
      use_explicit_associations: "true",
      priority: "HIGH",
    },
  };
  if (nextActionId) {
    action.connection = { edgeType: "STANDARD", nextActionId: String(nextActionId) };
  }
  return action;
}

/* Action: send in-app notification */
function notifyAction(actionId, subject, body, nextActionId) {
  const action = {
    type: "SINGLE_CONNECTION",
    actionId: String(actionId),
    actionTypeVersion: 0,
    actionTypeId: "0-9",
    fields: {
      delivery_method: "APP",
      subject,
      body,
    },
  };
  if (nextActionId) {
    action.connection = { edgeType: "STANDARD", nextActionId: String(nextActionId) };
  }
  return action;
}

/* Action: create a deal record */
function createDealAction(actionId, pipelineId, stageId, propertyMappings, nextActionId) {
  const properties = [
    { targetProperty: "dealstage", value: { type: "STATIC_VALUE", staticValue: stageId } },
    { targetProperty: "pipeline", value: { type: "STATIC_VALUE", staticValue: pipelineId } },
    { targetProperty: "amount", value: { type: "STATIC_VALUE", staticValue: "0" } },
    { targetProperty: "dealname", value: { type: "STATIC_VALUE", staticValue: "Nuevo negocio" } },
  ];
  // Add copy-from-contact mappings
  propertyMappings.forEach(([fromContact, toDeal]) => {
    properties.push({
      targetProperty: toDeal,
      value: { type: "OBJECT_PROPERTY", propertyName: fromContact },
    });
  });
  const action = {
    type: "SINGLE_CONNECTION",
    actionId: String(actionId),
    actionTypeVersion: 0,
    actionTypeId: "0-14",
    fields: {
      object_type_id: "0-3",
      properties,
      associations: [{
        target: { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 },
        value: { type: "ENROLLED_OBJECT" },
      }],
      use_explicit_associations: "true",
    },
  };
  if (nextActionId) {
    action.connection = { edgeType: "STANDARD", nextActionId: String(nextActionId) };
  }
  return action;
}

/* ═══ BUILD ALL WORKFLOW PAYLOADS FROM CONFIG ═══ */
function buildWorkflows(config, context) {
  const workflows = [];
  const ms = config.macros || [];
  const pipelineId = context.pipelineId || "";
  const firstStageId = context.firstStageId || "";
  const userIdMap = context.userIdMap || {}; // email → hubspot user id

  // ── WF-Q: QUALIFICATION (per macro × rule) ──
  if (config.usaCalif) {
    ms.forEach((m, mi) => {
      if (!m.nombre || !m.rangoMinimo) return;
      const rIdx = (config.rangos || []).indexOf(m.rangoMinimo);
      const oneBelow = rIdx > 0 ? config.rangos[rIdx - 1] : null;
      const allBelow = rIdx > 0 ? config.rangos.slice(0, rIdx) : [];

      (config.reglas || []).forEach((r, ri) => {
        const filters = [];
        // Project filter — IS_EQUAL_TO with array works as "is any of"
        filters.push({ property: "lista_proyectos_fx", values: [optVal(m.nombre)] });

        // Income condition
        if (r.si === "Cumple ingreso mínimo") {
          filters.push({ property: "rango_ingresos_fx", values: [optVal(m.rangoMinimo)] });
        } else if (r.si === "Un nivel debajo" && oneBelow) {
          filters.push({ property: "rango_ingresos_fx", values: [optVal(oneBelow)] });
        } else if (r.si === "No cumple requisito" && allBelow.length) {
          filters.push({ property: "rango_ingresos_fx", values: allBelow.map(optVal) });
        } else if (r.si === "Inversionista") {
          filters.push({ property: "proposito_compra_fx", values: [optVal("Inversión")] });
        } else if (r.si === "No desea ser contactado") {
          filters.push({ property: "motivo_descarte_fx", operator: "HAS_PROPERTY" });
        } else if (r.si === "Un nivel debajo" && !oneBelow) return;
        else if (r.si === "No cumple requisito" && !allBelow.length) return;

        // Secondary variable
        if (r.y && r.y !== "Cualquiera") {
          if (r.y === "Con ahorros") filters.push({ property: "tiene_ahorros_fx", values: [optVal("Sí")] });
          else if (r.y === "Sin ahorros") filters.push({ property: "tiene_ahorros_fx", values: [optVal("No")] });
        }

        if (filters.length < 2) return;

        workflows.push({
          id: `WF-Q${mi+1}${String.fromCharCode(97+ri)}`,
          category: "Calificación",
          label: `Calif ${m.nombre} → ${r.entonces}`,
          payload: {
            isEnabled: false,
            flowType: "WORKFLOW",
            name: `Focux Calif ${m.nombre} → ${r.entonces}`,
            startActionId: "1",
            nextAvailableActionId: "2",
            actions: [setPropertyAction("1", "tipo_lead_fx", r.entonces)],
            enrollmentCriteria: listEnrollment(filters),
            type: "CONTACT_FLOW",
            objectTypeId: "0-1",
            timeWindows: [], blockedDates: [], customProperties: {},
            suppressionListIds: [], canEnrollFromSalesforce: false,
          },
        });
      });
    });
  }

  // ── WF-A: ASSIGNMENT (per macro × nivel group) ──
  ms.forEach((m, mi) => {
    if (!m.nombre || !(m.asesores || []).length) return;
    const groups = {};
    (m.asesores || []).forEach(a => {
      const key = (a.niveles || []).sort().join(",") || "ALL";
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    let gi = 0;
    Object.entries(groups).forEach(([nivKey, asesores]) => {
      gi++;
      const niveles = nivKey === "ALL" ? (config.niveles || []) : nivKey.split(",");
      const userIds = asesores.map(a => userIdMap[a.email]).filter(Boolean);
      if (!userIds.length) return; // Can't create round robin without user IDs

      const filters = [
        { property: "lista_proyectos_fx", values: [optVal(m.nombre)] },
        { property: "tipo_lead_fx", values: niveles.map(optVal) },
      ];

      const actions = [];
      let aid = 1;
      // Action 1: Rotate owner (round robin)
      actions.push(rotateOwnerAction(aid, userIds, aid + 1)); aid++;
      // Action 2: Create task
      actions.push(createTaskAction(aid, `Tienes un lead nuevo en ${m.nombre} — contáctalo ya`)); aid++;

      const nivelesStr = niveles.join(", ");
      workflows.push({
        id: `WF-A${mi+1}${gi > 1 ? String.fromCharCode(96+gi) : ""}`,
        category: "Asignación",
        label: `Asign ${m.nombre} — ${nivelesStr}`,
        payload: {
          isEnabled: false,
          flowType: "WORKFLOW",
          name: `Focux Asign ${m.nombre} — ${nivelesStr}`,
          startActionId: "1",
          nextAvailableActionId: String(aid),
          actions,
          enrollmentCriteria: listEnrollment(filters),
          type: "CONTACT_FLOW",
          objectTypeId: "0-1",
          timeWindows: [], blockedDates: [], customProperties: {},
          suppressionListIds: [], canEnrollFromSalesforce: false,
        },
      });
    });
  });

  // ── WF-D1: Create Deal ──
  const triggerStageVal = optVal(config.triggerDeal || "Cotización Solicitada");
  workflows.push({
    id: "WF-D1",
    category: "Ventas",
    label: "Crear Deal al " + (config.triggerDeal || "Cotización Solicitada"),
    payload: {
      isEnabled: false,
      flowType: "WORKFLOW",
      name: `Focux Crear Deal — ${config.nombreConst || ""}`,
      startActionId: "1",
      nextAvailableActionId: "3",
      actions: [
        createDealAction("1", pipelineId, firstStageId, [
          ["lista_proyectos_fx", "macroproyecto_fx"],
          ["canal_atribucion_fx", "canal_deal_fx"],
          ["tipo_lead_fx", "tipo_lead_deal_fx"],
          ["proposito_compra_fx", "proposito_deal_fx"],
          ["cedula_fx", "cedula_comp1_fx"],
        ], "2"),
        notifyAction("2", "Nuevo negocio creado", "Se creó un deal automáticamente desde el workflow Focux."),
      ],
      enrollmentCriteria: listEnrollment([
        { property: "etapa_lead_fx", values: [triggerStageVal] },
      ], false),
      type: "CONTACT_FLOW",
      objectTypeId: "0-1",
      timeWindows: [], blockedDates: [], customProperties: {},
      suppressionListIds: [], canEnrollFromSalesforce: false,
    },
  });

  // ── WF-D2: Value on Option (deal-based) ──
  // Note: deal-based workflows use PLATFORM_FLOW + objectTypeId 0-3
  // Trigger: deal stage = "Opcionó" — but we need the stage ID, which we get from pipeline creation
  const opcionoStageId = context.opcionoStageId || "";
  if (opcionoStageId) {
    workflows.push({
      id: "WF-D2",
      category: "Ventas",
      label: "Valor al Opcionar",
      payload: {
        isEnabled: false,
        flowType: "WORKFLOW",
        name: `Focux Valor al Opcionar — ${config.nombreConst || ""}`,
        startActionId: "1",
        nextAvailableActionId: "2",
        actions: [{
          type: "SINGLE_CONNECTION",
          actionId: "1",
          actionTypeVersion: 0,
          actionTypeId: "0-5",
          fields: {
            property_name: "amount",
            value: { type: "OBJECT_PROPERTY", propertyName: "valor_cotizacion_fx" },
          },
        }],
        enrollmentCriteria: listEnrollment([
          { property: "dealstage", values: [opcionoStageId] },
          { property: "pipeline", values: [pipelineId] },
        ], true),
        type: "PLATFORM_FLOW",
        objectTypeId: "0-3",
        timeWindows: [], blockedDates: [], customProperties: {},
        suppressionListIds: [], canEnrollFromSalesforce: false,
      },
    });
  }

  // ── WF-D3: Inactivity Alert ──
  // Uses LIST_BASED enrollment with TIME_RANGED filter
  // "notes_last_updated is between (today - N days) and (now)" inverted:
  // We want leads where last activity is BEFORE (today - N days)
  // Using IS_BETWEEN with a far-past lower bound and (today - N days) as upper bound
  const diasInact = config.diasSinAct || 7;
  workflows.push({
    id: "WF-D3",
    category: "Ventas",
    label: `Alerta Inactividad ${diasInact}d`,
    payload: {
      isEnabled: false,
      flowType: "WORKFLOW",
      name: `Focux Alerta Inactividad ${diasInact}d — ${config.nombreConst || ""}`,
      startActionId: "1",
      nextAvailableActionId: "3",
      actions: [
        createTaskAction("1", `Lead sin actividad en ${diasInact} días — hacer seguimiento`, "2"),
        notifyAction("2", `Alerta: lead sin actividad ${diasInact}d`, "Un lead no ha tenido actividad. Revisa y haz seguimiento."),
      ],
      enrollmentCriteria: listEnrollment([
        {
          property: "notes_last_updated",
          operationType: "TIME_RANGED",
          lowerBoundTimePoint: {
            timeType: "INDEXED",
            timezoneSource: "CUSTOM",
            zoneId: "America/Bogota",
            indexReference: { referenceType: "TODAY" },
            offset: { days: -365 },
          },
          upperBoundTimePoint: {
            timeType: "INDEXED",
            timezoneSource: "CUSTOM",
            zoneId: "America/Bogota",
            indexReference: { referenceType: "TODAY" },
            offset: { days: -diasInact },
          },
        },
      ], true),
      type: "CONTACT_FLOW",
      objectTypeId: "0-1",
      timeWindows: [], blockedDates: [], customProperties: {},
      suppressionListIds: [], canEnrollFromSalesforce: false,
    },
  });

  return workflows;
}

/* ═══ DEPLOYMENT PLAN BUILDER ═══ */
function buildDeploymentPlan(config) {
  const steps = [];
  const contactProps = buildContactProperties(config);
  const dealProps = buildDealProperties(config);

  // Phase 1: Property Groups
  steps.push({
    id: "GRP-C", label: "Grupo propiedades Contactos → 'Focux'", category: "Propiedades",
    execute: async (token) => await hubspotAPI(token, "POST", "/crm/v3/properties/contacts/groups", { name: "focux", label: "Focux" }),
    rollback: async (token) => { try { await hubspotAPI(token, "DELETE", "/crm/v3/properties/contacts/groups/focux"); } catch(e) {} },
  });
  steps.push({
    id: "GRP-D", label: "Grupo propiedades Negocios → 'Focux'", category: "Propiedades",
    execute: async (token) => await hubspotAPI(token, "POST", "/crm/v3/properties/deals/groups", { name: "focux", label: "Focux" }),
    rollback: async (token) => { try { await hubspotAPI(token, "DELETE", "/crm/v3/properties/deals/groups/focux"); } catch(e) {} },
  });

  // Phase 2: Contact Properties
  contactProps.forEach((prop, i) => {
    steps.push({
      id: `CP-${String(i+1).padStart(2,"0")}`, label: `Contacto: ${prop.label} (${prop.name})`, category: "Propiedades",
      execute: async (token) => await hubspotAPI(token, "POST", "/crm/v3/properties/contacts", buildPropertyPayload(prop)),
      rollback: async (token) => { try { await hubspotAPI(token, "DELETE", `/crm/v3/properties/contacts/${prop.name}`); } catch(e) {} },
    });
  });

  // Phase 3: Deal Properties
  dealProps.forEach((prop, i) => {
    steps.push({
      id: `DP-${String(i+1).padStart(2,"0")}`, label: `Negocio: ${prop.label} (${prop.name})`, category: "Propiedades",
      execute: async (token) => await hubspotAPI(token, "POST", "/crm/v3/properties/deals", buildPropertyPayload(prop)),
      rollback: async (token) => { try { await hubspotAPI(token, "DELETE", `/crm/v3/properties/deals/${prop.name}`); } catch(e) {} },
    });
  });

  // Phase 4: Pipeline
  steps.push({
    id: "PL-01", label: `Pipeline: ${config.nombrePipeline}`, category: "Pipeline",
    resultKey: "pipeline",
    execute: async (token) => {
      try {
        return await hubspotAPI(token, "POST", "/crm/v3/pipelines/deals", buildPipelinePayload(config));
      } catch (err) {
        // Pipeline already exists — fetch it and return data for downstream steps
        const errMsg = String(err?.message || err?.category || JSON.stringify(err) || "");
        if (errMsg.includes("already exists") || errMsg.includes("CONFLICT") || err?.status === 409) {
          const pipelines = await hubspotAPI(token, "GET", "/crm/v3/pipelines/deals");
          const existing = (pipelines.results || []).find(p => p.label === config.nombrePipeline);
          if (existing) {
            existing._skipped = true;
            return existing;
          }
        }
        throw err;
      }
    },
    rollback: async (token, ctx) => { if (ctx.pipelineId) { try { await hubspotAPI(token, "DELETE", `/crm/v3/pipelines/deals/${ctx.pipelineId}`); } catch(e) {} } },
  });

  // Phase 5: Resolve User IDs (needed for round robin)
  const allEmails = new Set();
  (config.macros || []).forEach(m => (m.asesores || []).forEach(a => { if (a.email) allEmails.add(a.email.toLowerCase()); }));
  if (allEmails.size > 0) {
    steps.push({
      id: "USR-01", label: `Resolver ${allEmails.size} usuarios → HubSpot IDs`, category: "Usuarios",
      resultKey: "userIdMap",
      execute: async (token) => {
        const owners = await hubspotAPI(token, "GET", "/crm/v3/owners?limit=500");
        const map = {};
        (owners.results || []).forEach(o => {
          if (o.email) map[o.email.toLowerCase()] = String(o.userId || o.id);
        });
        const resolved = {};
        let found = 0, notFound = 0;
        allEmails.forEach(email => {
          if (map[email]) { resolved[email] = map[email]; found++; }
          else notFound++;
        });
        return { userIdMap: resolved, found, notFound };
      },
      rollback: async () => {},
    });
  }

  // Phase 6: Verification (properties + pipeline)
  steps.push({
    id: "VER-01", label: "Verificación: propiedades y pipeline", category: "Verificación",
    execute: async (token) => {
      const contacts = await hubspotAPI(token, "GET", "/crm/v3/properties/contacts?archived=false");
      const deals = await hubspotAPI(token, "GET", "/crm/v3/properties/deals?archived=false");
      const pipelines = await hubspotAPI(token, "GET", "/crm/v3/pipelines/deals");
      const fxContacts = (contacts.results||[]).filter(p => p.name.endsWith("_fx")).length;
      const fxDeals = (deals.results||[]).filter(p => p.name.endsWith("_fx")).length;
      const fxPipeline = (pipelines.results||[]).find(p => p.label === config.nombrePipeline);
      return {
        contactProperties: fxContacts, dealProperties: fxDeals,
        pipeline: fxPipeline ? { id: fxPipeline.pipelineId, stages: fxPipeline.stages.length, stageMap: Object.fromEntries(fxPipeline.stages.map(s => [s.label, s.stageId])) } : null,
        verified: fxContacts >= 14 && fxDeals >= 20 && !!fxPipeline,
      };
    },
    rollback: async () => {},
  });

  // Phase 7: Workflows (dynamic — added after verification resolves context)
  // These are placeholder — actual workflow steps are injected during deployment
  steps.push({
    id: "WF-BUILD", label: "Construir y desplegar workflows", category: "Workflows",
    execute: async (token, ctx) => {
      const pipelineData = ctx.pipeline;
      const userIdData = ctx.userIdMap || {};
      const wfContext = {
        pipelineId: pipelineData?.id || "",
        firstStageId: pipelineData?.stageMap?.[config.pipeline?.[0]?.n] || "",
        opcionoStageId: pipelineData?.stageMap?.["Opcionó"] || "",
        userIdMap: userIdData?.userIdMap || userIdData || {},
      };
      const workflows = buildWorkflows(config, wfContext);
      const results = { total: workflows.length, created: 0, errors: [], details: [] };

      for (const wf of workflows) {
        try {
          const result = await hubspotAPI(token, "POST", "/automation/v4/flows", wf.payload);
          results.created++;
          results.details.push({ id: wf.id, name: wf.payload.name, flowId: result.id, status: "created" });
        } catch (err) {
          if (err.status === 409) {
            results.details.push({ id: wf.id, name: wf.payload.name, status: "exists" });
          } else {
            results.errors.push({ id: wf.id, name: wf.payload.name, error: err.message });
            results.details.push({ id: wf.id, name: wf.payload.name, status: "error", error: err.message });
          }
        }
      }
      return results;
    },
    rollback: async () => { /* Workflows created individually — manual cleanup if needed */ },
  });

  return steps;
}

/* ═══ STATUS INDICATOR ═══ */
function StatusDot({ status }) {
  const colors = { pending: tk.textTer, running: tk.cyan, done: tk.green, error: tk.red, skipped: tk.amber };
  const c = colors[status] || tk.textTer;
  return (
    <div style={{ width:10, height:10, borderRadius:"50%", background:c, flexShrink:0,
      boxShadow: status==="running" ? `0 0 8px ${c}` : "none",
      animation: status==="running" ? "pulse 1.2s infinite" : "none" }} />
  );
}

/* ═══ MAIN APP ═══ */
export default function HubSpotAdapter() {
  const [token, setToken] = useState("");
  const [config, setConfig] = useState(null);
  const [configName, setConfigName] = useState("");
  const [steps, setSteps] = useState([]);
  const [stepStatus, setStepStatus] = useState({});
  const [stepResults, setStepResults] = useState({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);
  const abortRef = useRef(false);
  const contextRef = useRef({});

  const addLog = useCallback((msg, type="info") => {
    setLog(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
  }, []);

  const loadConfig = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        setConfig(data);
        setConfigName(data.nombreConst || file.name);
        const plan = buildDeploymentPlan(data);
        setSteps(plan);
        setStepStatus({});
        setStepResults({});
        setDone(false);
        setError(null);
        setLog([]);
        // Count expected workflows
        const wfCount = (data.macros||[]).reduce((acc, m) => {
          const asesorGroups = {};
          (m.asesores||[]).forEach(a => { const k = (a.niveles||[]).sort().join(",")||"ALL"; if(!asesorGroups[k]) asesorGroups[k]=[]; asesorGroups[k].push(a); });
          const assignWf = Object.keys(asesorGroups).length;
          const qualWf = m.rangoMinimo ? (data.reglas||[]).length : 0;
          return acc + assignWf + qualWf;
        }, 0) + 3; // +3 for WF-D1, D2, D3
        addLog(`Config cargada: ${data.nombreConst} — ${data.macros?.length || 0} macros, ${plan.length} pasos, ~${wfCount} workflows esperados`);
      } catch(err) {
        setError("JSON inválido: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const deploy = async () => {
    if (!token.trim()) { setError("Ingresa el Private App Token"); return; }
    if (!config) { setError("Carga un Config JSON"); return; }

    setRunning(true);
    setDone(false);
    setError(null);
    abortRef.current = false;
    contextRef.current = {};
    addLog("═══ DEPLOYMENT v2 INICIADO ═══", "header");

    const rollbackStack = [];

    for (let i = 0; i < steps.length; i++) {
      if (abortRef.current) { addLog("Deployment cancelado por usuario", "warn"); break; }

      const step = steps[i];
      setStepStatus(prev => ({ ...prev, [step.id]: "running" }));
      addLog(`[${step.id}] ${step.label}...`);

      try {
        const result = await step.execute(token, contextRef.current);
        setStepStatus(prev => ({ ...prev, [step.id]: "done" }));
        setStepResults(prev => ({ ...prev, [step.id]: result }));
        rollbackStack.push(step);

        // Store context for later steps
        if (step.resultKey) {
          if (step.resultKey === "pipeline") {
            contextRef.current.pipelineId = result?.pipelineId || result?.id;
            // Also do a quick GET to retrieve stage IDs
            try {
              const plId = result?.pipelineId || result?.id;
              if (plId) {
                const plData = await hubspotAPI(token, "GET", `/crm/v3/pipelines/deals/${plId}`);
                contextRef.current.pipeline = {
                  id: plId,
                  stageMap: Object.fromEntries((plData.stages||[]).map(s => [s.label, s.stageId])),
                  stages: (plData.stages||[]).length,
                };
              }
            } catch(e) { /* stage map will be resolved in VER-01 */ }
          } else if (step.resultKey === "userIdMap") {
            contextRef.current.userIdMap = result;
          }
        }

        // Special handling for VER-01 — update pipeline context with stage map
        if (step.id === "VER-01" && result?.pipeline) {
          contextRef.current.pipeline = result.pipeline;
        }

        // Log details
        if (step.id === "WF-BUILD" && result) {
          addLog(`[WF-BUILD] ${result.created} creados, ${result.errors.length} errores de ${result.total} total`, result.errors.length ? "warn" : "success");
          result.details.forEach(d => {
            if (d.status === "created") addLog(`  ✓ ${d.id}: ${d.name} (flowId: ${d.flowId})`, "success");
            else if (d.status === "exists") addLog(`  ⚠ ${d.id}: ya existe`, "warn");
            else addLog(`  ✗ ${d.id}: ${d.error}`, "error");
          });
        } else {
          const detail = result?.name || result?.label || result?.pipelineId || result?.found !== undefined ? `${result.found} encontrados, ${result.notFound} no encontrados` : (result?.verified ? "✓ Verificado" : "");
          addLog(`[${step.id}] ✓ OK${detail ? ` — ${detail}` : ""}`, "success");
        }
      } catch (err) {
        if (err.category === "CONFLICT" || err.status === 409) {
          setStepStatus(prev => ({ ...prev, [step.id]: "skipped" }));
          addLog(`[${step.id}] ⚠ Ya existe — saltado`, "warn");
          continue;
        }

        setStepStatus(prev => ({ ...prev, [step.id]: "error" }));
        addLog(`[${step.id}] ✗ ERROR: ${err.message}`, "error");
        setError(`Falló en ${step.id}: ${err.message}`);

        addLog("═══ INICIANDO ROLLBACK ═══", "warn");
        for (let j = rollbackStack.length - 1; j >= 0; j--) {
          try {
            await rollbackStack[j].rollback(token, contextRef.current);
            addLog(`[ROLLBACK] ${rollbackStack[j].id} — revertido`, "warn");
          } catch(rbErr) {
            addLog(`[ROLLBACK] ${rollbackStack[j].id} — error: ${rbErr.message}`, "error");
          }
        }
        addLog("═══ ROLLBACK COMPLETO ═══", "warn");
        break;
      }
    }

    if (!abortRef.current && !error) {
      addLog("═══ DEPLOYMENT v2 COMPLETO ═══", "header");
      setDone(true);
    }
    setRunning(false);
  };

  const abort = () => { abortRef.current = true; };

  const counts = { pending:0, running:0, done:0, error:0, skipped:0 };
  steps.forEach(s => { counts[stepStatus[s.id] || "pending"]++; });
  const categories = [...new Set(steps.map(s => s.category))];

  return (
    <div style={{ fontFamily:font, background:tk.bg, minHeight:"100vh", color:tk.text }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slideIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
        input::placeholder{color:${tk.textTer}}
      `}</style>

      <div style={{ background:`linear-gradient(135deg, ${tk.navy} 0%, #0A0D1A 100%)`, padding:"0 28px", height:56, display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:`1px solid ${tk.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg,${tk.teal},${tk.cyan})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:"#fff" }}>⚡</div>
          <div>
            <h1 style={{ margin:0, color:"#fff", fontSize:15, fontWeight:800, letterSpacing:"0.06em" }}>FOCUXAI ENGINE</h1>
            <p style={{ margin:0, color:tk.textTer, fontSize:10, fontWeight:500, letterSpacing:"0.1em" }}>HUBSPOT ADAPTER v2 — PROPERTIES + PIPELINE + WORKFLOWS</p>
          </div>
        </div>
        {configName && <span style={{ color:tk.textSec, fontSize:12, fontWeight:600 }}>{configName}</span>}
      </div>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"28px 24px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
          <div style={{ background:tk.card, borderRadius:12, padding:20, border:`1px solid ${tk.border}` }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:tk.textSec, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>Private App Token</label>
            <input type="password" value={token} onChange={e=>setToken(e.target.value)}
              placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              style={{ width:"100%", padding:"10px 14px", borderRadius:8, border:`1.5px solid ${tk.border}`, background:tk.bg, color:tk.text, fontSize:13, fontFamily:"monospace", outline:"none", boxSizing:"border-box" }} />
            <p style={{ margin:"6px 0 0", fontSize:10, color:tk.textTer }}>
              Scopes: crm.objects, crm.schemas, automation, crm.objects.owners.read
            </p>
          </div>
          <div style={{ background:tk.card, borderRadius:12, padding:20, border:`1px solid ${tk.border}` }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:tk.textSec, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.06em" }}>Config JSON</label>
            <label style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"10px 14px", borderRadius:8, border:`1.5px dashed ${tk.border}`, cursor:"pointer", fontSize:13, color:tk.textSec, fontWeight:600 }}>
              <input type="file" accept=".json" onChange={loadConfig} style={{ display:"none" }} />
              {config ? `✓ ${configName}` : "Seleccionar archivo JSON"}
            </label>
            {config && (
              <p style={{ margin:"6px 0 0", fontSize:10, color:tk.green }}>
                {config.macros?.length} macros · {steps.length} operaciones · {config.hubSales} Sales · {config.hubMarketing} Marketing
              </p>
            )}
          </div>
        </div>

        <div style={{ display:"flex", gap:12, marginBottom:24, alignItems:"center" }}>
          <button onClick={deploy} disabled={running || !config || !token.trim()}
            style={{
              padding:"12px 32px", borderRadius:10, border:"none", fontSize:14, fontWeight:700,
              fontFamily:font, cursor: running||!config||!token.trim() ? "default" : "pointer",
              background: running ? tk.border : `linear-gradient(135deg, ${tk.teal}, ${tk.cyan})`,
              color:"#fff", letterSpacing:"0.03em",
              boxShadow: running||!config ? "none" : `0 4px 20px ${tk.accentGlow}`,
              opacity: running||!config||!token.trim() ? 0.5 : 1,
            }}>
            {running ? "Desplegando..." : done ? "Completado — Redesplegar" : "Desplegar en HubSpot"}
          </button>
          {running && (
            <button onClick={abort} style={{ padding:"12px 24px", borderRadius:10, border:`1.5px solid ${tk.red}`, background:"transparent", color:tk.red, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:font }}>
              Cancelar
            </button>
          )}
          {done && !running && (
            <span style={{ fontSize:13, color:tk.green, fontWeight:600 }}>
              {counts.done} completados · {counts.skipped} existentes
            </span>
          )}
        </div>

        {error && (
          <div style={{ padding:"12px 16px", background:tk.redBg, borderRadius:8, borderLeft:`3px solid ${tk.red}`, marginBottom:16 }}>
            <p style={{ margin:0, fontSize:12, color:tk.red, fontWeight:600 }}>{error}</p>
          </div>
        )}

        {steps.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <div style={{ background:tk.card, borderRadius:12, border:`1px solid ${tk.border}`, overflow:"hidden" }}>
              <div style={{ padding:"14px 16px", borderBottom:`1px solid ${tk.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:12, fontWeight:700, color:tk.text, letterSpacing:"0.04em" }}>OPERACIONES</span>
                <span style={{ fontSize:11, color:tk.textSec }}>
                  <span style={{color:tk.green}}>{counts.done}</span> · <span style={{color:tk.amber}}>{counts.skipped}</span> · <span style={{color:tk.red}}>{counts.error}</span> · {counts.pending}
                </span>
              </div>
              <div style={{ height:3, background:tk.border }}>
                <div style={{ height:3, background:`linear-gradient(90deg,${tk.teal},${tk.green})`, width:`${((counts.done+counts.skipped+counts.error)/steps.length)*100}%`, transition:"width 0.4s ease" }} />
              </div>
              <div style={{ maxHeight:500, overflow:"auto", padding:"8px 0" }}>
                {categories.map(cat => (
                  <div key={cat}>
                    <div style={{ padding:"8px 16px", fontSize:10, fontWeight:700, color:tk.textTer, textTransform:"uppercase", letterSpacing:"0.06em" }}>{cat}</div>
                    {steps.filter(s=>s.category===cat).map(s => (
                      <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 16px" }}>
                        <StatusDot status={stepStatus[s.id]||"pending"} />
                        <span style={{ fontFamily:"monospace", fontSize:10, fontWeight:700, color:tk.textTer, minWidth:56 }}>{s.id}</span>
                        <span style={{ fontSize:11, color: stepStatus[s.id]==="error" ? tk.red : stepStatus[s.id]==="done" ? tk.text : tk.textSec, flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {s.label}
                        </span>
                        {stepStatus[s.id]==="skipped" && <span style={{fontSize:9,color:tk.amber,fontWeight:600}}>EXISTE</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background:tk.card, borderRadius:12, border:`1px solid ${tk.border}`, overflow:"hidden" }}>
              <div style={{ padding:"14px 16px", borderBottom:`1px solid ${tk.border}` }}>
                <span style={{ fontSize:12, fontWeight:700, color:tk.text, letterSpacing:"0.04em" }}>LOG</span>
              </div>
              <div style={{ maxHeight:500, overflow:"auto", padding:"8px 12px", fontFamily:"'JetBrains Mono', monospace", fontSize:11 }}>
                {log.map((l,i) => (
                  <div key={i} style={{ padding:"3px 0", color: l.type==="error"?tk.red : l.type==="success"?tk.green : l.type==="warn"?tk.amber : l.type==="header"?tk.cyan : tk.textSec }}>
                    <span style={{ color:tk.textTer, marginRight:8 }}>{l.time}</span>
                    {l.msg}
                  </div>
                ))}
                {log.length===0 && <p style={{color:tk.textTer, fontStyle:"italic", margin:8}}>Esperando deployment...</p>}
              </div>
            </div>
          </div>
        )}

        {/* Workflow results */}
        {done && stepResults["WF-BUILD"] && (
          <div style={{ marginTop:20, background:tk.card, borderRadius:12, border:`1px solid ${tk.green}30`, padding:20 }}>
            <h3 style={{ margin:"0 0 12px", color:tk.green, fontSize:14, fontWeight:700 }}>Workflows Desplegados</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:16 }}>
              {[
                ["Creados", stepResults["WF-BUILD"].created, tk.green],
                ["Errores", stepResults["WF-BUILD"].errors?.length || 0, tk.red],
                ["Total", stepResults["WF-BUILD"].total, tk.cyan],
              ].map(([label,val,color],i) => (
                <div key={i} style={{ padding:14, background:tk.bg, borderRadius:8, textAlign:"center" }}>
                  <p style={{ margin:0, fontSize:24, fontWeight:800, color }}>{val}</p>
                  <p style={{ margin:"4px 0 0", fontSize:10, color:tk.textSec, fontWeight:600 }}>{label}</p>
                </div>
              ))}
            </div>
            <div style={{ maxHeight:200, overflow:"auto", fontSize:11 }}>
              {(stepResults["WF-BUILD"].details||[]).map((d,i) => (
                <div key={i} style={{ padding:"4px 0", color: d.status==="created"?tk.green : d.status==="exists"?tk.amber : tk.red }}>
                  {d.status==="created" ? "✓" : d.status==="exists" ? "⚠" : "✗"} {d.id}: {d.name} {d.flowId ? `(${d.flowId})` : ""} {d.error || ""}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification results */}
        {done && stepResults["VER-01"] && (
          <div style={{ marginTop:20, background:tk.card, borderRadius:12, border:`1px solid ${tk.green}30`, padding:20 }}>
            <h3 style={{ margin:"0 0 12px", color:tk.green, fontSize:14, fontWeight:700 }}>Verificación de Propiedades</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
              {[
                ["Props Contacto _fx", stepResults["VER-01"].contactProperties],
                ["Props Negocio _fx", stepResults["VER-01"].dealProperties],
                ["Pipeline Etapas", stepResults["VER-01"].pipeline?.stages || 0],
              ].map(([label,val],i) => (
                <div key={i} style={{ padding:14, background:tk.bg, borderRadius:8, textAlign:"center" }}>
                  <p style={{ margin:0, fontSize:24, fontWeight:800, color:tk.cyan }}>{val}</p>
                  <p style={{ margin:"4px 0 0", fontSize:10, color:tk.textSec, fontWeight:600 }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop:32, textAlign:"center", padding:16 }}>
          <p style={{ margin:0, fontSize:10, color:tk.textTer, letterSpacing:"0.1em" }}>
            FOCUXAI ENGINE™ v2 — DETERMINISTIC. AUDITABLE. UNSTOPPABLE.
          </p>
        </div>
      </div>
    </div>
  );
}
