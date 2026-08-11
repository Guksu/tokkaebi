import { describe, expect, it } from "vitest";
import {
  getAgentTotals,
  getBranchTotals,
  getDailyTotals,
  getPeriodSummary,
  getTopSessions,
  getUsageDayIndexes,
} from "../src/aggregate/queries.js";
import { computeStreak, toDayIndex } from "../src/aggregate/streak.js";
import { openDatabase } from "../src/db/database.js";
import type { PricingTable } from "../src/types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// 단순 검산이 가능한 단가: input $10/M, output $50/M, read $1/M, 5m $12.5/M, 1h $20/M
const table: PricingTable = {
  "claude-fable-5": {
    inputCostPerToken: 0.00001,
    outputCostPerToken: 0.00005,
    cacheReadCostPerToken: 0.000001,
    cache5mWriteCostPerToken: 0.0000125,
    cache1hWriteCostPerToken: 0.00002,
  },
  "claude-opus-5": {
    inputCostPerToken: 0.000005,
    outputCostPerToken: 0.000025,
    cacheReadCostPerToken: 0.0000005,
    cache5mWriteCostPerToken: 0.00000625,
    cache1hWriteCostPerToken: 0.00001,
  },
};

type Seed = {
  dedupeKey: string;
  tsEpoch: number;
  model?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string | null;
  isSidechain?: boolean;
  agentId?: string | null;
  attributionAgent?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cache5mTokens?: number;
  cache1hTokens?: number;
};

const seedDb = (seeds: Seed[]) => {
  const db = openDatabase({ dbPath: ":memory:" });
  db.prepare(
    "INSERT INTO files (path, byte_offset, size, mtime_ms, last_synced_at) VALUES ('seed', 0, 0, 0, 0)",
  ).run();
  const insert = db.prepare(`
    INSERT INTO usage_records (
      dedupe_key, file_id, session_id, ts_epoch, timestamp, model,
      input_tokens, output_tokens, cache_read_tokens, cache_5m_tokens, cache_1h_tokens,
      cwd, git_branch, is_sidechain, agent_id,
      attribution_agent, attribution_skill, attribution_plugin, cc_version
    ) VALUES (
      @dedupeKey, 1, @sessionId, @tsEpoch, @timestamp, @model,
      @inputTokens, @outputTokens, @cacheReadTokens, @cache5mTokens, @cache1hTokens,
      @cwd, @gitBranch, @isSidechain, @agentId, @attributionAgent, NULL, NULL, '2.1.227'
    )
  `);
  for (const seed of seeds) {
    insert.run({
      model: "claude-fable-5",
      sessionId: "session-1",
      cwd: "/home/user/project-a",
      gitBranch: "main",
      isSidechain: 0,
      agentId: null,
      attributionAgent: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cache5mTokens: 0,
      cache1hTokens: 0,
      ...seed,
      isSidechain: seed.isSidechain ? 1 : 0,
      timestamp: new Date(seed.tsEpoch).toISOString(),
    });
  }
  return db;
};

const T0 = Date.parse("2026-08-10T00:00:00.000Z");

