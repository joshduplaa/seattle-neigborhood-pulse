import { describe, expect, it } from "vitest";

import { describeChange, MIN_PERCENT_BASE } from "@/lib/change";
import { previousPeriod } from "@/lib/filters";

describe("describeChange", () => {
  it("uses percentages when the previous count is large enough", () => {
    expect(describeChange(112, 100)).toMatchObject({ direction: "up", text: "+12.0%" });
    expect(describeChange(96, 100)).toMatchObject({ direction: "down", text: "−4.0%", description: "down 4.0% from the previous period" });
  });

  it("uses absolute change for small previous counts", () => {
    expect(describeChange(8, 5)).toMatchObject({ direction: "up", text: "+3" });
    expect(describeChange(3, 0)).toMatchObject({ direction: "up", text: "+3" });
    expect(describeChange(MIN_PERCENT_BASE, MIN_PERCENT_BASE - 1)).toMatchObject({ text: "+1" });
  });

  it("reports no change and missing comparisons", () => {
    expect(describeChange(50, 50)).toMatchObject({ direction: "flat", text: "No change" });
    expect(describeChange(50, null)).toBeNull();
    expect(describeChange(50, undefined)).toBeNull();
  });
});

describe("previousPeriod", () => {
  const base = { category: "Graffiti", status: null, area: "BALLARD", district: null };

  it("returns the equally long window just before, keeping filters", () => {
    expect(previousPeriod({ ...base, start: "2026-09-20", end: "2026-10-19" })).toEqual({
      ...base,
      start: "2026-08-21",
      end: "2026-09-19",
    });
    expect(previousPeriod({ ...base, start: "2026-10-19", end: "2026-10-19" })).toMatchObject({ start: "2026-10-18", end: "2026-10-18" });
  });

  it("returns null when the window would start before the dataset", () => {
    expect(previousPeriod({ ...base, start: "2013-01-10", end: "2013-01-31" })).toBeNull();
  });
});
