import { describe, expect, it } from "vitest";

import craBoundaries from "@/data/cra-boundaries.json";
import equityTracts from "@/data/equity-tracts.json";
import {
  analyze,
  binnedQuery,
  compare,
  equityWindow,
  getEquityData,
  parseCells,
  type Cell,
} from "@/lib/equity";
import { indexFeatures, inPolygons, locate } from "@/lib/geo";
import type { QueryFn } from "@/lib/resolution";

// A real request location on Capitol Hill (from the live API).
const CAPITOL_HILL = { lat: 47.61981262, lon: -122.32500963 };
const BELLEVUE = { lat: 47.6101, lon: -122.2015 };

describe("geo", () => {
  const square = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ],
  ];

  it("handles outer rings and holes", () => {
    expect(inPolygons(1, 1, [square])).toBe(true);
    expect(inPolygons(5, 5, [square])).toBe(false); // inside the hole
    expect(inPolygons(11, 5, [square])).toBe(false);
  });

  it("locates real points in neighborhoods and tracts", () => {
    const areas = indexFeatures<{ area: string }>(craBoundaries.features as { geometry: unknown; properties: { area: string } }[]);
    expect(locate(areas, CAPITOL_HILL.lat, CAPITOL_HILL.lon)?.area).toBe("CAPITOL HILL");
    expect(locate(areas, BELLEVUE.lat, BELLEVUE.lon)).toBeNull();

    const tracts = indexFeatures<{ quintile: number }>(equityTracts.features as { geometry: unknown; properties: { quintile: number } }[]);
    expect(tracts).toHaveLength(179);
    expect([1, 2, 3, 4, 5]).toContain(locate(tracts, CAPITOL_HILL.lat, CAPITOL_HILL.lon)?.quintile);
  });
});

describe("equityWindow", () => {
  const dataEnd = "2026-10-20";

  it("uses a mature selected range of at least 90 days as-is", () => {
    expect(equityWindow("2026-05-24", "2026-08-21", dataEnd)).toEqual({
      start: "2026-05-24",
      end: "2026-08-21",
      shifted: false,
      extended: false,
      capped: false,
    });
  });

  it("shifts a recent range and extends it to 90 days", () => {
    expect(equityWindow("2026-09-20", "2026-10-19", dataEnd)).toEqual({
      start: "2026-06-23",
      end: "2026-09-20",
      shifted: true,
      extended: true,
      capped: false,
    });
  });

  it("caps long ranges at the most recent 366 days and respects the tracking start", () => {
    expect(equityWindow("2023-06-01", "2026-08-01", dataEnd)).toMatchObject({ start: "2025-08-01", end: "2026-08-01", capped: true });
    expect(equityWindow("2023-01-01", "2023-01-20", dataEnd)).toMatchObject({ start: "2023-01-01", extended: true });
    expect(equityWindow("2020-01-01", "2020-02-01", dataEnd)).toBeNull();
  });
});

describe("parsing and the query", () => {
  it("converts cell indexes to cell centres and repairs missing sums", () => {
    expect(parseCells([{ servicerequesttype: "Graffiti Report", y: "95239", x: "-244651", n: "4", w7: "2" }, { y: "1" }, null])).toEqual([
      { type: "Graffiti Report", lat: 95239.5 / 2000, lon: -244650.5 / 2000, n: 4, w7: 2, w30: 2 },
    ]);
  });

  it("pages the binned query deterministically", () => {
    const q = binnedQuery({ start: "2026-05-24", end: "2026-08-21" }, 1).$query!;
    expect(q).toContain("createddate < '2026-08-22T00:00:00'");
    expect(q).toContain("floor(lat * 2000)");
    expect(q).toContain("ORDER BY servicerequesttype, y, x LIMIT 50000 OFFSET 50000");
  });
});

describe("compare (indirect standardization)", () => {
  // Citywide: type A closes 80% within 7 days, type B 20%.
  const city = new Map([
    ["A", { n: 100, w7: 80, w30: 90 }],
    ["B", { n: 100, w7: 20, w30: 60 }],
  ]);

  it("expects a slow-type-heavy group to be slower, so it isn't penalized for its mix", () => {
    const group = new Map([
      ["A", { n: 10, w7: 8, w30: 9 }],
      ["B", { n: 90, w7: 18, w30: 54 }],
    ]);
    const c = compare(group, city, 7);
    expect(c.observed).toBeCloseTo(0.26);
    expect(c.expected).toBeCloseTo((10 * 0.8 + 90 * 0.2) / 100); // 0.26
    expect(c.difference).toBeCloseTo(0);
  });

  it("reports a gap with a 95% margin", () => {
    const group = new Map([["B", { n: 100, w7: 40, w30: 70 }]]);
    const c = compare(group, city, 7);
    expect(c.difference).toBeCloseTo(0.2);
    expect(c.margin).toBeCloseTo((1.96 * Math.sqrt(100 * 0.4 * 0.6)) / 100);
    expect(compare(new Map(), city, 7)).toEqual({ observed: 0, expected: 0, difference: 0, margin: 0 });
  });
});

describe("analyze", () => {
  const cell = (type: string, where: { lat: number; lon: number }, n: number, w7: number): Cell => ({ type, ...where, n, w7, w30: n });

  it("assigns cells, counts unassigned requests and builds every view", () => {
    const result = analyze([
      cell("Graffiti Report", CAPITOL_HILL, 10, 7),
      cell("Abandoned Vehicle", CAPITOL_HILL, 5, 1),
      cell("Graffiti Report", BELLEVUE, 3, 3),
    ]);
    expect(result.requests).toBe(15);
    expect(result.unassigned).toBe(3);
    expect(result.quintiles).toHaveLength(5);
    expect(result.quintiles.reduce((a, q) => a + q.requests, 0)).toBe(15);
    expect(result.quintiles.reduce((a, q) => a + q.tracts, 0)).toBe(179);
    const area = result.areas.find((a) => a.area === "CAPITOL HILL")!;
    expect(area).toMatchObject({ requests: 15, reliable: false });
    const graffiti = result.byType.find((t) => t.tracking === "Graffiti Report")!;
    expect(graffiti.citywide).toMatchObject({ requests: 10, share7: 0.7 });
    expect(result.byType).toHaveLength(5);
  });
});

describe("getEquityData", () => {
  it("pages until a short page and reports the window", async () => {
    const calls: string[] = [];
    const fullPage = Array.from({ length: 50_000 }, (_, i) => ({ servicerequesttype: "Graffiti Report", y: String(95239 + (i % 3)), x: "-244651", n: "1", w7: "1", w30: "1" }));
    const query: QueryFn = async (p) => {
      const q = p.$query ?? "";
      calls.push(q);
      if (q.startsWith("SELECT max(updateddate)")) return { rows: [{ dataend: "2026-10-20T00:00:00.000" }], lastModified: null };
      return { rows: q.includes("OFFSET 0") ? fullPage : [], lastModified: null };
    };
    const data = await getEquityData({ start: "2026-05-24", end: "2026-08-21" }, query);
    expect(calls.filter((c) => c.includes("OFFSET"))).toHaveLength(2);
    expect(data.window).toMatchObject({ start: "2026-05-24", end: "2026-08-21" });
    expect(data.requests + data.unassigned).toBe(50_000);
  });
});
