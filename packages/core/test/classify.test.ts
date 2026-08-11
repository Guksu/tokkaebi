import { describe, expect, it } from "vitest";
import { classifyLine } from "../src/parser/classify.js";

const baseRecord = {
  type: "assistant",
  uuid: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000010",
  timestamp: "2026-08-05T10:00:00.000Z",
  cwd: "/home/user/project-a",
  gitBranch: "main",
  isSidechain: false,
  userType: "external",
  version: "2.1.227",
  requestId: "req_test_001",
  message: {
    id: "msg_test_001",
    model: "claude-fable-5",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 2000,
      cache_creation_input_tokens: 1500,
      cache_creation: {
        ephemeral_5m_input_tokens: 500,
        ephemeral_1h_input_tokens: 1000,
      },
    },
  },
};

const toLine = (record: unknown) => JSON.stringify(record);

describe("classifyLine", () => {
  it("maps a modern assistant record to a usage record", () => {
    const result = classifyLine({ line: toLine(baseRecord) });

    expect(result).toMatchObject({
      kind: "usage",
      record: {
        dedupeKey: "req_test_001",
        sessionId: "00000000-0000-4000-8000-000000000010",
        model: "claude-fable-5",
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 2000,
        cache5mTokens: 500,
        cache1hTokens: 1000,
        cwd: "/home/user/project-a",
        gitBranch: "main",
        isSidechain: false,
        ccVersion: "2.1.227",
      },
    });
    if (result.kind !== "usage") throw new Error("unreachable");
    expect(result.record.tsEpoch).toBe(Date.parse("2026-08-05T10:00:00.000Z"));
  });

  it("uses the cache_creation object, never adding the scalar on top", () => {
    const result = classifyLine({ line: toLine(baseRecord) });

    if (result.kind !== "usage") throw new Error("expected usage");
    // 스칼라(1500)와 객체(500+1000)는 같은 값의 이중 표현 — 합하면 2배가 된다
    expect(result.record.cache5mTokens + result.record.cache1hTokens).toBe(1500);
  });

  it("falls back to treating the scalar as 5m cache when the object is missing (legacy)", () => {
    const legacy = structuredClone(baseRecord) as Record<string, any>;
    delete legacy.message.usage.cache_creation;
    legacy.message.usage.cache_creation_input_tokens = 300;

    const result = classifyLine({ line: toLine(legacy) });

    if (result.kind !== "usage") throw new Error("expected usage");
    expect(result.record.cache5mTokens).toBe(300);
    expect(result.record.cache1hTokens).toBe(0);
  });

  it("captures sidechain and attribution fields", () => {
    const sidechain = {
      ...baseRecord,
      isSidechain: true,
      agentId: "abc123",
      attributionAgent: "Explore",
      attributionSkill: "digest",
    };

    const result = classifyLine({ line: toLine(sidechain) });

    if (result.kind !== "usage") throw new Error("expected usage");
    expect(result.record.isSidechain).toBe(true);
    expect(result.record.agentId).toBe("abc123");
    expect(result.record.attributionAgent).toBe("Explore");
    expect(result.record.attributionSkill).toBe("digest");
    expect(result.record.attributionPlugin).toBeNull();
  });

  it("falls back to message.id as the dedupe key when requestId is absent", () => {
    const noRequestId = structuredClone(baseRecord) as Record<string, any>;
    delete noRequestId.requestId;

    const result = classifyLine({ line: toLine(noRequestId) });

    if (result.kind !== "usage") throw new Error("expected usage");
    expect(result.record.dedupeKey).toBe("msg_test_001");
  });

  it("skips records that have neither requestId nor message.id", () => {
    const noKeys = structuredClone(baseRecord) as Record<string, any>;
    delete noKeys.requestId;
    delete noKeys.message.id;

    expect(classifyLine({ line: toLine(noKeys) })).toEqual({
      kind: "skip",
      reason: "no_dedupe_key",
    });
  });

  it("skips synthetic error records", () => {
    const synthetic = structuredClone(baseRecord) as Record<string, any>;
    synthetic.message.model = "<synthetic>";

    expect(classifyLine({ line: toLine(synthetic) })).toEqual({
      kind: "skip",
      reason: "synthetic_model",
    });
  });

  it("skips non-assistant records", () => {
    expect(
      classifyLine({ line: toLine({ type: "summary", summary: "s", leafUuid: "u" }) }),
    ).toEqual({ kind: "skip", reason: "non_assistant" });
  });

  it("skips empty lines and unparsable JSON", () => {
    expect(classifyLine({ line: "" })).toEqual({ kind: "skip", reason: "empty_line" });
    expect(classifyLine({ line: "   " })).toEqual({ kind: "skip", reason: "empty_line" });
    expect(classifyLine({ line: '{"type":"assistant","message":' })).toEqual({
      kind: "skip",
      reason: "json_parse_error",
    });
  });

  it("skips assistant records that do not match the schema", () => {
    const broken = structuredClone(baseRecord) as Record<string, any>;
    delete broken.sessionId;

    expect(classifyLine({ line: toLine(broken) })).toEqual({
      kind: "skip",
      reason: "schema_mismatch",
    });
  });

  it("skips assistant records with an unparsable timestamp", () => {
    const badTs = structuredClone(baseRecord) as Record<string, any>;
    badTs.timestamp = "not-a-date";

    expect(classifyLine({ line: toLine(badTs) })).toEqual({
      kind: "skip",
      reason: "schema_mismatch",
    });
  });
});
