import { formatLongDate, formatShortDate } from "@/lib/dates";
import type { Comparison, EquityWindow, QuintileResult } from "@/lib/equity";
import { formatDecimal } from "@/lib/format";

const MINUS = "−";

/** Percentage points with an explicit sign, e.g. "+6.0" or "−0.7". */
export function formatPoints(share: number): string {
  const v = share * 100;
  const text = formatDecimal(Math.abs(v));
  return Number(text) === 0 ? "0.0" : `${v > 0 ? "+" : MINUS}${text}`;
}

/** A difference counts as clear only when its 95% interval excludes zero. */
export function isClear(c: Comparison): boolean {
  return Math.abs(c.difference) > c.margin;
}

export function describeComparison(c: Comparison, horizon: number): string {
  const pts = formatDecimal(Math.abs(c.difference) * 100);
  if (!isClear(c)) return `about as often as their request mix predicts (within the ±${formatDecimal(c.margin * 100)}-point margin)`;
  return `${pts} points ${c.difference > 0 ? "more" : "less"} often within ${horizon} days than their request mix predicts`;
}

/** One-sentence summary comparing the highest- and lowest-priority quintiles. */
export function equityHeadline(quintiles: QuintileResult[], horizon: 7 | 30): string {
  const key = horizon === 7 ? "h7" : "h30";
  const high = quintiles.find((q) => q.quintile === 1);
  const low = quintiles.find((q) => q.quintile === 5);
  if (!high || !low || high.requests === 0 || low.requests === 0) return "Not enough requests to compare equity groups.";
  return (
    `Requests in the highest-equity-priority tracts were closed ${describeComparison(high[key], horizon)}; ` +
    `in the lowest-priority tracts, ${describeComparison(low[key], horizon)}.`
  );
}

export function equityWindowText(w: EquityWindow | null): string {
  if (!w) return "No tracked requests in this range have had 30 days to close yet.";
  const range = `${formatShortDate(w.start)} – ${formatLongDate(w.end)}`;
  const notes: string[] = [];
  if (w.shifted) notes.push("your range is too recent to judge, so it uses the latest period whose requests have all had 30 days to close");
  if (w.extended) notes.push("lengthened to 90 days so each group has enough requests");
  if (w.capped) notes.push("limited to the most recent year of your range");
  return `Requests created ${range}${notes.length ? ` (${notes.join("; ")})` : ""}.`;
}
