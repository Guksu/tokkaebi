import {
  getDailyTotals,
  getPeriodSummary,
  getWeeklyTotals,
  toDayIndex,
  toWeekIndex,
  weekIndexToStartDate,
} from "@tokkaebi/core";
import pc from "picocolors";
import { createContext, warnUnknownModels } from "../context.js";
import { endOfLocalDay, localTzOffsetMs, startOfLocalDay } from "../dates.js";
import { formatCost, formatTokens } from "../render/format.js";
import { koreanWeekday } from "../render/korean.js";
import { sparkline } from "../render/spark.js";
import { costCell, usageTable } from "../render/table.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const changeLabel = ({ prev, cur }: { prev: number | null; cur: number }) => {
  if (prev == null || prev === 0) return pc.dim("—");
  const ratio = (cur - prev) / prev;
  const text = `${ratio >= 0 ? "+" : ""}${(ratio * 100).toFixed(1)}%`;
  return ratio > 0 ? pc.red(text) : pc.green(text);
};

export const runTrend = async ({
  weeks,
  daily,
  json,
  sync,
}: {
  weeks: number;
  daily: boolean;
  json: boolean;
  sync: boolean;
}) => {
  const now = new Date();
  const tzOffsetMs = localTzOffsetMs({ now });
  const untilEpoch = endOfLocalDay({ now });

  const { db, pricing } = await createContext({ sync, quiet: json });

  if (daily) {
    // --daily: 최근 30일 일별 추이
    const sinceEpoch = startOfLocalDay({ now }) - 29 * DAY_MS;
    const days = getDailyTotals({
      db,
      table: pricing.table,
      sinceEpoch,
      untilEpoch,
      tzOffsetMs,
    });
    const summary = getPeriodSummary({ db, table: pricing.table, sinceEpoch, untilEpoch });

    if (json) {
      console.log(JSON.stringify({ window: "daily", days, totals: summary }, null, 2));
      return;
    }

    console.log(
      `\n${pc.bold("일별 비용 추이")} · 최근 30일 · 합계 ${pc.bold(
        pc.green(formatCost({ usd: summary.totals.totalCost })),
      )}\n`,
    );
    if (days.length === 0) {
      console.log(pc.dim("이 기간에 기록된 사용량이 없습니다."));
      return;
    }
    console.log(
      `  ${pc.green(sparkline({ values: days.map(({ cost }) => cost.totalCost) }))}\n`,
    );
    const table = usageTable({ head: ["날짜", "요청", "비용", "전일 대비"] });
    for (const [index, day] of days.entries()) {
      table.push([
        `${day.date.slice(5)} (${koreanWeekday({ date: day.date })})`,
        { content: formatTokens({ count: day.requestCount }), hAlign: "right" },
        costCell({ cost: day.cost }),
        {
          content: changeLabel({
            prev: index === 0 ? null : (days[index - 1]?.cost.totalCost ?? null),
            cur: day.cost.totalCost,
          }),
          hAlign: "right",
        },
      ]);
    }
    console.log(table.toString());
    return;
  }

  // 주간: 이번 주 포함 최근 N주, 빈 주는 0으로 채워 추이가 왜곡되지 않게
  const todayIndex = toDayIndex({ epochMs: now.getTime(), tzOffsetMs });
  const currentWeek = toWeekIndex({ dayIndex: todayIndex });
  const startWeek = currentWeek - weeks + 1;
  const startDate = weekIndexToStartDate({ weekIndex: startWeek });
  const sinceEpoch = new Date(`${startDate}T00:00:00`).getTime();

  const weekRows = getWeeklyTotals({
    db,
    table: pricing.table,
    sinceEpoch,
    untilEpoch,
    tzOffsetMs,
  });
  const summary = getPeriodSummary({ db, table: pricing.table, sinceEpoch, untilEpoch });

  const byIndex = new Map(weekRows.map((week) => [week.weekIndex, week]));
  const series = Array.from({ length: weeks }, (_, offset) => {
    const weekIndex = startWeek + offset;
    return (
      byIndex.get(weekIndex) ?? {
        weekStart: weekIndexToStartDate({ weekIndex }),
        weekIndex,
        requestCount: 0,
        tokens: null,
        cost: null,
      }
    );
  });

  if (json) {
    console.log(JSON.stringify({ window: "weekly", weeks: weekRows, totals: summary }, null, 2));
    return;
  }

  console.log(
    `\n${pc.bold("주간 비용 추이")} · 최근 ${weeks}주 · 합계 ${pc.bold(
      pc.green(formatCost({ usd: summary.totals.totalCost })),
    )}\n`,
  );
  if (weekRows.length === 0) {
    console.log(pc.dim("이 기간에 기록된 사용량이 없습니다."));
    return;
  }

  console.log(
    `  ${pc.green(
      sparkline({ values: series.map((week) => week.cost?.totalCost ?? 0) }),
    )}\n`,
  );

  const table = usageTable({ head: ["주 시작", "요청", "비용", "전주 대비"] });
  let prevCost: number | null = null;
  for (const [index, week] of series.entries()) {
    const cost = week.cost?.totalCost ?? 0;
    const isCurrent = index === series.length - 1;
    table.push([
      `${week.weekStart.slice(5)} (월)${isCurrent ? pc.dim(" *") : ""}`,
      { content: formatTokens({ count: week.requestCount }), hAlign: "right" },
      costCell({ cost }),
      {
        content: isCurrent ? pc.dim("(진행 중)") : changeLabel({ prev: prevCost, cur: cost }),
        hAlign: "right",
      },
    ]);
    prevCost = cost;
  }
  console.log(table.toString());

  console.log(
    `\n💰 ${pc.bold("캐시 절감")}  ${pc.green(
      formatCost({ usd: summary.totals.cacheSavings.net }),
    )}`,
  );
  warnUnknownModels({ unknownModels: summary.unknownModels });
};
