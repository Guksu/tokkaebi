import type { ModelPricing, PricingTable } from "../types.js";

export type ResolvedPricing = { key: string; pricing: ModelPricing };

// Bedrock 크로스리전 추론 프리픽스 (공식 문서의 전체 리전)
const BEDROCK_REGION_PREFIX = /^(us|eu|apac|jp|au|global)\./;
// Bedrock 버전 서픽스: -v1:0, -v2:1 등
const BEDROCK_VERSION_SUFFIX = /-v\d+(:\d+)?$/;
const DATE_SUFFIX = /-\d{8}$/;

// 배포 경로마다 같은 모델의 표기가 다르다:
//   1P/Vertex bare  claude-opus-4-8
//   Vertex @날짜     claude-opus-4-8@20260212
//   Bedrock         us.anthropic.claude-opus-4-8-20260212-v1:0
// 장식을 단계적으로 벗긴 후보들을 만들어, 각 후보를 [원형 → 날짜 제거] ×
// [무프리픽스 → anthropic/ → vertex_ai/] 순으로 단가표에서 찾는다.
const baseVariants = ({ model }: { model: string }) => {
  const variants: string[] = [model];
  const push = (candidate: string) => {
    if (!variants.includes(candidate)) variants.push(candidate);
  };

  // Vertex: @YYYYMMDD → -YYYYMMDD (기존 날짜 서픽스 체인에 합류)
  push(model.replace(/@(\d{8})$/, "-$1"));

  // Bedrock: 리전 프리픽스 제거 → LiteLLM의 anthropic.claude-*-v1:0 키와 일치
  const regionStripped = model.replace(BEDROCK_REGION_PREFIX, "");
  push(regionStripped);

  // Bedrock: 버전 서픽스 제거 → anthropic.claude-...-20260212
  const versionStripped = regionStripped.replace(BEDROCK_VERSION_SUFFIX, "");
  push(versionStripped);

  // Bedrock: anthropic. 프리픽스 제거 → bare claude 이름으로 수렴
  push(versionStripped.replace(/^anthropic\./, ""));

  return variants;
};

export const resolveModelPricing = ({
  model,
  table,
}: {
  model: string;
  table: PricingTable;
}): ResolvedPricing | null => {
  for (const variant of baseVariants({ model })) {
    for (const name of [variant, variant.replace(DATE_SUFFIX, "")]) {
      for (const key of [name, `anthropic/${name}`, `vertex_ai/${name}`]) {
        const pricing = table[key];
        if (pricing != null) return { key, pricing };
      }
    }
  }
  return null;
};
