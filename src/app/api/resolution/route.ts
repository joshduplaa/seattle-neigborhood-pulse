import type { NextRequest } from "next/server";

import { jsonResponse, upstreamErrorResponse } from "@/lib/api-response";
import { createTtlCache } from "@/lib/cache";
import { seattleToday } from "@/lib/dates";
import { parseFilters } from "@/lib/filters";
import { getResolutionData, type ResolutionData } from "@/lib/resolution";

// Only the date range applies: the tracking dataset has no neighborhood,
// district or comparable status fields. Same 15-minute cache as the dashboard.
const cache = createTtlCache<ResolutionData>({ ttlMs: 15 * 60_000, maxEntries: 100 });

export async function GET(request: NextRequest) {
  const { filters } = parseFilters(request.nextUrl.searchParams, seattleToday());
  const range = { start: filters.start, end: filters.end };
  const started = Date.now();

  try {
    const data = await cache.get(`${range.start}|${range.end}`, () => getResolutionData(range));
    return jsonResponse(request, data);
  } catch (err) {
    return upstreamErrorResponse(err, { event: "resolution_query_failed", scope: range, started });
  }
}
