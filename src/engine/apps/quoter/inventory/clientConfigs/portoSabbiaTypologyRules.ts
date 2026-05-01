/**
 * FocuxAI Engine™ — Porto Sabbia Typology Rules
 *
 * Reglas de tipología confirmadas para Porto Sabbia (Jiménez).
 * 17 tipologías validadas con datos reales de Sinco (curl abril 19, 2026).
 *
 * NOTA: E2, E3, E4 existen en documentación pero NO aparecen en
 * datos de inventario actuales. Se agregan cuando se confirmen con datos reales.
 *
 * Ambos proyectos (360 Residencial, 361 Suite) comparten estas reglas.
 * Confirmado con negocio — si divergen, crear constantes separadas.
 *
 * @since v2.0.0 — Multi-proyecto (Fase A)
 */

import type { TypologyRule } from '../typologyTypes';

/**
 * Reglas de tipología Porto Sabbia Suite T1 — 17 tipologías confirmadas.
 *
 * Object.freeze() garantiza inmutabilidad en runtime.
 * Referencia compartida entre proyectos 360 y 361 → WeakMap cache funciona.
 */
export const PORTO_SABBIA_SUITE_T1_RULES: readonly TypologyRule[] = Object.freeze([
  Object.freeze({ tipologia: 'A1', area: 34.21, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-A1.png', floorplanPath: 'porto-sabbia/plano-A1.png' }),
  Object.freeze({ tipologia: 'A2', area: 35.11, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-A2.png', floorplanPath: 'porto-sabbia/plano-A2.png' }),
  Object.freeze({ tipologia: 'A3', area: 39.34, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-A3.png', floorplanPath: 'porto-sabbia/plano-A3.png' }),
  Object.freeze({ tipologia: 'B1', area: 40.92, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-B1.png', floorplanPath: 'porto-sabbia/plano-B1.png' }),
  Object.freeze({ tipologia: 'B2', area: 41.53, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-B2.png', floorplanPath: 'porto-sabbia/plano-B2.png' }),
  Object.freeze({ tipologia: 'B3', area: 41.28, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-B3.png', floorplanPath: 'porto-sabbia/plano-B3.png' }),
  Object.freeze({ tipologia: 'B4', area: 42.53, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-B4.png', floorplanPath: 'porto-sabbia/plano-B4.png' }),
  Object.freeze({ tipologia: 'C1', area: 43.46, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-C1.png', floorplanPath: 'porto-sabbia/plano-C1.png' }),
  Object.freeze({ tipologia: 'C2', area: 43.50, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-C2.png', floorplanPath: 'porto-sabbia/plano-C2.png' }),
  Object.freeze({ tipologia: 'C3', area: 43.49, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-C3.png', floorplanPath: 'porto-sabbia/plano-C3.png' }),
  Object.freeze({ tipologia: 'C4', area: 43.12, habs: 1, banos: 1, renderPath: 'porto-sabbia/render-C4.png', floorplanPath: 'porto-sabbia/plano-C4.png' }),
  Object.freeze({ tipologia: 'D1', area: 45.04, habs: 2, banos: 1, renderPath: 'porto-sabbia/render-D1.png', floorplanPath: 'porto-sabbia/plano-D1.png' }),
  Object.freeze({ tipologia: 'D2', area: 46.38, habs: 2, banos: 2, renderPath: 'porto-sabbia/render-D2.png', floorplanPath: 'porto-sabbia/plano-D2.png' }),
  Object.freeze({ tipologia: 'D3', area: 46.01, habs: 2, banos: 2, renderPath: 'porto-sabbia/render-D3.png', floorplanPath: 'porto-sabbia/plano-D3.png' }),
  Object.freeze({ tipologia: 'D4', area: 46.33, habs: 2, banos: 2, renderPath: 'porto-sabbia/render-D4.png', floorplanPath: 'porto-sabbia/plano-D4.png' }),
  Object.freeze({ tipologia: 'D5', area: 46.76, habs: 2, banos: 2, renderPath: 'porto-sabbia/render-D5.png', floorplanPath: 'porto-sabbia/plano-D5.png' }),
  Object.freeze({ tipologia: 'E1', area: 54.19, habs: 2, banos: 2, renderPath: 'porto-sabbia/render-E1.png', floorplanPath: 'porto-sabbia/plano-E1.png' }),
]);
