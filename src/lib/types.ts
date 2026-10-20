import type { DashboardFilters } from "@/lib/filters";

export interface Coordinates {
  lat: number;
  lon: number;
}

/** A single service request after validation and normalization. */
export interface ServiceRequest {
  id: string;
  type: string;
  department: string | null;
  /** Floating local timestamp, `YYYY-MM-DDTHH:mm:ss` (Seattle time). */
  createdAt: string;
  status: string | null;
  method: string | null;
  address: string | null;
  /** `null` when the source has no coordinates or they fall outside Seattle. */
  coordinates: Coordinates | null;
  zip: string | null;
  councilDistrict: string | null;
  precinct: string | null;
  /** Community Reporting Area name as published (upper case). */
  area: string | null;
}

/** Count of matching requests for one value of a field. `value: null` = blank in source. */
export interface FacetBucket {
  value: string | null;
  count: number;
}

export type Granularity = "day" | "week" | "month";

export interface TimeSeriesPoint {
  /** First calendar day of the bucket. */
  bucket: string;
  /** Last calendar day of the bucket that falls inside the selected range. */
  bucketEnd: string;
  count: number;
  /** Number of days of this bucket inside the selected range. */
  days: number;
  /** True when the bucket is cut short by the selected range. */
  partial: boolean;
}

export interface GridCell {
  lat: number;
  lon: number;
  count: number;
}

export interface DashboardData {
  filters: DashboardFilters;
  /** ISO instant this response was assembled from upstream queries. */
  retrievedAt: string;
  /** `Last-Modified` reported by the source API, ISO instant, if available. */
  sourceUpdatedAt: string | null;
  /** Newest `createddate` in the whole dataset (floating local timestamp). */
  newestRecordAt: string | null;
  totals: {
    /** Requests matching every filter (aggregate count over full dataset). */
    matching: number;
    /** Matching requests with valid Seattle coordinates (from the density grid). */
    geolocated: number;
    /** Matching requests with no Community Reporting Area recorded. */
    withoutArea: number;
  };
  /**
   * Facet counts. Each facet applies every filter *except its own*, so the
   * selected value can be shown in the context of the alternatives.
   */
  facets: Record<"category" | "status" | "area" | "district", FacetBucket[]>;
  series: {
    granularity: Granularity;
    points: TimeSeriesPoint[];
  };
  grid: {
    resolution: number;
    cells: GridCell[];
  };
  sample: {
    /** Maximum number of requests requested from the source. */
    limit: number;
    /** Most recent matching requests, newest first. */
    requests: ServiceRequest[];
    /** Rows dropped during validation (e.g. missing id or unparseable date). */
    rejected: number;
  };
}

/** Body of a successful `GET /api/dashboard`. */
export interface DashboardResponse extends DashboardData {
  /** Corrections applied to the requested filters (e.g. an invalid date). */
  issues: string[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
