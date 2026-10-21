import { describe, expect, it } from "vitest";

import { CRA_POPULATION } from "@/lib/population";
import { NEIGHBORHOODS, neighborhoodName, normalize, searchNeighborhoods } from "@/lib/neighborhoodSearch";

const names = (q: string) => searchNeighborhoods(q).map((r) => r.name);

describe("neighborhood search data", () => {
  it("covers the same 53 areas as the population and boundary data", () => {
    expect(NEIGHBORHOODS).toHaveLength(53);
    expect(NEIGHBORHOODS.map((n) => n.area).sort()).toEqual(Object.keys(CRA_POPULATION).sort());
  });
});

describe("searchNeighborhoods", () => {
  it("returns every neighborhood alphabetically for an empty query", () => {
    expect(names("  ")).toHaveLength(53);
    expect(names("")[0]).toBe("Alki/Admiral");
  });

  it("matches names case-insensitively and by any word", () => {
    expect(names("ballard")[0]).toBe("Ballard");
    expect(names("BEACON")).toEqual(expect.arrayContaining(["Beacon Hill", "North Beacon Hill/Jefferson Park", "South Beacon Hill/NewHolly"]));
    expect(names("jefferson")).toEqual(["North Beacon Hill/Jefferson Park"]);
  });

  it("finds areas through the places listed inside them", () => {
    const slu = searchNeighborhoods("South Lake Union");
    expect(slu[0]).toEqual({ area: "CASCADE/EASTLAKE", name: "Cascade/Eastlake", matchedAlias: "South Lake Union" });
    // Lake City spans two areas.
    expect(names("lake city").sort()).toEqual(["Cedar Park/Meadowbrook", "Olympic Hills/Victory Heights"]);
    expect(names("magnuson")).toEqual(["Laurelhurst/Sand Point"]);
  });

  it("ranks an area's own name above an alias match", () => {
    const results = searchNeighborhoods("capitol hill");
    expect(results[0]).toMatchObject({ name: "Capitol Hill", matchedAlias: null });
    expect(results.some((r) => r.name === "Miller Park" && r.matchedAlias === "Capitol Hill")).toBe(true);
  });

  it("treats Mt/Mount and punctuation alike", () => {
    expect(normalize("Mt. Baker/North Rainier")).toBe("mount baker north rainier");
    expect(names("mount baker")[0]).toBe("Mt. Baker/North Rainier");
    expect(names("pike pine")).toContain("Capitol Hill");
  });

  it("returns nothing for unknown places", () => {
    expect(searchNeighborhoods("Bellevue")).toEqual([]);
  });

  it("looks up display names", () => {
    expect(neighborhoodName("GREENWOOD/PHINNEY RIDGE")).toBe("Greenwood/Phinney Ridge");
    expect(neighborhoodName("NOWHERE")).toBeNull();
  });
});
