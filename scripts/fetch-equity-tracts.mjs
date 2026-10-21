// Fetch Seattle's 2020 census tracts with the City's Racial and Social
// Equity Composite Index and write static JSON used by the equity analysis
// (server-side only). Run manually when the City updates the index:
//
//   node scripts/fetch-equity-tracts.mjs
//
// Source: "Racial and Social Equity Composite Index Current"
// https://data.seattle.gov/d/x5s4-2aie (hosted on Seattle GeoData / ArcGIS).
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LAYER =
  "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Race_and_Social_Equity_Composite_Index_Current/FeatureServer/0/query";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The layer's quintile labels, highest equity priority (most disadvantaged) first.
const QUINTILES = {
  "Highest Equity Priority": 1,
  "Second Highest": 2,
  Middle: 3,
  "Second Lowest": 4,
  Lowest: 5,
};

const params = new URLSearchParams({
  where: "1=1",
  outFields: "GEOID,NAMELSAD,COMPOSITE_QUINTILE,COMPOSITE_PERCENTILE,INDEX_YEAR",
  returnGeometry: "true",
  outSR: "4326",
  maxAllowableOffset: "0.0001",
  geometryPrecision: "5",
  orderByFields: "GEOID",
  f: "geojson",
});

const res = await fetch(`${LAYER}?${params}`);
if (!res.ok) throw new Error(`ArcGIS returned HTTP ${res.status}`);
const source = await res.json();

const years = new Set();
const features = source.features.map((f) => {
  const p = f.properties;
  const quintile = QUINTILES[String(p.COMPOSITE_QUINTILE).trim()];
  if (!quintile || !p.GEOID) throw new Error(`Unexpected attributes: ${JSON.stringify(p)}`);
  years.add(p.INDEX_YEAR);
  return {
    type: "Feature",
    geometry: f.geometry,
    properties: { geoid: String(p.GEOID), name: String(p.NAMELSAD), quintile, percentile: Number(p.COMPOSITE_PERCENTILE) },
  };
});

if (features.length !== 179) throw new Error(`Expected 179 Seattle tracts, got ${features.length}`);

const out = {
  type: "FeatureCollection",
  meta: {
    source: "City of Seattle, Racial and Social Equity Composite Index Current",
    sourceUrl: "https://data.seattle.gov/d/x5s4-2aie",
    quintileField: "COMPOSITE_QUINTILE (1 = Highest Equity Priority ... 5 = Lowest)",
    indexYear: [...years].join(", "),
    retrieved: new Date().toISOString().slice(0, 10),
  },
  features,
};
writeFileSync(join(root, "src/data/equity-tracts.json"), JSON.stringify(out) + "\n");
const counts = features.reduce((m, f) => ((m[f.properties.quintile] = (m[f.properties.quintile] ?? 0) + 1), m), {});
console.log(`Wrote ${features.length} tracts; quintile counts ${JSON.stringify(counts)}; index year ${out.meta.indexYear}.`);
