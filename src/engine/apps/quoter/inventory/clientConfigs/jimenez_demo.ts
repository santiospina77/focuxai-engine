/**
 * FocuxAI Engine™ — Client Config: Jiménez Demo
 *
 * Single source of truth para toda la config del piloto Jiménez demo.
 *
 * Datos confirmados:
 *   Macro 58 = Porto Sabbia (1 macro, 2 proyectos en HubSpot)
 *   Proyecto 360 = Porto Sabbia Residencial (nombre Sinco: "PORTO SABBIA RESIDENCIAL")
 *   Proyecto 361 = Porto Sabbia Suite (nombre Sinco: "PORTO SABBIA SUITE")
 *   NOTA: JSON v17 tenía nombres invertidos en el mapeo. Sinco es la fuente de verdad.
 *   objectTypeIds del portal demo (sesión abril 17, 2026)
 *   canalesAtribucion del Ops JSON v17 (chStd activos + chCu)
 *
 * Cuarentena:
 *   3 APTs en proyecto 361 con area_construida_fx=0 en Sinco.
 *   Excluidos hasta corrección en fuente + re-sync.
 *   Detectados en prueba curl abril 19, 2026.
 */

import type { ClientOverlayConfig, CanalOption } from '../types';
import type { HubSpotCustomObjectTypeIds } from '@/engine/connectors/crm/hubspot/types';
import type { TypologyRule } from '../typologyTypes';
import { PORTO_SABBIA_SUITE_T1_RULES } from './portoSabbiaTypologyRules';

export interface ClientInventoryConfig {
  readonly overlay: ClientOverlayConfig;
  readonly objectTypeIds: HubSpotCustomObjectTypeIds;
  readonly canalesAtribucion: readonly CanalOption[];
  readonly hubspotTokenEnvVar: string;
  /**
   * Reglas de tipología por proyecto.
   * Indexadas por sincoId del proyecto.
   * Si un proyecto no tiene reglas → fail hard.
   * @since v2.0 Multi-proyecto
   */
  readonly typologyRules: Readonly<Record<number, readonly TypologyRule[]>>;
  /**
   * Hostnames permitidos para fetch de assets (SSRF protection).
   * Se pasa a fetchAssetSafe como allowedHosts.
   * Si vacío en producción → fail hard.
   * @since v2.1 — Architect review: no hardcodear hosts
   */
  readonly assetAllowedHosts: readonly string[];
}

export const JIMENEZ_DEMO_CONFIG: ClientInventoryConfig = {
  overlay: {
    clientId: 'jimenez_demo',
    macros: {
      58: { zona: 'Playa Salguero' },
    },
    projects: {
      // sincoId 360 = "PORTO SABBIA RESIDENCIAL" en Sinco
      360: {
        codigo: 'PSR',
        pctSep: 1,
        pctCI: 30,
        tipo: 'Apartamento',
        agrupacionesPreestablecidas: true,
      },
      // sincoId 361 = "PORTO SABBIA SUITE" en Sinco
      361: {
        codigo: 'PSS',
        pctSep: 1,
        pctCI: 30,
        tipo: 'Apartasuite',
        agrupacionesPreestablecidas: true,
      },
    },
    excludedUnits: [
      { sincoId: 25847, reason: 'area_construida_fx=0 en Sinco. Pendiente corrección en fuente.' },
      { sincoId: 25848, reason: 'area_construida_fx=0 en Sinco. Pendiente corrección en fuente.' },
      { sincoId: 25849, reason: 'area_construida_fx=0 en Sinco. Pendiente corrección en fuente.' },
    ],
  },

  objectTypeIds: {
    macroproyecto: '2-60986238',
    proyecto: '2-60987399',
    unidad: '2-60987403',
    agrupacion: '2-60987404',
  },

  canalesAtribucion: [
    { label: 'Pauta Facebook-IG', value: 'pauta_facebook-ig' },
    { label: 'Pauta Google', value: 'pauta_google' },
    { label: 'Sitio Web', value: 'sitio_web' },
    { label: 'Mail Marketing', value: 'mail_marketing' },
    { label: 'Redes Sociales Orgánicas', value: 'redes_sociales_organicas' },
    { label: 'Búsqueda Orgánica', value: 'busqueda_organica' },
    { label: 'Sala de Ventas Física', value: 'sala_de_ventas_fisica' },
    { label: 'Referido', value: 'referido' },
    { label: 'Importación Base de Datos', value: 'importacion_base_de_datos' },
    { label: 'Feria Inmobiliaria', value: 'feria_inmobiliaria' },
    { label: 'Canal WhatsApp', value: 'canal_whatsapp' },
    { label: 'Llamada Telefónica', value: 'llamada_telefonica' },
    { label: 'Aliado / Portal Inmobiliario', value: 'aliado_portal_inmobiliario' },
    { label: 'Recompra', value: 'recompra' },
    { label: 'Youtube', value: 'youtube' },
    { label: 'Finca Raíz', value: 'finca_raiz' },
    { label: 'Estrenar Vivienda', value: 'estrenar_vivienda' },
    { label: 'Vivendo', value: 'vivendo' },
    { label: 'Metrocuadrado', value: 'metrocuadrado' },
    { label: 'Ciencuadras', value: 'ciencuadras' },
  ],

  hubspotTokenEnvVar: 'HUBSPOT_JIMENEZ_DEMO_PRIVATE_APP_TOKEN',

  // ═══════════════════════════════════════════════════════════
  // Typology Rules por proyecto (v2.1 — constante compartida)
  // Ambos proyectos comparten las mismas 17 tipologías (confirmado con negocio).
  // Referencia compartida → WeakMap cache funciona con una sola computación.
  // ═══════════════════════════════════════════════════════════

  typologyRules: {
    360: PORTO_SABBIA_SUITE_T1_RULES,  // Porto Sabbia Residencial
    361: PORTO_SABBIA_SUITE_T1_RULES,  // Porto Sabbia Suite
  },

  // ═══════════════════════════════════════════════════════════
  // Asset allowed hosts (SSRF protection — v2.1)
  // Hostnames permitidos para fetch de renders/planos.
  // En Fase A: assets locales servidos por Vercel.
  // En Fase B: agregar HubSpot File Manager.
  // ═══════════════════════════════════════════════════════════
  assetAllowedHosts:
    process.env.NODE_ENV === 'production'
      ? ['focuxai-engine.vercel.app']
      : ['localhost', '127.0.0.1'],
};
