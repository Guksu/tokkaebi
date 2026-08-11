import type { SkipReason, UsageRecordInput } from "../types.js";
import { assistantRecordSchema } from "./schema.js";

export type LineResult =
  | { kind: "usage"; record: UsageRecordInput }
  | { kind: "skip"; reason: SkipReason };

const skip = (reason: SkipReason): LineResult => ({ kind: "skip", reason });

export const classifyLine = ({ line }: { line: string }): LineResult => {
  if (line.trim() === "") return skip("empty_line");

  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return skip("json_parse_error");
  }

  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as { type?: unknown }).type !== "assistant"
  ) {
    return skip("non_assistant");
  }

  const parsed = assistantRecordSchema.safeParse(raw);
  if (!parsed.success) return skip("schema_mismatch");
  const record = parsed.data;

  if (record.message.model === "<synthetic>") return skip("synthetic_model");

  const dedupeKey = record.requestId ?? record.message.id;
  if (dedupeKey == null) return skip("no_dedupe_key");

  const tsEpoch = Date.parse(record.timestamp);
  if (Number.isNaN(tsEpoch)) return skip("schema_mismatch");

  const { usage } = record.message;
  // 객체가 있으면 5m/1h 분리값을 쓰고, 없으면(구버전) 스칼라 전체를 5m로 간주한다.
  // 1h 단가가 더 비싸므로 5m 간주가 비용을 과대계상하지 않는 보수적 선택이다.
  const cacheCreation = usage.cache_creation ?? {
    ephemeral_5m_input_tokens: usage.cache_creation_input_tokens,
    ephemeral_1h_input_tokens: 0,
  };

  return {
    kind: "usage",
    record: {
      dedupeKey,
      sessionId: record.sessionId,
      timestamp: record.timestamp,
      tsEpoch,
      model: record.message.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens,
      cache5mTokens: cacheCreation.ephemeral_5m_input_tokens,
      cache1hTokens: cacheCreation.ephemeral_1h_input_tokens,
      cwd: record.cwd,
      gitBranch: record.gitBranch ?? null,
      isSidechain: record.isSidechain,
      agentId: record.agentId ?? null,
      attributionAgent: record.attributionAgent ?? null,
      attributionSkill: record.attributionSkill ?? null,
      attributionPlugin: record.attributionPlugin ?? null,
      ccVersion: record.version ?? null,
    },
  };
};
