import { describe, expect, it } from "vitest";
import { toDayIndex } from "../src/aggregate/streak.js";
import {
  dayIndexToWeekday,
  toWeekIndex,
  weekIndexToStartDate,
} from "../src/aggregate/time.js";

const dayIndexOf = (isoDate: string) =>
  toDayIndex({ epochMs: Date.parse(`${isoDate}T00:00:00.000Z`), tzOffsetMs: 0 });

describe("dayIndexToWeekday", () => {
  it("anchors to the epoch: 1970-01-01 (dayIndex 0) is Thursday", () => {
    expect(dayIndexToWeekday({ dayIndex: 0 })).toBe(4);
  });

  it("matches JS Date.getDay for known dates", () => {
    // 2026-08-11은 화요일(2), 2026-08-09는 일요일(0)
    expect(dayIndexToWeekday({ dayIndex: dayIndexOf("2026-08-11") })).toBe(2);
    expect(dayIndexToWeekday({ dayIndex: dayIndexOf("2026-08-09") })).toBe(0);
    expect(dayIndexToWeekday({ dayIndex: dayIndexOf("2026-08-15") })).toBe(6);
  });
});

describe("toWeekIndex / weekIndexToStartDate", () => {
  it("starts weeks on Monday", () => {
    const monday = dayIndexOf("2026-08-10");
    const sunday = dayIndexOf("2026-08-09");
    const nextSunday = dayIndexOf("2026-08-16");

    // 일요일은 전 주 소속, 월~일이 한 주
    expect(toWeekIndex({ dayIndex: sunday })).toBe(toWeekIndex({ dayIndex: monday }) - 1);
    expect(toWeekIndex({ dayIndex: nextSunday })).toBe(toWeekIndex({ dayIndex: monday }));
  });

  it("round-trips a week index back to its Monday date", () => {
    expect(weekIndexToStartDate({ weekIndex: 0 })).toBe("1970-01-05");

    const monday = dayIndexOf("2026-08-10");
    const weekIndex = toWeekIndex({ dayIndex: monday });
    expect(weekIndexToStartDate({ weekIndex })).toBe("2026-08-10");
  });
});
