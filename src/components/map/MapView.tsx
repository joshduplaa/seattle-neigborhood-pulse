"use client";

import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { Shading } from "@/components/map/choropleth";
import {
  areaBounds,
  areasToGeoJSON,
  BASEMAP_STYLE_URL,
  cellBounds,
  gridToGeoJSON,
  requestsToGeoJSON,
  SEATTLE_BOUNDS,
  SEATTLE_MAX_BOUNDS,
} from "@/components/map/mapData";
import { formatCount, formatDecimal } from "@/lib/format";
import type { GridCell, ServiceRequest } from "@/lib/types";

// Worker is copied to /public by scripts/copy-maplibre-worker.mjs; the
// version query busts browser caches when MapLibre is upgraded.
maplibregl.setWorkerUrl(`/vendor/maplibre-gl-worker.mjs?v=${maplibregl.getVersion()}`);

export interface MapFocus {
  id: string;
  /** Changes on every request to focus, so re-focusing the same id works. */
  nonce: number;
}

export interface MapViewProps {
  cells: GridCell[];
  resolution: number;
  requests: ServiceRequest[];
  selectedId: string | null;
  focus: MapFocus | null;
  /** Changes when the geographic filter changes; the map then fits the data. */
  fitKey: string;
  background: MapBackground;
  shading: Shading;
  selectedArea: string | null;
  showRequests: boolean;
  onSelect: (id: string) => void;
  /** Toggle the neighborhood filter for an area clicked on the map. */
  onSelectArea: (area: string) => void;
  onStatusChange: (status: "ready" | "error", message?: string) => void;
}

export type MapBackground = "areas" | "density" | "none";

const REQUEST_LAYERS = ["request-clusters", "request-cluster-count", "request-points", "request-selected"];
const AREA_LAYERS = ["area-fill", "area-line", "area-selected"];

const COLORS = {
  sound: "#00789a",
  soundDeep: "#063f57",
  ferry: "#d9622b",
  surface: "#ffffff",
  ink: "#13222c",
};

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function addLayers(map: maplibregl.Map) {
  map.addSource("areas", { type: "geojson", data: EMPTY, promoteId: "area" });
  map.addSource("density", { type: "geojson", data: EMPTY });
  // The selection has its own unclustered source so it is never hidden inside a cluster.
  map.addSource("selected", { type: "geojson", data: EMPTY });
  map.addSource("requests", {
    type: "geojson",
    data: EMPTY,
    cluster: true,
    clusterRadius: 44,
    clusterMaxZoom: 15,
    promoteId: "id",
  });

  // Neighborhood shading (fill color resolved in areasToGeoJSON).
  map.addLayer({
    id: "area-fill",
    type: "fill",
    source: "areas",
    paint: { "fill-color": ["get", "fill"], "fill-opacity": 0.62 },
  });
  map.addLayer({
    id: "area-line",
    type: "line",
    source: "areas",
    paint: { "line-color": COLORS.surface, "line-width": 1 },
  });
  map.addLayer({
    id: "area-selected",
    type: "line",
    source: "areas",
    filter: ["==", ["get", "area"], ""],
    paint: { "line-color": COLORS.ink, "line-width": 2.5 },
  });

  // Density: one-hue sequential ramp, transparent at zero.
  map.addLayer({
    id: "density-heat",
    type: "heatmap",
    source: "density",
    paint: {
      "heatmap-weight": ["get", "weight"],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 14, 2.4],
      "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 9, 9, 12, 30, 15, 110],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.9, 16, 0.5],
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(214,238,243,0)",
        0.15,
        "rgba(159,211,223,0.55)",
        0.35,
        "#5bb2c8",
        0.6,
        "#1c8eab",
        0.8,
        "#0a6684",
        1,
        "#063f57",
      ],
    },
  });

  map.addLayer({
    id: "request-clusters",
    type: "circle",
    source: "requests",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": COLORS.surface,
      "circle-stroke-color": COLORS.soundDeep,
      "circle-stroke-width": 2,
      "circle-radius": ["step", ["get", "point_count"], 13, 25, 17, 100, 22, 500, 28],
    },
  });
  map.addLayer({
    id: "request-cluster-count",
    type: "symbol",
    source: "requests",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: { "text-color": COLORS.soundDeep },
  });
  map.addLayer({
    id: "request-points",
    type: "circle",
    source: "requests",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": COLORS.sound,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4.5, 16, 7],
      "circle-stroke-color": COLORS.surface,
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "request-selected",
    type: "circle",
    source: "selected",
    paint: {
      "circle-color": COLORS.ferry,
      "circle-radius": 9,
      "circle-stroke-color": COLORS.surface,
      "circle-stroke-width": 3,
    },
  });
}

