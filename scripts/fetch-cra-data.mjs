// Fetch Community Reporting Area (CRA) boundaries and 2020 Census population
// from the City of Seattle's official GIS service and write static JSON used
// by the app. Run manually when the City publishes new boundaries:
//
//   node scripts/fetch-cra-data.mjs
//
// Source: "Community Reporting Areas (2020) - Redistricting Data 1990-2020"
// https://data.seattle.gov/d/7mx9-c62n (hosted on Seattle GeoData / ArcGIS).
// Population is the 2020 Census P.L. 94-171 total population.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LAYER =
  "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/CRA_90_20_PL/FeatureServer/0/query";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const params = new URLSearchParams({
  where: "1=1",
  outFields: "NEIGH_NAME,DETL_NAMES,F2020_PL_data_TOT_POP,AREA_SQMI",
  returnGeometry: "true",
  outSR: "4326",
  // ~10 m simplification keeps the file small without visible distortion at city zoom.
  maxAllowableOffset: "0.0001",
  geometryPrecision: "5",
  orderByFields: "NEIGH_NAME",
  f: "geojson",
});

const res = await fetch(`${LAYER}?${params}`);
if (!res.ok) throw new Error(`ArcGIS returned HTTP ${res.status}`);
const source = await res.json();

const features = source.features.map((f) => {
  const name = String(f.properties.NEIGH_NAME).trim();
  const population = Number(f.properties.F2020_PL_data_TOT_POP);
  if (!name || !Number.isInteger(population) || population < 0) {
    throw new Error(`Unexpected attributes: ${JSON.stringify(f.properties)}`);
  }
  return {
    type: "Feature",
    geometry: f.geometry,
    // `area` matches the upper-case community_reporting_area values in 5ngg-rpne.
    properties: { area: name.toUpperCase(), name, population, sqMi: Number(f.properties.AREA_SQMI) },
    // Smaller places inside the area ("Lake City", "South Lake Union"), used by neighborhood search.
    aliases: String(f.properties.DETL_NAMES ?? "")
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a && a.toLowerCase() !== name.toLowerCase()),
  };
});

if (features.length !== 53) throw new Error(`Expected 53 CRAs, got ${features.length}`);

const meta = {
  source: "City of Seattle, Community Reporting Areas (2020) - Redistricting Data 1990-2020",
  sourceUrl: "https://data.seattle.gov/d/7mx9-c62n",
  populationField: "F2020_PL_data_TOT_POP (2020 Census P.L. 94-171 total population)",
  retrieved: new Date().toISOString().slice(0, 10),
};

const boundaries = {
  type: "FeatureCollection",
  meta,
  features: features.map((f) => ({ type: f.type, geometry: f.geometry, properties: f.properties })),
};
const aliases = {
  meta: { ...meta, aliasField: "DETL_NAMES (all names for the area)" },
  areas: Object.fromEntries(features.map((f) => [f.properties.area, { name: f.properties.name, aliases: f.aliases }])),
};
const population = {
  meta,
  areas: Object.fromEntries(features.map((f) => [f.properties.area, f.properties.population])),
};

writeFileSync(join(root, "src/data/cra-boundaries.json"), JSON.stringify(boundaries) + "\n");
writeFileSync(join(root, "src/data/cra-population.json"), JSON.stringify(population, null, 2) + "\n");
writeFileSync(join(root, "src/data/cra-aliases.json"), JSON.stringify(aliases, null, 2) + "\n");
const total = features.reduce((a, f) => a + f.properties.population, 0);
console.log(`Wrote ${features.length} areas (2020 population ${total.toLocaleString("en-US")}).`);
