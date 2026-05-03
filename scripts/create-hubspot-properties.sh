#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# FocuxAI Engine™ — Crear propiedades HubSpot faltantes (Sinco → CRM)
#
# Genera las 42 propiedades que Sinco envía pero no estaban en HubSpot.
# Santiago aprobó: "creemos TODO lo que viene en esos objetos"
#
# USO:
#   # Portal DEMO:
#   HUBSPOT_TOKEN="pat-na1-xxx" bash scripts/create-hubspot-properties.sh demo
#
#   # Portal PRODUCCIÓN:
#   HUBSPOT_TOKEN="pat-na1-xxx" bash scripts/create-hubspot-properties.sh prod
#
# PREREQUISITO: El property group "focuxai_properties" ya debe existir.
#               (Lo crea el Adapter automáticamente en ensureProperties)
#
# FocuxAI Engine™ — Focux Digital Group S.A.S. — Confidencial
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Validar args ────────────────────────────────────────────
ENV="${1:-}"
if [[ -z "$ENV" || ("$ENV" != "demo" && "$ENV" != "prod") ]]; then
  echo "❌ Uso: HUBSPOT_TOKEN=pat-xxx bash $0 [demo|prod]"
  exit 1
fi

if [[ -z "${HUBSPOT_TOKEN:-}" ]]; then
  echo "❌ Falta HUBSPOT_TOKEN. Exporta tu Private App Token."
  exit 1
fi

# ── Object Type IDs por portal ──────────────────────────────
if [[ "$ENV" == "demo" ]]; then
  OBJ_MACRO="2-60986238"
  OBJ_PROYECTO="2-60987399"
  OBJ_UNIDAD="2-60987403"
  OBJ_AGRUPACION="2-60987404"
  echo "🔵 Portal DEMO (Jiménez)"
else
  # Producción — IDs del deploy 27-abril-2026 (Adapter v4.1)
  OBJ_MACRO="2-61560827"
  OBJ_PROYECTO="2-61560828"
  OBJ_UNIDAD="2-61560829"
  OBJ_AGRUPACION="2-61560831"
  echo "🟢 Portal PRODUCCIÓN (Jiménez)"
fi

API="https://api.hubapi.com"
GROUP="focuxai_properties"
CREATED=0
FAILED=0
SKIPPED=0

# ── Helper: crear propiedad individual ──────────────────────
create_prop() {
  local obj_type_id="$1"
  local obj_label="$2"
  local name="$3"
  local label="$4"
  local type="$5"
  local field_type="$6"
  local description="$7"

  # Check if exists
  local check
  check=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $HUBSPOT_TOKEN" \
    "$API/crm/v3/properties/$obj_type_id/$name" 2>/dev/null)

  if [[ "$check" == "200" ]]; then
    echo "   ⏭️  $name ya existe en $obj_label"
    ((SKIPPED++)) || true
    return 0
  fi

  local body
  body=$(cat <<JSONEOF
{
  "name": "$name",
  "label": "$label",
  "type": "$type",
  "fieldType": "$field_type",
  "groupName": "$GROUP",
  "description": "$description"
}
JSONEOF
)

  local response
  local http_code
  response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $HUBSPOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$API/crm/v3/properties/$obj_type_id" 2>/dev/null)

  http_code=$(echo "$response" | tail -1)
  local resp_body
  resp_body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "201" ]]; then
    echo "   ✅ $name → $obj_label"
    ((CREATED++)) || true
  elif [[ "$http_code" == "409" ]]; then
    echo "   ⏭️  $name ya existe (409) en $obj_label"
    ((SKIPPED++)) || true
  else
    echo "   ❌ $name → HTTP $http_code"
    echo "      $resp_body" | head -2
    ((FAILED++)) || true
  fi

  # Rate limit: ~100 calls/10s = 1 call/100ms
  sleep 0.15
}

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Creando 42 propiedades Sinco → HubSpot ($ENV)"
echo "═══════════════════════════════════════════════════════════"

# ── Verificar que el grupo existe ───────────────────────────
echo ""
echo "📋 Verificando property group '$GROUP'..."

# Check on one object type (macro)
GROUP_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $HUBSPOT_TOKEN" \
  "$API/crm/v3/properties/$OBJ_MACRO/groups/$GROUP" 2>/dev/null)

if [[ "$GROUP_CHECK" != "200" ]]; then
  echo "   Creando grupo '$GROUP'..."
  for OBJ in "$OBJ_MACRO" "$OBJ_PROYECTO" "$OBJ_UNIDAD" "$OBJ_AGRUPACION"; do
    curl -s -X POST \
      -H "Authorization: Bearer $HUBSPOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"name\": \"$GROUP\", \"label\": \"FocuxAI Sinco Properties\"}" \
      "$API/crm/v3/properties/$OBJ/groups" > /dev/null 2>&1 || true
    sleep 0.1
  done
  echo "   ✅ Grupo creado en los 4 custom objects"
