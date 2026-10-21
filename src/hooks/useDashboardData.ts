"use client";

import { useCallback, useEffect, useState } from "react";

import { filtersKey, type DashboardFilters } from "@/lib/filters";
import type { EquityData } from "@/lib/equity";
import type { ResolutionData } from "@/lib/resolution";
import type { ApiErrorBody, DashboardResponse } from "@/lib/types";

interface Loaded<T> {
  key: string;
  data: T;
}

interface Failed {
  key: string;
  message: string;
}

export interface ApiState<T> {
  /** Latest successful response; may belong to a previous key while loading. */
  data: T | null;
  /** True while the data for the current key is still being fetched. */
  loading: boolean;
  /** Error for the current key, if the last attempt failed. */
  error: string | null;
  /** True when `data` was loaded for the current key. */
  isCurrent: boolean;
  retry: () => void;
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === "object" && value !== null && "error" in value;
}

/** GET `${path}?${key}`, keeping the last good data and aborting superseded requests. */
export function useApi<T>(path: string, key: string): ApiState<T> {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${path}?${key}`, { signal: controller.signal });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message = isErrorBody(body) ? body.error.message : `The service returned HTTP ${res.status}.`;
          setFailed({ key, message });
          return;
        }
        setLoaded({ key, data: body as T });
        setFailed(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn(`Request to ${path} failed`, err);
        setFailed({ key, message: "Could not reach the dashboard service. Check your connection and try again." });
      }
    })();

    return () => controller.abort();
  }, [path, key, attempt]);

  const retry = useCallback(() => {
    setFailed(null);
    setAttempt((n) => n + 1);
  }, []);

  const isCurrent = loaded?.key === key;
  const error = failed?.key === key ? failed.message : null;

  return {
    data: loaded?.data ?? null,
    loading: !isCurrent && error === null,
    error,
    isCurrent,
    retry,
  };
}

export type DashboardState = ApiState<DashboardResponse>;

export function useDashboardData(filters: DashboardFilters): DashboardState {
  return useApi<DashboardResponse>("/api/dashboard", filtersKey(filters));
}

/** Equity-of-response analysis; like response times, only the date range applies. */
export function useEquityData(filters: Pick<DashboardFilters, "start" | "end">): ApiState<EquityData> {
  return useApi<EquityData>("/api/equity", new URLSearchParams({ start: filters.start, end: filters.end }).toString());
}

/** Resolution stats depend only on the date range. */
export function useResolutionData(filters: Pick<DashboardFilters, "start" | "end">): ApiState<ResolutionData> {
  return useApi<ResolutionData>("/api/resolution", new URLSearchParams({ start: filters.start, end: filters.end }).toString());
}
