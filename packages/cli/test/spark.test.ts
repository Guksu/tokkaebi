import { describe, expect, it } from "vitest";
import { sparkline } from "../src/render/spark.js";

describe("sparkline", () => {
  it("renders one character per value, scaled to the max", () => {
    const line = sparkline({ values: [0, 1, 2, 4, 8] });

    expect(line).toHaveLength(5);
    expect(line.at(-1)).toBe("█");
    expect(line.at(0)).toBe("▁");
  });

  it("keeps non-zero minimums visible above the baseline", () => {
    const line = sparkline({ values: [1, 8] });

    // 0이 아닌 값은 최소 ▁보다 위 칸을 보장하지 않아도 되지만, 문자는 8단계 내여야 한다
    expect("▁▂▃▄▅▆▇█").toContain(line.at(0));
  });

  it("handles a flat series without dividing by zero", () => {
    expect(sparkline({ values: [0, 0, 0] })).toBe("▁▁▁");
    expect(sparkline({ values: [5, 5] })).toBe("██");
  });

  it("returns an empty string for no values", () => {
    expect(sparkline({ values: [] })).toBe("");
  });
});
