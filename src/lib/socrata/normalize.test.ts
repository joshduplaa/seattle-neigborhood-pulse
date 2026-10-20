import { describe, expect, it } from "vitest";

import fixtures from "@/lib/__fixtures__/socrata-responses.json";
import {
  normalizeDailyCounts,
  normalizeFacet,
  normalizeGrid,
  normalizeNewest,
  normalizeRequest,
  normalizeRequests,
  parseCoordinates,
  parseFloatingTimestamp,
  parseHttpDate,
} from "@/lib/socrata/normalize";

describe("normalizeRequest (real API rows)", () => {
  const { requests, rejected } = normalizeRequests(fixtures.sample);

  it("accepts every well-formed row from the live API", () => {
    expect(rejected).toBe(0);
    expect(requests).toHaveLength(fixtures.sample.length);
  });

  it("parses strings into typed fields", () => {
    const first = requests[0]!;
    expect(first.id).toMatch(/^\d{2}-\d{8}$/);
    expect(first.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(first.coordinates).not.toBeNull();
    expect(typeof first.coordinates!.lat).toBe("number");
    expect(first.area).toBe("GREEN LAKE");
  });

  it("keeps rows without coordinates but marks them unmapped", () => {
    const unmapped = requests.filter((r) => r.coordinates === null);
    expect(unmapped.length).toBeGreaterThanOrEqual(2);
    for (const r of unmapped) expect(r.area).toBeNull();
  });
});

describe("normalizeRequest (malformed input)", () => {
  const valid = { servicerequestnumber: "26-1", createddate: "2026-10-20T02:33:06.000" };

  it("rejects rows without an id or a valid date", () => {
    expect(normalizeRequest({ createddate: valid.createddate })).toBeNull();
    expect(normalizeRequest({ ...valid, createddate: "2026-02-31T00:00:00.000" })).toBeNull();
    expect(normalizeRequest({ ...valid, createddate: "yesterday" })).toBeNull();
    expect(normalizeRequest(null)).toBeNull();
    expect(normalizeRequest({ ...valid, latitude: { nested: true } })).toBeNull();
  });

  it("fills a placeholder type and nulls blank strings", () => {
    const r = normalizeRequest({ ...valid, location: "  ", servicerequeststatusname: "" });
    expect(r).toMatchObject({ type: "Unspecified request type", address: null, status: null, coordinates: null });
  });

  it("never invents coordinates for invalid values", () => {
    expect(parseCoordinates("0", "0")).toBeNull();
    expect(parseCoordinates("47.6", "")).toBeNull();
    expect(parseCoordinates("NaN", "-122.3")).toBeNull();
    expect(parseCoordinates("40.7", "-74.0")).toBeNull(); // New York
    expect(parseCoordinates("47.6062", "-122.3321")).toEqual({ lat: 47.6062, lon: -122.3321 });
    expect(parseCoordinates(47.6, -122.3)).toEqual({ lat: 47.6, lon: -122.3 });
  });

  it("parses floating timestamps with or without milliseconds", () => {
    expect(parseFloatingTimestamp("2026-10-20T02:33:06.000")).toBe("2026-10-20T02:33:06");
    expect(parseFloatingTimestamp("2026-10-20T02:33:06")).toBe("2026-10-20T02:33:06");
    expect(parseFloatingTimestamp("2026-10-20")).toBeNull();
  });
});

describe("aggregate row normalization", () => {
  it("normalizes facets, folding missing values into a null bucket", () => {
    const districts = normalizeFacet(fixtures.districtFacet);
    expect(districts).toHaveLength(8);
    expect(districts[0]).toEqual({ value: "3", count: 1213 });
    expect(districts.find((b) => b.value === null)?.count).toBe(124);
  });

  it("skips malformed facet rows and merges duplicates", () => {
    const rows = [{ value: "A", n: "2" }, { value: "A", n: 3 }, { value: "B", n: "-1" }, { value: "C" }, { value: "", n: "4" }];
    expect(normalizeFacet(rows)).toEqual([
      { value: "A", count: 5 },
      { value: null, count: 4 },
    ]);
  });

  it("normalizes daily counts and grid cells", () => {
    const daily = normalizeDailyCounts(fixtures.daily);
    expect(daily.get("2026-10-12")).toBe(861);
    expect(daily.size).toBe(7);

    const cells = normalizeGrid(fixtures.grid);
    expect(cells[0]).toEqual({ lat: 47.615, lon: -122.35, count: 114 });
    expect(normalizeGrid([{ cell: { type: "Point", coordinates: [-74, 40.7] }, n: "5" }])).toEqual([]);
  });

  it("reads the newest record timestamp and HTTP dates", () => {
    expect(normalizeNewest(fixtures.newest)).toBe("2026-10-20T02:33:06");
    expect(normalizeNewest([])).toBeNull();
    expect(parseHttpDate("Tue, 20 Oct 2026 15:08:41 GMT")).toBe("2026-10-20T15:08:41.000Z");
    expect(parseHttpDate("nope")).toBeNull();
  });

  it("produces totals that agree across facets for the same scope", () => {
    const total = (rows: unknown[]) => normalizeFacet(rows).reduce((a, b) => a + b.count, 0);
    const daily = [...normalizeDailyCounts(fixtures.daily).values()].reduce((a, b) => a + b, 0);
    expect(total(fixtures.statusFacet)).toBe(daily);
    expect(total(fixtures.districtFacet)).toBe(daily);
  });
});
