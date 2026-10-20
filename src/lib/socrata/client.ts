import { REQUEST_TIMEOUT_MS, RESOURCE_URL } from "@/lib/socrata/config";
import type { SoqlParams } from "@/lib/socrata/soql";

export type SocrataErrorKind = "timeout" | "rate_limited" | "upstream" | "bad_request" | "bad_response" | "network";

export class SocrataError extends Error {
  readonly kind: SocrataErrorKind;
  readonly status: number | null;

  constructor(kind: SocrataErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "SocrataError";
    this.kind = kind;
    this.status = status;
  }
}

export interface SoqlResult {
  rows: unknown[];
  /** Value of the `Last-Modified` response header, if present. */
  lastModified: string | null;
}

export interface QueryOptions {
  timeoutMs?: number;
  /** Extra attempts after the first for retryable failures. */
  retries?: number;
  fetchImpl?: typeof fetch;
  appToken?: string | undefined;
  /** Delay before retry `n` (1-based), in ms. */
  backoffMs?: (attempt: number) => number;
}

const RETRYABLE: ReadonlySet<SocrataErrorKind> = new Set(["timeout", "rate_limited", "upstream", "network"]);

function classifyStatus(status: number): SocrataErrorKind {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  return "bad_request";
}

async function attempt(params: SoqlParams, opts: Required<Omit<QueryOptions, "appToken">> & { appToken?: string }): Promise<SoqlResult> {
  const url = `${RESOURCE_URL}?${new URLSearchParams(params).toString()}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  // App tokens are optional; they raise Socrata's throttling limits.
  if (opts.appToken) headers["X-App-Token"] = opts.appToken;

  let response: Response;
  try {
    response = await opts.fetchImpl(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs), cache: "no-store" });
  } catch (err) {
    // DOMException is not an Error subclass in every runtime; check the name.
    const name = typeof err === "object" && err !== null && "name" in err ? String(err.name) : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new SocrataError("timeout", `Seattle Open Data did not respond within ${opts.timeoutMs / 1000}s.`);
    }
    throw new SocrataError("network", "Could not reach Seattle Open Data.");
  }

  if (!response.ok) {
    // Socrata error bodies are JSON with a `message`; keep it short for logs.
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 200);
    } catch {
      // ignore unreadable body
    }
    throw new SocrataError(classifyStatus(response.status), `Seattle Open Data returned HTTP ${response.status}. ${detail}`.trim(), response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SocrataError("bad_response", "Seattle Open Data returned a response that was not valid JSON.", response.status);
  }
  if (!Array.isArray(body)) {
    throw new SocrataError("bad_response", "Seattle Open Data returned an unexpected response shape.", response.status);
  }
  return { rows: body, lastModified: response.headers.get("last-modified") };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Run one SoQL query against the dataset, retrying transient failures. */
export async function querySocrata(params: SoqlParams, options: QueryOptions = {}): Promise<SoqlResult> {
  const opts = {
    timeoutMs: options.timeoutMs ?? REQUEST_TIMEOUT_MS,
    retries: options.retries ?? 1,
    fetchImpl: options.fetchImpl ?? fetch,
    appToken: options.appToken ?? process.env.SOCRATA_APP_TOKEN,
    backoffMs: options.backoffMs ?? ((n: number) => 400 * 2 ** (n - 1)),
  };

  for (let n = 0; ; n++) {
    try {
      return await attempt(params, opts);
    } catch (err) {
      const retryable = err instanceof SocrataError && RETRYABLE.has(err.kind);
      if (!retryable || n >= opts.retries) throw err;
      await sleep(opts.backoffMs(n + 1));
    }
  }
}