else
  echo "   ✅ Grupo ya existe"
fi

# ═══════════════════════════════════════════════════════════════
# MACROPROYECTO — 4 propiedades nuevas
# ═══════════════════════════════════════════════════════════════
echo ""
echo "📦 MACROPROYECTO ($OBJ_MACRO) — 4 propiedades"
echo "───────────────────────────────────────────────"

create_prop "$OBJ_MACRO" "Macro" \
  "telefono_fx" "Teléfono" \
  "string" "text" \
  "Sinco: telefono — Teléfono del macroproyecto"

create_prop "$OBJ_MACRO" "Macro" \
  "id_supermacro_fx" "ID Supermacro Sinco" \
  "number" "number" \
  "Sinco: idSupermacro — ID del supermacro padre (si aplica)"

create_prop "$OBJ_MACRO" "Macro" \
  "logo_fx" "Logo" \
  "string" "text" \
  "Sinco: logo — Nombre/referencia del logo del macroproyecto"

create_prop "$OBJ_MACRO" "Macro" \
  "ruta_logo_fx" "Ruta Logo" \
  "string" "text" \
  "Sinco: rutaLogo — Ruta al archivo del logo en Sinco"

# ═══════════════════════════════════════════════════════════════
# PROYECTO — 18 propiedades nuevas
# ═══════════════════════════════════════════════════════════════
echo ""
echo "🏗️  PROYECTO ($OBJ_PROYECTO) — 18 propiedades"
echo "───────────────────────────────────────────────"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "es_vis_fx" "Es VIS" \
  "number" "number" \
  "Sinco: esViviendaDeInteresSocial — 1=VIS, 0=No VIS"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "etapa_fx" "Etapa" \
  "string" "text" \
  "Sinco: etapa — Etapa del proyecto (ej: Preventa, Construcción)"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "tipo_proyecto_fx" "Tipo Proyecto" \
  "number" "number" \
  "Sinco: tipoProyecto — Tipo de proyecto (código numérico Sinco)"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "direccion_proyecto_fx" "Dirección Proyecto" \
  "string" "text" \
  "Sinco: direccion — Dirección del proyecto"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "barrio_fx" "Barrio" \
  "string" "text" \
  "Sinco: barrio — Barrio o sector del proyecto"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "interior_fx" "Interior" \
  "string" "text" \
  "Sinco: interior — Interior/bloque del proyecto"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "numero_fx" "Número" \
  "string" "text" \
  "Sinco: numero — Número del proyecto en Sinco"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "nombre_abreviado_fx" "Nombre Abreviado" \
  "string" "text" \
  "Sinco: nombreAbreviado — Nombre corto del proyecto"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "entidad_credito_fx" "Entidad de Crédito" \
  "string" "text" \
  "Sinco: entidadCredito — Entidad financiera para créditos"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "entidad_fiduciaria_fx" "Entidad Fiduciaria" \
  "number" "number" \
  "Sinco: entidadFiduciaria — ID entidad fiduciaria"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "porcentaje_separacion_fx" "Porcentaje Separación" \
  "number" "number" \
  "Sinco: porcentajeSeparacion — % de separación sobre valor total"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "porcentaje_confirmacion_fx" "Porcentaje Confirmación" \
  "number" "number" \
  "Sinco: porcentajeConfirmacion — % de confirmación de venta"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "valor_confirmacion_fx" "Valor Confirmación" \
  "number" "number" \
  "Sinco: valorConfirmacion — Monto fijo de confirmación"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "categoria_servicio_fx" "Categoría Servicio" \
  "string" "text" \
  "Sinco: categoriaServicio — Categoría del servicio en Sinco"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "codigo_servicio_fx" "Código Servicio" \
  "string" "text" \
  "Sinco: codigoServicio — Código interno del servicio"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "cuentas_banco_fx" "Cuentas Banco" \
  "string" "text" \
  "Sinco: cuentasBanco — Información de cuentas bancarias del proyecto"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "tasa_interes_corriente_fx" "Tasa Interés Corriente" \
  "number" "number" \
  "Sinco: tasaInteresCorrienteMesVencido — Tasa interés corriente mensual"

create_prop "$OBJ_PROYECTO" "Proyecto" \
  "tasa_interes_financiero_fx" "Tasa Interés Financiero" \
  "number" "number" \
  "Sinco: tasaInteresFinancieroMesVencido — Tasa interés financiero mensual"

