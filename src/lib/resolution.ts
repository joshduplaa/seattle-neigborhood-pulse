import { addDays, compareYmd, daysInRange } from "@/lib/dates";
import type { DashboardFilters } from "@/lib/filters";
import { querySocrata, type SoqlResult } from "@/lib/socrata/client";
import { TRACKED_TYPES, TRACKING_RESOURCE_URL } from "@/lib/socrata/config";
import { parseFloatingTimestamp, parseHttpDate } from "@/lib/socrata/normalize";
import { soqlString, type SoqlParams } from "@/lib/socrata/soql";

/**
 * "How quickly do tracked requests get a Closed update?"
 *
 * Method (see README): one cohort of requests *created* in a window that
 * ended at least 30 days before the tracking data ends, so every request in
 * it has had the full 30 days to close. That keeps the 7- and 30-day shares
 * and the median consistent (all describe the same requests). When the
 * selected range is too recent, the window shifts back to the latest period
 * of the same length that qualifies, and the UI says so. Requests never
 * closed stay in the denominator. "Closed" includes duplicates, "unable to
 * locate" and transfers, so this measures City response, not physical repair.
 */

export const HORIZONS = [7, 30] as const;
export type Horizon = (typeof HORIZONS)[number];
/** Every request in the cohort has had this many days to close. */
export const OBSERVATION_DAYS = 30;
/** First created date in the tracking dataset. */
export const TRACKING_START_DATE = "2023-01-01";

export interface CohortWindow {
  start: string;
  end: string;
  /** True when the selected range was too recent and the window moved back. */
  shifted: boolean;
}

export interface HorizonStat {
  /** Requests in the cohort (created in the window). */
  cohort: number;
  /** Requests whose first Closed update came within the horizon. */
  closed: number;
  share: number;
}

export interface TypeResolution {
  /** Type name in the tracking dataset. */
  tracking: string;
  /** Matching type name in the requests dataset (used by the category filter). */
  request: string;
  label: string;
  /** Requests in the cohort. */
  cohort: number;
  horizons: Record<Horizon, HorizonStat>;
  /**
   * Median days to first Closed update. `exceeds` is set when fewer than
   * half closed within the observation period.
   */
  median: { days: number; exceeds: false } | { days: number; exceeds: true } | null;
}

export interface ResolutionData {
  start: string;
  end: string;
  /** Last day covered by the tracking data. */
  dataEnd: string;
  /** Created-date window of the cohort; null when no requests qualify. */
  window: CohortWindow | null;
  types: TypeResolution[];
  retrievedAt: string;
  sourceUpdatedAt: string | null;
}

/**
 * Created-date window whose requests have all had `OBSERVATION_DAYS` to
 * close: the selected range if it is old enough, otherwise the latest
 * equally long window that is. Null if nothing qualifies.
 */
export function cohortWindow(start: string, end: string, dataEnd: string): CohortWindow | null {
  const latest = addDays(dataEnd, -OBSERVATION_DAYS);
  if (compareYmd(end, latest) <= 0) {
    const s = compareYmd(start, TRACKING_START_DATE) < 0 ? TRACKING_START_DATE : start;
    return compareYmd(s, end) <= 0 ? { start: s, end, shifted: false } : null;
  }
  let shiftedStart = addDays(latest, -(daysInRange(start, end) - 1));
  if (compareYmd(shiftedStart, TRACKING_START_DATE) < 0) shiftedStart = TRACKING_START_DATE;
  return compareYmd(shiftedStart, latest) <= 0 ? { start: shiftedStart, end: latest, shifted: true } : null;
}

function createdBetween(w: Pick<CohortWindow, "start" | "end">): string {
  return `createddate >= ${soqlString(`${w.start}T00:00:00`)} AND createddate < ${soqlString(`${addDays(w.end, 1)}T00:00:00`)}`;
}

export function dataEndQuery(): SoqlParams {
  return { $query: "SELECT max(updateddate) AS dataend" };
}

export function cohortSizeQuery(w: Pick<CohortWindow, "start" | "end">): SoqlParams {
  return {
    $query: `SELECT servicerequesttype, count(distinct servicerequestnumber) AS n WHERE ${createdBetween(w)} GROUP BY servicerequesttype`,
  };
}

