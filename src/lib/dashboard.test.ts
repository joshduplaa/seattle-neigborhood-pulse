import { describe, expect, it } from "vitest";

import fixtures from "@/lib/__fixtures__/socrata-responses.json";
import { getDashboardData, type QueryFn } from "@/lib/dashboard";
import type { DashboardFilters } from "@/lib/filters";
import type { SoqlParams } from "@/lib/socrata/soql";

const filters: DashboardFilters = {
  start: "2026-10-12",
  end: "2026-10-18",
  category: null,
  status: null,
  area: null,
  district: null,
};

/** Route each query to the matching captured fixture by its SELECT clause. */
function fixtureQuery(overrides: Partial<Record<string, unknown[]>> = {}): QueryFn & { calls: SoqlParams[] } {
  const calls: SoqlParams[] = [];
  const fn = async (params: SoqlParams) => {
    calls.push(params);
    const select = params.$select ?? "";
    const pick = (key: string, fallback: unknown[]) => overrides[key] ?? fallback;
    let rows: unknown[];
    if (select.startsWith("webintakeservicerequests AS value")) rows = pick("category", [{ value: "Graffiti", n: "6000" }, { value: "Pothole", n: "830" }]);
    else if (select.startsWith("servicerequeststatusname AS value")) rows = pick("status", fixtures.statusFacet);
    else if (select.startsWith("community_reporting_area AS value")) rows = pick("area", [{ value: "BALLARD", n: "6700" }, { n: "130" }]);
    else if (select.startsWith("councildistrict AS value")) rows = pick("district", fixtures.districtFacet);
    else if (select.startsWith("date_trunc_ymd")) rows = pick("daily", fixtures.daily);
    else if (select.startsWith("snap_to_grid")) rows = pick("grid", fixtures.grid);
    else if (select.startsWith("max(")) rows = fixtures.newest;
    else rows = pick("sample", fixtures.sample);
    return { rows, lastModified: "Tue, 20 Oct 2026 15:08:41 GMT" };
  };
  return Object.assign(fn, { calls });
}

describe("getDashboardData", () => {
  it("assembles a coherent, scoped response from real API shapes", async () => {
    const query = fixtureQuery();
    const data = await getDashboardData(filters, query, () => new Date("2026-10-20T22:00:00Z"));

    expect(query.calls).toHaveLength(10);
    expect(data.retrievedAt).toBe("2026-10-20T22:00:00.000Z");
    expect(data.sourceUpdatedAt).toBe("2026-10-20T15:08:41.000Z");
    expect(data.newestRecordAt).toBe("2026-10-20T02:33:06");

    expect(data.totals.matching).toBe(6830);
    expect(data.totals.withoutArea).toBe(130);
    expect(data.totals.geolocated).toBe(fixtures.grid.reduce((a, c) => a + Number(c.n), 0));

    expect(data.series.granularity).toBe("day");
    expect(data.series.points).toHaveLength(7);
    expect(data.series.points.reduce((a, p) => a + p.count, 0)).toBe(6830);

    expect(data.sample.requests.length).toBe(fixtures.sample.length);
    expect(data.sample.rejected).toBe(0);

    // Previous 7 days, same filters; total from the area facet (all buckets).
    expect(data.comparison).toMatchObject({ start: "2026-10-05", end: "2026-10-11", matching: 6830 });
    const prevWhere = query.calls.filter((c) => c.$where?.includes("2026-10-05T00:00:00"));
    expect(prevWhere.map((c) => c.$group)).toEqual(["community_reporting_area", "councildistrict"]);
  });

  it("uses the selected area's previous count and skips comparison before the dataset starts", async () => {
    const withArea = await getDashboardData({ ...filters, area: "BALLARD" }, fixtureQuery());
    expect(withArea.comparison?.matching).toBe(6700);

    const early = fixtureQuery();
    const data = await getDashboardData({ ...filters, start: "2013-01-02", end: "2013-01-31" }, early);
    expect(data.comparison).toBeNull();
    expect(early.calls).toHaveLength(8);
  });

  it("derives the total from the selected category bucket", async () => {
    const data = await getDashboardData({ ...filters, category: "Pothole" }, fixtureQuery());
    expect(data.totals.matching).toBe(830);
    // The category facet still lists alternatives for context.
    expect(data.facets.category.map((b) => b.value)).toEqual(["Graffiti", "Pothole"]);
  });

  it("handles an empty result set", async () => {
    const empty = { category: [], status: [], area: [], district: [], daily: [], grid: [], sample: [] };
    const data = await getDashboardData(filters, fixtureQuery(empty));
    expect(data.totals).toEqual({ matching: 0, geolocated: 0, withoutArea: 0 });
    expect(data.series.points.every((p) => p.count === 0)).toBe(true);
    expect(data.sample.requests).toEqual([]);
  });

  it("propagates upstream failures", async () => {
    const failing: QueryFn = async () => {
      throw new Error("boom");
    };
    await expect(getDashboardData(filters, failing)).rejects.toThrow("boom");
  });
});
