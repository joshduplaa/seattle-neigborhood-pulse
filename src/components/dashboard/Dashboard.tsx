"use client";

import { useCallback, useRef, useState } from "react";

import { AreaPanel, CategoryPanel, StatusPanel } from "@/components/dashboard/BreakdownPanels";
import { DataProvenance, FreshnessLine } from "@/components/dashboard/DataProvenance";
import { EquityPanel } from "@/components/dashboard/EquityPanel";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { RecentRequests } from "@/components/dashboard/RecentRequests";
import { ResolutionPanel } from "@/components/dashboard/ResolutionPanel";
import { RequestDetail } from "@/components/dashboard/RequestDetail";
import { SummaryMetrics } from "@/components/dashboard/SummaryMetrics";
import { TrendPanel } from "@/components/dashboard/TrendPanel";
import { MapPanel } from "@/components/map/MapPanel";
import type { MapFocus } from "@/components/map/MapView";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useFilterState } from "@/hooks/useFilterState";
import { activeFacetCount } from "@/lib/filters";
import type { AreaMeasure } from "@/lib/population";

export function Dashboard() {
  const { filters, issues, setFilters, clearFilters, isDefault, today } = useFilterState();
  const { data, loading, error, retry } = useDashboardData(filters);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  // Shared by the map shading and the area comparison.
  const [measure, setMeasure] = useState<AreaMeasure>("count");
  const detailRef = useRef<HTMLElement>(null);

  // A selection that isn't in the current results simply shows as nothing selected.
  const selected = data?.sample.requests.find((r) => r.id === selectedId) ?? null;
  const activeId = selected?.id ?? null;

  const chooseFromList = useCallback((id: string) => {
    setSelectedId(id);
    setFocus((f) => ({ id, nonce: (f?.nonce ?? 0) + 1 }));
    detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const firstLoad = !data;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[28px] font-semibold leading-tight text-ink sm:text-4xl">What Seattle is reporting</h1>
        <p className="max-w-3xl text-[15px] leading-6 text-ink-muted">
          Service requests residents file with the City — encampments, abandoned vehicles, illegal dumping, graffiti, potholes and more —
          mapped and compared across neighborhoods.
        </p>
        <FreshnessLine data={data} unavailable={Boolean(error) && !data} />
      </div>

      <div className="z-20 -mx-4 bg-canvas/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:sticky lg:top-0">
        <FilterBar
          filters={filters}
          today={today}
          facets={data?.facets ?? null}
          onChange={setFilters}
          onClear={clearFilters}
          isDefault={isDefault}
          busy={loading && !firstLoad}
        />
      </div>

      {issues.length > 0 ? (
        <p role="status" className="rounded-lg border border-line bg-surface px-4 py-2 text-[13px] text-ink-muted">
          {issues.join(" ")}
        </p>
      ) : null}

      {error && data ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-alert/30 bg-alert-soft px-4 py-3 text-sm text-alert">
          <span>
            <strong className="font-semibold">Couldn&apos;t load data.</strong> {error}
            {" Showing the last results that loaded successfully."}
          </span>
          <button type="button" onClick={retry} className="h-8 rounded-md border border-alert/40 bg-surface px-3 font-medium hover:bg-alert-soft">
            Try again
          </button>
        </div>
      ) : null}

      {error && !data ? (
        // Nothing has loaded yet: show a clear failure instead of perpetual skeletons.
        <section role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-16 text-center">
          <h2 className="font-display text-xl font-semibold text-ink">The dashboard couldn&apos;t load City data</h2>
          <p className="max-w-md text-sm text-ink-muted">{error}</p>
          <button type="button" onClick={retry} className="h-9 rounded-md bg-sound-strong px-4 text-sm font-medium text-white hover:bg-sound-deep">
            Try again
          </button>
        </section>
      ) : (
        <>
        <SummaryMetrics data={data} loading={loading} />

        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <MapPanel
            data={data}
            loading={loading}
            error={error}
            selectedId={activeId}
            focus={focus}
            measure={measure}
            onSelect={setSelectedId}
            onSelectArea={(area) => setFilters({ area: filters.area === area ? null : area })}
          />
          <div className="flex min-w-0 flex-col gap-4 sm:gap-5 lg:max-h-[calc(600px+68px)]">
            <RequestDetail ref={detailRef} request={selected} onClose={() => setSelectedId(null)} />
            <div className="min-h-0 lg:flex-1 lg:overflow-y-auto lg:rounded-xl">
              <RecentRequests
                data={data}
                loading={loading}
                selectedId={activeId}
                onChoose={chooseFromList}
                onClearFilters={clearFilters}
                canClear={!isDefault}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
          <TrendPanel data={data} loading={loading} />
          <StatusPanel data={data} loading={loading} onChange={setFilters} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
          <CategoryPanel data={data} loading={loading} onChange={setFilters} />
          <AreaPanel data={data} loading={loading} onChange={setFilters} measure={measure} onMeasureChange={setMeasure} />
        </div>
        </>
      )}

      {data ? <ResolutionPanel filters={filters} /> : null}

      {data ? <EquityPanel filters={filters} onSelectArea={(area) => setFilters({ area })} /> : null}

      <DataProvenance data={data} />

      <p className="sr-only" aria-live="polite">
        {loading ? "Loading results." : data ? `${data.totals.matching} requests match ${activeFacetCount(filters)} active filters.` : ""}
      </p>
    </div>
  );
}
