import { describe, expect, it } from "vitest";

import { buildShading, CHOROPLETH_COLORS, classColor, EXCLUDED_COLOR, legendClasses } from "@/components/map/choropleth";
import { areaBounds, areasToGeoJSON } from "@/components/map/mapData";
import { CRA_POPULATION } from "@/lib/population";
import type { FacetBucket } from "@/lib/types";

// Give every area a count equal to its alphabetical index so classes are spread.
const facet: FacetBucket[] = Object.keys(CRA_POPULATION)
  .sort()
  .map((value, i) => ({ value, count: i * 10 }));

describe("buildShading", () => {
  it("shades all 53 areas by count using every class", () => {
    const s = buildShading(facet, "count");
    expect(s.shades).toHaveLength(53);
    expect(s.breaks).toHaveLength(CHOROPLETH_COLORS.length - 1);
    expect(new Set(s.shades.map((x) => x.cls))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(s.max).toBe(520);
  });

  it("excludes low-population areas from the rate scale", () => {
    const s = buildShading(facet, "rate");
    const georgetown = s.shades.find((x) => x.area === "GEORGETOWN")!;
    expect(georgetown.lowPopulation).toBe(true);
    expect(georgetown.cls).toBe(-1);
    expect(s.shades.filter((x) => !x.lowPopulation).every((x) => x.cls >= 0)).toBe(true);
    const comparableMax = Math.max(...s.shades.filter((x) => !x.lowPopulation).map((x) => x.rate));
    expect(s.max).toBeCloseTo(comparableMax);
  });

  it("handles no data without inventing classes", () => {
    const s = buildShading([], "count");
    expect(s.breaks).toEqual([]);
    expect(s.shades.every((x) => x.cls === 0 && x.count === 0)).toBe(true);
    expect(legendClasses(s)).toEqual([{ color: CHOROPLETH_COLORS[4], label: "0–0" }]);
  });
});

describe("legend and colors", () => {
  it("labels each class range and keeps the darkest color for the top class", () => {
    const s = buildShading(facet, "count");
    const legend = legendClasses(s);
    expect(legend).toHaveLength(5);
    expect(legend[0]!.label).toMatch(/^0–</);
    expect(legend[4]!.label).toMatch(/–520$/);
    expect(legend.map((l) => l.color)).toEqual([...CHOROPLETH_COLORS]);
    expect(classColor(0, 2)).toBe(CHOROPLETH_COLORS[3]);
    expect(classColor(-1, 5)).toBe(EXCLUDED_COLOR);
  });
});

describe("area geometry", () => {
  it("joins shading onto every boundary polygon", () => {
    const s = buildShading(facet, "count");
    const fc = areasToGeoJSON(s.shades, s.breaks.length + 1);
    expect(fc.features).toHaveLength(53);
    const ballard = fc.features.find((f) => f.properties?.area === "BALLARD")!;
    expect(ballard.properties).toMatchObject({ name: "Ballard", population: CRA_POPULATION.BALLARD });
    expect(CHOROPLETH_COLORS).toContain(ballard.properties!.fill);
  });

  it("computes a bounding box inside Seattle for a neighborhood", () => {
    const [[w, s], [e, n]] = areaBounds("BALLARD")!;
    expect(w).toBeLessThan(e);
    expect(s).toBeLessThan(n);
    expect(w).toBeGreaterThan(-122.5);
    expect(n).toBeLessThan(47.8);
    expect(areaBounds("ATLANTIS")).toBeNull();
  });
});
