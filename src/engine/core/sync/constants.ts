/**
 * WB-5: Constants for the separar-webhook pipeline.
 *
 * WRITEBACK_DEAL_PROPS — all Deal properties that route.ts must request
 * from the CRM adapter. Adding a property here ensures it's loaded;
 * removing it here ensures builders will receive null.
 *
 * Sorted by usage context for readability.
 */

// ============================================================================
// Deal properties required for separar-webhook
// ============================================================================

export const WRITEBACK_DEAL_PROPS: readonly string[] = [
  // --- Control ---
  'writeback_ready_fx',

  // --- Contact resolution (PATH A: explicit VID) ---
  'contacto_principal_vid_fx',

  // --- Sinco ID mirrors (deterministic, avoids association call) ---
  'id_agrupacion_sinco_fx',
  'id_proyecto_sinco_fx',

  // --- Comprador (deal mirrors override contact props) ---
  'tipo_persona_fx',
  'tipo_identificacion_fx',
  'cedula_fx',
  'nombre_comprador_fx',
  'apellido_comprador_fx',
  'email_comprador_fx',
  'telefono_comprador_fx',
  'genero_fx',
  'ingreso_mensual_fx',
  'ciudad_residencia_fx',

  // --- Venta ---
  'tipo_venta_fx',
  'valor_descuento_fx',
  'valor_descuento_financiero_fx',
  'id_asesor_sinco_fx',

  // --- Plan de Pagos: Separación (obligatoria) ---
  'valor_separacion_fx',
  'separacion_fecha_fx',

  // --- Plan de Pagos: Cuota inicial (opcional) ---
  'valor_cuota_inicial_fx',
  'cuota_inicial_fecha_fx',

  // --- Plan de Pagos: Cuotas mensuales (par obligatorio) ---
  'valor_cuota_mensual_fx',
  'numero_de_cuotas_fx',
  'cuotas_mensuales_fecha_fx',
  'id_entidad_financiera_fx',

  // --- Plan de Pagos: Saldo final (opcional) ---
  'saldo_final_fx',
  'saldo_fecha_fx',
] as const;
