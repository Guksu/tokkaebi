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

export type ParseResult = {
  records: UsageRecordInput[];
  /** start 지점부터 소비한 바이트 수 — 잘린 마지막 줄은 소비하지 않아 다음 sync가 재시도한다 */
  consumed: number;
  skips: SkipCounts;
};