function setVisibility(map: maplibregl.Map, layers: string[], visible: boolean) {
  for (const id of layers) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

/** Hover card for a neighborhood, built from DOM nodes (no HTML injection). */
function areaCard(props: Record<string, unknown>): HTMLElement {
  const root = document.createElement("div");
  root.className = "text-[13px] leading-5 text-ink";
  const line = (text: string, className = "") => {
    const el = document.createElement("div");
    el.textContent = text;
    if (className) el.className = className;
    root.append(el);
  };
  const population = Number(props.population ?? 0);
  line(String(props.name ?? ""), "font-semibold");
  line(`${formatCount(Number(props.count ?? 0))} requests`);
  if (population > 0) {
    line(`${formatDecimal(Number(props.rate ?? 0))} per 1,000 residents`);
    line(`${formatCount(population)} residents (2020 Census)`, "text-ink-subtle");
  }
  if (props.lowPopulation === true || props.lowPopulation === "true") {
    line("Few residents: per-capita rate not comparable", "text-ink-subtle");
  }
  line("Click to filter to this neighborhood", "mt-1 text-ink-subtle");
  return root;
}

export default function MapView(props: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const lastFitKey = useRef<string | null>(null);
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: BASEMAP_STYLE_URL,
        bounds: SEATTLE_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        minZoom: 9,
        maxZoom: 18,
        maxBounds: SEATTLE_MAX_BOUNDS,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
    } catch (err) {
      console.error("Map failed to initialise", err);
      propsRef.current.onStatusChange("error", "Your browser could not start the map (WebGL may be unavailable).");
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    let loaded = false;
    map.on("load", () => {
      loaded = true;
      addLayers(map);
      setReady(true);
      propsRef.current.onStatusChange("ready");
    });
    map.on("error", (e) => {
      // Before the style loads, any error means there is no usable map.
      if (!loaded) {
        console.error("Basemap failed to load", e.error);
        propsRef.current.onStatusChange("error", "The basemap could not be loaded. Check your connection and reload the page.");
      }
    });

    const onClusterClick = async (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      const clusterId = feature?.properties?.cluster_id as number | undefined;
      const source = map.getSource<maplibregl.GeoJSONSource>("requests");
      if (clusterId === undefined || !source || feature?.geometry.type !== "Point") return;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: Math.min(zoom, 17) });
    };
    const onPointClick = (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (typeof id === "string") propsRef.current.onSelect(id);
    };
    const pointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const unpointer = () => {
      map.getCanvas().style.cursor = "";
    };

    // Neighborhood hover card and click-to-filter. Clicks on markers win.
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: "240px" });
    const onAreaMove = (e: maplibregl.MapLayerMouseEvent) => {
      const props = e.features?.[0]?.properties;
      if (!props) return;
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat(e.lngLat).setDOMContent(areaCard(props)).addTo(map);
    };
    const onAreaLeave = () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    };
    const onAreaClick = (e: maplibregl.MapLayerMouseEvent) => {
      const onMarker = map.queryRenderedFeatures(e.point, { layers: REQUEST_LAYERS.filter((l) => map.getLayer(l)) }).length > 0;
      const area = e.features?.[0]?.properties?.area;
      if (!onMarker && typeof area === "string") propsRef.current.onSelectArea(area);
    };
    map.on("mousemove", "area-fill", onAreaMove);
    map.on("mouseleave", "area-fill", onAreaLeave);
    map.on("click", "area-fill", onAreaClick);

    map.on("click", "request-clusters", onClusterClick);
    map.on("click", "request-points", onPointClick);
    map.on("click", "request-selected", onPointClick);
    for (const layer of ["request-clusters", "request-points", "request-selected"]) {
      map.on("mouseenter", layer, pointer);
      map.on("mouseleave", layer, unpointer);
    }

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  const { cells, requests, selectedId, focus, fitKey, resolution, background, shading, selectedArea, showRequests } = props;

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource<maplibregl.GeoJSONSource>("areas")?.setData(areasToGeoJSON(shading.shades, shading.breaks.length + 1));
  }, [ready, shading]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter("area-selected", ["==", ["get", "area"], selectedArea ?? ""]);
  }, [ready, selectedArea]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource<maplibregl.GeoJSONSource>("density")?.setData(gridToGeoJSON(cells));
  }, [ready, cells]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource<maplibregl.GeoJSONSource>("requests")?.setData(requestsToGeoJSON(requests));
  }, [ready, requests]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const selected = propsRef.current.requests.find((r) => r.id === selectedId);
    map.getSource<maplibregl.GeoJSONSource>("selected")?.setData(requestsToGeoJSON(selected ? [selected] : []));
  }, [ready, selectedId, requests]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    setVisibility(map, ["density-heat"], background === "density");
    setVisibility(map, AREA_LAYERS, background === "areas");
    setVisibility(map, REQUEST_LAYERS, showRequests);
  }, [ready, background, showRequests]);

  // Fly to a request chosen from the list.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    const request = propsRef.current.requests.find((r) => r.id === focus.id);
    if (!request?.coordinates) return;
    map.flyTo({
      center: [request.coordinates.lon, request.coordinates.lat],
      zoom: Math.max(map.getZoom(), 15.5),
      essential: true,
    });
  }, [ready, focus]);

  // Fit to the data when the geographic filter changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || lastFitKey.current === fitKey) return;
    const first = lastFitKey.current === null;
    lastFitKey.current = fitKey;
    if (fitKey === "|") {
      if (!first) map.fitBounds(SEATTLE_BOUNDS, { padding: 24 });
      return;
    }
    // Prefer the neighborhood's real boundary; otherwise fit the matching data.
    const area = fitKey.split("|")[0];
    const bounds = (area ? areaBounds(area) : null) ?? cellBounds(cells, resolution);
    if (bounds) map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: first ? 0 : 800 });
  }, [ready, fitKey, cells, resolution]);

  return (
    <div
      ref={containerRef}
      // MapLibre's stylesheet forces `position: relative` on the container, so size it explicitly.
      className="h-full w-full"
      role="region"
      aria-label="Map of Seattle service requests. Use arrow keys to pan and plus or minus to zoom. Requests can also be selected from the recent requests list."
    />
  );
}
