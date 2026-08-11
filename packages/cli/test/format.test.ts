import { describe, expect, it } from "vitest";
import { formatCost, formatTokens, shortenPath } from "../src/render/format.js";
import { budgetGauge } from "../src/render/korean.js";

const stripAnsi = (text: string) => text.replace(/\[[0-9;]*m/g, "");

describe("budgetGauge", () => {
  it("fills proportionally to spend", () => {
    expect(stripAnsi(budgetGauge({ spent: 0, budget: 200 }))).toBe("[▯▯▯▯▯▯▯▯▯▯]");
    expect(stripAnsi(budgetGauge({ spent: 94, budget: 200 }))).toBe("[▮▮▮▮▮▯▯▯▯▯]");
    expect(stripAnsi(budgetGauge({ spent: 200, budget: 200 }))).toBe("[▮▮▮▮▮▮▮▮▮▮]");
  });

  it("clamps overspend at a full bar instead of overflowing", () => {
    expect(stripAnsi(budgetGauge({ spent: 260, budget: 200 }))).toBe("[▮▮▮▮▮▮▮▮▮▮]");
  });
});

describe("formatCost", () => {
  it("renders dollars with two decimals and thousands separators", () => {
    expect(formatCost({ usd: 1.234 })).toBe("$1.23");
    expect(formatCost({ usd: 0 })).toBe("$0.00");
    expect(formatCost({ usd: 152.5 })).toBe("$152.50");
    expect(formatCost({ usd: 2312.584 })).toBe("$2,312.58");
  });

  it("keeps tiny non-zero costs visible instead of rounding to $0.00", () => {
    expect(formatCost({ usd: 0.0042 })).toBe("$0.0042");
    expect(formatCost({ usd: 0.00001234 })).toBe("$0.000012");
  });
});

describe("formatTokens", () => {
  it("adds thousands separators", () => {
    expect(formatTokens({ count: 0 })).toBe("0");
    expect(formatTokens({ count: 1234 })).toBe("1,234");
    expect(formatTokens({ count: 9324663 })).toBe("9,324,663");
  });
});

describe("shortenPath", () => {
  it("keeps the basename of a project path", () => {
    expect(shortenPath({ cwd: "/home/user/dev/tokkaebi" })).toBe("tokkaebi");
    expect(shortenPath({ cwd: "/" })).toBe("/");
  });
});
