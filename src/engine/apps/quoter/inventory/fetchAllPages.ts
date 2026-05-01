/**
 * fetchAllPages — Paginated search over HubSpot Custom Objects.
 *
 * HubSpotAdapter.searchRecords returns max 100 records per call.
 * This helper loops with the `after` cursor until all records are fetched.
 *
 * FAIL HARD rules:
 *   1. Any page that returns an error → return err, no partial data.
 *   2. Max pages exceeded (default 20 = 2,000 records) → return err.
 *   3. Cursor repeats (infinite loop protection) → return err.
 *   4. nextCursor present but records.length === 0 → return err (HubSpot bug protection).
 *
 * Retorna Result<T, EngineError> — nunca throw.
 *
 * @since v2.0.0 — Multi-proyecto
 * @since v2.2.0 — Migrado a Result (Architect review #4)
 */

import type { ICrmAdapter, CrmRecord, CrmSearchQuery, CrmObjectType } from '@/engine/interfaces/ICrmAdapter';
import type { Logger } from '@/engine/core/logging/Logger';
import type { Result } from '@/engine/core/types/Result';
import type { EngineError } from '@/engine/core/errors/EngineError';
import { ok, err } from '@/engine/core/types/Result';
import { ResourceError } from '@/engine/core/errors/EngineError';

const MAX_PAGES_DEFAULT = 20;

export interface FetchAllPagesOptions {
  readonly objectType: CrmObjectType;
  readonly filters?: CrmSearchQuery['filters'];
  readonly properties: readonly string[];
  readonly maxPages?: number;
}

export interface FetchAllPagesResult {
  readonly records: readonly CrmRecord[];
  readonly pagesConsumed: number;
}

/**
 * Fetch paginado de Custom Objects de HubSpot.
 *
 * Retorna Result — nunca throw.
 * Errores de HubSpot API se mapean a ResourceError con context de page/objectType.
 */
export async function fetchAllPages(
  adapter: ICrmAdapter,
  options: FetchAllPagesOptions,
  logger: Logger,
): Promise<Result<FetchAllPagesResult, EngineError>> {
  const { objectType, filters, properties, maxPages = MAX_PAGES_DEFAULT } = options;
  const allRecords: CrmRecord[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let pageCount = 0;

  logger.info({ objectType, maxPages }, 'fetchAllPages: starting');

  while (true) {
    pageCount++;

    // ── Blindaje 1: Max pages ──
    if (pageCount > maxPages) {
      return err(ResourceError.crmMaxPagesExceeded(objectType, maxPages, allRecords.length));
    }

    // ── Blindaje 2: Repeated cursor (infinite loop) ──
    if (cursor !== undefined) {
      if (seenCursors.has(cursor)) {
        return err(ResourceError.crmRepeatedCursor(objectType, pageCount, cursor));
      }
      seenCursors.add(cursor);
    }

    // ── Fetch page ──
    const result = await adapter.searchRecords({
      objectType,
      filters: filters ? [...filters] : [],
      properties: [...properties],
      limit: 100,
      after: cursor,
    });

    // ── Blindaje 3: Error from HubSpot ──
    if (result.isErr()) {
      return err(ResourceError.crmSearchFailed(objectType, pageCount, result.error));
    }

    const { records, nextCursor, total } = result.value;

    // ── Blindaje 4: nextCursor present but empty records ──
    if (nextCursor !== undefined && records.length === 0) {
      return err(ResourceError.crmEmptyPageWithCursor(objectType, pageCount, nextCursor));
    }

    allRecords.push(...records);

    logger.info(
      { objectType, page: pageCount, recordsThisPage: records.length, totalSoFar: allRecords.length, hubspotTotal: total },
      `fetchAllPages: page ${pageCount} fetched`,
    );

    cursor = nextCursor;

    // No more pages
    if (cursor === undefined) {
      break;
    }
  }

  logger.info(
    { objectType, totalRecords: allRecords.length, pagesConsumed: pageCount },
    'fetchAllPages: completed',
  );

  return ok({ records: allRecords, pagesConsumed: pageCount });
}
