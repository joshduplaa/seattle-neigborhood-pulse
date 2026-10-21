import { describe, expect, it } from "vitest";

import { formatMedian } from "@/components/dashboard/ResolutionPanel";
import {
  closedDistributionQuery,
  closedWithin,
  cohortWindow,
  getResolutionData,
  medianDays,
  parseDistribution,
  parseSizes,
  type QueryFn,
} from "@/lib/resolution";

describe("cohortWindow", () => {
  it("uses the selected range when every request has had 30 days", () => {
    expect(cohortWindow("2026-08-01", "2026-08-31", "2026-10-20")).toEqual({ start: "2026-08-01", end: "2026-08-31", shifted: false });
    expect(cohortWindow("2026-08-21", "2026-09-20", "2026-10-20")).toEqual({ start: "2026-08-21", end: "2026-09-20", shifted: false });
  });

  it("shifts a too-recent range back to the latest equally long qualifying window", () => {
    // Default 30-day range ending yesterday → the 30 days ending Sep 20.
    expect(cohortWindow("2026-09-20", "2026-10-19", "2026-10-20")).toEqual({ start: "2026-08-22", end: "2026-09-20", shifted: true });
    expect(cohortWindow("2026-10-13", "2026-10-19", "2026-10-20")).toEqual({ start: "2026-09-14", end: "2026-09-20", shifted: true });
  });

  it("clamps to the start of the tracking data", () => {
    expect(cohortWindow("2022-06-01", "2023-01-10", "2026-10-20")).toEqual({ start: "2023-01-01", end: "2023-01-10", shifted: false });
    expect(cohortWindow("2020-01-01", "2020-12-31", "2026-10-20")).toBeNull();
  });
});

describe("median and closures", () => {
  const dist = new Map([
    [0, 10],
    [2, 20],
    [9, 15],
  ]);

  it("counts closures within a horizon", () => {
    expect(closedWithin(dist, 7)).toBe(30);
    expect(closedWithin(dist, 30)).toBe(45);
    expect(closedWithin(undefined, 7)).toBe(0);
  });

  it("treats never-closed requests as slower than the horizon", () => {
    expect(medianDays(dist, 60, 30)).toEqual({ days: 2, exceeds: false }); // 30th of 60 closed on day 2
    expect(medianDays(dist, 100, 30)).toEqual({ days: 30, exceeds: true }); // only 45 of 100 ever closed
    expect(medianDays(new Map(), 0, 7)).toBeNull();
  });

  it("formats medians for display", () => {
    expect(formatMedian({ days: 0, exceeds: false })).toBe("Same day");
    expect(formatMedian({ days: 1, exceeds: false })).toBe("1 day");
    expect(formatMedian({ days: 9, exceeds: false })).toBe("9 days");
    expect(formatMedian({ days: 30, exceeds: true })).toBe("> 30 days");
    expect(formatMedian(null)).toBe("—");
  });
});

describe("parsing", () => {
  it("ignores malformed rows", () => {
    expect(parseSizes([{ servicerequesttype: "Graffiti Report", n: "12" }, { n: "3" }, { servicerequesttype: "X", n: "-1" }, null])).toEqual(
      new Map([["Graffiti Report", 12]]),
    );
    const dist = parseDistribution([
      { servicerequesttype: "Graffiti Report", days: "0", n: "4" },
      { servicerequesttype: "Graffiti Report", days: "0", n: "1" },
      { servicerequesttype: "Graffiti Report", days: "x", n: "1" },
    ]);
    expect(dist.get("Graffiti Report")).toEqual(new Map([[0, 5]]));
  });

  it("builds a chained query that excludes negative and over-horizon durations", () => {
    const q = closedDistributionQuery({ start: "2026-08-01", end: "2026-08-31" }, 30).$query!;
    expect(q).toContain("statuscategory = 'Closed'");
    expect(q).toContain("createddate < '2026-09-01T00:00:00'");
    expect(q).toContain("|> SELECT");
    expect(q).toContain("date_diff_d(u, c) >= 0 AND date_diff_d(u, c) <= 30");
  });
});

