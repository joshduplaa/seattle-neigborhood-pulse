import { forwardRef } from "react";

import { formatLocalTimestamp } from "@/lib/dates";
import { formatAreaName, formatDepartment, formatDistrict, formatPrecinct } from "@/lib/format";
import type { ServiceRequest } from "@/lib/types";

interface RequestDetailProps {
  request: ServiceRequest | null;
  onClose: () => void;
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 text-[13px] leading-5">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className={value ? "text-ink" : "text-ink-subtle italic"}>{value ?? "Not recorded"}</dd>
    </div>
  );
}

export const RequestDetail = forwardRef<HTMLElement, RequestDetailProps>(function RequestDetail({ request, onClose }, ref) {
  return (
    <section
      ref={ref}
      aria-labelledby="request-detail-heading"
      aria-live="polite"
      tabIndex={-1}
      className={`scroll-mt-28 rounded-xl border bg-surface shadow-[0_1px_2px_rgb(19_34_44/0.04)] ${
        request ? "border-ferry/40" : "border-line"
      }`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-muted">Selected request</p>
          <h2 id="request-detail-heading" className="mt-0.5 text-[15px] font-semibold leading-6 text-ink">
            {request ? request.type : "Nothing selected"}
          </h2>
        </div>
        {request ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-[13px] text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label="Clear selected request"
          >
            Close
          </button>
        ) : null}
      </header>
      {request ? (
        <dl className="divide-y divide-line/70 px-4 py-2">
          <Row label="Reported" value={`${formatLocalTimestamp(request.createdAt)} (Seattle time)`} />
          <Row label="Current status" value={request.status} />
          <Row label="Address" value={request.address} />
          <Row label="Neighborhood" value={request.area ? formatAreaName(request.area) : null} />
          <Row label="Council district" value={request.councilDistrict ? formatDistrict(request.councilDistrict) : null} />
          <Row label="ZIP code" value={request.zip} />
          <Row label="Police precinct" value={formatPrecinct(request.precinct)} />
          <Row label="Department" value={formatDepartment(request.department)} />
          <Row label="Received via" value={request.method} />
          <Row label="Request number" value={request.id} />
          {!request.coordinates ? (
            <p className="py-2 text-[13px] text-ink-subtle">This request has no usable coordinates, so it is not shown on the map.</p>
          ) : null}
        </dl>
      ) : (
        <p className="px-4 py-4 text-[13px] leading-5 text-ink-subtle">
          Select a marker on the map or a request from the list to see its details.
        </p>
      )}
    </section>
  );
});
