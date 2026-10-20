// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SocrataError } from "@/lib/socrata/client";

const getDashboardDataCached = vi.fn();
vi.mock("@/lib/dashboard-cache", () => ({ getDashboardDataCached: (...args: unknown[]) => getDashboardDataCached(...args) }));

const { GET } = await import("@/app/api/dashboard/route");

function request(query: string) {
  return new NextRequest(`http://localhost/api/dashboard${query}`);
}

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    getDashboardDataCached.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("passes normalized filters through and reports corrections", async () => {
    getDashboardDataCached.mockImplementation(async (filters: unknown) => ({ filters }));
    const res = await GET(request("?start=2026-10-01&end=2026-10-07&district=42&area=BALLARD"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filters).toMatchObject({ start: "2026-10-01", end: "2026-10-07", area: "BALLARD", district: null });
    expect(body.issues).toEqual(['Ignored unknown council district "42".']);
    expect(res.headers.get("cache-control")).toContain("s-maxage");
    expect(res.headers.get("content-encoding")).toBeNull();
  });

  it("gzips the body when the client accepts it", async () => {
    getDashboardDataCached.mockImplementation(async (filters: unknown) => ({ filters }));
    const res = await GET(new NextRequest("http://localhost/api/dashboard", { headers: { "Accept-Encoding": "gzip, br" } }));
    expect(res.headers.get("content-encoding")).toBe("gzip");
    const text = await new Response(res.body!.pipeThrough(new DecompressionStream("gzip"))).text();
    expect(JSON.parse(text).filters.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each([
    ["timeout", 504, "upstream_timeout"],
    ["rate_limited", 503, "upstream_rate_limited"],
    ["upstream", 502, "upstream_unavailable"],
    ["bad_response", 502, "upstream_bad_response"],
    ["bad_request", 502, "upstream_rejected"],
  ] as const)("maps %s upstream errors to HTTP %i", async (kind, status, code) => {
    getDashboardDataCached.mockRejectedValue(new SocrataError(kind, "detail"));
    const res = await GET(request(""));
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
  });

  it("hides unexpected errors behind a generic message", async () => {
    getDashboardDataCached.mockRejectedValue(new Error("secret internals"));
    const res = await GET(request(""));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).not.toContain("secret");
  });
});
