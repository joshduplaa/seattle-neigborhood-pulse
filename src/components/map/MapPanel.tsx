"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { buildShading, EXCLUDED_COLOR, legendClasses } from "@/components/map/choropleth";
import type { MapBackground, MapFocus } from "@/components/map/MapView";
import { Panel } from "@/components/ui/Panel";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatCount, formatPercent } from "@/lib/format";
import { LOW_POPULATION_THRESHOLD, type AreaMeasure } from "@/lib/population";
import type { DashboardData } from "@/lib/types";

// MapLibre touches `window` on import, so it only loads in the browser.
const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });

interface MapPanelProps {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  focus: MapFocus | null;
  /** Shared with the area comparison: shade by count or per 1,000 residents. */
  measure: AreaMeasure;
  onSelect: (id: string) => void;
  onSelectArea: (area: string) => void;
}

function Overlay({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "alert" }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div
        role={tone === "alert" ? "alert" : "status"}
        className={`pointer-events-auto max-w-sm rounded-lg border px-4 py-3 text-center text-sm shadow-sm ${
          tone === "alert" ? "border-alert/30 bg-alert-soft text-alert" : "border-line bg-surface/95 text-ink-muted"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

const BACKGROUNDS: { id: MapBackground; label: string }[] = [
  { id: "areas", label: "Neighborhoods" },
  { id: "density", label: "Density" },
  { id: "none", label: "Off" },
];

export function MapPanel({ data, loading, error, selectedId, focus, measure, onSelect, onSelectArea }: MapPanelProps) {
  const [background, setBackground] = useState<MapBackground>("areas");
  const [showRequests, setShowRequests] = useState(true);
  // Layers start collapsed on phones (where they'd cover most of the map) and
  // open on larger screens; a tap overrides the default for this visit.
  const wide = useMediaQuery("(min-width: 640px)", true);
  const [layersChoice, setLayersChoice] = useState<boolean | null>(null);
  const layersOpen = layersChoice ?? wide;
  const [mapState, setMapState] = useState<{ status: "loading" | "ready" | "error"; message?: string }>({
    status: "loading",
  });

  const cells = data?.grid.cells ?? [];
  const requests = data?.sample.requests ?? [];
  const mapped = requests.filter((r) => r.coordinates).length;
  const matching = data?.totals.matching ?? 0;
  const geolocated = data?.totals.geolocated ?? 0;
  const fitKey = data ? `${data.filters.area ?? ""}|${data.filters.district ?? ""}` : "|";
  const areaFacet = data?.facets.area;
  const shading = useMemo(() => buildShading(areaFacet ?? [], measure), [areaFacet, measure]);

  const description = data ? (
    <>
      {formatCount(geolocated)} of {formatCount(matching)} matching requests ({formatPercent(matching ? geolocated / matching : 0)}) have
      usable coordinates.
    </>
  ) : (
    "Where requests in the selected period were reported."
  );

  return (
    <Panel id="map" title="Where requests are reported" description={description} bodyClassName="p-0">
      <div className="relative h-[420px] overflow-hidden sm:h-[520px] lg:h-[600px]">
        <MapView
          cells={cells}
          resolution={data?.grid.resolution ?? 0.005}
          requests={requests}
          selectedId={selectedId}
          focus={focus}
          fitKey={fitKey}
          background={background}
          shading={shading}
          selectedArea={data?.filters.area ?? null}
          showRequests={showRequests}
          onSelect={onSelect}
          onSelectArea={onSelectArea}
          onStatusChange={(status, message) => setMapState({ status, message })}
        />

        {mapState.status === "error" ? (
          <Overlay tone="alert">{mapState.message}</Overlay>
        ) : error && !data ? (
          <Overlay tone="alert">Map data is unavailable: {error}</Overlay>
        ) : mapState.status === "loading" || (loading && !data) ? (
          <Overlay>
            <span className="inline-flex items-center gap-2">
              <span className="size-3 animate-spin rounded-full border-2 border-sound border-t-transparent" aria-hidden />
              Loading map…
            </span>
          </Overlay>
        ) : data && geolocated === 0 && !loading ? (
          <Overlay>No requests with map locations match these filters.</Overlay>
        ) : null}

        {loading && data && mapState.status === "ready" ? (
          <div className="absolute left-3 top-3 z-10 rounded-md border border-line bg-surface/95 px-2.5 py-1 text-xs text-ink-muted shadow-sm">
            Updating map…
          </div>
        ) : null}

        {/* Legend + layer controls: collapsible so it doesn't cover the map on phones. */}
        <div className="absolute bottom-3 left-3 z-10 max-h-[calc(100%-1.5rem)] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-line bg-surface/95 text-xs text-ink-muted shadow-sm backdrop-blur-sm sm:max-w-xs">
          <button
            type="button"
            aria-expanded={layersOpen}
            aria-controls="map-layers-panel"
            onClick={() => setLayersChoice(!layersOpen)}
            className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-surface-muted"
          >
            <span className="font-medium text-ink">
              Map layers
              {layersOpen ? null : (
                <span className="font-normal text-ink-subtle"> · {BACKGROUNDS.find((b) => b.id === background)?.label}</span>
              )}
            </span>
            <svg aria-hidden viewBox="0 0 16 16" className={`size-3.5 shrink-0 transition-transform ${layersOpen ? "" : "rotate-180"}`}>
              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">{layersOpen ? "Hide" : "Show"} map layers and legend</span>
          </button>

          {layersOpen ? (
            <div id="map-layers-panel" className="border-t border-line px-3 pb-2.5 pt-2">
            <fieldset>
              <legend className="mb-1 font-medium text-ink">Background</legend>
              <div className="inline-flex rounded-md border border-line-strong p-0.5">
                {BACKGROUNDS.map((b) => (
                  <label
                    key={b.id}
                    className={`cursor-pointer rounded px-2 py-0.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-sound-strong ${
                      background === b.id ? "bg-sound-strong font-medium text-white" : "hover:bg-sound-soft"
                    }`}
                  >
                    <input
                      type="radio"
                      name="map-background"
                      value={b.id}
                      checked={background === b.id}
                      onChange={() => setBackground(b.id)}
                      className="sr-only"
                    />
                    {b.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {background === "areas" ? (
              <div className="mt-2">
                <p>
                  {measure === "rate" ? "Requests per 1,000 residents" : "Requests"} by neighborhood
                  {measure === "rate" ? " (2020 Census population)" : ""}
                </p>
                <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums" aria-label="Neighborhood shading classes">
                  {legendClasses(shading).map((c) => (
                    <li key={c.label} className="flex items-center gap-1.5">
                      <span aria-hidden className="size-2.5 rounded-sm" style={{ background: c.color }} />
                      {c.label}
                    </li>
                  ))}
                  {measure === "rate" ? (
                    <li className="col-span-2 flex items-center gap-1.5">
                      <span aria-hidden className="size-2.5 rounded-sm" style={{ background: EXCLUDED_COLOR }} />
                      Under {formatCount(LOW_POPULATION_THRESHOLD)} residents (not compared)
                    </li>
                  ) : null}
                </ul>
                <p className="mt-1 hidden text-[11px] text-ink-subtle sm:block">
                  Hover for details; click to filter. Shading changes with “Compare areas”.
                </p>
              </div>
            ) : background === "density" ? (
              <div className="mt-2">
                <p>All {formatCount(geolocated)} mapped requests</p>
                <span
                  aria-hidden
                  className="mt-1 block h-1.5 w-28 rounded-full"
                  style={{ background: "linear-gradient(90deg, #d6eef3, #5bb2c8, #1c8eab, #063f57)" }}
                />
                <span className="mt-0.5 flex w-28 justify-between text-[10px] text-ink-subtle" aria-hidden>
                  <span>fewer</span>
                  <span>more</span>
                </span>
              </div>
            ) : null}

            <label className="mt-2 flex cursor-pointer items-start gap-2 border-t border-line pt-2">
              <input
                type="checkbox"
                className="mt-0.5 accent-sound-strong"
                checked={showRequests}
                onChange={(e) => setShowRequests(e.target.checked)}
              />
              <span>
                <span className="font-medium text-ink">Individual requests</span> — newest {formatCount(mapped)}
                <span className="mt-1 flex items-center gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden className="size-2.5 rounded-full bg-sound ring-2 ring-surface" /> request
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden className="size-3 rounded-full border-2 border-sound-deep bg-surface" /> cluster
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden className="size-2.5 rounded-full bg-ferry ring-2 ring-surface" /> selected
                  </span>
                </span>
              </span>
            </label>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
