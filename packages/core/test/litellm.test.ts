import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPricingTable, parseLitellmTable } from "../src/pricing/litellm.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const litellmEntry = {
  input_cost_per_token: 0.00001,
  output_cost_per_token: 0.00005,
  cache_read_input_token_cost: 0.000001,
  cache_creation_input_token_cost: 0.0000125,
  cache_creation_input_token_cost_above_1hr: 0.00002,
  litellm_provider: "anthropic",
  mode: "chat",
};

const tempCacheDir = () => mkdtemp(join(tmpdir(), "tokkaebi-pricing-"));

const fetchReturning = (models: Record<string, unknown>) => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify(models), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
};

const failingFetch = (async () => {
  throw new Error("network down");
}) as typeof fetch;

describe("parseLitellmTable", () => {
  it("maps LiteLLM cost fields onto per-token pricing", () => {
    const table = parseLitellmTable({ raw: { "claude-x": litellmEntry } });

    expect(table["claude-x"]).toEqual({
      inputCostPerToken: 0.00001,
      outputCostPerToken: 0.00005,
      cacheReadCostPerToken: 0.000001,
      cache5mWriteCostPerToken: 0.0000125,
      cache1hWriteCostPerToken: 0.00002,
    });
  });

  it("derives missing cache rates from Anthropic's documented multipliers", () => {
    const bare = {
      input_cost_per_token: 0.00001,
      output_cost_per_token: 0.00005,
    };

    const table = parseLitellmTable({ raw: { "claude-bare": bare } });
    const derived = table["claude-bare"];

    expect(derived?.cacheReadCostPerToken).toBeCloseTo(0.000001, 12); // input × 0.1
    expect(derived?.cache5mWriteCostPerToken).toBeCloseTo(0.0000125, 12); // input × 1.25
    expect(derived?.cache1hWriteCostPerToken).toBeCloseTo(0.000025, 12); // 5m × 2
  });

  it("doubles the 5m write rate when only above_1hr is missing", () => {
    const partial = { ...litellmEntry } as Record<string, unknown>;
    delete partial.cache_creation_input_token_cost_above_1hr;

    const table = parseLitellmTable({ raw: { "claude-partial": partial } });

    expect(table["claude-partial"]?.cache1hWriteCostPerToken).toBeCloseTo(0.000025, 12);
  });

  it("skips entries without input/output costs", () => {
    const table = parseLitellmTable({
      raw: { "claude-broken": { mode: "chat" }, "claude-x": litellmEntry },
    });

    expect(Object.keys(table)).toEqual(["claude-x"]);
  });
});

