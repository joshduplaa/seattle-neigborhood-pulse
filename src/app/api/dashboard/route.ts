import { NextResponse, type NextRequest } from "next/server";

import { getDashboardDataCached } from "@/lib/dashboard-cache";
import { seattleToday } from "@/lib/dates";
import { parseFilters } from "@/lib/filters";
import { SocrataError } from "@/lib/socrata/client";
import type { ApiErrorBody } from "@/lib/types";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status });
}

export async function GET(request: NextRequest) {
  const { filters, issues } = parseFilters(request.nextUrl.searchParams, seattleToday());
  const started = Date.now();

  try {
    const data = await getDashboardDataCached(filters);
    const body = JSON.stringify({ ...data, issues });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      Vary: "Accept-Encoding",
    };
    // `next start` does not compress route handler responses; the 2,000-request
    // sample is ~10x smaller gzipped. Hosts that compress skip encoded bodies.
    if (/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "")) {
      const stream = new Blob([body]).stream().pipeThrough(new CompressionStream("gzip"));
      return new Response(stream, { headers: { ...headers, "Content-Encoding": "gzip" } });
    }
    return new Response(body, { headers });
  } catch (err) {
    // Log the failure class and filter scope only — no headers or tokens.
    const kind = err instanceof SocrataError ? err.kind : "internal";
    console.error(
      JSON.stringify({
        event: "dashboard_query_failed",
        kind,
        status: err instanceof SocrataError ? err.status : null,
        message: err instanceof Error ? err.message.slice(0, 300) : String(err),
        filters,
        ms: Date.now() - started,
      }),
    );

    if (err instanceof SocrataError) {
      switch (err.kind) {
        case "timeout":
          return errorResponse(504, "upstream_timeout", "Seattle Open Data took too long to respond. Try again, or narrow the date range.");
        case "rate_limited":
          return errorResponse(503, "upstream_rate_limited", "Seattle Open Data is rate-limiting requests right now. Please try again in a minute.");
        case "bad_response":
          return errorResponse(502, "upstream_bad_response", "Seattle Open Data returned data in an unexpected format.");
        case "bad_request":
          return errorResponse(502, "upstream_rejected", "Seattle Open Data rejected the query.");
        case "network":
        case "upstream":
          return errorResponse(502, "upstream_unavailable", "Seattle Open Data is unavailable right now. Please try again shortly.");
      }
    }
    return errorResponse(500, "internal_error", "Something went wrong while preparing the dashboard.");
  }
}
