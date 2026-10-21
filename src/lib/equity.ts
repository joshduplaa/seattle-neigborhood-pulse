import craBoundaries from "@/data/cra-boundaries.json";
import equityTracts from "@/data/equity-tracts.json";
import { addDays, compareYmd, daysInRange } from "@/lib/dates";
import type { DashboardFilters } from "@/lib/filters";
import { indexFeatures, locate } from "@/lib/geo";
import { cohortWindow, dataEndQuery, OBSERVATION_DAYS, TRACKING_START_DATE, type QueryFn } from "@/lib/resolution";
import { querySocrata } from "@/lib/socrata/client";
import { TRACKED_TYPES, TRACKING_RESOURCE_URL } from "@/lib/socrata/config";
import { parseFloatingTimestamp, parseHttpDate } from "@/lib/socrata/normalize";
import { soqlString, type SoqlParams } from "@/lib/socrata/soql";

/**
 * "Is the City responding equally?"
 *
 * Method (see README):
 * 1. Cohort: tracked requests created in a window whose requests have all
 *    had 30 days to close (as for response times), at least 90 and at most
 *    366 days long so each group has enough requests.
 * 2. Location: requests are binned server-side into 0.0005° cells
 *    (~55 m × 37 m); each cell centre is placed in its 2020 census tract
 *    (Racial and Social Equity Index quintile) and Community Reporting Area.
 *    Measured against exact points, this reassigns ~1.7% of requests to a
 *    different quintile, about the same as moving an exact point 11 m.
 * 3. Indirect standardization: each group's observed share closed within
 *    H days is compared with the share expected if every one of its requests
 *    closed at the citywide rate for its request type. The difference
 *    (percentage points) is the equity signal; the 95% margin uses the
 *    binomial variance within each type.
 */

export const EQUITY_MIN_DAYS = 90;
export const EQUITY_MAX_DAYS = 366;
export const CELL_SCALE = 2000; // cells of 1/2000 degree
/** Neighborhoods with fewer requests than this aren't ranked. */
export const MIN_AREA_REQUESTS = 100;
const PAGE_SIZE = 50_000;
const MAX_PAGES = 6;

export const QUINTILE_LABELS: Record<number, string> = {
  1: "Highest equity priority",
  2: "Second highest",
  3: "Middle",
  4: "Second lowest",
  5: "Lowest equity priority",
};

export type EquityHorizon = 7 | 30;

export interface EquityWindow {
  start: string;
  end: string;
  /** Moved back because the selected range was too recent to judge. */
  shifted: boolean;
  /** Lengthened to the 90-day minimum. */
  extended: boolean;
  /** Shortened to the most recent 366 days. */
  capped: boolean;
}

export interface Comparison {
  /** Share actually closed within the horizon. */
  observed: number;
  /** Share expected from the citywide rate for each request's type. */
  expected: number;
  /** observed − expected, in share units (0.05 = 5 points). */
  difference: number;
  /** Half-width of the 95% interval for the difference. */
  margin: number;
}

export interface GroupResult {
  requests: number;
  h7: Comparison;
  h30: Comparison;
}

export interface QuintileResult extends GroupResult {
  quintile: number;
  label: string;
  tracts: number;
}

export interface AreaResult extends GroupResult {
  area: string;
  /** False when the area has fewer than MIN_AREA_REQUESTS requests. */
  reliable: boolean;
}

export interface TypeBreakdown {
  tracking: string;
  request: string;
  label: string;
  citywide: { requests: number; share7: number; share30: number };
  /** Unadjusted shares by quintile (no adjustment needed within one type). */
  quintiles: { quintile: number; requests: number; share7: number; share30: number }[];
}

export interface EquityData {
  dataEnd: string;
  window: EquityWindow | null;
  requests: number;
  /** Requests whose cell fell outside every Seattle tract. */
  unassigned: number;
  quintiles: QuintileResult[];
  byType: TypeBreakdown[];
  areas: AreaResult[];
  retrievedAt: string;
  sourceUpdatedAt: string | null;
}

