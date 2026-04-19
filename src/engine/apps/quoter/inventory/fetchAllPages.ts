/**
 * fetchAllPages — Paginated search over HubSpot Custom Objects.
 *
 * HubSpotAdapter.searchRecords returns max 100 records per call.
 * This helper loops with the `after` cursor until all records are fetched.
 *
 * FAIL HARD rules:
 *   1. Any page that returns an error → abort, throw, no partial data.
 *   2. Max pages exceeded (default 20 = 2,000 records) → abort.
 *   3. Cursor repeats (infinite loop protection) → abort.
 *   4. nextCursor present but records.length === 0 → abort (HubSpot bug protection).
 *
 * Pure function except for adapter calls. Fully deterministic behavior.
 */

import type { ICrmAdapter, CrmRecord, CrmSearchQuery, CrmObjectType } from '@/engine/interfaces/ICrmAdapter';
import type { Logger } from '@/engine/core/logging/Logger';

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

export class FetchAllPagesError extends Error {
  constructor(
    message: string,
    public readonly objectType: CrmObjectType,
    public readonly page: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FetchAllPagesError';
  }
}

export async function fetchAllPages(
  adapter: ICrmAdapter,
  options: FetchAllPagesOptions,
  logger: Logger,
): Promise<FetchAllPagesResult> {
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
      throw new FetchAllPagesError(
        `Exceeded max pages (${maxPages}) for ${objectType}. ` +
        `Fetched ${allRecords.length} records across ${maxPages} pages. ` +
        `Expected <${maxPages * 100} records.`,
        objectType,
        pageCount,
      );
    }

    // ── Blindaje 2: Repeated cursor (infinite loop) ──
    if (cursor !== undefined) {
      if (seenCursors.has(cursor)) {
        throw new FetchAllPagesError(
          `Cursor "${cursor}" repeated on page ${pageCount} for ${objectType}. ` +
          `Infinite loop detected. Aborting.`,
          objectType,
          pageCount,
        );
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
      throw new FetchAllPagesError(
        `HubSpot search failed on page ${pageCount} for ${objectType}: ${result.error.message}`,
        objectType,
        pageCount,
        result.error,
      );
    }

    const { records, nextCursor, total } = result.value;

    // ── Blindaje 4: nextCursor present but empty records ──
    if (nextCursor !== undefined && records.length === 0) {
      throw new FetchAllPagesError(
        `HubSpot returned nextCursor "${nextCursor}" but 0 records on page ${pageCount} for ${objectType}. ` +
        `This indicates a HubSpot API anomaly. Aborting to prevent infinite loop.`,
        objectType,
        pageCount,
      );
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

  return { records: allRecords, pagesConsumed: pageCount };
}
