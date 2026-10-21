"use client";

import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";
import { useResolutionData } from "@/hooks/useDashboardData";
import { formatLongDate, formatShortDate } from "@/lib/dates";
import type { DashboardFilters } from "@/lib/filters";
import { formatCount, formatPercent } from "@/lib/format";
import type { CohortWindow, HorizonStat, TypeResolution } from "@/lib/resolution";
import { TRACKED_TYPES, TRACKING_DATASET_NAME, TRACKING_PAGE_URL } from "@/lib/socrata/config";

/** Below this cohort size, shares are shown but flagged as unreliable. */
export const MIN_RELIABLE_COHORT = 30;

export function windowText(w: CohortWindow | null): string {
  if (!w) return "No requests in this range have had 30 days to close yet.";
  const range = w.start === w.end ? formatLongDate(w.start) : `${formatShortDate(w.start)} – ${formatLongDate(w.end)}`;
  return w.shifted
    ? `Requests created ${range}. Your range is too recent to judge, so this uses the latest period of the same length whose requests have all had 30 days to close.`
    : `Requests created ${range}; all have had at least 30 days to close.`;
}

export function formatMedian(median: TypeResolution["median"]): string {
  if (!median) return "—";
  if (median.exceeds) return `> ${median.days} days`;
  if (median.days === 0) return "Same day";
  return `${median.days} ${median.days === 1 ? "day" : "days"}`;
}

function ShareCell({ stat }: { stat: HorizonStat }) {
  if (stat.cohort === 0) return <td className="px-3 py-2 text-right text-ink-subtle">—</td>;
  const small = stat.cohort < MIN_RELIABLE_COHORT;
  return (
    <td className="px-3 py-2 text-right">
      <span className={`tabular-nums ${small ? "text-ink-subtle" : "text-ink"}`}>
        {formatPercent(stat.share)}
        {small ? <span title={`Only ${stat.cohort} requests`}>*</span> : null}
      </span>
      <span aria-hidden className="ml-auto mt-1 block h-1.5 w-full max-w-28 rounded-full bg-surface-muted sm:ml-auto">
        <span className={`block h-1.5 rounded-r-[3px] ${small ? "bg-sound-muted" : "bg-sound"}`} style={{ width: `${stat.share * 100}%` }} />
      </span>
    </td>
  );
}

export function ResolutionPanel({ filters }: { filters: DashboardFilters }) {
  const { data, loading, error, retry } = useResolutionData(filters);

  const tracked = TRACKED_TYPES.find((t) => t.request === filters.category);
  const untrackedCategory = filters.category !== null && !tracked;
  const otherFilters = [filters.status, filters.area, filters.district].some((v) => v !== null);
  const anySmall = data?.types.some((t) => t.cohort > 0 && t.cohort < MIN_RELIABLE_COHORT);

  return (
    <Panel
      id="response"
      title="How quickly requests get a “Closed” update"
      description={
        <>
          Five request types tracked in the City&apos;s{" "}
          <a href={TRACKING_PAGE_URL} target="_blank" rel="noreferrer" className="font-medium text-sound-strong underline-offset-2 hover:underline">
            {TRACKING_DATASET_NAME}
          </a>
          , citywide, by created date.
        </>
      }
    >
      {error && !data ? (
        <EmptyState title="Response times couldn’t load">
          {error}{" "}
          <button type="button" onClick={retry} className="font-medium text-sound-strong underline underline-offset-2">
            Try again
          </button>
        </EmptyState>
      ) : !data ? (
        <div className="flex flex-col gap-2" aria-busy>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          {untrackedCategory ? (
            <p role="status" className="mb-3 rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">
              Response times aren&apos;t published for &ldquo;{filters.category}&rdquo;. Showing the five tracked types.
            </p>
          ) : null}

          <p className={`mb-3 text-xs leading-5 ${data.window?.shifted ? "text-ink-muted" : "text-ink-subtle"}`}>{windowText(data.window)}</p>

          {/* Focusable so keyboard users can scroll the table on narrow screens. */}
          <div
            // relative: keeps screen-reader-only text inside the scroller.
            className="relative -mx-4 overflow-x-auto sm:-mx-5"
            tabIndex={0}
            role="region"
            aria-label="Response times table (scrolls horizontally)"
          >
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <caption className="sr-only">
                Share of requests whose first Closed status update came within 7 and 30 days, and median days, by request type
              </caption>
              <thead>
                <tr className="border-y border-line text-left text-xs text-ink-subtle">
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">Request type</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Requests</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Closed within 7 days</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Within 30 days</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">Median time</th>
                </tr>
              </thead>
              <tbody>
                {data.types.map((t) => {
                  const highlighted = tracked?.request === t.request;
                  return (
                    <tr
                      key={t.tracking}
                      aria-current={highlighted ? "true" : undefined}
                      className={`border-b border-line/70 ${highlighted ? "bg-sound-soft" : ""} ${tracked && !highlighted ? "text-ink-subtle" : ""}`}
                    >
                      <th scope="row" className="px-4 py-2 text-left font-medium sm:px-5">
                        {t.label}
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{t.cohort ? formatCount(t.cohort) : "—"}</td>
                      <ShareCell stat={t.horizons[7]} />
                      <ShareCell stat={t.horizons[30]} />
                      <td className="px-4 py-2 text-right tabular-nums sm:px-5">{formatMedian(t.median)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-ink-subtle">
            <li>
              Every column describes the same requests, all old enough to judge, so recent requests can&apos;t make the City look faster or
              slower. Requests never closed still count, as slower than 30 days.
            </li>
            <li>
              &ldquo;Closed&rdquo; is the City&apos;s status, not proof of a fix. It includes duplicates, vehicles that couldn&apos;t be located or
              had moved, and reports forwarded to another department or team.
            </li>
            <li>Dates are whole days, so &ldquo;Same day&rdquo; means closed on the day it was reported.</li>
            {anySmall ? <li>* Fewer than {MIN_RELIABLE_COHORT} requests, so the percentage is unreliable.</li> : null}
            {otherFilters ? <li>Neighborhood, district and status filters don&apos;t apply here; the tracking data doesn&apos;t include them.</li> : null}
          </ul>
        </div>
      )}
    </Panel>
  );
}
