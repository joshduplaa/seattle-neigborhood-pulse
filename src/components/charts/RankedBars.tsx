import type { RankedBucket } from "@/lib/aggregate";
import { formatCount, formatPercent } from "@/lib/format";

interface RankedBarsProps {
  items: RankedBucket[];
  /** Currently selected filter value for this dimension, if any. */
  selected: string | null;
  /** Toggle a value as a filter. Omit to render read-only bars. */
  onSelect?: (value: string | null) => void;
  /** Accessible name for the list, e.g. "Requests by type". */
  label: string;
  /** Noun for the action, e.g. "request type". */
  noun: string;
}

/**
 * Horizontal ranked bars as semantic HTML. Each row is a button that toggles
 * the corresponding filter, so the chart doubles as a keyboard-friendly
 * control and long Seattle place/category names can wrap on small screens.
 * Bar length is relative to the largest bucket; the share column is of the
 * whole scope.
 */
export function RankedBars({ items, selected, onSelect, label, noun }: RankedBarsProps) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const hasSelection = selected !== null;

  return (
    <ul aria-label={label} className="flex flex-col gap-1">
      {items.map((item) => {
        const isSelected = !item.other && hasSelection && item.value === selected;
        const interactive = Boolean(onSelect) && !item.other && item.value !== null;
        const dim = hasSelection && !isSelected;
        const width = `${Math.max((item.count / max) * 100, item.count > 0 ? 1.5 : 0)}%`;

        const content = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className={`min-w-0 text-[13px] leading-5 ${isSelected ? "font-semibold text-ink" : "text-ink"} ${item.other ? "text-ink-subtle" : ""}`}>
                {item.label}
              </span>
              <span className="shrink-0 text-[13px] leading-5 tabular-nums text-ink-muted">
                {formatCount(item.count)}
                <span className="ml-1.5 inline-block w-12 text-right text-ink-subtle">{formatPercent(item.share)}</span>
              </span>
            </span>
            <span aria-hidden className="mt-1 block h-2 w-full rounded-full bg-surface-muted">
              <span
                className={`block h-2 rounded-r-[4px] rounded-l-[2px] transition-[width] duration-300 ${
                  item.other ? "bg-line-strong" : dim ? "bg-sound-muted" : "bg-sound"
                }`}
                style={{ width }}
              />
            </span>
          </>
        );

        return (
          <li key={item.key}>
            {interactive ? (
              <button
                type="button"
                onClick={() => onSelect?.(isSelected ? null : item.value)}
                aria-pressed={isSelected}
                title={isSelected ? `Remove ${noun} filter` : `Filter to ${item.label}`}
                className={`block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sound-soft/60 ${
                  isSelected ? "bg-sound-soft" : ""
                }`}
              >
                {content}
              </button>
            ) : (
              <div className="px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
