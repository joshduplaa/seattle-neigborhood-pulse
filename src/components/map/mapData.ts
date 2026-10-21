import { classColor, type AreaShade } from "@/components/map/choropleth";
import boundaries from "@/data/cra-boundaries.json";
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

type AreaGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;
const AREA_FEATURES = boundaries.features as unknown as GeoJSON.Feature<AreaGeometry, { area: string }>[];

/**
 * Community Reporting Area polygons with their shading resolved to a fill
 * color, so the map layer needs no data-driven class logic.
 */
export function areasToGeoJSON(shades: AreaShade[], classCount: number): GeoJSON.FeatureCollection<AreaGeometry> {
  const byArea = new Map(shades.map((s) => [s.area, s]));
  return {
    type: "FeatureCollection",
    features: AREA_FEATURES.map((f) => {
      const s = byArea.get(f.properties.area);
      return {
        type: "Feature",
        geometry: f.geometry,
        properties: {
          area: f.properties.area,
          name: s?.name ?? f.properties.area,
          count: s?.count ?? 0,
          rate: s?.rate ?? 0,
          population: s?.population ?? 0,
          lowPopulation: s?.lowPopulation ?? false,
          fill: classColor(s?.cls ?? -1, classCount),
        },
      };
    }),
  };
}

function visit(coords: unknown, fn: (lon: number, lat: number) => void) {
  if (Array.isArray(coords) && typeof coords[0] === "number") fn(coords[0] as number, coords[1] as number);
  else if (Array.isArray(coords)) for (const c of coords) visit(c, fn);
}

/** Bounding box of one Community Reporting Area polygon; null if unknown. */
export function areaBounds(area: string): [[number, number], [number, number]] | null {
  const feature = AREA_FEATURES.find((f) => f.properties.area === area);
  if (!feature) return null;
  let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
  visit(feature.geometry.coordinates, (lon, lat) => {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}
