"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { MapFocus } from "@/components/map/MapView";
import { Panel } from "@/components/ui/Panel";
import { formatCount, formatPercent } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

// MapLibre touches `window` on import, so it only loads in the browser.
const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });

interface MapPanelProps {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  focus: MapFocus | null;
  onSelect: (id: string) => void;
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

export function MapPanel({ data, loading, error, selectedId, focus, onSelect }: MapPanelProps) {
  const [showDensity, setShowDensity] = useState(true);
  const [showRequests, setShowRequests] = useState(true);
  const [mapState, setMapState] = useState<{ status: "loading" | "ready" | "error"; message?: string }>({
    status: "loading",
  });

  const cells = data?.grid.cells ?? [];
  const requests = data?.sample.requests ?? [];
  const mapped = requests.filter((r) => r.coordinates).length;
  const matching = data?.totals.matching ?? 0;
  const geolocated = data?.totals.geolocated ?? 0;
  const fitKey = data ? `${data.filters.area ?? ""}|${data.filters.district ?? ""}` : "|";

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
          showDensity={showDensity}
          showRequests={showRequests}
          onSelect={onSelect}
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

        {/* Legend + layer toggles */}
        <fieldset className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg border border-line bg-surface/95 px-3 py-2.5 text-xs text-ink-muted shadow-sm backdrop-blur-sm sm:max-w-xs">
          <legend className="sr-only">Map layers</legend>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 accent-sound-strong"
              checked={showDensity}
              onChange={(e) => setShowDensity(e.target.checked)}
            />
            <span>
              <span className="font-medium text-ink">Density</span> — all {formatCount(geolocated)} mapped requests
              <span
                aria-hidden
                className="mt-1 block h-1.5 w-28 rounded-full"
                style={{ background: "linear-gradient(90deg, #d6eef3, #5bb2c8, #1c8eab, #063f57)" }}
              />
              <span className="mt-0.5 flex w-28 justify-between text-[10px] text-ink-subtle" aria-hidden>
                <span>fewer</span>
                <span>more</span>
              </span>
            </span>
          </label>
          <label className="mt-2 flex cursor-pointer items-start gap-2">
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
        </fieldset>
      </div>
    </Panel>
  );
}
