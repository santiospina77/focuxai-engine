/**
 * FocuxAI Engine™ — Quoter Inventory Module
 *
 * Helpers puros + tipos congelados + mapper para GET /api/engine/inventory
 */

export * from './types';
export { parseUnitName, type ParsedUnitName } from './parseUnitName';
export { resolveUnitFallbacks, type UnitFallbackResult } from './resolveUnitFallbacks';
export { normalizeUnitType } from './normalizeUnitType';
export { fetchAllPages, FetchAllPagesError, type FetchAllPagesResult } from './fetchAllPages';
export {
  joinGroupingsWithUnits,
  JoinError,
  type JoinResult,
  type JoinedGrouping,
  type JoinStats,
} from './joinGroupingWithUnit';
export {
  mapInventoryToDto,
  InventoryMappingError,
  type MapInventoryInput,
} from './mapInventoryToDto';
