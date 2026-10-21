"use client";

import { useState } from "react";

import { equityHeadline, equityWindowText, formatPoints, isClear } from "@/components/dashboard/equityText";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";
import { useEquityData } from "@/hooks/useDashboardData";
import type { DashboardFilters } from "@/lib/filters";
import { MIN_AREA_REQUESTS, type AreaResult, type Comparison, type EquityHorizon } from "@/lib/equity";
import { formatAreaName, formatCount, formatDecimal, formatPercent } from "@/lib/format";
import { TRACKED_TYPES } from "@/lib/socrata/config";

const INDEX_URL = "https://data.seattle.gov/d/x5s4-2aie";
const AREAS_SHOWN = 5;

/** Dot-and-whisker for one difference on a shared, zero-centred scale. */
function DiffMark({ c, scale }: { c: Comparison; scale: number }) {
  const w = 132;
  const mid = w / 2;
  const x = (v: number) => mid + (v / scale) * (mid - 6);
  const clear = isClear(c);
  return (
    <svg aria-hidden width={w} height={16} viewBox={`0 0 ${w} 16`} className="block">
      <line x1={mid} x2={mid} y1={1} y2={15} stroke="var(--color-line-strong)" strokeWidth={1} />
      <line x1={x(c.difference - c.margin)} x2={x(c.difference + c.margin)} y1={8} y2={8} stroke="var(--color-ink-subtle)" strokeWidth={2} strokeLinecap="round" />
      <circle cx={x(c.difference)} cy={8} r={4.5} fill={clear ? "var(--color-sound)" : "var(--color-surface)"} stroke="var(--color-sound)" strokeWidth={2} />
    </svg>
  );
}

