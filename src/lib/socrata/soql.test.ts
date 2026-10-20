import { describe, expect, it } from "vitest";

import type { DashboardFilters } from "@/lib/filters";
import { buildWhere, facetQuery, gridQuery, sampleQuery, soqlString } from "@/lib/socrata/soql";

const base: DashboardFilters = {
  start: "2026-10-01",
  end: "2026-10-31",
  category: null,
  status: null,
  area: null,
  district: null,
};

describe("soql", () => {
  it("escapes single quotes in literals", () => {
    expect(soqlString("O'Brien's")).toBe("'O''Brien''s'");
    expect(soqlString("x' OR 1=1 --")).toBe("'x'' OR 1=1 --'");
  });

  it("uses a half-open date range that includes the whole end day", () => {
    expect(buildWhere(base)).toBe("createddate >= '2026-10-01T00:00:00' AND createddate < '2026-11-01T00:00:00'");
  });

  it("adds facet filters and can omit one", () => {
    const f = { ...base, category: "Graffiti", area: "BALLARD", district: "6" };
    const where = buildWhere(f);
    expect(where).toContain("webintakeservicerequests = 'Graffiti'");
    expect(where).toContain("community_reporting_area = 'BALLARD'");
    expect(where).toContain("councildistrict = '6'");

    const withoutCategory = buildWhere(f, "category");
    expect(withoutCategory).not.toContain("webintakeservicerequests");
    expect(withoutCategory).toContain("community_reporting_area = 'BALLARD'");
  });

  it("builds a facet query that ignores only its own filter", () => {
    const q = facetQuery({ ...base, status: "Open", category: "Pothole" }, "status");
    expect(q.$group).toBe("servicerequeststatusname");
    expect(q.$where).not.toContain("servicerequeststatusname");
    expect(q.$where).toContain("'Pothole'");
  });

  it("restricts the density grid to geolocated rows and orders the sample deterministically", () => {
    expect(gridQuery(base).$where).toMatch(/latitude_longitude IS NOT NULL$/);
    const s = sampleQuery(base, 50);
    expect(s.$limit).toBe("50");
    expect(s.$order).toBe("createddate DESC, servicerequestnumber DESC");
  });
});