/** Days from creation to first Closed update, per type, up to `horizon` days. */
export function closedDistributionQuery(w: Pick<CohortWindow, "start" | "end">, horizon: number): SoqlParams {
  return {
    $query:
      `SELECT servicerequesttype, servicerequestnumber, min(createddate) AS c, min(updateddate) AS u ` +
      `WHERE statuscategory = 'Closed' AND ${createdBetween(w)} GROUP BY servicerequesttype, servicerequestnumber ` +
      `|> SELECT servicerequesttype, date_diff_d(u, c) AS days, count(*) AS n ` +
      `WHERE date_diff_d(u, c) >= 0 AND date_diff_d(u, c) <= ${horizon} GROUP BY servicerequesttype, days LIMIT 50000`,
  };
}

function toCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function rowsOf(rows: unknown[]): Record<string, unknown>[] {
  return rows.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
}

export function parseSizes(rows: unknown[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rowsOf(rows)) {
    const n = toCount(r.n);
    if (typeof r.servicerequesttype === "string" && n !== null) out.set(r.servicerequesttype, n);
  }
  return out;
}

/** type → (days → count) */
export function parseDistribution(rows: unknown[]): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  for (const r of rowsOf(rows)) {
    const days = toCount(r.days);
    const n = toCount(r.n);
    if (typeof r.servicerequesttype !== "string" || days === null || n === null) continue;
    const byDay = out.get(r.servicerequesttype) ?? new Map<number, number>();
    byDay.set(days, (byDay.get(days) ?? 0) + n);
    out.set(r.servicerequesttype, byDay);
  }
  return out;
}

export function closedWithin(dist: ReadonlyMap<number, number> | undefined, horizon: number): number {
  let total = 0;
  for (const [days, n] of dist ?? []) if (days <= horizon) total += n;
  return total;
}

/**
 * Median days to first Closed update over a cohort of `cohort` requests,
 * where never-closed requests count as "longer than the horizon".
 */
export function medianDays(dist: ReadonlyMap<number, number> | undefined, cohort: number, horizon: number): TypeResolution["median"] {
  if (cohort === 0) return null;
  let cumulative = 0;
  for (const days of [...(dist ?? new Map()).keys()].sort((a, b) => a - b)) {
    cumulative += dist?.get(days) ?? 0;
    if (days <= horizon && cumulative * 2 >= cohort) return { days, exceeds: false };
  }
  return { days: horizon, exceeds: true };
}

export function summarize(sizes: Map<string, number>, dist: Map<string, Map<number, number>>): TypeResolution[] {
  return TRACKED_TYPES.map((t) => {
    const cohort = sizes.get(t.tracking) ?? 0;
    const byDay = dist.get(t.tracking);
    const stat = (h: Horizon): HorizonStat => {
      const closed = Math.min(cohort, closedWithin(byDay, h));
      return { cohort, closed, share: cohort === 0 ? 0 : closed / cohort };
    };
    return {
      tracking: t.tracking,
      request: t.request,
      label: t.label,
      cohort,
      horizons: { 7: stat(7), 30: stat(30) },
      median: medianDays(byDay, cohort, OBSERVATION_DAYS),
    };
  });
}

export type QueryFn = (params: SoqlParams) => Promise<SoqlResult>;

const trackingQuery: QueryFn = (p) => querySocrata(p, { resourceUrl: TRACKING_RESOURCE_URL });

export async function getResolutionData(
  filters: Pick<DashboardFilters, "start" | "end">,
  query: QueryFn = trackingQuery,
  now: () => Date = () => new Date(),
): Promise<ResolutionData> {
  const endResult = await query(dataEndQuery());
  const first = rowsOf(endResult.rows)[0];
  const dataEnd = parseFloatingTimestamp(typeof first?.dataend === "string" ? first.dataend : undefined)?.slice(0, 10);
  if (!dataEnd) throw new Error("Tracking dataset returned no end date");

  const window = cohortWindow(filters.start, filters.end, dataEnd);
  let types = summarize(new Map(), new Map());
  if (window) {
    const [size, dist] = await Promise.all([query(cohortSizeQuery(window)), query(closedDistributionQuery(window, OBSERVATION_DAYS))]);
    types = summarize(parseSizes(size.rows), parseDistribution(dist.rows));
  }

  return {
    start: filters.start,
    end: filters.end,
    dataEnd,
    window,
    types,
    retrievedAt: now().toISOString(),
    sourceUpdatedAt: parseHttpDate(endResult.lastModified),
  };
}
