"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { seattleToday } from "@/lib/dates";
import { defaultFilters, filtersKey, filtersToParams, parseFilters, type DashboardFilters } from "@/lib/filters";

/**
 * Filter state lives in the URL so views are shareable and survive reloads.
 * Updates are normalized through the same parser the API uses.
 */
export function useFilterState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = useMemo(() => seattleToday(), []);

  const query = searchParams.toString();
  const { filters, issues } = useMemo(() => parseFilters(new URLSearchParams(query), today), [query, today]);

  const setFilters = useCallback(
    (update: Partial<DashboardFilters>) => {
      const next = parseFilters(filtersToParams({ ...filters, ...update }), today).filters;
      if (filtersKey(next) === filtersKey(filters)) return;
      router.replace(`${pathname}?${filtersToParams(next).toString()}`, { scroll: false });
    },
    [filters, pathname, router, today],
  );

  const defaults = useMemo(() => defaultFilters(today), [today]);
  const isDefault = filtersKey(filters) === filtersKey(defaults);

  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return { filters, issues, setFilters, clearFilters, isDefault, today };
}
