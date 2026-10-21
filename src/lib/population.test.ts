import { describe, expect, it } from "vitest";

import boundaries from "@/data/cra-boundaries.json";
import fixtures from "@/lib/__fixtures__/socrata-responses.json";
import { normalizeRequests } from "@/lib/socrata/normalize";
import {
  areaRates,
  classify,
  CRA_POPULATION,
  LOW_POPULATION_THRESHOLD,
  quantileBreaks,
  ratePer1000,
} from "@/lib/population";

describe("CRA reference data", () => {
  it("covers all 53 areas with Seattle's 2020 Census population", () => {
    expect(Object.keys(CRA_POPULATION)).toHaveLength(53);
    expect(Object.values(CRA_POPULATION).reduce((a, b) => a + b, 0)).toBe(737_015);
  });

  it("uses the same keys for boundaries and population", () => {
    const keys = boundaries.features.map((f) => f.properties.area).sort();
    expect(keys).toEqual(Object.keys(CRA_POPULATION).sort());
    for (const f of boundaries.features) expect(["Polygon", "MultiPolygon"]).toContain(f.geometry.type);
  });

  it("matches the area names used by the requests dataset", () => {
    const areas = normalizeRequests(fixtures.sample).requests.flatMap((r) => (r.area ? [r.area] : []));
    expect(areas.length).toBeGreaterThan(0);
    for (const a of areas) expect(CRA_POPULATION[a]).toBeGreaterThan(0);
  });
});

describe("areaRates", () => {
  it("computes per-1,000 rates, includes areas with no requests and flags low populations", () => {
    const rates = areaRates([
      { value: "BALLARD", count: CRA_POPULATION.BALLARD! },
      { value: "GEORGETOWN", count: 10 },
      { value: null, count: 99 },
    ]);
    expect(rates).toHaveLength(53);
    expect(rates[0]).toMatchObject({ area: "BALLARD", rate: 1000, lowPopulation: false });
    const georgetown = rates.find((r) => r.area === "GEORGETOWN")!;
    expect(georgetown.lowPopulation).toBe(CRA_POPULATION.GEORGETOWN! < LOW_POPULATION_THRESHOLD);
    expect(rates.find((r) => r.area === "MAGNOLIA")).toMatchObject({ count: 0, rate: 0 });
  });

  it("guards against zero population", () => {
    expect(ratePer1000(5, 0)).toBe(0);
    expect(ratePer1000(5, 2500)).toBe(2);
  });
});

describe("quantile classes", () => {
  it("splits values into roughly equal-sized classes", () => {
    const values = Array.from({ length: 10 }, (_, i) => i + 1); // 1..10
    const breaks = quantileBreaks(values, 5);
    expect(breaks).toEqual([3, 5, 7, 9]);
    expect(values.map((v) => classify(v, breaks))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("collapses duplicate thresholds and handles degenerate input", () => {
    expect(quantileBreaks([0, 0, 0, 0, 5], 5)).toEqual([5]);
    expect(quantileBreaks([], 5)).toEqual([]);
    expect(quantileBreaks([7, 7, 7], 5)).toEqual([]);
    expect(classify(7, [])).toBe(0);
  });
});
