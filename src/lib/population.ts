import populationData from "@/data/cra-population.json";

import type { FacetBucket } from "@/lib/types";

/**
 * 2020 Census population by Community Reporting Area, from the City's
 * redistricting layer (see scripts/fetch-cra-data.mjs). Keys match the
 * upper-case `community_reporting_area` values in the requests dataset.
 */
export const CRA_POPULATION: Readonly<Record<string, number>> = populationData.areas;
export const POPULATION_SOURCE = populationData.meta;

/**
 * Below this many residents a per-capita rate is dominated by non-residential
 * activity (industrial and commercial districts such as Georgetown or SODO),
 * so those areas are listed separately instead of ranked.
 */
export const LOW_POPULATION_THRESHOLD = 5000;

export type AreaMeasure = "count" | "rate";

export interface AreaRate {
  area: string;
  count: number;
  population: number;
  /** Requests per 1,000 residents in the selected period. */
  rate: number;
  lowPopulation: boolean;
}

export function populationOf(area: string): number | null {
  return CRA_POPULATION[area] ?? null;
}

export function ratePer1000(count: number, population: number): number {
  return population > 0 ? (count / population) * 1000 : 0;
}

/**
 * Per-1,000-resident rates for every area with a known population, including
 * areas with zero matching requests. Sorted by rate, highest first.
 */
export function areaRates(facet: readonly FacetBucket[]): AreaRate[] {
  const counts = new Map(facet.filter((b) => b.value !== null).map((b) => [b.value as string, b.count]));
  return Object.entries(CRA_POPULATION)
    .map(([area, population]) => {
      const count = counts.get(area) ?? 0;
      return { area, count, population, rate: ratePer1000(count, population), lowPopulation: population < LOW_POPULATION_THRESHOLD };
    })
    .sort((a, b) => b.rate - a.rate || a.area.localeCompare(b.area));
}

/**
 * Quantile class breaks for a choropleth: returns up to `classes - 1`
 * ascending, de-duplicated thresholds. A value v belongs to class i where
 * i = number of breaks <= v.
 */
export function quantileBreaks(values: readonly number[], classes: number): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0 || classes < 2) return [];
  const breaks: number[] = [];
  for (let i = 1; i < classes; i++) {
    const idx = Math.min(sorted.length - 1, Math.floor((i * sorted.length) / classes));
    const v = sorted[idx] as number;
    if (v > (breaks[breaks.length - 1] ?? -Infinity) && v > (sorted[0] as number)) breaks.push(v);
  }
  return breaks;
}

export function classify(value: number, breaks: readonly number[]): number {
  let cls = 0;
  for (const b of breaks) if (value >= b) cls++;
  return cls;
}
