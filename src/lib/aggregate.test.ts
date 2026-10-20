import { describe, expect, it } from "vitest";

import { buildTimeSeries, chooseGranularity, matchingTotal, rankBuckets } from "@/lib/aggregate";

describe("chooseGranularity", () => {
  it("scales with the selected range", () => {
    expect(chooseGranularity("2026-10-01", "2026-10-30")).toBe("day");
    expect(chooseGranularity("2026-07-23", "2026-10-20")).toBe("week");
    expect(chooseGranularity("2025-10-21", "2026-10-20")).toBe("week");
    expect(chooseGranularity("2024-10-21", "2026-10-20")).toBe("month");
  });
});

describe("buildTimeSeries", () => {
  it("fills days with no records as zero", () => {
    const daily = new Map([
      ["2026-10-01", 5],
      ["2026-10-03", 2],
    ]);
    const points = buildTimeSeries(daily, "2026-10-01", "2026-10-04", "day");
    expect(points.map((p) => [p.bucket, p.count])).toEqual([
      ["2026-10-01", 5],
      ["2026-10-02", 0],
      ["2026-10-03", 2],
      ["2026-10-04", 0],
    ]);
    expect(points.every((p) => !p.partial)).toBe(true);
  });

  it("rolls days into Monday weeks and flags clipped edge weeks", () => {
    // 2026-10-01 is a Thursday; 2026-10-20 is a Tuesday.
    const daily = new Map<string, number>();
    for (let d = 1; d <= 20; d++) daily.set(`2026-10-${String(d).padStart(2, "0")}`, 1);
    const points = buildTimeSeries(daily, "2026-10-01", "2026-10-20", "week");
    expect(points.map((p) => ({ b: p.bucket, n: p.count, partial: p.partial }))).toEqual([
      { b: "2026-09-28", n: 4, partial: true },
      { b: "2026-10-05", n: 7, partial: false },
      { b: "2026-10-12", n: 7, partial: false },
      { b: "2026-10-19", n: 2, partial: true },
    ]);
    expect(points[0]!.bucketEnd).toBe("2026-10-04");
    expect(points.reduce((a, p) => a + p.count, 0)).toBe(20);
  });

  it("rolls days into calendar months", () => {
    const daily = new Map([
      ["2026-01-31", 3],
      ["2026-02-01", 4],
      ["2026-03-15", 1],
    ]);
    const points = buildTimeSeries(daily, "2026-01-15", "2026-03-31", "month");
    expect(points.map((p) => [p.bucket, p.count, p.partial])).toEqual([
      ["2026-01-01", 3, true],
      ["2026-02-01", 4, false],
      ["2026-03-01", 1, false],
    ]);
  });
});

describe("matchingTotal", () => {
  const facet = [
    { value: "Graffiti", count: 10 },
    { value: "Pothole", count: 4 },
    { value: null, count: 1 },
  ];

  it("sums the whole facet when nothing is selected", () => {
    expect(matchingTotal(facet, null)).toBe(15);
  });

  it("uses only the selected bucket otherwise", () => {
    expect(matchingTotal(facet, "Pothole")).toBe(4);
    expect(matchingTotal(facet, "Unknown")).toBe(0);
  });
});

describe("rankBuckets", () => {
  const buckets = [
    { value: "A", count: 50 },
    { value: "B", count: 30 },
    { value: "C", count: 15 },
    { value: "D", count: 5 },
  ];
  const label = (v: string | null) => v ?? "blank";

  it("keeps the top N and folds the rest into 'other'", () => {
    const ranked = rankBuckets(buckets, { limit: 2, label });
    expect(ranked.map((r) => [r.label, r.count])).toEqual([
      ["A", 50],
      ["B", 30],
      ["All other (2 more)", 20],
    ]);
    expect(ranked[0]!.share).toBeCloseTo(0.5);
    expect(ranked.reduce((a, r) => a + r.count, 0)).toBe(100);
  });

  it("always keeps the selected value visible", () => {
    const ranked = rankBuckets(buckets, { limit: 2, selected: "D", label });
    expect(ranked.map((r) => r.label)).toEqual(["A", "D", "All other (2 more)"]);
  });

  it("shows a selected value with no matches as zero", () => {
    const ranked = rankBuckets(buckets, { limit: 5, selected: "Z", label });
    expect(ranked.find((r) => r.value === "Z")?.count).toBe(0);
  });
});
