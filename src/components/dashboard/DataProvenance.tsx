import { formatInstantInSeattle, formatLocalTimestamp } from "@/lib/dates";
import { formatCount } from "@/lib/format";
import {
  DATASET_API_DOCS_URL,
  DATASET_ID,
  DATASET_NAME,
  DATASET_PAGE_URL,
  DATASET_PUBLISHER,
  RESOURCE_URL,
} from "@/lib/socrata/config";
import type { DashboardData } from "@/lib/types";

/** One-line freshness indicator shown under the page title. */
export function FreshnessLine({ data, unavailable = false }: { data: DashboardData | null; unavailable?: boolean }) {
  return (
    <p className="text-[13px] leading-5 text-ink-subtle">
      Source:{" "}
      <a href={DATASET_PAGE_URL} className="font-medium text-sound-strong underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
        {DATASET_PUBLISHER} · {DATASET_NAME}
      </a>
      {data ? (
        <>
          {" · "}
          {data.sourceUpdatedAt ? <>Source updated {formatInstantInSeattle(data.sourceUpdatedAt)} · </> : null}
          Retrieved {formatInstantInSeattle(data.retrievedAt)}
        </>
      ) : unavailable ? (
        " · Data currently unavailable"
      ) : (
        " · Loading latest data…"
      )}
    </p>
  );
}

export function DataProvenance({ data }: { data: DashboardData | null }) {
  return (
    <section id="about" aria-labelledby="about-heading" className="scroll-mt-28 rounded-xl border border-line bg-surface-muted px-4 py-5 sm:px-6">
      <h2 id="about-heading" className="font-display text-xl font-semibold text-ink">
        About this data
      </h2>
      <div className="mt-3 grid gap-6 text-[13px] leading-6 text-ink-muted lg:grid-cols-2">
        <div className="space-y-3">
          <p>
            Every figure on this page comes from the City of Seattle&apos;s{" "}
            <a href={DATASET_PAGE_URL} target="_blank" rel="noreferrer" className="font-medium text-sound-strong underline underline-offset-2">
              {DATASET_NAME}
            </a>{" "}
            dataset (ID <code className="rounded bg-surface px-1 py-0.5 text-[12px]">{DATASET_ID}</code>): requests submitted through the
            Find It, Fix It app, the Customer Service Request web portal, phone, email and other channels, for request types that are or
            were available to the public. It is queried live through the{" "}
            <a href={DATASET_API_DOCS_URL} target="_blank" rel="noreferrer" className="font-medium text-sound-strong underline underline-offset-2">
              Socrata Open Data API
            </a>{" "}
            and cached on this server for up to 15 minutes.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-ink-subtle">Endpoint</dt>
            <dd className="break-all font-mono text-[12px]">{RESOURCE_URL}</dd>
            {data?.sourceUpdatedAt ? (
              <>
                <dt className="text-ink-subtle">Source updated</dt>
                <dd>{formatInstantInSeattle(data.sourceUpdatedAt)}</dd>
              </>
            ) : null}
            {data?.newestRecordAt ? (
              <>
                <dt className="text-ink-subtle">Newest request</dt>
                <dd>{formatLocalTimestamp(data.newestRecordAt)} (Seattle time)</dd>
              </>
            ) : null}
            {data ? (
              <>
                <dt className="text-ink-subtle">Retrieved</dt>
                <dd>{formatInstantInSeattle(data.retrievedAt)}</dd>
              </>
            ) : null}
          </dl>
        </div>
        <div>
          <h3 className="font-semibold text-ink">How to read it</h3>
          <ul className="mt-1 list-disc space-y-1.5 pl-5">
            <li>
              <strong className="font-medium text-ink">Counts, trends, breakdowns and the density layer</strong> are aggregates computed by the
              City&apos;s API over <em>every</em> request matching your filters.
            </li>
            <li>
              <strong className="font-medium text-ink">Map markers and the recent list</strong> show only the newest{" "}
              {formatCount(data?.sample.limit ?? 2000)} matching requests, so they are a sample, not the full picture.
            </li>
            <li>
              Dates are when a request was <em>created</em>, in Seattle time. The main dataset has no resolution timestamp, so its status is
              the current status only. Response times come from a separate City tracking dataset that covers just five request types.
            </li>
            <li>
              A request is one report, not one problem: several residents can report the same issue, and statuses such as &ldquo;Duplicate&rdquo;
              mark some of these.
            </li>
            <li>
              Neighborhoods are the City&apos;s Community Reporting Areas. ZIP codes, council districts and neighborhoods are different
              boundaries and are never mixed. Area counts are not adjusted for population.
            </li>
            <li>Requests without valid Seattle coordinates are counted but not mapped; no location is ever guessed.</li>
            <li>
              For privacy, encampment reports never show an address or exact point. They still count in every total, chart, neighborhood
              shade and the density layer (~550 m cells).
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
