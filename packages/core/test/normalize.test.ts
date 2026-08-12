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

  describe("Bedrock model IDs (region prefix + version suffix)", () => {
    it("matches the LiteLLM bedrock key after stripping the region prefix", () => {
      const bedrockTable: PricingTable = {
        "anthropic.claude-opus-4-8-20260212-v1:0": pricing,
      };

      const resolved = resolveModelPricing({
        model: "us.anthropic.claude-opus-4-8-20260212-v1:0",
        table: bedrockTable,
      });

      expect(resolved?.key).toBe("anthropic.claude-opus-4-8-20260212-v1:0");
    });

    it("falls all the way back to the bare claude name", () => {
      // 스냅샷에 bedrock 키가 없어도 리전·anthropic.·-v1:0·날짜를 벗겨 bare 키로 도달
      const resolved = resolveModelPricing({
        model: "eu.anthropic.claude-opus-4-8-20260212-v1:0",
        table,
      });

      expect(resolved?.key).toBe("claude-opus-4-8");
    });

    it("handles every documented region prefix", () => {
      for (const region of ["us", "eu", "apac", "jp", "au", "global"]) {
        const resolved = resolveModelPricing({
          model: `${region}.anthropic.claude-opus-4-8-20260212-v1:0`,
          table,
        });
        expect(resolved?.key).toBe("claude-opus-4-8");
      }
    });
  });

  describe("Vertex model IDs (@date)", () => {
    it("converts @YYYYMMDD into the date-suffix chain", () => {
      const resolved = resolveModelPricing({
        model: "claude-opus-4-8@20260212",
        table,
      });

      expect(resolved?.key).toBe("claude-opus-4-8");
    });

    it("matches vertex_ai/-prefixed LiteLLM keys", () => {
      const vertexTable: PricingTable = {
        "vertex_ai/claude-vertex-only@20260101": pricing,
      };

      const resolved = resolveModelPricing({
        model: "claude-vertex-only@20260101",
        table: vertexTable,
      });

      expect(resolved?.key).toBe("vertex_ai/claude-vertex-only@20260101");
    });
  });
});
