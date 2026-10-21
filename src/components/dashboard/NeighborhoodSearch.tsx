"use client";

import { useId, useMemo, useRef, useState } from "react";

import { formatCount } from "@/lib/format";
import { neighborhoodName, searchNeighborhoods } from "@/lib/neighborhoodSearch";
import type { FacetBucket } from "@/lib/types";

interface NeighborhoodSearchProps {
  /** Selected area (upper-case CRA value) or null for all neighborhoods. */
  value: string | null;
  /** Area facet counts, shown beside each option; null while loading. */
  counts: FacetBucket[] | null;
  onChange: (area: string | null) => void;
  disabled?: boolean;
}

/**
 * Type-ahead neighborhood picker (ARIA 1.2 combobox with a listbox popup).
 * Matches area names and the smaller places listed inside each area.
 */
export function NeighborhoodSearch({ value, counts, onChange, disabled = false }: NeighborhoodSearchProps) {
  const inputId = useId();
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null); // null = not editing
  const [active, setActive] = useState(0);

  const selectedName = value ? (neighborhoodName(value) ?? value) : "";
  const text = query ?? selectedName;
  const results = useMemo(() => searchNeighborhoods(query ?? ""), [query]);
  const countOf = useMemo(() => new Map((counts ?? []).map((b) => [b.value, b.count])), [counts]);

  const close = () => {
    setOpen(false);
    setQuery(null);
    setActive(0);
  };

  const choose = (area: string) => {
    onChange(area);
    close();
  };

  const move = (delta: number) => {
    if (!open) setOpen(true);
    if (results.length === 0) return;
    const next = (active + delta + results.length) % results.length;
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      const pick = results[active];
      if (pick) choose(pick.area);
    } else if (e.key === "Escape") {
      if (open || query !== null) {
        e.preventDefault();
        close();
      }
    }
  };

  const activeId = open && results[active] ? `${listId}-opt-${active}` : undefined;

  return (
    <div className="relative flex min-w-0 flex-col gap-1">
      <label htmlFor={inputId} className="text-xs font-medium text-ink-muted">
        Neighborhood
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder="All neighborhoods (type to search)"
          value={text}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={(e) => {
            e.target.select();
            setOpen(true);
          }}
          onBlur={close}
          onKeyDown={onKeyDown}
          className="h-9 w-full min-w-0 rounded-md border border-line-strong bg-surface pl-2.5 pr-8 text-sm text-ink placeholder:text-ink-subtle hover:border-ink-subtle disabled:cursor-not-allowed disabled:opacity-60"
        />
        {value && !disabled ? (
          <button
            type="button"
            aria-label={`Clear neighborhood filter (${selectedName})`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(null);
              close();
            }}
            className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-ink-subtle hover:bg-surface-muted hover:text-ink"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Neighborhoods"
        hidden={!open}
        className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg"
      >
        {results.length === 0 ? (
          <li role="option" aria-selected={false} aria-disabled className="px-3 py-2 text-sm text-ink-subtle">
            No Seattle neighborhood matches “{query}”
          </li>
        ) : (
          results.map((r, i) => {
            const count = countOf.get(r.area);
            return (
              <li
                key={r.area}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={r.area === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r.area)}
                onMouseMove={() => setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm ${
                  i === active ? "bg-sound-soft" : ""
                } ${r.area === value ? "font-medium" : ""}`}
              >
                <span className="min-w-0">
                  <span className="text-ink">{r.name}</span>
                  {r.matchedAlias ? <span className="ml-1.5 text-xs text-ink-subtle">includes {r.matchedAlias}</span> : null}
                </span>
                {count !== undefined ? <span className="shrink-0 text-xs tabular-nums text-ink-subtle">{formatCount(count)}</span> : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
