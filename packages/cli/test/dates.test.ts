import { describe, expect, it } from "vitest";
import {
  localTzOffsetMs,
  startOfLocalDay,
  startOfLocalMonth,
  startOfLocalWeekWindow,
} from "../src/dates.js";

// 로컬 타임존에 의존하지 않도록 불변식 위주로 검증한다
describe("local date boundaries", () => {
  const now = new Date("2026-08-11T15:30:45.123Z");

  it("start of day is at most 24h before now and at a local midnight", () => {
    const start = startOfLocalDay({ now });
    const asDate = new Date(start);

    expect(now.getTime() - start).toBeGreaterThanOrEqual(0);
    expect(now.getTime() - start).toBeLessThan(24 * 60 * 60 * 1000);
    expect(asDate.getHours()).toBe(0);
    expect(asDate.getMinutes()).toBe(0);
    expect(asDate.getSeconds()).toBe(0);
  });

  it("week window starts 6 local days before today's midnight", () => {
    const dayStart = startOfLocalDay({ now });
    const weekStart = startOfLocalWeekWindow({ now });

    expect(dayStart - weekStart).toBe(6 * 24 * 60 * 60 * 1000);
  });

  it("start of month is the local 1st at midnight", () => {
    const start = new Date(startOfLocalMonth({ now }));

    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
  });

  it("tz offset matches what Date reports", () => {
    expect(localTzOffsetMs({ now })).toBe(-now.getTimezoneOffset() * 60 * 1000);
  });
});