describe("getPeriodSummary", () => {
  it("sums tokens per model and prices them with the given table", () => {
    const db = seedDb([
      { dedupeKey: "r1", tsEpoch: T0, inputTokens: 100, outputTokens: 10 },
      { dedupeKey: "r2", tsEpoch: T0 + 1000, inputTokens: 200, cacheReadTokens: 1_000_000 },
      {
        dedupeKey: "r3",
        tsEpoch: T0 + 2000,
        model: "claude-opus-5",
        inputTokens: 1000,
        outputTokens: 100,
      },
    ]);

    const summary = getPeriodSummary({
      db,
      table,
      sinceEpoch: T0,
      untilEpoch: T0 + DAY_MS,
    });

    const fable = summary.models.find(({ model }) => model === "claude-fable-5");
    expect(fable?.tokens.inputTokens).toBe(300);
    expect(fable?.tokens.cacheReadTokens).toBe(1_000_000);
    expect(fable?.requestCount).toBe(2);
    expect(fable?.cost.totalCost).toBeCloseTo(0.003 + 0.0005 + 1.0, 10);

    const opus = summary.models.find(({ model }) => model === "claude-opus-5");
    expect(opus?.cost.totalCost).toBeCloseTo(0.005 + 0.0025, 10);

    expect(summary.totals.totalCost).toBeCloseTo(
      (fable?.cost.totalCost ?? 0) + (opus?.cost.totalCost ?? 0),
      10,
    );
    expect(summary.totals.cacheSavings.net).toBeCloseTo(9.0, 10);
    expect(summary.unknownModels).toEqual([]);
  });

  it("excludes records outside the period", () => {
    const db = seedDb([
      { dedupeKey: "in", tsEpoch: T0, inputTokens: 100 },
      { dedupeKey: "before", tsEpoch: T0 - 1, inputTokens: 999 },
      { dedupeKey: "after", tsEpoch: T0 + DAY_MS, inputTokens: 999 },
    ]);

    const summary = getPeriodSummary({
      db,
      table,
      sinceEpoch: T0,
      untilEpoch: T0 + DAY_MS,
    });

    expect(summary.totals.tokens.inputTokens).toBe(100);
  });

  it("reports unknown models with zero cost instead of failing", () => {
    const db = seedDb([
      { dedupeKey: "u1", tsEpoch: T0, model: "future-model-x", inputTokens: 500 },
    ]);

    const summary = getPeriodSummary({
      db,
      table,
      sinceEpoch: T0,
      untilEpoch: T0 + DAY_MS,
    });

    expect(summary.unknownModels).toEqual(["future-model-x"]);
    expect(summary.totals.totalCost).toBe(0);
    expect(summary.totals.tokens.inputTokens).toBe(500);
  });
});

describe("getDailyTotals", () => {
  it("groups by local day using the timezone offset", () => {
    const db = seedDb([
      { dedupeKey: "d1", tsEpoch: T0 + 1000, inputTokens: 10 },
      { dedupeKey: "d2", tsEpoch: T0 + 2000, inputTokens: 20 },
      { dedupeKey: "d3", tsEpoch: T0 + DAY_MS + 1000, inputTokens: 40 },
    ]);

    const days = getDailyTotals({
      db,
      table,
      sinceEpoch: T0,
      untilEpoch: T0 + 2 * DAY_MS,
      tzOffsetMs: 0,
    });

    expect(days).toHaveLength(2);
    expect(days[0]?.date).toBe("2026-08-10");
    expect(days[0]?.tokens.inputTokens).toBe(30);
    expect(days[0]?.requestCount).toBe(2);
    expect(days[1]?.date).toBe("2026-08-11");
    expect(days[1]?.tokens.inputTokens).toBe(40);
  });

  it("shifts day boundaries by the timezone offset (KST)", () => {
    const kstOffset = 9 * 60 * 60 * 1000;
    // UTC 2026-08-10 16:00 = KST 2026-08-11 01:00 → KST 기준 8/11
    const db = seedDb([
      { dedupeKey: "k1", tsEpoch: T0 + 16 * 60 * 60 * 1000, inputTokens: 10 },
    ]);

    const days = getDailyTotals({
      db,
      table,
      sinceEpoch: T0,
      untilEpoch: T0 + 2 * DAY_MS,
      tzOffsetMs: kstOffset,
    });

    expect(days[0]?.date).toBe("2026-08-11");
  });
});

