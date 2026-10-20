"use client";

import { bucketLabel, seriesStats, TrendChart } from "@/components/charts/TrendChart";
import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";
import { compareYmd } from "@/lib/dates";
import { formatCount, formatDecimal } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

const UNIT_LABEL = { day: "day", week: "week (Mon–Sun)", month: "month" } as const;

export function TrendPanel({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  if (!data) {
    return (
      <Panel id="trends" title="Requests over time" description="Loading…">
        <Skeleton className="h-60 w-full sm:h-64" />
      </Panel>
    );
  }

  const { granularity, points } = data.series;
  const { peak, perDay } = seriesStats(points);
  const partial = points.filter((p) => p.partial);
  const newestDay = data.newestRecordAt?.slice(0, 10) ?? null;
  // The final day in range may still be filling in if it is the newest day in the source (or later).
  const lastDayIncomplete = newestDay !== null && compareYmd(data.filters.end, newestDay) >= 0;

  return (
    <Panel
      id="trends"
      title="Requests over time"
      description={`Requests reported per ${UNIT_LABEL[granularity]}, by created date.`}
      actions={
        data.totals.matching > 0 && peak ? (
          <dl className="flex gap-4 text-right text-xs">
            <div>
              <dt className="text-ink-subtle">Avg / day</dt>
              <dd className="font-semibold tabular-nums text-ink">{formatDecimal(perDay)}</dd>
            </div>
            <div>
              <dt className="text-ink-subtle">Busiest {granularity}</dt>
              <dd className="font-semibold tabular-nums text-ink">
                {formatCount(peak.count)} <span className="font-normal text-ink-subtle">· {bucketLabel(peak, granularity).replace("Week of ", "wk of ")}</span>
              </dd>
            </div>
          </dl>
        ) : null
      }
    >
      {data.totals.matching === 0 ? (
        <EmptyState title="No requests in this period">Try widening the date range or clearing filters.</EmptyState>
      ) : (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <TrendChart points={points} granularity={granularity} />
          <ul className="mt-2 space-y-0.5 text-xs text-ink-subtle">
            {partial.length > 0 ? (
              <li>
                <span aria-hidden className="mr-1.5 inline-block w-4 border-t-2 border-dashed border-sound align-middle" />
                {partial.length === 1 ? "One" : partial.length} {granularity === "week" ? "week" : "month"}
                {partial.length === 1 ? " is" : "s are"} only partly inside the selected range, so {partial.length === 1 ? "its total is" : "their totals are"} lower.
              </li>
            ) : null}
            {lastDayIncomplete ? <li>The most recent day may be incomplete; the City publishes this dataset once a day.</li> : null}
          </ul>
        </div>
      )}
    </Panel>
  );
}
