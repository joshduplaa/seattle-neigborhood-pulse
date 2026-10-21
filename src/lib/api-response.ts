import { NextResponse } from "next/server";

import { SocrataError } from "@/lib/socrata/client";
import type { ApiErrorBody } from "@/lib/types";

const CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

/**
 * JSON response with CDN caching, gzipped when the client accepts it.
 * `next start` does not compress route handler responses; hosts that do
 * compress skip bodies that are already encoded.
 */
export function jsonResponse(request: Request, data: unknown): Response {
  const body = JSON.stringify(data);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": CACHE_CONTROL,
    Vary: "Accept-Encoding",
  };
  if (/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "")) {
    const stream = new Blob([body]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Response(stream, { headers: { ...headers, "Content-Encoding": "gzip" } });
  }
  return new Response(body, { headers });
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status });
}

/**
 * Log an upstream failure (class and scope only — no headers or tokens) and
 * map it to a user-facing error response.
 */
export function upstreamErrorResponse(err: unknown, context: { event: string; scope: unknown; started: number }): Response {
  console.error(
    JSON.stringify({
      event: context.event,
      kind: err instanceof SocrataError ? err.kind : "internal",
      status: err instanceof SocrataError ? err.status : null,
      message: err instanceof Error ? err.message.slice(0, 300) : String(err),
      scope: context.scope,
      ms: Date.now() - context.started,
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
  return errorResponse(500, "internal_error", "Something went wrong while preparing the data.");
}
