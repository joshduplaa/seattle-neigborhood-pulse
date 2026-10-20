import { buildTimeSeries, chooseGranularity, countFor, matchingTotal } from "@/lib/aggregate";
import type { DashboardFilters } from "@/lib/filters";
import { querySocrata, type SoqlResult } from "@/lib/socrata/client";
import { GRID_RESOLUTION, SAMPLE_LIMIT } from "@/lib/socrata/config";
import {
  normalizeDailyCounts,
  normalizeFacet,
  normalizeGrid,
  normalizeNewest,
  normalizeRequests,
  parseHttpDate,
} from "@/lib/socrata/normalize";
import {
  dailyCountQuery,
  facetQuery,
  gridQuery,
  newestRecordQuery,
  sampleQuery,
  type SoqlParams,
} from "@/lib/socrata/soql";
import type { DashboardData } from "@/lib/types";

export type QueryFn = (params: SoqlParams) => Promise<SoqlResult>;

/**
 * Assemble everything the dashboard shows for one filter state.
 *
 * Scopes:
 * - totals, facets, series and grid are server-side aggregates over *all*
 *   matching records;
 * - `sample` is the newest `SAMPLE_LIMIT` matching records, used for map
 *   markers and the recent-requests list.
 */
export async function getDashboardData(
  filters: DashboardFilters,
  query: QueryFn = (p) => querySocrata(p),
  now: () => Date = () => new Date(),
): Promise<DashboardData> {
  const [category, status, area, district, daily, grid, sample, newest] = await Promise.all([
    query(facetQuery(filters, "category")),
    query(facetQuery(filters, "status")),
    query(facetQuery(filters, "area")),
    query(facetQuery(filters, "district")),
    query(dailyCountQuery(filters)),
    query(gridQuery(filters)),
    query(sampleQuery(filters, SAMPLE_LIMIT)),
    query(newestRecordQuery()),
  ]);

  const facets = {
    category: normalizeFacet(category.rows),
    status: normalizeFacet(status.rows),
    area: normalizeFacet(area.rows),
    district: normalizeFacet(district.rows),
  };
  const cells = normalizeGrid(grid.rows);
  const { requests, rejected } = normalizeRequests(sample.rows);
  const granularity = chooseGranularity(filters.start, filters.end);

  const areaMatching = filters.area === null ? countFor(facets.area, null) : 0;

  return {
    filters,
    retrievedAt: now().toISOString(),
    sourceUpdatedAt: parseHttpDate(sample.lastModified ?? newest.lastModified),
    newestRecordAt: normalizeNewest(newest.rows),
    totals: {
      matching: matchingTotal(facets.category, filters.category),
      geolocated: cells.reduce((acc, c) => acc + c.count, 0),
      withoutArea: areaMatching,
    },
    facets,
    series: {
      granularity,
      points: buildTimeSeries(normalizeDailyCounts(daily.rows), filters.start, filters.end, granularity),
    },
    grid: { resolution: GRID_RESOLUTION, cells },
    sample: { limit: SAMPLE_LIMIT, requests, rejected },
  };
}
