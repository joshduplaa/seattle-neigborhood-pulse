import { describe, expect, it } from "vitest";

import { defaultFilters, filtersToParams, matchPreset, MAX_RANGE_DAYS, parseFilters, presetRange } from "@/lib/filters";
import { daysInRange } from "@/lib/dates";

const TODAY = "2026-10-20";

describe("filters", () => {
  it("defaults to the 30 complete days ending yesterday", () => {
    const f = defaultFilters(TODAY);
    expect(f).toEqual({ start: "2026-09-20", end: "2026-10-19", category: null, status: null, area: null, district: null });
    expect(daysInRange(f.start, f.end)).toBe(30);
    expect(matchPreset(f, TODAY)).toBe("30d");
  });

  it("parses valid parameters", () => {
    const params = new URLSearchParams({
      start: "2026-10-01",
      end: "2026-10-10",
      category: "Graffiti",
      status: "Open",
      area: "BALLARD",
      district: "6",
    });
    const { filters, issues } = parseFilters(params, TODAY);
    expect(issues).toEqual([]);
    expect(filters).toEqual({
      start: "2026-10-01",
      end: "2026-10-10",
      category: "Graffiti",
      status: "Open",
      area: "BALLARD",
      district: "6",
    });
    expect(matchPreset(filters, TODAY)).toBeNull();
  });

  it("corrects invalid input and reports what changed", () => {
    const { filters, issues } = parseFilters(
      new URLSearchParams({ start: "2026-02-30", end: "2027-01-01", district: "9", category: "  " }),
      TODAY,
    );
    expect(filters.start).toBe(defaultFilters(TODAY).start);
    expect(filters.end).toBe(TODAY);
    expect(filters.district).toBeNull();
    expect(filters.category).toBeNull();
    expect(issues).toHaveLength(3);
  });

  it("swaps reversed dates, clamps to the dataset start and to the max range", () => {
    expect(parseFilters(new URLSearchParams({ start: "2026-10-10", end: "2026-10-01" }), TODAY).filters).toMatchObject({
      start: "2026-10-01",
      end: "2026-10-10",
    });
    const clamped = parseFilters(new URLSearchParams({ start: "2005-01-01", end: TODAY }), TODAY).filters;
    expect(daysInRange(clamped.start, clamped.end)).toBe(MAX_RANGE_DAYS);
    expect(parseFilters(new URLSearchParams({ start: "2010-01-01", end: "2013-06-01" }), TODAY).filters.start).toBe(
      "2013-01-01",
    );
  });

  it("round-trips through URL parameters", () => {
    const f = { ...presetRange("7d", TODAY), category: "Pothole", status: null, area: "FREMONT", district: null };
    expect(parseFilters(filtersToParams(f), TODAY).filters).toEqual(f);
    expect(filtersToParams(f).has("status")).toBe(false);
  });
});