/** Cohort window for the equity analysis; see module comment. */
export function equityWindow(start: string, end: string, dataEnd: string): EquityWindow | null {
  const base = cohortWindow(start, end, dataEnd);
  if (!base) return null;
  let s = base.start;
  let extended = false;
  let capped = false;
  if (daysInRange(s, base.end) < EQUITY_MIN_DAYS) {
    s = addDays(base.end, -(EQUITY_MIN_DAYS - 1));
    extended = true;
  }
  if (daysInRange(s, base.end) > EQUITY_MAX_DAYS) {
    s = addDays(base.end, -(EQUITY_MAX_DAYS - 1));
    capped = true;
  }
  if (compareYmd(s, TRACKING_START_DATE) < 0) s = TRACKING_START_DATE;
  return { start: s, end: base.end, shifted: base.shifted, extended, capped };
}

/** Requests binned by type and cell, with closed-within-7/30-day counts. */
export function binnedQuery(w: Pick<EquityWindow, "start" | "end">, page: number): SoqlParams {
  const between = `createddate >= ${soqlString(`${w.start}T00:00:00`)} AND createddate < ${soqlString(`${addDays(w.end, 1)}T00:00:00`)}`;
  return {
    $query:
      `SELECT servicerequestnumber, servicerequesttype, min(createddate) AS c, ` +
      `min(case(statuscategory = 'Closed', updateddate)) AS u, max(latitude) AS lat, max(longitude) AS lon ` +
      `WHERE ${between} AND latitude IS NOT NULL AND longitude IS NOT NULL GROUP BY servicerequestnumber, servicerequesttype ` +
      `|> SELECT servicerequesttype, floor(lat * ${CELL_SCALE}) AS y, floor(lon * ${CELL_SCALE}) AS x, count(*) AS n, ` +
      `sum(case(date_diff_d(u, c) <= 7, 1, true, 0)) AS w7, sum(case(date_diff_d(u, c) <= ${OBSERVATION_DAYS}, 1, true, 0)) AS w30 ` +
      `GROUP BY servicerequesttype, y, x ORDER BY servicerequesttype, y, x LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`,
  };
}

export interface Cell {
  type: string;
  lat: number;
  lon: number;
  n: number;
  w7: number;
  w30: number;
}

function int(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
}

export function parseCells(rows: unknown[]): Cell[] {
  const cells: Cell[] = [];
  for (const r of rows) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    const [y, x, n, w7, w30] = [int(o.y), int(o.x), int(o.n), int(o.w7), int(o.w30)];
    if (typeof o.servicerequesttype !== "string" || y === null || x === null || n === null || n <= 0) continue;
    // Never-closed requests have no duration, so the sums can be missing; treat as 0.
    const c7 = Math.min(n, Math.max(0, w7 ?? 0));
    const c30 = Math.min(n, Math.max(c7, w30 ?? 0));
    cells.push({ type: o.servicerequesttype, lat: (y + 0.5) / CELL_SCALE, lon: (x + 0.5) / CELL_SCALE, n, w7: c7, w30: c30 });
  }
  return cells;
}

interface Tally {
  n: number;
  w7: number;
  w30: number;
}
type ByType = Map<string, Tally>;

function add(map: ByType, type: string, c: Cell) {
  const t = map.get(type) ?? { n: 0, w7: 0, w30: 0 };
  t.n += c.n;
  t.w7 += c.w7;
  t.w30 += c.w30;
  map.set(type, t);
}

/** Indirectly standardized comparison of a group's closures with the citywide rates by type. */
export function compare(group: ByType, city: ByType, horizon: EquityHorizon): Comparison {
  const key = horizon === 7 ? "w7" : "w30";
  let n = 0;
  let closed = 0;
  let expected = 0;
  let variance = 0;
  for (const [type, t] of group) {
    const c = city.get(type);
    if (!c || c.n === 0 || t.n === 0) continue;
    n += t.n;
    closed += t[key];
    expected += t.n * (c[key] / c.n);
    const p = t[key] / t.n;
    variance += t.n * p * (1 - p);
  }
  if (n === 0) return { observed: 0, expected: 0, difference: 0, margin: 0 };
  return {
    observed: closed / n,
    expected: expected / n,
    difference: (closed - expected) / n,
    margin: (1.96 * Math.sqrt(variance)) / n,
  };
}