describe("loadPricingTable", () => {
  it("uses a fresh disk cache without fetching", async () => {
    const cacheDir = await tempCacheDir();
    const now = Date.parse("2026-08-11T12:00:00.000Z");
    await writeFile(
      join(cacheDir, "pricing-cache.json"),
      JSON.stringify({ fetchedAt: now - DAY_MS / 2, models: { "claude-disk": litellmEntry } }),
    );
    const { fetchImpl, calls } = fetchReturning({ "claude-live": litellmEntry });

    const result = await loadPricingTable({ cacheDir, fetchImpl, now: () => now });

    expect(result.source).toBe("disk");
    expect(result.table["claude-disk"]).toBeDefined();
    expect(calls).toHaveLength(0);
  });

  it("fetches when the disk cache is stale and rewrites it", async () => {
    const cacheDir = await tempCacheDir();
    const now = Date.parse("2026-08-11T12:00:00.000Z");
    await writeFile(
      join(cacheDir, "pricing-cache.json"),
      JSON.stringify({ fetchedAt: now - DAY_MS * 2, models: { "claude-disk": litellmEntry } }),
    );
    const { fetchImpl } = fetchReturning({ "claude-live": litellmEntry });

    const result = await loadPricingTable({ cacheDir, fetchImpl, now: () => now });

    expect(result.source).toBe("fetch");
    expect(result.table["claude-live"]).toBeDefined();
    const rewritten = JSON.parse(
      await readFile(join(cacheDir, "pricing-cache.json"), "utf8"),
    );
    expect(rewritten.models["claude-live"]).toBeDefined();
  });

  it("keeps using a stale disk cache when the fetch fails", async () => {
    const cacheDir = await tempCacheDir();
    const now = Date.parse("2026-08-11T12:00:00.000Z");
    await writeFile(
      join(cacheDir, "pricing-cache.json"),
      JSON.stringify({ fetchedAt: now - DAY_MS * 30, models: { "claude-disk": litellmEntry } }),
    );

    const result = await loadPricingTable({
      cacheDir,
      fetchImpl: failingFetch,
      now: () => now,
    });

    expect(result.source).toBe("disk");
    expect(result.table["claude-disk"]).toBeDefined();
  });

  it("falls back to the bundled snapshot when there is no disk cache and no network", async () => {
    const cacheDir = await tempCacheDir();

    const result = await loadPricingTable({ cacheDir, fetchImpl: failingFetch });

    expect(result.source).toBe("snapshot");
    // 스냅샷은 실제 LiteLLM 데이터의 claude 서브셋 — 관측 모델이 반드시 있어야 한다
    expect(result.table["claude-fable-5"]).toBeDefined();
    expect(result.table["claude-fable-5"]?.cache1hWriteCostPerToken).toBeGreaterThan(
      result.table["claude-fable-5"]?.cache5mWriteCostPerToken ?? Infinity,
    );
  });

  it("bundles Bedrock and Vertex keys so enterprise deployments price offline", async () => {
    const result = await loadPricingTable({
      cacheDir: await tempCacheDir(),
      fetchImpl: failingFetch,
      offline: true,
    });

    const keys = Object.keys(result.table);
    expect(keys.some((key) => key.startsWith("anthropic.claude"))).toBe(true);
    expect(keys.some((key) => key.startsWith("vertex_ai/claude"))).toBe(true);
  });

  it("offline mode never fetches and accepts a stale disk cache", async () => {
    const cacheDir = await tempCacheDir();
    const now = Date.parse("2026-08-11T12:00:00.000Z");
    await writeFile(
      join(cacheDir, "pricing-cache.json"),
      JSON.stringify({ fetchedAt: now - DAY_MS * 90, models: { "claude-disk": litellmEntry } }),
    );
    // 성공하는 fetch를 주입 — 호출됐다면 source가 "fetch"가 됐을 것이므로
    // "disk"라는 결과 + calls 0건이 "fetch 자체를 안 했다"를 증명한다
    const { fetchImpl, calls } = fetchReturning({ "claude-live": litellmEntry });

    const result = await loadPricingTable({
      cacheDir,
      fetchImpl,
      now: () => now,
      offline: true,
    });

    expect(result.source).toBe("disk");
    expect(result.table["claude-disk"]).toBeDefined();
    expect(calls).toHaveLength(0);
  });

  it("offline mode falls back to the snapshot without a disk cache", async () => {
    const result = await loadPricingTable({
      cacheDir: await tempCacheDir(),
      fetchImpl: failingFetch,
      offline: true,
    });

    expect(result.source).toBe("snapshot");
    expect(result.table["claude-fable-5"]).toBeDefined();
  });

  it("writes the disk cache after a successful fetch with no prior cache", async () => {
    const cacheDir = await tempCacheDir();
    const { fetchImpl } = fetchReturning({ "claude-live": litellmEntry });

    const result = await loadPricingTable({ cacheDir, fetchImpl });

    expect(result.source).toBe("fetch");
    const written = JSON.parse(
      await readFile(join(cacheDir, "pricing-cache.json"), "utf8"),
    );
    expect(written.models["claude-live"]).toBeDefined();
  });
});