describe("getBranchTotals / getAgentTotals", () => {
  it("groups by git branch including a null-branch bucket", () => {
    const db = seedDb([
      { dedupeKey: "b1", tsEpoch: T0, gitBranch: "main", inputTokens: 10 },
      { dedupeKey: "b2", tsEpoch: T0, gitBranch: "feat/x", inputTokens: 20 },
      { dedupeKey: "b3", tsEpoch: T0, gitBranch: "feat/x", inputTokens: 30 },
      { dedupeKey: "b4", tsEpoch: T0, gitBranch: null, inputTokens: 5 },
    ]);

    const branches = getBranchTotals({
      db,
      table,
      sinceEpoch: T0,
      untilEpoch: T0 + DAY_MS,
    });

    const featX = branches.find(({ branch }) => branch === "feat/x");
    expect(featX?.tokens.inputTokens).toBe(50);
    expect(branches.find(({ branch }) => branch === null)?.tokens.inputTokens).toBe(5);
  });

  it("groups sidechain usage by attribution agent", () => {
    const db = seedDb([
      { dedupeKey: "a1", tsEpoch: T0, inputTokens: 100 },
      {
        dedupeKey: "a2",
        tsEpoch: T0,
        isSidechain: true,
        agentId: "x1",
        attributionAgent: "Explore",
        inputTokens: 30,
      },
      {
        dedupeKey: "a3",
        tsEpoch: T0,
        isSidechain: true,
        agentId: "x2",
        attributionAgent: "Explore",
        inputTokens: 40,
      },
    ]);

    const agents = getAgentTotals({
      db,
      table,
      sinceEpoch: T0,
      untilEpoch: T0 + DAY_MS,
    });

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ agent: "Explore", requestCount: 2 });
    expect(agents[0]?.tokens.inputTokens).toBe(70);
  });
});

describe("getTopSessions", () => {
  it("ranks sessions by cost and respects the limit", () => {
    const db = seedDb([
      // 세션 A: fable 출력 100만 토큰 = $50
      {
        dedupeKey: "s1",
        tsEpoch: T0,
        sessionId: "session-a",
        cwd: "/home/user/big",
        outputTokens: 1_000_000,
      },
      // 세션 B: fable 출력 10만 토큰 = $5
      {
        dedupeKey: "s2",
        tsEpoch: T0 + 1000,
        sessionId: "session-b",
        cwd: "/home/user/small",
        outputTokens: 100_000,
      },
      // 세션 C: 극소
      {
        dedupeKey: "s3",
        tsEpoch: T0 + 2000,
        sessionId: "session-c",
        cwd: "/home/user/tiny",
        outputTokens: 10,
      },
    ]);

    const sessions = getTopSessions({ db, table, limit: 2 });

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      sessionId: "session-a",
      projectCwd: "/home/user/big",
    });
    expect(sessions[0]?.totalCost).toBeCloseTo(50, 6);
    expect(sessions[1]?.sessionId).toBe("session-b");
  });
});

describe("streak", () => {
  const day = (index: number) => index;

  it("counts consecutive days ending today", () => {
    const today = toDayIndex({ epochMs: T0 + 3 * DAY_MS, tzOffsetMs: 0 });
    const days = [today, today - 1, today - 2];

    expect(computeStreak({ dayIndexes: days, todayIndex: today })).toBe(3);
  });

  it("starts from yesterday when today has no usage yet", () => {
    const today = toDayIndex({ epochMs: T0 + 3 * DAY_MS, tzOffsetMs: 0 });
    const days = [today - 1, today - 2];

    expect(computeStreak({ dayIndexes: days, todayIndex: today })).toBe(2);
  });

  it("stops at a gap and returns 0 for stale history", () => {
    const today = 1000;
    expect(
      computeStreak({ dayIndexes: [day(1000), day(999), day(997)], todayIndex: 1000 }),
    ).toBe(2);
    expect(computeStreak({ dayIndexes: [day(990)], todayIndex: 1000 })).toBe(0);
    expect(computeStreak({ dayIndexes: [], todayIndex: 1000 })).toBe(0);
  });

  it("reads distinct usage days from the database", () => {
    const db = seedDb([
      { dedupeKey: "u1", tsEpoch: T0 + 1000 },
      { dedupeKey: "u2", tsEpoch: T0 + 2000 },
      { dedupeKey: "u3", tsEpoch: T0 + DAY_MS },
    ]);

    const indexes = getUsageDayIndexes({ db, tzOffsetMs: 0 });

    expect(indexes).toHaveLength(2);
  });
});
