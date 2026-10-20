import { DATASET_START_DATE } from "@/lib/socrata/config";
import { addDays, compareYmd, isValidYmd } from "@/lib/dates";

/**
 * Dashboard filter state. The same shape is used in the URL, by the API route
 * and when building SoQL, so every view is scoped identically.
 *
 * `start` and `end` are inclusive calendar dates in Seattle local time.
 */
export interface DashboardFilters {
  start: string;
  end: string;
  category: string | null;
  status: string | null;
  /** Community Reporting Area, as published (upper case). */
  area: string | null;
  /** Seattle City Council district number, "1"–"7". */
  district: string | null;
}

export type FacetKey = "category" | "status" | "area" | "district";

export const FACET_KEYS: readonly FacetKey[] = ["category", "status", "area", "district"];

export const DATE_PRESETS = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "365d", label: "12 months", days: 365 },
] as const;

export type DatePresetId = (typeof DATE_PRESETS)[number]["id"];

export const DEFAULT_PRESET: DatePresetId = "30d";

/** Longest range the API accepts (keeps aggregate queries fast). */
export const MAX_RANGE_DAYS = 366 * 3;

const MAX_VALUE_LENGTH = 120;
const DISTRICTS = new Set(["1", "2", "3", "4", "5", "6", "7"]);

/**
 * Presets cover the N days ending *yesterday*. The City publishes this
 * dataset once a day, so the current day is almost always incomplete and
 * would read as a sudden drop. Custom ranges may still include today.
 */
export function presetRange(id: DatePresetId, today: string): { start: string; end: string } {
  const preset = DATE_PRESETS.find((p) => p.id === id) ?? DATE_PRESETS[1];
  const end = addDays(today, -1);
  return { start: addDays(end, -(preset.days - 1)), end };
}

export function defaultFilters(today: string): DashboardFilters {
  return { ...presetRange(DEFAULT_PRESET, today), category: null, status: null, area: null, district: null };
}

/** Which preset (if any) the current range corresponds to. */
export function matchPreset(filters: Pick<DashboardFilters, "start" | "end">, today: string): DatePresetId | null {
  for (const p of DATE_PRESETS) {
    const r = presetRange(p.id, today);
    if (r.start === filters.start && r.end === filters.end) return p.id;
  }
  return null;
}

function cleanValue(raw: string | null): string | null {
  if (raw === null) return null;
  const v = raw.trim();
  if (v === "" || v.length > MAX_VALUE_LENGTH) return null;
  return v;
}

export interface ParseResult {
  filters: DashboardFilters;
  /** Human-readable problems with the supplied parameters (already corrected). */
  issues: string[];
}

/**
 * Parse filter query parameters, falling back to defaults for anything
 * missing or invalid. Never throws; corrections are reported in `issues`.
 */
export function parseFilters(params: URLSearchParams, today: string): ParseResult {
  const issues: string[] = [];
  const defaults = defaultFilters(today);

  let start = params.get("start") ?? defaults.start;
  let end = params.get("end") ?? defaults.end;

  if (!isValidYmd(start)) {
    issues.push(`Ignored invalid start date "${start}".`);
    start = defaults.start;
  }
  if (!isValidYmd(end)) {
    issues.push(`Ignored invalid end date "${end}".`);
    end = defaults.end;
  }
  if (compareYmd(end, today) > 0) {
    issues.push("End date was in the future; using today.");
    end = today;
  }
  if (compareYmd(start, DATASET_START_DATE) < 0) {
    issues.push(`Start date moved to ${DATASET_START_DATE}, when the dataset begins.`);
    start = DATASET_START_DATE;
  }
  if (compareYmd(start, end) > 0) {
    issues.push("Start date was after end date; dates swapped.");
    [start, end] = [end, start];
  }
  const earliest = addDays(end, -(MAX_RANGE_DAYS - 1));
  if (compareYmd(start, earliest) < 0) {
    issues.push(`Date range limited to ${MAX_RANGE_DAYS} days.`);
    start = earliest;
  }

  let district = cleanValue(params.get("district"));
  if (district !== null && !DISTRICTS.has(district)) {
    issues.push(`Ignored unknown council district "${district}".`);
    district = null;
  }

  return {
    filters: {
      start,
      end,
      category: cleanValue(params.get("category")),
      status: cleanValue(params.get("status")),
      area: cleanValue(params.get("area")),
      district,
    },
    issues,
  };
}

/** Serialize filters to query parameters (omitting nulls). */
export function filtersToParams(filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("start", filters.start);
  params.set("end", filters.end);
  for (const key of FACET_KEYS) {
    const value = filters[key];
    if (value !== null) params.set(key, value);
  }
  return params;
}

export function activeFacetCount(filters: DashboardFilters): number {
  return FACET_KEYS.filter((k) => filters[k] !== null).length;
}

/** Stable string key for caching and request de-duplication. */
export function filtersKey(filters: DashboardFilters): string {
  return filtersToParams(filters).toString();
}
