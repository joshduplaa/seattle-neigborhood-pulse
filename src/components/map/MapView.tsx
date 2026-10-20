"use client";

import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import {
  BASEMAP_STYLE_URL,
  cellBounds,
  gridToGeoJSON,
  requestsToGeoJSON,
  SEATTLE_BOUNDS,
  SEATTLE_MAX_BOUNDS,
} from "@/components/map/mapData";
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
  showDensity: boolean;
  showRequests: boolean;
  onSelect: (id: string) => void;
  onStatusChange: (status: "ready" | "error", message?: string) => void;
}

const COLORS = {
  sound: "#00789a",
  soundDeep: "#063f57",
  ferry: "#d9622b",
  surface: "#ffffff",
};

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function addLayers(map: maplibregl.Map) {
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

    map.on("click", "request-clusters", onClusterClick);
    map.on("click", "request-points", onPointClick);
    map.on("click", "request-selected", onPointClick);
    for (const layer of ["request-clusters", "request-points", "request-selected"]) {
      map.on("mouseenter", layer, pointer);
      map.on("mouseleave", layer, unpointer);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  const { cells, requests, selectedId, focus, fitKey, resolution, showDensity, showRequests } = props;

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
    setVisibility(map, ["density-heat"], showDensity);
    setVisibility(map, ["request-clusters", "request-cluster-count", "request-points", "request-selected"], showRequests);
  }, [ready, showDensity, showRequests]);

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
    const bounds = cellBounds(cells, resolution);
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
