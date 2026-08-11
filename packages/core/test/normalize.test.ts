import { describe, expect, it } from "vitest";
import { resolveModelPricing } from "../src/pricing/normalize.js";
import type { ModelPricing, PricingTable } from "../src/types.js";

const pricing: ModelPricing = {
  inputCostPerToken: 0.00001,
  outputCostPerToken: 0.00005,
  cacheReadCostPerToken: 0.000001,
  cache5mWriteCostPerToken: 0.0000125,
  cache1hWriteCostPerToken: 0.00002,
};

const table: PricingTable = {
  "claude-fable-5": pricing,
  "claude-opus-4-8": pricing,
  "anthropic/claude-prefixed-1": pricing,
};

describe("resolveModelPricing", () => {
  it("resolves an exact key match", () => {
    const resolved = resolveModelPricing({ model: "claude-fable-5", table });

    expect(resolved?.key).toBe("claude-fable-5");
    expect(resolved?.pricing).toBe(pricing);
  });

  it("strips a trailing date suffix when the bare key exists", () => {
    const resolved = resolveModelPricing({ model: "claude-opus-4-8-20260101", table });

    expect(resolved?.key).toBe("claude-opus-4-8");
  });

  it("falls back to the anthropic/ prefixed key", () => {
    const resolved = resolveModelPricing({ model: "claude-prefixed-1", table });

    expect(resolved?.key).toBe("anthropic/claude-prefixed-1");
  });

  it("returns null for unknown models", () => {
    expect(resolveModelPricing({ model: "gpt-100", table })).toBeNull();
    expect(resolveModelPricing({ model: "<synthetic>", table })).toBeNull();
  });
});
