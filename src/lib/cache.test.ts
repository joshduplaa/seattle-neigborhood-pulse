import { describe, expect, it, vi } from "vitest";

import { createTtlCache } from "@/lib/cache";

describe("createTtlCache", () => {
  it("reuses values until they expire", async () => {
    let t = 0;
    const cache = createTtlCache<number>({ ttlMs: 100, maxEntries: 10, now: () => t });
    const load = vi.fn(async () => t);

    expect(await cache.get("a", load)).toBe(0);
    t = 50;
    expect(await cache.get("a", load)).toBe(0);
    expect(load).toHaveBeenCalledTimes(1);

    t = 150;
    expect(await cache.get("a", load)).toBe(150);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight load between concurrent callers", async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    let resolve: (v: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));

    const a = cache.get("k", load);
    const b = cache.get("k", load);
    resolve("done");
    expect(await Promise.all([a, b])).toEqual(["done", "done"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures and preserves the error", async () => {
    class CustomError extends Error {}
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 10 });
    await expect(cache.get("k", () => Promise.reject(new CustomError("nope")))).rejects.toBeInstanceOf(CustomError);
    expect(cache.size).toBe(0);
    expect(await cache.get("k", async () => "ok")).toBe("ok");
  });

  it("evicts the least recently used entry beyond capacity", async () => {
    const cache = createTtlCache<string>({ ttlMs: 1000, maxEntries: 2 });
    await cache.get("a", async () => "a");
    await cache.get("b", async () => "b");
    await cache.get("a", async () => "a2"); // touch a
    await cache.get("c", async () => "c"); // evicts b
    const load = vi.fn(async () => "b2");
    expect(await cache.get("b", load)).toBe("b2");
    expect(load).toHaveBeenCalledTimes(1);
    // Re-adding b evicted a (now the oldest); c is still cached.
    expect(await cache.get("c", async () => "unused")).toBe("c");
    expect(cache.size).toBe(2);
  });
});