# ═══════════════════════════════════════════════════════════════
# UNIDAD — 14 propiedades nuevas (+ 5 CONECTAR que ya existen)
# ═══════════════════════════════════════════════════════════════
echo ""
echo "🏠 UNIDAD ($OBJ_UNIDAD) — 14 propiedades nuevas"
echo "───────────────────────────────────────────────"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "tipo_inmueble_fx" "Tipo Inmueble" \
  "string" "text" \
  "Sinco: tipoInmueble — Nombre del tipo de inmueble (ej: Apartamento, Local)"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "fecha_creacion_sinco_fx" "Fecha Creación Sinco" \
  "datetime" "date" \
  "Sinco: fechaCreacion — Fecha y hora de creación del registro en Sinco"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "fecha_entrega_unidad_fx" "Fecha Entrega Unidad" \
  "date" "date" \
  "Sinco: fechaEntrega — Fecha estimada de entrega de la unidad"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "area_jardineria_fx" "Área Jardinería" \
  "number" "number" \
  "Sinco: areaJardineria — Área de jardinería en m2"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "area_lote_fx" "Área Lote" \
  "number" "number" \
  "Sinco: areaLote — Área del lote en m2"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "area_pergola_fx" "Área Pérgola" \
  "number" "number" \
  "Sinco: areaPergola — Área de pérgola en m2"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "area_tecnica_fx" "Área Técnica" \
  "number" "number" \
  "Sinco: areaTecnica — Área técnica en m2"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "nomenclatura_eje_fx" "Nomenclatura Eje" \
  "string" "text" \
  "Sinco: nomenclaturaFinal_o_Eje — Eje o nomenclatura final de la unidad"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "matricula_fx" "Matrícula Inmobiliaria" \
  "string" "text" \
  "Sinco: matricula — Matrícula inmobiliaria de la unidad"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "cedula_catastral_fx" "Cédula Catastral" \
  "string" "text" \
  "Sinco: cedulaCatastral — Cédula catastral de la unidad"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "chip_fx" "CHIP" \
  "string" "text" \
  "Sinco: chip — Código Homologado de Identificación Predial"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "linderos_fx" "Linderos" \
  "string" "textarea" \
  "Sinco: linderos — Descripción de linderos de la unidad"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "interior_unidad_fx" "Interior Unidad" \
  "string" "text" \
  "Sinco: interior — Interior/bloque de la unidad"

create_prop "$OBJ_UNIDAD" "Unidad" \
  "id_visita_externa_fx" "ID Visita Externa" \
  "number" "number" \
  "Sinco: idVisitaExterna — ID de visita externa asociada"

# ═══════════════════════════════════════════════════════════════
# AGRUPACIÓN — 4 propiedades nuevas
# ═══════════════════════════════════════════════════════════════
echo ""
echo "📋 AGRUPACIÓN ($OBJ_AGRUPACION) — 4 propiedades nuevas"
echo "───────────────────────────────────────────────"

create_prop "$OBJ_AGRUPACION" "Agrupación" \
  "fecha_escritura_fx" "Fecha Escritura" \
  "date" "date" \
  "Sinco: fechaEscritura — Fecha de escritura pública"

create_prop "$OBJ_AGRUPACION" "Agrupación" \
  "numero_escritura_fx" "Número Escritura" \
  "string" "text" \
  "Sinco: numeroEscritura — Número de la escritura pública"

create_prop "$OBJ_AGRUPACION" "Agrupación" \
  "referencia_bancaria_fx" "Referencia Bancaria" \
  "string" "text" \
  "Sinco: referenciaBancaria — Referencia bancaria de la transacción"

create_prop "$OBJ_AGRUPACION" "Agrupación" \
  "id_oportunidad_sinco_fx" "ID Oportunidad Sinco" \
  "number" "number" \
  "Sinco: idOportunidad — ID de la oportunidad comercial en Sinco"

# ═══════════════════════════════════════════════════════════════
# RESUMEN
# ═══════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  RESUMEN ($ENV)"
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Creadas:   $CREATED"
echo "  ⏭️  Existían:  $SKIPPED"
echo "  ❌ Fallaron:  $FAILED"
echo "  📊 Total:     $((CREATED + SKIPPED + FAILED)) / 40"
echo ""
echo "  NOTA: 5 propiedades adicionales (area_balcon_fx, area_terraza_fx,"
echo "  area_patio_fx, tiene_jardineria_fx, nomenclatura_torre_fx) ya"
echo "  existen en HubSpot pero NO se están sincronizando desde Sinco."
echo "  Eso requiere cambio de código en InventorySync.ts (tarea A.2)."
echo "═══════════════════════════════════════════════════════════"
