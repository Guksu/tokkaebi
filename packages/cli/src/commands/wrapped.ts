import {
  computeLongestStreak,
  getDailyTotals,
  getHeatmapTotals,
  getPeriodSummary,
  getProjectTotals,
  getUsageDayIndexes,
  type TokenCounts,
} from "@tokkaebi/core";
import Table from "cli-table3";
import pc from "picocolors";
import { createContext, warnUnknownModels } from "../context.js";
import { endOfLocalDay, localTzOffsetMs, startOfLocalMonth } from "../dates.js";
import { formatCost, formatTokens, shortenPath } from "../render/format.js";
import { goblinTier, koreanWeekday } from "../render/korean.js";

const sumTokens = ({ tokens }: { tokens: TokenCounts }) =>
  tokens.inputTokens +
  tokens.outputTokens +
  tokens.cacheReadTokens +
  tokens.cache5mTokens +
  tokens.cache1hTokens;

export const runWrapped = async ({
  year,
  json,
  sync,
}: {
  /** false=이번 달, true=올해, 문자열=해당 연도 */
  year: boolean | string;
  json: boolean;
  sync: boolean;
}) => {
  const now = new Date();
  const tzOffsetMs = localTzOffsetMs({ now });

  const targetYear = typeof year === "string" ? Number.parseInt(year, 10) : now.getFullYear();
  const isYearMode = year !== false;
  const sinceEpoch = isYearMode
    ? new Date(targetYear, 0, 1).getTime()
    : startOfLocalMonth({ now });
  const untilEpoch =
    isYearMode && targetYear < now.getFullYear()
      ? new Date(targetYear + 1, 0, 1).getTime()
      : endOfLocalDay({ now });
  const title = isYearMode
    ? `${targetYear}년 도깨비 결산`
    : `${now.getFullYear()}년 ${now.getMonth() + 1}월 도깨비 결산`;

  const { db, pricing } = await createContext({ sync, quiet: json });
  const summary = getPeriodSummary({ db, table: pricing.table, sinceEpoch, untilEpoch });
  const projects = getProjectTotals({ db, table: pricing.table, sinceEpoch, untilEpoch });
  const days = getDailyTotals({ db, table: pricing.table, sinceEpoch, untilEpoch, tzOffsetMs });
  const heatmap = getHeatmapTotals({ db, table: pricing.table, sinceEpoch, untilEpoch, tzOffsetMs });
  const longestStreak = computeLongestStreak({
    dayIndexes: getUsageDayIndexes({ db, tzOffsetMs, sinceEpoch, untilEpoch }),
  });
  const cumulative = getPeriodSummary({
    db,
    table: pricing.table,
    sinceEpoch: 0,
    untilEpoch: Number.MAX_SAFE_INTEGER,
  });

  const totalTokens = sumTokens({ tokens: summary.totals.tokens });
  const cumulativeTokens = sumTokens({ tokens: cumulative.totals.tokens });
  const dawnCost = heatmap
    .filter(({ hour }) => hour < 6)
    .reduce((sum, cell) => sum + cell.cost.totalCost, 0);
  const dawnRatio = summary.totals.totalCost > 0 ? dawnCost / summary.totals.totalCost : 0;
  const topProject = projects[0] ?? null;
  const topModel = summary.models[0] ?? null;
  const peakDay = days.reduce(
    (best, day) => (day.cost.totalCost > (best?.cost.totalCost ?? -1) ? day : best),
    null as (typeof days)[number] | null,
  );
  const tier = goblinTier({ totalTokens: cumulativeTokens });

  if (json) {
    console.log(
      JSON.stringify(
        {
          period: { sinceEpoch, untilEpoch, mode: isYearMode ? "year" : "month" },
          totals: summary.totals,
          totalTokens,
          topProject,
          topModel: topModel && { model: topModel.model, cost: topModel.cost.totalCost },
          longestStreak,
          dawnRatio,
          peakDay,
          cumulativeTokens,
          tier,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (summary.totals.requestCount === 0) {
    console.log(pc.dim("\n이 기간에 기록된 사용량이 없습니다."));
    return;
  }

  const modelShare =
    topModel && summary.totals.totalCost > 0
      ? Math.round((topModel.cost.totalCost / summary.totals.totalCost) * 100)
      : 0;

  // 한글 전각 폭 계산은 cli-table3에 맡긴다 — 수작업 박스 정렬 금지
  const box = new Table({ style: { head: [], border: [] }, colAligns: ["left", "left"] });
  box.push(
    [pc.bold("총 지출"), pc.bold(pc.green(formatCost({ usd: summary.totals.totalCost })))],
    ["총 토큰", formatTokens({ count: totalTokens })],
    [
      "최다 프로젝트",
      topProject
        ? `${pc.cyan(shortenPath({ cwd: topProject.cwd }))} (${formatCost({ usd: topProject.cost.totalCost })})`
        : pc.dim("-"),
    ],
    [
      "최애 모델",
      topModel ? `${pc.cyan(topModel.model)} (비용의 ${modelShare}%)` : pc.dim("-"),
    ],
    ["최장 스트릭", `${longestStreak}일 연속`],
    ["새벽 코딩", `비용의 ${Math.round(dawnRatio * 100)}%가 00–06시`],
    [
      "최고 지출일",
      peakDay
        ? `${peakDay.date.slice(5)} (${koreanWeekday({ date: peakDay.date })}) ${formatCost({ usd: peakDay.cost.totalCost })}`
        : pc.dim("-"),
    ],
    ["캐시 절감", pc.green(formatCost({ usd: summary.totals.cacheSavings.net }))],
    [
      pc.bold("현재 등급"),
      `${pc.bold(pc.yellow(tier))} ${pc.dim(`(누적 ${formatTokens({ count: cumulativeTokens })} 토큰)`)}`,
    ],
  );

  console.log(`\n🧌 ${pc.bold(title)}\n`);
  console.log(box.toString());
  warnUnknownModels({ unknownModels: summary.unknownModels });
};
