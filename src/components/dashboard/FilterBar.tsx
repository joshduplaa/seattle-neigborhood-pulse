"use client";

import { useId } from "react";

import { DATASET_START_DATE } from "@/lib/socrata/config";
import { DATE_PRESETS, matchPreset, presetRange, type DashboardFilters } from "@/lib/filters";
import { NeighborhoodSearch } from "@/components/dashboard/NeighborhoodSearch";
import { formatCount, formatDistrict } from "@/lib/format";
import type { FacetBucket } from "@/lib/types";

interface FilterBarProps {
  filters: DashboardFilters;
  today: string;
  facets: Record<"category" | "status" | "area" | "district", FacetBucket[]> | null;
  onChange: (update: Partial<DashboardFilters>) => void;
  onClear: () => void;
  isDefault: boolean;
  busy: boolean;
}

interface Option {
  value: string;
  label: string;
}

/**
 * Build select options from facet counts. Counts reflect every *other* active
 * filter, so they preview how many requests each choice would show. The
 * current selection is kept even if it has no matches.
 */
function facetOptions(buckets: FacetBucket[] | undefined, selected: string | null, label: (v: string) => string): Option[] {
  const options = (buckets ?? [])
    .filter((b): b is FacetBucket & { value: string } => b.value !== null)
    .map((b) => ({ value: b.value, label: `${label(b.value)} (${formatCount(b.count)})`, sort: label(b.value) }));
  if (selected !== null && !options.some((o) => o.value === selected)) {
    options.push({ value: selected, label: `${label(selected)} (0)`, sort: label(selected) });
  }
  return options
    .sort((a, b) => a.sort.localeCompare(b.sort, "en", { numeric: true }))
    .map(({ value, label: l }) => ({ value, label: l }));
}

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink shadow-[inset_0_1px_0_rgb(19_34_44/0.02)] hover:border-ink-subtle disabled:cursor-not-allowed disabled:opacity-60";

function SelectField(props: {
  label: string;
  value: string | null;
  allLabel: string;
  options: Option[];
  onChange: (value: string | null) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-ink-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={selectClass}
        value={props.value ?? ""}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value === "" ? null : e.target.value)}
      >
        <option value="">{props.allLabel}</option>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterBar({ filters, today, facets, onChange, onClear, isDefault, busy }: FilterBarProps) {
  const activePreset = matchPreset(filters, today);
  const startId = useId();
  const endId = useId();
  const noOptions = facets === null;

  return (
    <form
      aria-label="Filter service requests"
      onSubmit={(e) => e.preventDefault()}
      className="rounded-xl border border-line bg-surface px-4 py-3 shadow-[0_1px_2px_rgb(19_34_44/0.04)] sm:px-5"
    >
      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[auto_1fr] 2xl:items-end 2xl:gap-5">
        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="mb-1 text-xs font-medium text-ink-muted">Reported between</legend>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Date range presets" className="inline-flex rounded-md border border-line-strong p-0.5">
              {DATE_PRESETS.map((p) => {
                const active = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChange(presetRange(p.id, today))}
                    className={`h-8 rounded px-2.5 text-sm transition-colors ${
                      active ? "bg-sound-strong font-medium text-white" : "text-ink-muted hover:bg-sound-soft hover:text-ink"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor={startId} className="sr-only">
                Start date
              </label>
              <input
                id={startId}
                type="date"
                className={`${selectClass} w-[9.5rem]`}
                value={filters.start}
                min={DATASET_START_DATE}
                max={filters.end}
                onChange={(e) => e.target.value && onChange({ start: e.target.value })}
              />
              <span className="text-sm text-ink-subtle" aria-hidden>
                –
              </span>
              <label htmlFor={endId} className="sr-only">
                End date
              </label>
              <input
                id={endId}
                type="date"
                className={`${selectClass} w-[9.5rem]`}
                value={filters.end}
                min={filters.start}
                max={today}
                onChange={(e) => e.target.value && onChange({ end: e.target.value })}
              />
            </div>
          </div>
        </fieldset>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_auto] lg:items-end">
          <SelectField
            label="Request type"
            value={filters.category}
            allLabel="All request types"
            options={facetOptions(facets?.category, filters.category, (v) => v)}
            onChange={(category) => onChange({ category })}
            disabled={noOptions}
          />
          <SelectField
            label="Current status"
            value={filters.status}
            allLabel="Any status"
            options={facetOptions(facets?.status, filters.status, (v) => v)}
            onChange={(status) => onChange({ status })}
            disabled={noOptions}
          />
          <NeighborhoodSearch
            value={filters.area}
            counts={facets?.area ?? null}
            onChange={(area) => onChange({ area })}
            disabled={noOptions}
          />
          <SelectField
            label="Council district"
            value={filters.district}
            allLabel="All districts"
            options={facetOptions(facets?.district, filters.district, formatDistrict)}
            onChange={(district) => onChange({ district })}
            disabled={noOptions}
          />
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-1">
            <button
              type="button"
              onClick={onClear}
              disabled={isDefault}
              className="h-9 rounded-md border border-line-strong px-3 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-ink-subtle disabled:opacity-60"
            >
              Clear filters
            </button>
            <span aria-live="polite" className="text-xs text-ink-subtle">
              {busy ? "Updating…" : ""}
            </span>
          </div>
        </div>
      </div>
    </form>
  );
}
