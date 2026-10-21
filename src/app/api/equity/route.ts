import type { NextRequest } from "next/server";

import { jsonResponse, upstreamErrorResponse } from "@/lib/api-response";
import { createTtlCache } from "@/lib/cache";
import { seattleToday } from "@/lib/dates";
import { getEquityData, type EquityData } from "@/lib/equity";
import { parseFilters } from "@/lib/filters";

// Like response times, only the date range applies. The analysis reads up to
// a year of binned requests, so results are cached for 15 minutes.
const cache = createTtlCache<EquityData>({ ttlMs: 15 * 60_000, maxEntries: 50 });

export async function GET(request: NextRequest) {
  const { filters } = parseFilters(request.nextUrl.searchParams, seattleToday());
  const range = { start: filters.start, end: filters.end };
  const started = Date.now();

  try {
    const data = await cache.get(`${range.start}|${range.end}`, () => getEquityData(range));
    return jsonResponse(request, data);
  } catch (err) {
    return upstreamErrorResponse(err, { event: "equity_query_failed", scope: range, started });
  }
}
