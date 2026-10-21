/**
 * Point-in-polygon lookup for static boundary layers (census tracts,
 * Community Reporting Areas). Each layer is indexed by bounding box once;
 * a lookup scans only the candidates whose box contains the point.
 */
type Ring = number[][];
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };

export interface IndexedFeature<P> {
  bbox: [number, number, number, number];
  polygons: Ring[][];
  properties: P;
}

function polygonsOf(geometry: Geometry): Ring[][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/** Ray casting: is (x, y) inside the ring? */
export function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole of any polygon. */
export function inPolygons(x: number, y: number, polygons: Ring[][]): boolean {
  return polygons.some(([outer, ...holes]) => outer !== undefined && inRing(x, y, outer) && !holes.some((h) => inRing(x, y, h)));
}

export function indexFeatures<P>(features: readonly { geometry: unknown; properties: P }[]): IndexedFeature<P>[] {
  return features.map((f) => {
    const polygons = polygonsOf(f.geometry as Geometry);
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of polygons)
      for (const [x, y] of poly[0] ?? []) {
        x0 = Math.min(x0, x as number);
        x1 = Math.max(x1, x as number);
        y0 = Math.min(y0, y as number);
        y1 = Math.max(y1, y as number);
      }
    return { bbox: [x0, y0, x1, y1], polygons, properties: f.properties };
  });
}

/** Properties of the first feature containing (lat, lon), or null. */
export function locate<P>(index: readonly IndexedFeature<P>[], lat: number, lon: number): P | null {
  for (const f of index) {
    const [x0, y0, x1, y1] = f.bbox;
    if (lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1 && inPolygons(lon, lat, f.polygons)) return f.properties;
  }
  return null;
}
