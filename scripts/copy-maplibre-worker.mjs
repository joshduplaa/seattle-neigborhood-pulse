// MapLibre GL 6 loads its web worker from a URL relative to its own module.
// Bundlers relocate the module, so we serve the worker from /public and point
// MapLibre at it with setWorkerUrl() (see src/components/map/MapView.tsx).
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(dirname(require.resolve("maplibre-gl/package.json")), "dist", "maplibre-gl-worker.mjs");
const target = join(root, "public", "vendor", "maplibre-gl-worker.mjs");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`Copied MapLibre worker to ${target.replace(root, ".")}`);
