import { describe, expect, it } from "vitest";

import { equityHeadline, equityWindowText, formatPoints, isClear } from "@/components/dashboard/equityText";
import type { Comparison, QuintileResult } from "@/lib/equity";

const cmp = (difference: number, margin: number): Comparison => ({ observed: 0.5 + difference, expected: 0.5, difference, margin });
const quintile = (q: number, c: Comparison): QuintileResult => ({ quintile: q, label: `Q${q}`, tracts: 35, requests: 1000, h7: c, h30: c });

describe("equity wording", () => {
  it("formats signed percentage points", () => {
    expect(formatPoints(0.06)).toBe("+6.0");
    expect(formatPoints(-0.007)).toBe("−0.7");
    expect(formatPoints(0.0001)).toBe("0.0");
  });

  it("only calls a difference clear when its interval excludes zero", () => {
    expect(isClear(cmp(0.06, 0.013))).toBe(true);
    expect(isClear(cmp(-0.007, 0.011))).toBe(false);
  });

  it("summarizes the highest- and lowest-priority quintiles honestly", () => {
    const text = equityHeadline([quintile(1, cmp(-0.007, 0.011)), quintile(5, cmp(0.06, 0.013))], 7);
    expect(text).toBe(
      "Requests in the highest-equity-priority tracts were closed about as often as their request mix predicts (within the ±1.1-point margin); " +
        "in the lowest-priority tracts, 6.0 points more often within 7 days than their request mix predicts.",
    );
    expect(equityHeadline([], 7)).toBe("Not enough requests to compare equity groups.");
  });

  it("explains how the window was chosen", () => {
    expect(equityWindowText({ start: "2026-06-23", end: "2026-09-20", shifted: true, extended: true, capped: false })).toBe(
      "Requests created Jun 23 – Sep 20, 2026 (your range is too recent to judge, so it uses the latest period whose requests have all had 30 days to close; lengthened to 90 days so each group has enough requests).",
    );
    expect(equityWindowText(null)).toMatch(/30 days to close/);
  });
});
