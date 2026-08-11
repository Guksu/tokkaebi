import { describe, expect, it } from "vitest";
import { computeCost } from "../src/pricing/cost.js";
import type { ModelPricing } from "../src/types.js";

// claude-fable-5의 실제 단가 구조와 동일한 형태 (USD per token)
const pricing: ModelPricing = {
  inputCostPerToken: 0.00001,
  outputCostPerToken: 0.00005,
  cacheReadCostPerToken: 0.000001,
  cache5mWriteCostPerToken: 0.0000125,
  cache1hWriteCostPerToken: 0.00002,
};

describe("computeCost", () => {
  it("prices each token bucket with its own rate", () => {
    const cost = computeCost({
      tokens: {
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 1_000_000,
        cache5mTokens: 1000,
        cache1hTokens: 1000,
      },
      pricing,
    });

    expect(cost.inputCost).toBeCloseTo(0.001, 10);
    expect(cost.outputCost).toBeCloseTo(0.0005, 10);
    expect(cost.cacheReadCost).toBeCloseTo(1.0, 10);
    // 1h 쓰기(2e-5)와 5m 쓰기(1.25e-5)는 단가가 다르다 — 분리 계산 검증
    expect(cost.cacheWriteCost).toBeCloseTo(0.0325, 10);
    expect(cost.totalCost).toBeCloseTo(1.034, 10);
  });

  it("computes net cache savings as read savings minus write premium", () => {
    const cost = computeCost({
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
        cache5mTokens: 1000,
        cache1hTokens: 1000,
      },
      pricing,
    });

    // 캐시가 없었다면 read 전량이 input 단가였을 것 — 그 차액이 gross
    expect(cost.cacheSavings.gross).toBeCloseTo(9.0, 10);
    // 캐시 쓰기는 input보다 비싸다 — 그 프리미엄을 차감해야 정직한 절감액
    expect(cost.cacheSavings.writePremium).toBeCloseTo(0.0125, 10);
    expect(cost.cacheSavings.net).toBeCloseTo(8.9875, 10);
  });

  it("returns zero cost for zero tokens", () => {
    const cost = computeCost({
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cache5mTokens: 0,
        cache1hTokens: 0,
      },
      pricing,
    });

    expect(cost.totalCost).toBe(0);
    expect(cost.cacheSavings.net).toBe(0);
  });
});
