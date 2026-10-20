"use client";

import { useCallback, useEffect, useState } from "react";

import { filtersKey, type DashboardFilters } from "@/lib/filters";
import type { ApiErrorBody, DashboardResponse } from "@/lib/types";

interface Loaded {
  key: string;
  data: DashboardResponse;
}

interface Failed {
  key: string;
  message: string;
}

export interface DashboardState {
  /** Latest successful response; may belong to a previous filter state while loading. */
  data: DashboardResponse | null;
  /** True while the data for the current filters is still being fetched. */
  loading: boolean;
  /** Error for the current filters, if the last attempt failed. */
  error: string | null;
  /** True when `data` was loaded for the current filters. */
  isCurrent: boolean;
  retry: () => void;
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === "object" && value !== null && "error" in value;
}

/** Fetch `/api/dashboard` for the given filters, aborting superseded requests. */
export function useDashboardData(filters: DashboardFilters): DashboardState {
  const key = filtersKey(filters);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`/api/dashboard?${key}`, { signal: controller.signal });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message = isErrorBody(body) ? body.error.message : `The dashboard service returned HTTP ${res.status}.`;
          setFailed({ key, message });
          return;
        }
        setLoaded({ key, data: body as DashboardResponse });
        setFailed(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn("Dashboard request failed", err);
        setFailed({ key, message: "Could not reach the dashboard service. Check your connection and try again." });
      }
    })();

    return () => controller.abort();
  }, [key, attempt]);

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
