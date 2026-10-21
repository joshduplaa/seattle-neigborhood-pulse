"use client";

import { useState } from "react";

import { RankedBars } from "@/components/charts/RankedBars";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";
import { rankBuckets, type RankedBucket } from "@/lib/aggregate";
import type { DashboardFilters } from "@/lib/filters";
import { formatAreaName, formatCategory, formatCount, formatDecimal, formatDistrict, formatStatus } from "@/lib/format";
import { areaRates, LOW_POPULATION_THRESHOLD, type AreaMeasure, type AreaRate } from "@/lib/population";
import { describeChange } from "@/lib/change";
import { formatShortDate } from "@/lib/dates";
import type { DashboardData, FacetBucket } from "@/lib/types";

interface BreakdownProps {
  data: DashboardData | null;
  loading: boolean;
  onChange: (update: Partial<DashboardFilters>) => void;
}

function Loading({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-1.5 h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

const facetNote = "Click a bar to filter; counts include all other active filters.";

export function CategoryPanel({ data, loading, onChange }: BreakdownProps) {
  const selected = data?.filters.category ?? null;
  return (
    <Panel id="categories" title="What residents are reporting" description={`Requests by type. ${facetNote}`}>
      {!data ? (
        <Loading rows={8} />
      ) : data.facets.category.length === 0 ? (
        <EmptyState title="No requests match these filters" />
      ) : (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <RankedBars
            label="Requests by type"
            noun="request type"
            items={rankBuckets(data.facets.category, { limit: 10, selected, label: formatCategory })}
            selected={selected}
            onSelect={(category) => onChange({ category })}
          />
        </div>
      )}
    </Panel>
  );
}

export function StatusPanel({ data, loading, onChange }: BreakdownProps) {
  const selected = data?.filters.status ?? null;
  return (
    <Panel
      id="status"
      title="Current status"
      description="Status as of the latest City update, not when a request was resolved."
    >
      {!data ? (
        <Loading rows={5} />
      ) : data.facets.status.length === 0 ? (
        <EmptyState title="No requests match these filters" />
      ) : (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <RankedBars
            label="Requests by current status"
            noun="status"
            items={rankBuckets(data.facets.status, { limit: 10, selected, label: formatStatus })}
            selected={selected}
            onSelect={(status) => onChange({ status })}
          />
        </div>
      )}
    </Panel>
  );
}

type AreaUnit = "area" | "district";

const AREA_LIMIT = 12;

interface AreaPanelProps extends BreakdownProps {
  /** Shared with the map shading. */
  measure: AreaMeasure;
  onMeasureChange: (measure: AreaMeasure) => void;
}

function Toggle<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-line-strong p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`h-7 rounded px-2.5 text-[13px] transition-colors ${
            value === o.id ? "bg-sound-strong font-medium text-white" : "text-ink-muted hover:bg-sound-soft hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Attach the change versus the previous period to each named bucket. */
function withChange(items: RankedBucket[], previous: FacetBucket[] | null): RankedBucket[] {
  if (!previous) return items;
  const prev = new Map(previous.map((b) => [b.value, b.count]));
  return items.map((i) => (i.other || i.value === null ? i : { ...i, change: describeChange(i.count, prev.get(i.value) ?? 0) }));
}

function rateItem(r: AreaRate): RankedBucket {
  return {
    key: r.area,
    label: formatAreaName(r.area),
    value: r.area,
    count: r.count,
    share: 0,
    other: false,
    display: { value: formatDecimal(r.rate), detail: `${formatCount(r.count)} req.`, bar: r.rate },
  };
}

export function AreaPanel({ data, loading, onChange, measure, onMeasureChange }: AreaPanelProps) {
  const [unit, setUnit] = useState<AreaUnit>("area");
  const [expanded, setExpanded] = useState(false);

  const buckets = data ? data.facets[unit] : [];
  const named = buckets.filter((b) => b.value !== null);
  const blank = buckets.find((b) => b.value === null)?.count ?? 0;
  const selected = data ? (unit === "area" ? data.filters.area : data.filters.district) : null;
  const label = unit === "area" ? formatAreaName : formatDistrict;
  // Population is published per Community Reporting Area only.
  const perCapita = unit === "area" && measure === "rate";

  const rates = perCapita && data ? areaRates(data.facets.area) : [];
  const previous = data?.comparison ? data.comparison[unit] : null;
  const comparable = rates.filter((r) => !r.lowPopulation);
  const lowPopulation = rates.filter((r) => r.lowPopulation);

  const listLength = perCapita ? comparable.length : named.length;
  const limit = unit === "district" || expanded ? listLength : AREA_LIMIT;

  const description = perCapita
    ? `Requests per 1,000 residents by Community Reporting Area, using 2020 Census population.`
    : unit === "area"
      ? "Requests by Community Reporting Area, the City's neighborhood-scale planning unit."
      : "Requests by Seattle City Council district (1–7).";

  return (
    <Panel
      id="neighborhoods"
      title="Compare areas"
      description={description}
      actions={
        <div className="flex flex-wrap gap-2">
          <Toggle
            label="Geographic unit"
            value={unit}
            onChange={(u) => {
              setUnit(u);
              setExpanded(false);
            }}
            options={[
              { id: "area", label: "Neighborhoods" },
              { id: "district", label: "Council districts" },
            ]}
          />
          {unit === "area" ? (
            <Toggle
              label="Measure"
              value={measure}
              onChange={onMeasureChange}
              options={[
                { id: "count", label: "Requests" },
                { id: "rate", label: "Per 1,000 residents" },
              ]}
            />
          ) : null}
        </div>
      }
    >
      {!data ? (
        <Loading rows={8} />
      ) : named.length === 0 ? (
        <EmptyState title="No requests with a recorded area match these filters" />
      ) : (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          {perCapita ? (
            <RankedBars
              label="Requests per 1,000 residents by neighborhood"
              noun="neighborhood"
              items={withChange(comparable.slice(0, limit).map(rateItem), previous)}
              selected={selected}
              onSelect={(value) => onChange({ area: value })}
            />
          ) : (
            <RankedBars
              label={unit === "area" ? "Requests by neighborhood" : "Requests by council district"}
              noun={unit === "area" ? "neighborhood" : "district"}
              items={withChange(rankBuckets(named, { limit, selected, label }), previous)}
              selected={selected}
              onSelect={(value) => onChange(unit === "area" ? { area: value } : { district: value })}
            />
          )}
          {unit === "area" && listLength > AREA_LIMIT ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-2 h-8 rounded-md px-2 text-[13px] font-medium text-sound-strong hover:bg-sound-soft"
            >
              {expanded ? "Show top 12" : `Show all ${listLength} neighborhoods`}
            </button>
          ) : null}

          {perCapita && lowPopulation.length > 0 ? (
            <div className="mt-3 rounded-md bg-surface-muted px-3 py-2">
              <p className="text-xs font-medium text-ink">
                Not ranked: fewer than {formatCount(LOW_POPULATION_THRESHOLD)} residents
              </p>
              <p className="text-xs leading-5 text-ink-subtle">
                With few residents, a handful of requests swings the rate widely, and requests from workers and visitors weigh more, so these rates aren&apos;t comparable.
              </p>
              <ul className="mt-1 grid grid-cols-1 gap-x-4 text-xs leading-5 text-ink-muted sm:grid-cols-2">
                {lowPopulation.map((r) => (
                  <li key={r.area} className="flex justify-between gap-2 tabular-nums">
                    <button type="button" onClick={() => onChange({ area: selected === r.area ? null : r.area })} className="text-left hover:underline">
                      {formatAreaName(r.area)}
                    </button>
                    <span>
                      {formatDecimal(r.rate)} · {formatCount(r.population)} residents
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-subtle">
            {perCapita
              ? "Rates divide requests in the selected period by 2020 Census residents. Requests come from residents, workers and visitors alike, so busy commercial areas still rank higher."
              : "Raw counts — not adjusted for population, area or foot traffic, so dense and commercial neighborhoods rank higher."}
            {blank > 0 ? ` ${formatCount(blank)} matching requests have no ${unit === "area" ? "area" : "district"} recorded and are excluded.` : ""}
            {unit === "district" ? " Per-resident rates are available for neighborhoods only." : ""}
            {data.comparison
              ? ` ▲▼ compare with ${formatShortDate(data.comparison.start)} – ${formatShortDate(data.comparison.end)}, the same number of days just before.`
              : ""}
          </p>
        </div>
      )}
    </Panel>
  );
}
