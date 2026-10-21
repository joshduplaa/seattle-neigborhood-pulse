import { formatAreaName, formatCount, formatDecimal } from "@/lib/format";
import { areaRates, classify, quantileBreaks, type AreaMeasure } from "@/lib/population";
import type { FacetBucket } from "@/lib/types";

/** Five-step one-hue sequential ramp (light → dark), shared with the density layer. */
export const CHOROPLETH_COLORS = ["#d6eef3", "#9fd3df", "#5bb2c8", "#1c8eab", "#0a6684"] as const;
/** Fill for areas excluded from the scale (low residential population in rate mode). */
export const EXCLUDED_COLOR = "#d9d6cc";

export interface AreaShade {
  area: string;
  name: string;
  population: number;
  count: number;
  rate: number;
  lowPopulation: boolean;
  /** Class index into CHOROPLETH_COLORS, or -1 when excluded from the scale. */
  cls: number;
}

export interface Shading {
  measure: AreaMeasure;
  shades: AreaShade[];
  breaks: number[];
  /** Highest value on the scale, for the legend's last class. */
  max: number;
}

/**
 * Shade every Community Reporting Area by request count or by requests per
 * 1,000 residents. In rate mode, areas below the low-population threshold are
 * excluded from the quantile scale (their rates are not comparable).
 */
export function buildShading(areaFacet: readonly FacetBucket[], measure: AreaMeasure): Shading {
  const rates = areaRates(areaFacet);
  const valueOf = (r: (typeof rates)[number]) => (measure === "rate" ? r.rate : r.count);
  const scaled = rates.filter((r) => measure === "count" || !r.lowPopulation);
  const breaks = quantileBreaks(scaled.map(valueOf), CHOROPLETH_COLORS.length);
  const max = scaled.reduce((m, r) => Math.max(m, valueOf(r)), 0);

  return {
    measure,
    breaks,
    max,
    shades: rates.map((r) => ({
      ...r,
      name: formatAreaName(r.area),
      cls: measure === "rate" && r.lowPopulation ? -1 : classify(valueOf(r), breaks),
    })),
  };
}

export function formatMeasureValue(value: number, measure: AreaMeasure): string {
  return measure === "rate" ? formatDecimal(value) : formatCount(Math.round(value));
}

/** Legend rows: one per class actually used, with its value range. */
export function legendClasses(shading: Shading): { color: string; label: string }[] {
  const { breaks, max, measure } = shading;
  const fmt = (v: number) => formatMeasureValue(v, measure);
  const bounds = [0, ...breaks];
  return bounds.map((lo, i) => {
    const hi = breaks[i];
    const color = classColor(i, bounds.length);
    return { color, label: hi === undefined ? `${fmt(lo)}–${fmt(max)}` : `${fmt(lo)}–<${fmt(hi)}` };
  });
}

/** Map a class index to a color, keeping the darkest step for the top class. */
export function classColor(cls: number, classCount: number): string {
  if (cls < 0) return EXCLUDED_COLOR;
  const offset = CHOROPLETH_COLORS.length - classCount;
  return CHOROPLETH_COLORS[Math.min(cls + offset, CHOROPLETH_COLORS.length - 1)] as string;
}
