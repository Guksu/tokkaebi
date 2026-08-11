import { describe, expect, it } from "vitest";
import { projectMonthlySpend } from "../src/aggregate/pace.js";

describe("projectMonthlySpend", () => {
  it("projects the month from the daily average", () => {
    const pace = projectMonthlySpend({ spentUsd: 50, dayOfMonth: 15, daysInMonth: 30 });

    expect(pace.dailyAvgUsd).toBeCloseTo(50 / 15, 10);
    expect(pace.projectedUsd).toBeCloseTo(100, 10);
  });

  it("extrapolates aggressively on day one (known noise, accepted)", () => {
    const pace = projectMonthlySpend({ spentUsd: 10, dayOfMonth: 1, daysInMonth: 31 });

    expect(pace.projectedUsd).toBeCloseTo(310, 10);
  });

  it("equals the actual spend on the last day", () => {
    const pace = projectMonthlySpend({ spentUsd: 240, dayOfMonth: 31, daysInMonth: 31 });

    expect(pace.projectedUsd).toBeCloseTo(240, 10);
  });

  it("returns zeros for zero spend", () => {
    const pace = projectMonthlySpend({ spentUsd: 0, dayOfMonth: 10, daysInMonth: 30 });

    expect(pace.dailyAvgUsd).toBe(0);
    expect(pace.projectedUsd).toBe(0);
  });
});
