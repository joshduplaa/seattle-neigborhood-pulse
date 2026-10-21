import type { NextRequest } from "next/server";

import { jsonResponse, upstreamErrorResponse } from "@/lib/api-response";
import { getDashboardDataCached } from "@/lib/dashboard-cache";
import { seattleToday } from "@/lib/dates";
import { parseFilters } from "@/lib/filters";

export async function GET(request: NextRequest) {
  const { filters, issues } = parseFilters(request.nextUrl.searchParams, seattleToday());
  const started = Date.now();

  try {
    const data = await getDashboardDataCached(filters);
    return jsonResponse(request, { ...data, issues });
  } catch (err) {
    return upstreamErrorResponse(err, { event: "dashboard_query_failed", scope: filters, started });
  }
}
