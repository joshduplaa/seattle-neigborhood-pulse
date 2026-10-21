import { z } from "zod";

import { LOCATION_WITHHELD_TYPES, SEATTLE_BOUNDS } from "@/lib/socrata/config";
import type { Coordinates, FacetBucket, GridCell, ServiceRequest } from "@/lib/types";

/**
 * Validation and normalization of raw SODA rows. SODA 2 serializes every
 * value as a string (numbers included) and omits keys whose value is null,
 * so every field is optional here and parsed explicitly.
 */

const optionalText = z.string().optional();
const numeric = z.union([z.string(), z.number()]);

const rawRequestSchema = z.object({
  servicerequestnumber: optionalText,
  webintakeservicerequests: optionalText,
  departmentname: optionalText,
  createddate: optionalText,
  methodreceivedname: optionalText,
  servicerequeststatusname: optionalText,
  location: optionalText,
  latitude: numeric.optional(),
  longitude: numeric.optional(),
  zipcode: optionalText,
  councildistrict: optionalText,
  policeprecinct: optionalText,
  community_reporting_area: optionalText,
});

const countRowSchema = z.object({ value: z.string().optional(), n: numeric });
const dailyRowSchema = z.object({ day: z.string(), n: numeric });
const gridRowSchema = z.object({
  cell: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
  n: numeric,
});

const FLOATING_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?$/;

function text(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toCount(value: string | number): number | null {
  const n = toNumber(value);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
}

/** Normalize a floating timestamp to `YYYY-MM-DDTHH:mm:ss`, or null if invalid. */
export function parseFloatingTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const m = FLOATING_TIMESTAMP.exec(value.trim());
  if (!m) return null;
  const [datePart, timePart] = [m[1] as string, m[2] as string];
  const parsed = new Date(`${datePart}T${timePart}Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== datePart) return null;
  return `${datePart}T${timePart}`;
}

export function isWithinSeattle(lat: number, lon: number): boolean {
  return (
    lat >= SEATTLE_BOUNDS.minLat &&
    lat <= SEATTLE_BOUNDS.maxLat &&
    lon >= SEATTLE_BOUNDS.minLon &&
    lon <= SEATTLE_BOUNDS.maxLon
  );
}

export function parseCoordinates(lat: string | number | undefined, lon: string | number | undefined): Coordinates | null {
  const la = toNumber(lat);
  const lo = toNumber(lon);
  if (la === null || lo === null) return null;
  return isWithinSeattle(la, lo) ? { lat: la, lon: lo } : null;
}

/** Normalize one raw row. Returns null when the row lacks an id or a valid created date. */
export function normalizeRequest(raw: unknown): ServiceRequest | null {
  const parsed = rawRequestSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;

  const id = text(r.servicerequestnumber);
  const createdAt = parseFloatingTimestamp(r.createddate);
  if (id === null || createdAt === null) return null;

  const type = text(r.webintakeservicerequests) ?? "Unspecified request type";
  // Privacy: drop the exact location server-side for sensitive types; the
  // neighborhood, district and ZIP remain.
  const withheld = LOCATION_WITHHELD_TYPES.has(type);

  return {
    id,
    type,
    department: text(r.departmentname),
    createdAt,
    status: text(r.servicerequeststatusname),
    method: text(r.methodreceivedname),
    address: withheld ? null : text(r.location),
    coordinates: withheld ? null : parseCoordinates(r.latitude, r.longitude),
    locationWithheld: withheld,
    zip: text(r.zipcode),
    councilDistrict: text(r.councildistrict),
    precinct: text(r.policeprecinct),
    area: text(r.community_reporting_area),
  };
}

export function normalizeRequests(rows: unknown[]): { requests: ServiceRequest[]; rejected: number } {
  const requests: ServiceRequest[] = [];
  for (const row of rows) {
    const r = normalizeRequest(row);
    if (r) requests.push(r);
  }
  return { requests, rejected: rows.length - requests.length };
}

/** Normalize `value, n` group-by rows. Blank values collapse into one `null` bucket. */
export function normalizeFacet(rows: unknown[]): FacetBucket[] {
  const counts = new Map<string | null, number>();
  for (const row of rows) {
    const parsed = countRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const n = toCount(parsed.data.n);
    if (n === null) continue;
    const value = text(parsed.data.value);
    counts.set(value, (counts.get(value) ?? 0) + n);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

/** Normalize `day, n` rows into a map of `YYYY-MM-DD` → count. */
export function normalizeDailyCounts(rows: unknown[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const parsed = dailyRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const ts = parseFloatingTimestamp(parsed.data.day);
    const n = toCount(parsed.data.n);
    if (ts === null || n === null) continue;
    const day = ts.slice(0, 10);
    out.set(day, (out.get(day) ?? 0) + n);
  }
  return out;
}

/** Normalize `snap_to_grid` rows; cells outside Seattle are dropped. */
export function normalizeGrid(rows: unknown[]): GridCell[] {
  const cells: GridCell[] = [];
  for (const row of rows) {
    const parsed = gridRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const [lon, lat] = parsed.data.cell.coordinates;
    const n = toCount(parsed.data.n);
    if (n === null || n === 0 || !isWithinSeattle(lat, lon)) continue;
    cells.push({ lat, lon, count: n });
  }
  return cells;
}

export function normalizeNewest(rows: unknown[]): string | null {
  const first = rows[0];
  if (typeof first !== "object" || first === null || !("newest" in first)) return null;
  const value = (first as { newest: unknown }).newest;
  return typeof value === "string" ? parseFloatingTimestamp(value) : null;
}

/** Convert an HTTP date header to an ISO instant. */
export function parseHttpDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