const total = (m: ByType) => [...m.values()].reduce((a, t) => a + t.n, 0);

type TractProps = { geoid: string; quintile: number };
type AreaProps = { area: string };
const TRACTS = indexFeatures<TractProps>(equityTracts.features as { geometry: unknown; properties: TractProps }[]);
const AREAS = indexFeatures<AreaProps>(craBoundaries.features as { geometry: unknown; properties: AreaProps }[]);
const TRACT_COUNTS = equityTracts.features.reduce<Record<number, number>>((m, f) => {
  m[f.properties.quintile] = (m[f.properties.quintile] ?? 0) + 1;
  return m;
}, {});

/** Assign cells to quintiles and areas and compute every comparison. */
export function analyze(cells: Cell[]): Omit<EquityData, "dataEnd" | "window" | "retrievedAt" | "sourceUpdatedAt"> {
  const city: ByType = new Map();
  const quintiles = new Map<number, ByType>();
  const areas = new Map<string, ByType>();
  let unassigned = 0;

  for (const c of cells) {
    const tract = locate(TRACTS, c.lat, c.lon);
    if (!tract) {
      unassigned += c.n;
      continue;
    }
    add(city, c.type, c);
    const q = quintiles.get(tract.quintile) ?? new Map();
    add(q, c.type, c);
    quintiles.set(tract.quintile, q);
    const area = locate(AREAS, c.lat, c.lon);
    if (area) {
      const a = areas.get(area.area) ?? new Map();
      add(a, c.type, c);
      areas.set(area.area, a);
    }
  }

  const result = (g: ByType): GroupResult => ({ requests: total(g), h7: compare(g, city, 7), h30: compare(g, city, 30) });
  const share = (t: Tally | undefined, k: "w7" | "w30") => (t && t.n ? t[k] / t.n : 0);

  return {
    requests: total(city),
    unassigned,
    quintiles: [1, 2, 3, 4, 5].map((q) => ({
      quintile: q,
      label: QUINTILE_LABELS[q] as string,
      tracts: TRACT_COUNTS[q] ?? 0,
      ...result(quintiles.get(q) ?? new Map()),
    })),
    byType: TRACKED_TYPES.map((t) => {
      const c = city.get(t.tracking);
      return {
        tracking: t.tracking,
        request: t.request,
        label: t.label,
        citywide: { requests: c?.n ?? 0, share7: share(c, "w7"), share30: share(c, "w30") },
        quintiles: [1, 2, 3, 4, 5].map((q) => {
          const v = quintiles.get(q)?.get(t.tracking);
          return { quintile: q, requests: v?.n ?? 0, share7: share(v, "w7"), share30: share(v, "w30") };
        }),
      };
    }),
    areas: [...areas.entries()]
      .map(([area, g]) => ({ area, ...result(g), reliable: total(g) >= MIN_AREA_REQUESTS }))
      .sort((a, b) => a.h7.difference - b.h7.difference),
  };
}

const trackingQuery: QueryFn = (p) => querySocrata(p, { resourceUrl: TRACKING_RESOURCE_URL, timeoutMs: 45_000 });

export async function getEquityData(
  filters: Pick<DashboardFilters, "start" | "end">,
  query: QueryFn = trackingQuery,
  now: () => Date = () => new Date(),
): Promise<EquityData> {
  const endResult = await query(dataEndQuery());
  const first = endResult.rows[0] as { dataend?: unknown } | undefined;
  const dataEnd = parseFloatingTimestamp(typeof first?.dataend === "string" ? first.dataend : undefined)?.slice(0, 10);
  if (!dataEnd) throw new Error("Tracking dataset returned no end date");

  const window = equityWindow(filters.start, filters.end, dataEnd);
  const cells: Cell[] = [];
  if (window) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = (await query(binnedQuery(window, page))).rows;
      cells.push(...parseCells(rows));
      if (rows.length < PAGE_SIZE) break;
    }
  }

  return {
    dataEnd,
    window,
    ...analyze(cells),
    retrievedAt: now().toISOString(),
    sourceUpdatedAt: parseHttpDate(endResult.lastModified),
  };
}
