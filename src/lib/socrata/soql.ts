import { addDays } from "@/lib/dates";
import type { DashboardFilters, FacetKey } from "@/lib/filters";
import { FIELDS, GRID_RESOLUTION, SAMPLE_LIMIT } from "@/lib/socrata/config";

/** SoQL query parameters, sent as `$select`, `$where`, … */
export type SoqlParams = Record<string, string>;

const FACET_FIELD: Record<FacetKey, string> = {
  category: FIELDS.type,
  status: FIELDS.status,
  area: FIELDS.area,
  district: FIELDS.councilDistrict,
};

/** Quote a string literal for SoQL (single quotes doubled). */
export function soqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * WHERE clause for the filters. The date range is half-open on the day after
 * `end` so the whole final day is included. Pass `omit` to leave one facet
 * unfiltered (used for facet counts).
 */
export function buildWhere(filters: DashboardFilters, omit?: FacetKey): string {
  const clauses = [
    `${FIELDS.createdAt} >= ${soqlString(`${filters.start}T00:00:00`)}`,
    `${FIELDS.createdAt} < ${soqlString(`${addDays(filters.end, 1)}T00:00:00`)}`,
  ];
  for (const key of ["category", "status", "area", "district"] as const) {
    const value = filters[key];
    if (key !== omit && value !== null) {
      clauses.push(`${FACET_FIELD[key]} = ${soqlString(value)}`);
    }
  }
  return clauses.join(" AND ");
}

export function facetQuery(filters: DashboardFilters, facet: FacetKey): SoqlParams {
  const field = FACET_FIELD[facet];
  return {
    $select: `${field} AS value, count(*) AS n`,
    $where: buildWhere(filters, facet),
    $group: field,
    $order: "n DESC",
    $limit: "1000",
  };
}

export function dailyCountQuery(filters: DashboardFilters): SoqlParams {
  return {
    $select: `date_trunc_ymd(${FIELDS.createdAt}) AS day, count(*) AS n`,
    $where: buildWhere(filters),
    $group: "day",
    $order: "day",
    $limit: "50000",
  };
}

export function gridQuery(filters: DashboardFilters): SoqlParams {
  return {
    $select: `snap_to_grid(${FIELDS.point}, ${GRID_RESOLUTION}) AS cell, count(*) AS n`,
    $where: `${buildWhere(filters)} AND ${FIELDS.point} IS NOT NULL`,
    $group: "cell",
    $limit: "50000",
  };
}

const SAMPLE_FIELDS = [
  FIELDS.id,
  FIELDS.type,
  FIELDS.department,
  FIELDS.createdAt,
  FIELDS.method,
  FIELDS.status,
  FIELDS.address,
  FIELDS.latitude,
  FIELDS.longitude,
  FIELDS.zip,
  FIELDS.councilDistrict,
  FIELDS.precinct,
  FIELDS.area,
];

export function sampleQuery(filters: DashboardFilters, limit: number = SAMPLE_LIMIT): SoqlParams {
  return {
    $select: SAMPLE_FIELDS.join(","),
    $where: buildWhere(filters),
    // Request number breaks ties so ordering is deterministic.
    $order: `${FIELDS.createdAt} DESC, ${FIELDS.id} DESC`,
    $limit: String(limit),
  };
}

export function newestRecordQuery(): SoqlParams {
  return { $select: `max(${FIELDS.createdAt}) AS newest` };
}