describe("getResolutionData", () => {
  // Scripted API using the August 2026 cohort, cross-checked by hand against the live dataset.
  const august: QueryFn = async (params) => {
    const q = params.$query ?? "";
    if (q.startsWith("SELECT max(updateddate)")) return { rows: [{ dataend: "2026-10-20T00:00:00.000" }], lastModified: "Wed, 21 Oct 2026 00:08:10 GMT" };
    if (q.includes("count(distinct servicerequestnumber)")) {
      return { rows: [{ servicerequesttype: "Abandoned Vehicle", n: "5869" }, { servicerequesttype: "Streetlight Repair", n: "179" }], lastModified: null };
    }
    const rows = [
      { servicerequesttype: "Abandoned Vehicle", days: "3", n: "2590" },
      { servicerequesttype: "Abandoned Vehicle", days: "9", n: "2407" },
      { servicerequesttype: "Streetlight Repair", days: "5", n: "63" },
      { servicerequesttype: "Streetlight Repair", days: "12", n: "55" },
    ];
    return { rows, lastModified: null };
  };

  it("summarizes each tracked type with cohort-based shares and medians", async () => {
    const data = await getResolutionData({ start: "2026-08-01", end: "2026-08-31" }, august, () => new Date("2026-10-21T00:00:00Z"));
    expect(data.dataEnd).toBe("2026-10-20");
    expect(data.sourceUpdatedAt).toBe("2026-10-21T00:08:10.000Z");
    expect(data.types).toHaveLength(5);

    const vehicles = data.types.find((t) => t.tracking === "Abandoned Vehicle")!;
    expect(vehicles.request).toBe("Abandoned Vehicle/72hr Parking Ordinance");
    expect(vehicles.horizons[7]).toMatchObject({ cohort: 5869, closed: 2590 });
    expect(vehicles.horizons[30]!.share).toBeCloseTo(4997 / 5869);
    expect(vehicles.median).toEqual({ days: 9, exceeds: false });

    const lights = data.types.find((t) => t.tracking === "Streetlight Repair")!;
    expect(lights.horizons[30]).toMatchObject({ cohort: 179, closed: 118 });
    expect(lights.median).toEqual({ days: 12, exceeds: false });

    // Types absent from the cohort report zero, not missing data.
    expect(data.types.find((t) => t.tracking === "Graffiti Report")!.horizons[7]).toMatchObject({ cohort: 0, closed: 0 });
    expect(data.window).toEqual({ start: "2026-08-01", end: "2026-08-31", shifted: false });
  });

  it("keeps 7-day and 30-day figures on the same cohort, so they never contradict", async () => {
    const data = await getResolutionData({ start: "2026-08-01", end: "2026-08-31" }, august);
    for (const t of data.types) {
      expect(t.horizons[7].cohort).toBe(t.horizons[30].cohort);
      expect(t.horizons[7].share).toBeLessThanOrEqual(t.horizons[30].share);
    }
  });

  it("shifts a too-recent range and skips upstream queries when nothing qualifies", async () => {
    const shifted = await getResolutionData({ start: "2026-10-13", end: "2026-10-19" }, august);
    expect(shifted.window).toMatchObject({ shifted: true, end: "2026-09-20" });

    const calls: string[] = [];
    const counting: QueryFn = async (p) => {
      calls.push(p.$query ?? "");
      return august(p);
    };
    const none = await getResolutionData({ start: "2020-01-01", end: "2020-12-31" }, counting);
    expect(none.window).toBeNull();
    expect(calls).toHaveLength(1);
    expect(none.types.every((t) => t.cohort === 0 && t.median === null)).toBe(true);
  });

  it("fails loudly when the tracking data has no end date", async () => {
    await expect(getResolutionData({ start: "2026-08-01", end: "2026-08-31" }, async () => ({ rows: [], lastModified: null }))).rejects.toThrow(
      "no end date",
    );
  });
});
