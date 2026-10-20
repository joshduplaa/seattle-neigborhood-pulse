import type { GridCell, ServiceRequest } from "@/lib/types";

/** Initial view: the city limits, from Rainier Beach to the north city line. */
export const SEATTLE_BOUNDS: [[number, number], [number, number]] = [
  [-122.44, 47.495],
  [-122.235, 47.735],
];
/** Pan limits — a margin around the city so it can't be lost off-screen. */
export const SEATTLE_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-122.8, 47.3],
  [-121.9, 47.95],
];

/** Free, key-less vector basemap (OpenFreeMap, OpenStreetMap data). */
export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

type Point = GeoJSON.Feature<GeoJSON.Point>;

/** Density cells as GeoJSON points with a 0–1 weight relative to the busiest cell. */
export function gridToGeoJSON(cells: GridCell[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const max = cells.reduce((m, c) => Math.max(m, c.count), 0);
  return {
    type: "FeatureCollection",
    features: cells.map<Point>((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      // sqrt keeps a few extreme downtown cells from washing out the rest.
      properties: { count: c.count, weight: max === 0 ? 0 : Math.sqrt(c.count / max) },
    })),
  };
}

/** Only requests with validated coordinates are plotted. */
export function requestsToGeoJSON(requests: ServiceRequest[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: Point[] = [];
  for (const r of requests) {
    if (!r.coordinates) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [r.coordinates.lon, r.coordinates.lat] },
      properties: { id: r.id, type: r.type },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Bounding box of the density cells, padded by half a cell; null if empty. */
export function cellBounds(cells: GridCell[], resolution: number): [[number, number], [number, number]] | null {
  if (cells.length === 0) return null;
  let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of cells) {
    minLon = Math.min(minLon, c.lon);
    maxLon = Math.max(maxLon, c.lon);
    minLat = Math.min(minLat, c.lat);
    maxLat = Math.max(maxLat, c.lat);
  }
  const pad = resolution / 2;
  return [
    [minLon - pad, minLat - pad],
    [maxLon + pad, maxLat + pad],
  ];
}
