"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { addDays, formatLongDate, formatMonthYear, formatShortDate } from "@/lib/dates";
import { formatCompact, formatCount } from "@/lib/format";
import type { Granularity, TimeSeriesPoint } from "@/lib/types";

const UNIT: Record<Granularity, string> = { day: "day", week: "week", month: "month" };

export function bucketLabel(point: TimeSeriesPoint, granularity: Granularity): string {
  if (granularity === "day") return formatLongDate(point.bucket);
  if (granularity === "month") return formatMonthYear(point.bucket);
  return `Week of ${formatShortDate(point.bucket)}`;
}

function TrendTooltip({ active, payload, granularity }: TooltipContentProps & { granularity: Granularity }) {
  const point = payload?.[0]?.payload as TimeSeriesPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-md">
      <p className="font-medium text-ink">{bucketLabel(point, granularity)}</p>
      <p className="tabular-nums text-ink-muted">
        <span className="mr-1.5 inline-block size-2 rounded-full bg-sound align-middle" aria-hidden />
        {formatCount(point.count)} requests
      </p>
      {granularity !== "day" ? (
        <p className="text-ink-subtle">
          {formatShortDate(addDays(point.bucketEnd, -(point.days - 1)))}–{formatShortDate(point.bucketEnd)}
          {point.partial ? ` · partial (${point.days} days in range)` : ""}
        </p>
      ) : null}
    </div>
  );
}

interface ChartPoint extends TimeSeriesPoint {
  /** Count for complete buckets (solid line); null otherwise. */
  full: number | null;
  /** Count for partial buckets and their neighbours (dashed line); null otherwise. */
  clipped: number | null;
}

/**
 * Split the series so buckets clipped by the date range are drawn dashed and
 * are not read as a real drop. Neighbours of a partial bucket are included in
 * the dashed series so the segments connect.
 */
export function toChartPoints(points: TimeSeriesPoint[]): ChartPoint[] {
  return points.map((p, i) => {
    const nearPartial = p.partial || points[i - 1]?.partial === true || points[i + 1]?.partial === true;
    return { ...p, full: p.partial ? null : p.count, clipped: nearPartial ? p.count : null };
  });
}

interface TrendChartProps {
  points: TimeSeriesPoint[];
  granularity: Granularity;
}

export function TrendChart({ points, granularity }: TrendChartProps) {
  const tick = (value: string) => (granularity === "month" ? formatMonthYear(value) : formatShortDate(value));

  return (
    <div className="h-60 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={toChartPoints(points)} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-sound)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--color-sound)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis
            dataKey="bucket"
            tickFormatter={tick}
            tick={{ fill: "var(--color-ink-subtle)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-line-strong)" }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => formatCompact(v)}
            tick={{ fill: "var(--color-ink-subtle)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            content={(props) => <TrendTooltip {...props} granularity={granularity} />}
            cursor={{ stroke: "var(--color-ink-subtle)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="full"
            name={`Requests per ${UNIT[granularity]}`}
            stroke="var(--color-sound)"
            strokeWidth={2}
            fill="url(#trend-fill)"
            dot={false}
            activeDot={{ r: 4, stroke: "var(--color-surface)", strokeWidth: 2, fill: "var(--color-sound)" }}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="clipped"
            name="Partial period"
            stroke="var(--color-sound)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Peak and average for the series header. */
export function seriesStats(points: TimeSeriesPoint[]) {
  const full = points.filter((p) => !p.partial);
  const candidates = full.length > 0 ? full : points;
  const peak = candidates.reduce<TimeSeriesPoint | null>((best, p) => (best === null || p.count > best.count ? p : best), null);
  const total = points.reduce((a, p) => a + p.count, 0);
  const days = points.reduce((a, p) => a + p.days, 0);
  return { peak, perDay: days === 0 ? 0 : total / days };
}
