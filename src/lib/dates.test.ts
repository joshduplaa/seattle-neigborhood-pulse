import { describe, expect, it } from "vitest";

import {
  addDays,
  daysInRange,
  endOfMonth,
  formatLocalTimestamp,
  isValidYmd,
  seattleToday,
  startOfWeek,
} from "@/lib/dates";

describe("dates", () => {
  it("validates calendar dates strictly", () => {
    expect(isValidYmd("2026-10-20")).toBe(true);
    expect(isValidYmd("2024-02-29")).toBe(true);
    expect(isValidYmd("2025-02-29")).toBe(false);
    expect(isValidYmd("2026-13-01")).toBe(false);
    expect(isValidYmd("2026-1-01")).toBe(false);
    expect(isValidYmd("not a date")).toBe(false);
  });

  it("does day arithmetic across month, year and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    // US DST ends 2026-11-01; arithmetic must not drift by an hour into another day.
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(daysInRange("2026-10-01", "2026-10-30")).toBe(30);
    expect(daysInRange("2026-10-20", "2026-10-20")).toBe(1);
  });

  it("finds Monday week starts and month ends", () => {
    expect(startOfWeek("2026-10-20")).toBe("2026-10-19"); // Tue → Mon
    expect(startOfWeek("2026-10-19")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19"); // Sun → previous Mon
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(endOfMonth("2026-12-05")).toBe("2026-12-31");
  });

  it("computes today's date in Seattle, not UTC", () => {
    // 2026-10-21 03:00 UTC is still 2026-10-20 in Seattle (UTC-7).
    expect(seattleToday(new Date("2026-10-21T03:00:00Z"))).toBe("2026-10-20");
    expect(seattleToday(new Date("2026-10-21T08:00:00Z"))).toBe("2026-10-21");
  });

  it("formats floating timestamps without timezone shifts", () => {
    expect(formatLocalTimestamp("2026-10-20T02:33:06")).toBe("Oct 20, 2026, 2:33 AM");
    expect(formatLocalTimestamp("garbage")).toBe("garbage");
  });
});
