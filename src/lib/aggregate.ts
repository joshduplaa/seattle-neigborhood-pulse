import { addDays, compareYmd, daysInRange, endOfMonth, startOfMonth, startOfWeek } from "@/lib/dates";
import type { FacetBucket, Granularity, TimeSeriesPoint } from "@/lib/types";

/** Day buckets up to ~2 months, weeks up to ~1 year, months beyond. */
export function chooseGranularity(start: string, end: string): Granularity {
  const days = daysInRange(start, end);
  if (days <= 62) return "day";
  if (days <= 366) return "week";
  return "month";
}

function bucketStart(day: string, granularity: Granularity): string {
  if (granularity === "week") return startOfWeek(day);
  if (granularity === "month") return startOfMonth(day);
  return day;
}

function bucketLastDay(first: string, granularity: Granularity): string {
  if (granularity === "week") return addDays(first, 6);
  if (granularity === "month") return endOfMonth(first);
  return first;
}

/**
 * Roll daily counts up into contiguous buckets covering [start, end].
 * Days with no records count as zero (the source omits empty groups).
 * Buckets clipped by the range are flagged `partial` so they are not read
 * as a drop in activity.
 */
export function buildTimeSeries(
  daily: ReadonlyMap<string, number>,
  start: string,
  end: string,
  granularity: Granularity,
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = [];
  let cursor = start;
  while (compareYmd(cursor, end) <= 0) {
    const first = bucketStart(cursor, granularity);
    const naturalLast = bucketLastDay(first, granularity);
    const last = compareYmd(naturalLast, end) > 0 ? end : naturalLast;
    let count = 0;
    for (let d = cursor; compareYmd(d, last) <= 0; d = addDays(d, 1)) {
      count += daily.get(d) ?? 0;
    }
    const days = daysInRange(cursor, last);
    points.push({
      bucket: first,
      bucketEnd: last,
      count,
      days,
      partial: days < daysInRange(first, naturalLast),
    });
    cursor = addDays(last, 1);
  }
  return points;
}

export function sumCounts(buckets: readonly FacetBucket[]): number {
  return buckets.reduce((acc, b) => acc + b.count, 0);
}

/**
 * Total requests matching every filter, derived from a facet that omitted
 * its own filter: either the whole facet, or just the selected bucket.
 */
export function matchingTotal(facet: readonly FacetBucket[], selected: string | null): number {
  if (selected === null) return sumCounts(facet);
  return facet.find((b) => b.value === selected)?.count ?? 0;
}

export function countFor(facet: readonly FacetBucket[], value: string | null): number {
  return facet.find((b) => b.value === value)?.count ?? 0;
}

export interface RankedBucket {
  key: string;
  label: string;
  value: string | null;
  count: number;
  share: number;
  /** True for the folded "all other" bucket. */
  other: boolean;
}

/**
 * Keep the `limit` largest buckets and fold the remainder into one "other"
 * bucket. The selected value is always kept visible, even if small.
 */
export function rankBuckets(
  buckets: readonly FacetBucket[],
  options: { limit: number; selected?: string | null; label: (value: string | null) => string },
): RankedBucket[] {
  const total = sumCounts(buckets);
  const sorted = [...buckets].sort((a, b) => b.count - a.count);
  let kept = sorted.slice(0, options.limit);
  const selected = options.selected ?? null;
  if (selected !== null && !kept.some((b) => b.value === selected)) {
    const sel = sorted.find((b) => b.value === selected) ?? { value: selected, count: 0 };
    kept = [...kept.slice(0, Math.max(0, options.limit - 1)), sel];
  }
  const keptValues = new Set(kept.map((b) => b.value));
  const rest = sorted.filter((b) => !keptValues.has(b.value));

  const share = (n: number) => (total === 0 ? 0 : n / total);
  const ranked: RankedBucket[] = kept.map((b) => ({
    key: b.value ?? "__blank__",
    label: options.label(b.value),
    value: b.value,
    count: b.count,
    share: share(b.count),
    other: false,
  }));
  if (rest.length > 0) {
    const restCount = sumCounts(rest);
    ranked.push({
      key: "__other__",
      label: `All other (${rest.length} more)`,
      value: null,
      count: restCount,
      share: share(restCount),
      other: true,
    });
  }
  return ranked;
}
