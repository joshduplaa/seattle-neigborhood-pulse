"use client";

import { useState } from "react";

import { EmptyState, Panel, Skeleton } from "@/components/ui/Panel";
import { formatLocalTimestamp } from "@/lib/dates";
import { formatAreaName, formatCount } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

const PAGE = 15;

interface RecentRequestsProps {
  data: DashboardData | null;
  loading: boolean;
  selectedId: string | null;
  onChoose: (id: string) => void;
  onClearFilters: () => void;
  canClear: boolean;
}

export function RecentRequests({ data, loading, selectedId, onChoose, onClearFilters, canClear }: RecentRequestsProps) {
  // Reset paging when the result set changes (keyed by the request that heads the list).
  const resetKey = data ? `${data.retrievedAt}|${data.sample.requests[0]?.id ?? ""}` : "";
  const [paging, setPaging] = useState({ key: resetKey, visible: PAGE });
  const visible = paging.key === resetKey ? paging.visible : PAGE;

  const requests = data?.sample.requests ?? [];
  const shown = requests.slice(0, visible);
  const total = data?.totals.matching ?? 0;

  const description = data
    ? requests.length < total
      ? `Newest ${formatCount(requests.length)} of ${formatCount(total)} matching requests, newest first.`
      : `All ${formatCount(total)} matching requests, newest first.`
    : "Newest matching requests first.";

  return (
    <Panel id="recent" title="Recent requests" description={description} bodyClassName="px-2 py-2">
      {!data ? (
        <ul className="flex flex-col gap-2 p-2" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-1.5 h-3 w-1/2" />
            </li>
          ))}
        </ul>
      ) : requests.length === 0 ? (
        <EmptyState title="No requests match these filters">
          {canClear ? (
            <button type="button" onClick={onClearFilters} className="font-medium text-sound-strong underline underline-offset-2">
              Clear filters
            </button>
          ) : (
            "Try a longer date range."
          )}
        </EmptyState>
      ) : (
        <>
          <ul className={`flex flex-col transition-opacity ${loading ? "opacity-60" : ""}`}>
            {shown.map((r) => {
              const selected = r.id === selectedId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onChoose(r.id)}
                    aria-current={selected ? "true" : undefined}
                    className={`grid w-full grid-cols-[auto_1fr] gap-x-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-muted ${
                      selected ? "bg-ferry-soft hover:bg-ferry-soft" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 size-2.5 rounded-full ${
                        selected ? "bg-ferry" : r.coordinates ? "bg-sound" : "border border-ink-subtle bg-transparent"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium leading-5 text-ink">{r.type}</span>
                      <span className="block text-xs leading-5 text-ink-subtle">
                        {formatLocalTimestamp(r.createdAt)}
                        {" · "}
                        {r.area ? formatAreaName(r.area) : r.address ?? "Location not recorded"}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {r.status ? (
                          <span className="rounded border border-line px-1.5 text-[11px] leading-4 text-ink-muted">{r.status}</span>
                        ) : null}
                        {!r.coordinates ? (
                          <span className="rounded border border-dashed border-line-strong px-1.5 text-[11px] leading-4 text-ink-subtle">
                            No map location
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {visible < requests.length ? (
            <div className="border-t border-line px-2 pb-1 pt-2">
              <button
                type="button"
                onClick={() => setPaging({ key: resetKey, visible: visible + PAGE })}
                className="h-9 w-full rounded-md text-sm font-medium text-sound-strong hover:bg-sound-soft"
              >
                Show {Math.min(PAGE, requests.length - visible)} more
                <span className="text-ink-subtle"> · {formatCount(visible)} of {formatCount(requests.length)} shown</span>
              </button>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
