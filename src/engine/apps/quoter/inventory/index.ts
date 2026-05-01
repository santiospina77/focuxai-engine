/**
 * FocuxAI Engine™ — Quoter Inventory Module
 *
 * Helpers puros + tipos congelados + mapper para GET /api/engine/inventory
 *
 * v2.2: Todas las funciones retornan Result<T, EngineError>. Cero throw.
 */

export * from './types';
export { parseUnitName, type ParsedUnitName } from './parseUnitName';
export { resolveUnitFallbacks, type UnitFallbackResult } from './resolveUnitFallbacks';
export { normalizeUnitType } from './normalizeUnitType';
export { fetchAllPages, type FetchAllPagesResult } from './fetchAllPages';
export {
  joinGroupingsWithUnits,
  type JoinResult,
  type JoinedGrouping,
  type JoinStats,
} from './joinGroupingWithUnit';
export {
  mapInventoryToDto,
  type MapInventoryInput,
} from './mapInventoryToDto';
