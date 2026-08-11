import type { ModelPricing, PricingTable } from "../types.js";

export type ResolvedPricing = { key: string; pricing: ModelPricing };

// 관측된 모델명은 전부 LiteLLM bare 키와 정확 일치하지만, 날짜 suffix가 붙은
// 모델명(claude-haiku-4-5-20251001 형태)과 프리픽스 키만 있는 경우를 위한 fallback 체인.
export const resolveModelPricing = ({
  model,
  table,
}: {
  model: string;
  table: PricingTable;
}): ResolvedPricing | null => {
  const stripped = model.replace(/-\d{8}$/, "");
  const candidates = [model, stripped, `anthropic/${model}`, `anthropic/${stripped}`];

  for (const key of candidates) {
    const pricing = table[key];
    if (pricing != null) return { key, pricing };
  }
  return null;
};
