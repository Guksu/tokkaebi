export type SkipReason =
  | "empty_line"
  | "json_parse_error"
  | "non_assistant"
  | "schema_mismatch"
  | "synthetic_model"
  | "no_dedupe_key"
  | "duplicate_in_file";

export type UsageRecordInput = {
  dedupeKey: string;
  sessionId: string;
  timestamp: string;
  tsEpoch: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cache5mTokens: number;
  cache1hTokens: number;
  cwd: string;
  gitBranch: string | null;
  isSidechain: boolean;
  agentId: string | null;
  attributionAgent: string | null;
  attributionSkill: string | null;
  attributionPlugin: string | null;
  ccVersion: string | null;
};

export type SkipCounts = Partial<Record<SkipReason, number>>;

export type ModelPricing = {
  inputCostPerToken: number;
  outputCostPerToken: number;
  cacheReadCostPerToken: number;
  cache5mWriteCostPerToken: number;
  cache1hWriteCostPerToken: number;
};

export type PricingTable = Record<string, ModelPricing>;

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cache5mTokens: number;
  cache1hTokens: number;
};

export type CacheSavings = {
  /** cache_read × (input 단가 − read 단가): 캐시가 없었다면 냈을 금액과의 차이 */
  gross: number;
  /** 캐시 쓰기가 일반 input보다 비싼 만큼의 추가 지출 */
  writePremium: number;
  /** gross − writePremium: 정직한 순절감액 */
  net: number;
};

export type CostBreakdown = {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
  cacheSavings: CacheSavings;
};

export type ParseResult = {
  records: UsageRecordInput[];
  /** start 지점부터 소비한 바이트 수 — 잘린 마지막 줄은 소비하지 않아 다음 sync가 재시도한다 */
  consumed: number;
  skips: SkipCounts;
};