function AreaList({ title, areas, horizon, onSelect }: { title: string; areas: AreaResult[]; horizon: EquityHorizon; onSelect: (area: string) => void }) {
  const key = horizon === 7 ? "h7" : "h30";
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-medium text-ink-muted">{title}</h3>
      {areas.length === 0 ? (
        <p className="mt-1 text-xs text-ink-subtle">None outside their margin of error.</p>
      ) : (
        <ul className="mt-1">
          {areas.map((a) => (
            <li key={a.area}>
              <button
                type="button"
                onClick={() => onSelect(a.area)}
                className="flex w-full items-baseline justify-between gap-3 rounded px-1.5 py-1 text-left text-[13px] hover:bg-surface-muted"
              >
                <span className="min-w-0 text-ink">{formatAreaName(a.area)}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">
                  {formatPoints(a[key].difference)}
                  <span className="text-ink-subtle"> ±{formatDecimal(a[key].margin * 100)} pts</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EquityPanel({ filters, onSelectArea }: { filters: DashboardFilters; onSelectArea: (area: string) => void }) {
  const { data, loading, error, retry } = useEquityData(filters);
  const [horizon, setHorizon] = useState<EquityHorizon>(7);
  const key = horizon === 7 ? "h7" : "h30";
  const tracked = TRACKED_TYPES.find((t) => t.request === filters.category);

  const quintiles = data?.quintiles ?? [];
  const scale = Math.max(0.05, ...quintiles.map((q) => Math.abs(q[key].difference) + q[key].margin));
  const reliable = (data?.areas ?? []).filter((a) => a.reliable);
  const clearAreas = reliable.filter((a) => isClear(a[key])).sort((a, b) => a[key].difference - b[key].difference);
  const slower = clearAreas.filter((a) => a[key].difference < 0).slice(0, AREAS_SHOWN);
  const faster = clearAreas.filter((a) => a[key].difference > 0).reverse().slice(0, AREAS_SHOWN);

  return (
    <Panel
      id="equity"
      title="Is the City responding equally?"
      description={
        <>
          How quickly tracked requests get a &ldquo;Closed&rdquo; update across census tracts, grouped by the City&apos;s{" "}
          <a href={INDEX_URL} target="_blank" rel="noreferrer" className="font-medium text-sound-strong underline-offset-2 hover:underline">
            Racial and Social Equity Index
          </a>{" "}
          and adjusted for each area&apos;s mix of request types.
        </>
      }
      actions={
        <div role="group" aria-label="Time to close" className="inline-flex rounded-md border border-line-strong p-0.5">
          {([7, 30] as const).map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={horizon === h}
              onClick={() => setHorizon(h)}
              className={`h-7 rounded px-2.5 text-[13px] transition-colors ${
                horizon === h ? "bg-sound-strong font-medium text-white" : "text-ink-muted hover:bg-sound-soft hover:text-ink"
              }`}
            >
              Within {h} days
            </button>
          ))}
        </div>
      }
    >
      {error && !data ? (
        <EmptyState title="The equity analysis couldn’t load">
          {error}{" "}
          <button type="button" onClick={retry} className="font-medium text-sound-strong underline underline-offset-2">
            Try again
          </button>
        </EmptyState>
      ) : !data ? (
        <div aria-busy className="flex flex-col gap-2">
          <p className="text-xs text-ink-subtle">Placing tracked requests in census tracts…</p>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : !data.window || data.requests === 0 ? (
        <EmptyState title="Not enough tracked requests to compare">{equityWindowText(data.window)}</EmptyState>
      ) : (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <p className="text-xs leading-5 text-ink-subtle">
            {equityWindowText(data.window)} {formatCount(data.requests)} requests across Seattle&apos;s 179 census tracts.
          </p>
          <p className="mt-2 text-[15px] leading-6 text-ink">{equityHeadline(quintiles, horizon)}</p>

          <div className="relative -mx-4 mt-3 overflow-x-auto sm:-mx-5" tabIndex={0} role="region" aria-label="Equity comparison table (scrolls horizontally)">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <caption className="sr-only">
                Share of requests closed within {horizon} days by equity priority quintile, compared with the share expected from each group&apos;s
                mix of request types, with 95% margins
              </caption>
              <thead>
                <tr className="border-y border-line text-left text-xs text-ink-subtle">
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">Equity priority (census tracts)</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Requests</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Closed within {horizon} days</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Expected for its mix</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Difference</th>
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">
                    <span className="sr-only">Difference chart</span>
                    <span aria-hidden className="flex w-[132px] justify-between text-[10px]">
                      <span>slower</span>
                      <span>faster</span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {quintiles.map((q) => {
                  const c = q[key];
                  return (
                    <tr key={q.quintile} className="border-b border-line/70">
                      <th scope="row" className="px-4 py-2 text-left font-medium text-ink sm:px-5">
                        {q.label} <span className="font-normal text-ink-subtle">({q.tracts})</span>
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{formatCount(q.requests)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPercent(c.observed)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{formatPercent(c.expected)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${isClear(c) ? "font-medium text-ink" : "text-ink-subtle"}`}>
                        {formatPoints(c.difference)} <span className="font-normal text-ink-subtle">±{formatDecimal(c.margin * 100)}</span>
                      </td>
                      <td className="px-4 py-2 sm:px-5">
                        <DiffMark c={c} scale={scale} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-subtle">
            Points = percentage points. A filled dot means the 95% interval (the line) excludes zero; a hollow dot is within the margin of error.
          </p>

          <details className="mt-4 rounded-md border border-line">
            <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-ink hover:bg-surface-muted">By request type (unadjusted)</summary>
            <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Equity by request type table (scrolls horizontally)">
              <table className="w-full min-w-[620px] border-collapse text-[13px]">
                <caption className="sr-only">Share closed within {horizon} days by request type and equity quintile, with request counts</caption>
                <thead>
                  <tr className="border-y border-line text-left text-xs text-ink-subtle">
                    <th scope="col" className="px-3 py-2 font-medium">Request type</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Citywide</th>
                    {quintiles.map((q) => (
                      <th key={q.quintile} scope="col" className="px-3 py-2 text-right font-medium">
                        {q.quintile === 1 ? "Highest" : q.quintile === 5 ? "Lowest" : q.label.replace(" equity priority", "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.byType.map((t) => {
                    const shareKey = horizon === 7 ? "share7" : "share30";
                    return (
                      <tr key={t.tracking} aria-current={tracked?.tracking === t.tracking ? "true" : undefined} className={`border-b border-line/70 ${tracked?.tracking === t.tracking ? "bg-sound-soft" : ""}`}>
                        <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
                          {t.label}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums">{t.citywide.requests ? formatPercent(t.citywide[shareKey]) : "—"}</td>
                        {t.quintiles.map((q) => (
                          <td key={q.quintile} className="px-3 py-2 text-right tabular-nums">
                            {q.requests ? formatPercent(q[shareKey]) : "—"}
                            <span className="block text-[11px] text-ink-subtle">{formatCount(q.requests)}</span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AreaList title="Neighborhoods slower than expected" areas={slower} horizon={horizon} onSelect={onSelectArea} />
            <AreaList title="Neighborhoods faster than expected" areas={faster} horizon={horizon} onSelect={onSelectArea} />
          </div>
          <p className="mt-2 text-xs text-ink-subtle">
            {formatCount(reliable.length - clearAreas.length)} of {formatCount(reliable.length)} neighborhoods with at least {MIN_AREA_REQUESTS}{" "}
            tracked requests are within their margin of error. Click a neighborhood to filter the dashboard.
          </p>

          <ul className="mt-4 list-disc space-y-1 border-t border-line pt-3 pl-5 text-xs leading-5 text-ink-subtle">
            <li>
              &ldquo;Expected&rdquo; is the share that would close in time if every request closed at the citywide rate for its type (indirect
              standardization), so areas aren&apos;t penalized for having more slow request types.
            </li>
            <li>
              This shows differences, not their causes. &ldquo;Closed&rdquo; isn&apos;t proof of a fix: an abandoned-vehicle report also
              closes when the car has moved or can&apos;t be found, which may happen at different rates in different areas.
            </li>
            <li>
              Equity groups are census-tract quintiles of the City&apos;s 2026 Racial and Social Equity Index. Request locations are grouped into
              ~55 m cells before being placed in tracts, which moves about 1.7% of requests to a neighboring tract, about the same as the
              uncertainty in the reported locations.
            </li>
            <li>Citywide only: neighborhood, district, status and request-type filters don&apos;t change these figures.</li>
          </ul>
        </div>
      )}
    </Panel>
  );
}
