import { formatCount, formatDecimal } from "@/lib/format";

/** Below this many previous-period requests, percentages swing wildly; show the absolute change instead. */
export const MIN_PERCENT_BASE = 20;

export interface Change {
  direction: "up" | "down" | "flat";
  /** e.g. "+12.3%", "−4.0%", "+3", "No change". */
  text: string;
  /** Accessible wording, e.g. "up 12.3% from the previous period". */
  description: string;
}

const MINUS = "−";

/**
 * Describe the change from `previous` to `current`. Percent when the
 * previous count is large enough to be meaningful, absolute otherwise.
 * Returns null when there is no previous period to compare with.
 */
export function describeChange(current: number, previous: number | null | undefined): Change | null {
  if (previous === null || previous === undefined) return null;
  const diff = current - previous;
  if (diff === 0) return { direction: "flat", text: "No change", description: "unchanged from the previous period" };

  const direction = diff > 0 ? "up" : "down";
  const sign = diff > 0 ? "+" : MINUS;
  if (previous >= MIN_PERCENT_BASE) {
    const pct = formatDecimal(Math.abs(diff / previous) * 100);
    return { direction, text: `${sign}${pct}%`, description: `${direction} ${pct}% from the previous period` };
  }
  const abs = formatCount(Math.abs(diff));
  return { direction, text: `${sign}${abs}`, description: `${direction} ${abs} from the previous period` };
}

export const CHANGE_ARROW: Record<Change["direction"], string> = { up: "▲", down: "▼", flat: "■" };
