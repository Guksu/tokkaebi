import { describe, expect, it } from "vitest";
import { computeLongestStreak } from "../src/aggregate/streak.js";
import {
  COST_MILESTONES,
  findNewMilestone,
  TOKEN_MILESTONES,
} from "../src/milestones.js";

describe("findNewMilestone", () => {
  it("returns null just below a threshold", () => {
    expect(
      findNewMilestone({ total: 9_999_999, celebrated: 1e6, thresholds: TOKEN_MILESTONES }),
    ).toBeNull();
  });

  it("celebrates exactly at the threshold (>=)", () => {
    expect(
      findNewMilestone({ total: 1e7, celebrated: 1e6, thresholds: TOKEN_MILESTONES }),
    ).toBe(1e7);
  });

  it("returns only the largest when several thresholds are crossed at once", () => {
    expect(
      findNewMilestone({ total: 2e9, celebrated: 0, thresholds: TOKEN_MILESTONES }),
    ).toBe(1e9);
  });

  it("never re-celebrates the same threshold", () => {
    expect(
      findNewMilestone({ total: 1.5e8, celebrated: 1e8, thresholds: TOKEN_MILESTONES }),
    ).toBeNull();
  });

  it("works for cost milestones too", () => {
    expect(findNewMilestone({ total: 520, celebrated: 100, thresholds: COST_MILESTONES })).toBe(
      500,
    );
  });
});

describe("computeLongestStreak", () => {
  it("finds the longest consecutive run regardless of order or duplicates", () => {
    expect(computeLongestStreak({ dayIndexes: [] })).toBe(0);
    expect(computeLongestStreak({ dayIndexes: [42] })).toBe(1);
    expect(computeLongestStreak({ dayIndexes: [1, 2, 3, 7, 8] })).toBe(3);
    expect(computeLongestStreak({ dayIndexes: [8, 7, 3, 2, 1, 2] })).toBe(3);
  });

  it("finds a past streak longer than the current one", () => {
    // 과거 10~14(5일 연속) vs 현재 20~21(2일)
    expect(
      computeLongestStreak({ dayIndexes: [10, 11, 12, 13, 14, 20, 21] }),
    ).toBe(5);
  });
});
