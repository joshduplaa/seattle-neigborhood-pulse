import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RankedBars } from "@/components/charts/RankedBars";
import { toChartPoints } from "@/components/charts/TrendChart";
import { buildMetrics } from "@/components/dashboard/SummaryMetrics";
import { RecentRequests } from "@/components/dashboard/RecentRequests";
import { cellBounds, gridToGeoJSON, requestsToGeoJSON } from "@/components/map/mapData";
import { rankBuckets } from "@/lib/aggregate";
import type { DashboardData, ServiceRequest } from "@/lib/types";

const request = (id: string, overrides: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id,
  type: "Graffiti",
  department: null,
  createdAt: "2026-10-19T10:00:00",
  status: "Open",
  method: null,
  address: "100 PINE ST",
  coordinates: { lat: 47.61, lon: -122.34 },
  zip: null,
  councilDistrict: "7",
  precinct: null,
  area: "BELLTOWN",
  ...overrides,
});

function dashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    filters: { start: "2026-10-01", end: "2026-10-10", category: null, status: null, area: null, district: null },
    retrievedAt: "2026-10-20T22:00:00.000Z",
    sourceUpdatedAt: null,
    newestRecordAt: null,
    totals: { matching: 200, geolocated: 190, withoutArea: 4 },
    facets: {
      category: [
        { value: "Graffiti", count: 150 },
        { value: "Pothole", count: 50 },
      ],
      status: [],
      area: [],
      district: [],
    },
    series: { granularity: "day", points: [] },
    grid: { resolution: 0.005, cells: [] },
    comparison: null,
    sample: { limit: 2000, requests: [], rejected: 0 },
    ...overrides,
  };
}

describe("RankedBars", () => {
  const items = rankBuckets(
    [
      { value: "Graffiti", count: 30 },
      { value: "Pothole", count: 10 },
      { value: "Dead Animal", count: 5 },
    ],
    { limit: 2, label: (v) => v ?? "" },
  );

  it("toggles a filter on and off, and leaves the 'other' row inert", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(<RankedBars items={items} selected={null} onSelect={onSelect} label="Types" noun="type" />);

    await userEvent.click(screen.getByRole("button", { name: /Pothole/ }));
    expect(onSelect).toHaveBeenLastCalledWith("Pothole");
    expect(screen.queryByRole("button", { name: /All other/ })).toBeNull();

    rerender(<RankedBars items={items} selected="Pothole" onSelect={onSelect} label="Types" noun="type" />);
    const selected = screen.getByRole("button", { name: /Pothole/ });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(selected);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});

describe("buildMetrics", () => {
  it("derives every figure from the response", () => {
    const [total, avg, top, mapped] = buildMetrics(dashboard());
    expect(total).toMatchObject({ value: "200", detail: "Oct 1 – Oct 10 · 10 days" });
    expect(avg!.value).toBe("20.0");
    expect(top).toMatchObject({ label: "Most reported type", value: "Graffiti", detail: "75.0% of requests in scope" });
    expect(mapped).toMatchObject({ value: "95.0%", detail: "10 without usable coordinates" });
  });

  it("describes the selected type and handles an empty scope", () => {
    const withCategory = buildMetrics(
      dashboard({ filters: { ...dashboard().filters, category: "Pothole" }, totals: { matching: 50, geolocated: 50, withoutArea: 0 } }),
    );
    expect(withCategory[2]).toMatchObject({ label: "Selected request type", value: "Pothole", detail: "25.0% of requests in scope" });

    const empty = buildMetrics(
      dashboard({ totals: { matching: 0, geolocated: 0, withoutArea: 0 }, facets: { category: [], status: [], area: [], district: [] } }),
    );
    expect(empty[2]).toMatchObject({ value: "—", detail: "No requests in scope" });
    expect(empty[3]!.value).toBe("—");
  });
});

describe("toChartPoints", () => {
  it("draws partial buckets on a separate dashed series joined to their neighbours", () => {
    const base = { bucketEnd: "", days: 7, partial: false };
    const out = toChartPoints([
      { ...base, bucket: "a", count: 1, partial: true, days: 2 },
      { ...base, bucket: "b", count: 7 },
      { ...base, bucket: "c", count: 7 },
      { ...base, bucket: "d", count: 3, partial: true, days: 3 },
    ]);
    expect(out.map((p) => [p.full, p.clipped])).toEqual([
      [null, 1],
      [7, 7],
      [7, 7],
      [null, 3],
    ]);
  });
});

describe("map data", () => {
  it("plots only requests with validated coordinates", () => {
    const fc = requestsToGeoJSON([request("1"), request("2", { coordinates: null })]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry.coordinates).toEqual([-122.34, 47.61]);
  });

  it("weights density cells relative to the busiest cell and computes bounds", () => {
    const cells = [
      { lat: 47.6, lon: -122.3, count: 100 },
      { lat: 47.65, lon: -122.35, count: 25 },
    ];
    expect(gridToGeoJSON(cells).features.map((f) => f.properties?.weight)).toEqual([1, 0.5]);
    const [[west, south], [east, north]] = cellBounds(cells, 0.01)!;
    expect(west).toBeCloseTo(-122.355, 9);
    expect(south).toBeCloseTo(47.595, 9);
    expect(east).toBeCloseTo(-122.295, 9);
    expect(north).toBeCloseTo(47.655, 9);
    expect(cellBounds([], 0.01)).toBeNull();
  });
});

describe("RecentRequests", () => {
  it("lists requests, flags unmapped ones and reports the selection", async () => {
    const onChoose = vi.fn();
    const data = dashboard({
      sample: { limit: 2000, requests: [request("26-1"), request("26-2", { coordinates: null, type: "Pothole" })], rejected: 0 },
    });
    render(<RecentRequests data={data} loading={false} selectedId={null} onChoose={onChoose} onClearFilters={() => {}} canClear={false} />);

    expect(screen.getByText("Newest 2 of 200 matching requests, newest first.")).toBeInTheDocument();
    expect(screen.getAllByText("No map location")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /Pothole/ }));
    expect(onChoose).toHaveBeenCalledWith("26-2");
  });

  it("offers to clear filters when nothing matches", async () => {
    const onClear = vi.fn();
    const data = dashboard({ totals: { matching: 0, geolocated: 0, withoutArea: 0 } });
    render(<RecentRequests data={data} loading={false} selectedId={null} onChoose={() => {}} onClearFilters={onClear} canClear />);
    expect(screen.getByText("No requests match these filters")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalled();
  });
});
