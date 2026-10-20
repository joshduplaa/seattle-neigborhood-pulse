import { describe, expect, it, vi } from "vitest";

import { querySocrata, SocrataError } from "@/lib/socrata/client";

const noDelay = () => 0;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

describe("querySocrata", () => {
  it("sends the SoQL parameters and returns rows plus Last-Modified", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ n: "1" }], { headers: { "Last-Modified": "Tue, 20 Oct 2026 15:08:41 GMT" } }),
    );
    const result = await querySocrata({ $select: "count(*) AS n" }, { fetchImpl, appToken: undefined });
    expect(result).toEqual({ rows: [{ n: "1" }], lastModified: "Tue, 20 Oct 2026 15:08:41 GMT" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://data.seattle.gov/resource/5ngg-rpne.json?%24select=count%28*%29+AS+n");
    expect((init.headers as Record<string, string>)["X-App-Token"]).toBeUndefined();
  });

  it("sends an app token when configured", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    await querySocrata({}, { fetchImpl, appToken: "token123" });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-App-Token"]).toBe("token123");
  });

  it("retries rate limits and server errors, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(jsonResponse([{ ok: true }]));
    const result = await querySocrata({}, { fetchImpl, retries: 2, backoffMs: noDelay });
    expect(result.rows).toEqual([{ ok: true }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget with a typed error", async () => {
    const fetchImpl = vi.fn(async () => new Response("down", { status: 503 }));
    await expect(querySocrata({}, { fetchImpl, retries: 1, backoffMs: noDelay })).rejects.toMatchObject({
      kind: "upstream",
      status: 503,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry bad requests", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"message":"no-such-column"}', { status: 400 }));
    await expect(querySocrata({}, { fetchImpl, retries: 3, backoffMs: noDelay })).rejects.toMatchObject({
      kind: "bad_request",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies timeouts, network failures and malformed bodies", async () => {
    const timeout = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(querySocrata({}, { fetchImpl: timeout, retries: 0 })).rejects.toMatchObject({ kind: "timeout" });

    const network = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(querySocrata({}, { fetchImpl: network, retries: 0 })).rejects.toMatchObject({ kind: "network" });

    const html = vi.fn(async () => new Response("<html>", { status: 200 }));
    await expect(querySocrata({}, { fetchImpl: html, retries: 0 })).rejects.toBeInstanceOf(SocrataError);

    const object = vi.fn(async () => jsonResponse({ rows: [] }));
    await expect(querySocrata({}, { fetchImpl: object, retries: 0 })).rejects.toMatchObject({ kind: "bad_response" });
  });
});
