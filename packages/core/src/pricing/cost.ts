import type { CostBreakdown, ModelPricing, TokenCounts } from "../types.js";

export const computeCost = ({
  tokens,
  pricing,
}: {
  tokens: TokenCounts;
  pricing: ModelPricing;
}): CostBreakdown => {
  const inputCost = tokens.inputTokens * pricing.inputCostPerToken;
  const outputCost = tokens.outputTokens * pricing.outputCostPerToken;
  const cacheReadCost = tokens.cacheReadTokens * pricing.cacheReadCostPerToken;
  const cacheWriteCost =
    tokens.cache5mTokens * pricing.cache5mWriteCostPerToken +
    tokens.cache1hTokens * pricing.cache1hWriteCostPerToken;

  const gross =
    tokens.cacheReadTokens *
    (pricing.inputCostPerToken - pricing.cacheReadCostPerToken);
  const writePremium =
    tokens.cache5mTokens *
      (pricing.cache5mWriteCostPerToken - pricing.inputCostPerToken) +
    tokens.cache1hTokens *
      (pricing.cache1hWriteCostPerToken - pricing.inputCostPerToken);

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    cacheSavings: { gross, writePremium, net: gross - writePremium },
  };
};
