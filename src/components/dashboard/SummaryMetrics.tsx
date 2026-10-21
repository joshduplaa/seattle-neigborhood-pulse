import { countFor } from "@/lib/aggregate";
import { daysInRange, formatShortDate } from "@/lib/dates";
import { formatCount, formatDecimal, formatPercent } from "@/lib/format";
import { CHANGE_ARROW, describeChange, type Change } from "@/lib/change";
import type { DashboardData } from "@/lib/types";

import { Skeleton } from "@/components/ui/Panel";

interface Metric {
  label: string;
  value: string;
  detail: string;
  title?: string;
  /** Text values (names) use a smaller face so they can wrap. */
  text?: boolean;
  /** Change versus the previous equal-length period, with its date range. */
  change?: { change: Change; period: string };
}

export function buildMetrics(data: DashboardData): Metric[] {
  const { filters, totals, facets, comparison } = data;
  const days = daysInRange(filters.start, filters.end);
  const perDay = totals.matching / days;
  const range = `${formatShortDate(filters.start)} – ${formatShortDate(filters.end)}`;

  // Most common type within the current scope (category facet ignores its own filter).
  const categoryScope = facets.category.reduce((a, b) => a + b.count, 0);
  const top = filters.category
    ? { value: filters.category, count: countFor(facets.category, filters.category) }
    : facets.category.find((b) => b.value !== null);

  return [
    {
      label: "Requests reported",
      value: formatCount(totals.matching),
      change: comparison
        ? (() => {
            const change = describeChange(totals.matching, comparison.matching);
            return change ? { change, period: `${formatShortDate(comparison.start)} – ${formatShortDate(comparison.end)}` } : undefined;
          })()
        : undefined,
      detail: `${range} · ${formatCount(days)} ${days === 1 ? "day" : "days"}`,
    },
    {
      label: "Daily average",
      value: perDay >= 100 ? formatCount(Math.round(perDay)) : formatDecimal(perDay),
      detail: "requests per day in range",
    },
    {
      label: filters.category ? "Selected request type" : "Most reported type",
      value: top?.value ?? "—",
      text: true,
      detail: top && categoryScope > 0 ? `${formatPercent(top.count / categoryScope)} of requests in scope` : "No requests in scope",
    },
    {
      label: "Mapped location",
      value: totals.matching ? formatPercent(totals.geolocated / totals.matching) : "—",
      detail: `${formatCount(Math.max(0, totals.matching - totals.geolocated))} without usable coordinates`,
    },
  ];
}

export function SummaryMetrics({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={loading}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-surface px-4 py-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <dl className={`grid grid-cols-2 gap-3 transition-opacity lg:grid-cols-4 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
      {buildMetrics(data).map((m) => (
        <div key={m.label} className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3 shadow-[0_1px_2px_rgb(19_34_44/0.04)]">
          <dt className="text-xs font-medium text-ink-muted">{m.label}</dt>
          <dd
            className={`mt-1 font-display font-semibold text-ink ${
              m.text ? "line-clamp-2 text-lg leading-6 sm:text-xl sm:leading-7" : "text-2xl leading-8 tabular-nums sm:text-[28px]"
            }`}
            title={m.title ?? m.value}
          >
            {m.value}
          </dd>
          <dd className="mt-0.5 text-xs leading-5 text-ink-subtle">{m.detail}</dd>
          {m.change ? (
            <dd className="text-xs leading-5 text-ink-muted">
              <span aria-hidden className="mr-1 text-[9px]">
                {CHANGE_ARROW[m.change.change.direction]}
              </span>
              <span className="sr-only">{m.change.change.description}</span>
              <span aria-hidden className="font-medium tabular-nums text-ink">
                {m.change.change.text}
              </span>
              <span> vs {m.change.period}</span>
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
