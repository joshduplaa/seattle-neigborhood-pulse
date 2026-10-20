"use client";

import { useState } from "react";

import { RankedBars } from "@/components/charts/RankedBars";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";
import { rankBuckets } from "@/lib/aggregate";
import type { DashboardFilters } from "@/lib/filters";
import { formatAreaName, formatCategory, formatCount, formatDistrict, formatStatus } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

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

export function AreaPanel({ data, loading, onChange }: BreakdownProps) {
  const [unit, setUnit] = useState<AreaUnit>("area");
  const [expanded, setExpanded] = useState(false);

  const buckets = data ? data.facets[unit] : [];
  const named = buckets.filter((b) => b.value !== null);
  const blank = buckets.find((b) => b.value === null)?.count ?? 0;
  const selected = data ? (unit === "area" ? data.filters.area : data.filters.district) : null;
  const limit = unit === "district" || expanded ? named.length : AREA_LIMIT;
  const label = unit === "area" ? formatAreaName : formatDistrict;

  const tabs: { id: AreaUnit; label: string }[] = [
    { id: "area", label: "Neighborhoods" },
    { id: "district", label: "Council districts" },
  ];

  return (
    <Panel
      id="neighborhoods"
      title="Compare areas"
      description={
        unit === "area"
          ? "Requests by Community Reporting Area, the City's neighborhood-scale planning unit."
          : "Requests by Seattle City Council district (1–7)."
      }
      actions={
        <div role="group" aria-label="Geographic unit" className="inline-flex rounded-md border border-line-strong p-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={unit === t.id}
              onClick={() => {
                setUnit(t.id);
                setExpanded(false);
              }}
              className={`h-7 rounded px-2.5 text-[13px] transition-colors ${
                unit === t.id ? "bg-sound-strong font-medium text-white" : "text-ink-muted hover:bg-sound-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {!data ? (
        <Loading rows={8} />
      ) : named.length === 0 ? (
        <EmptyState title="No requests with a recorded area match these filters" />
      ) : (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <RankedBars
            label={unit === "area" ? "Requests by neighborhood" : "Requests by council district"}
            noun={unit === "area" ? "neighborhood" : "district"}
            items={rankBuckets(named, { limit, selected, label })}
            selected={selected}
            onSelect={(value) => onChange(unit === "area" ? { area: value } : { district: value })}
          />
          {unit === "area" && named.length > AREA_LIMIT ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-2 h-8 rounded-md px-2 text-[13px] font-medium text-sound-strong hover:bg-sound-soft"
            >
              {expanded ? "Show top 12" : `Show all ${named.length} neighborhoods`}
            </button>
          ) : null}
          <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-subtle">
            Raw counts — not adjusted for population, area or foot traffic, so dense and commercial neighborhoods rank higher.
            {blank > 0 ? ` ${formatCount(blank)} matching requests have no ${unit === "area" ? "area" : "district"} recorded and are excluded.` : ""}
          </p>
        </div>
      )}
    </Panel>
  );
}
