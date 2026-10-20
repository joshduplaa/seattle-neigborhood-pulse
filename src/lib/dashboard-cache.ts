import { createTtlCache } from "@/lib/cache";
import { getDashboardData } from "@/lib/dashboard";
import { filtersKey, type DashboardFilters } from "@/lib/filters";
import type { DashboardData } from "@/lib/types";

/**
 * Server-side cache around the upstream queries, keyed by the filter state.
 * The source refreshes about once a day, so 15 minutes keeps data current
 * while sparing the public API repeated identical queries. In serverless
 * deployments each instance keeps its own cache.
 */
const cache = createTtlCache<DashboardData>({ ttlMs: 15 * 60_000, maxEntries: 200 });

export function getDashboardDataCached(filters: DashboardFilters): Promise<DashboardData> {
  return cache.get(filtersKey(filters), () => getDashboardData(filters));
}
