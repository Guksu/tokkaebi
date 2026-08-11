import {
  getPeriodSummary,
  getWeeklyTotals,
  toDayIndex,
  toWeekIndex,
  weekIndexToStartDate,
} from "@tokkaebi/core";
import pc from "picocolors";
import { createContext, warnUnknownModels } from "../context.js";
import { endOfLocalDay, localTzOffsetMs } from "../dates.js";
import { formatCost, formatTokens } from "../render/format.js";
import { costBar } from "../render/korean.js";
import { sparkline } from "../render/spark.js";
import { costCell, usageTable } from "../render/table.js";

const WEEKS = 12;

// 캐시 심층 분석 — 요약(getPeriodSummary)과 주별 추이(getWeeklyTotals) 조립, 신규 SQL 없음
export const runCache = async ({ json, sync }: { json: boolean; sync: boolean }) => {
  const now = new Date();
  const tzOffsetMs = localTzOffsetMs({ now });
  const untilEpoch = endOfLocalDay({ now });
  const todayIndex = toDayIndex({ epochMs: now.getTime(), tzOffsetMs });
  const startWeek = toWeekIndex({ dayIndex: todayIndex }) - WEEKS + 1;
  const sinceEpoch = new Date(
    `${weekIndexToStartDate({ weekIndex: startWeek })}T00:00:00`,
  ).getTime();

  const { db, pricing } = await createContext({ sync, quiet: json });
  const summary = getPeriodSummary({ db, table: pricing.table, sinceEpoch, untilEpoch });
  const weeks = getWeeklyTotals({
    db,
    table: pricing.table,
    sinceEpoch,
    untilEpoch,
    tzOffsetMs,
  });

  const { tokens } = summary.totals;
  const readAndInput = tokens.inputTokens + tokens.cacheReadTokens;
  const hitRate = readAndInput > 0 ? tokens.cacheReadTokens / readAndInput : 0;
  const writeTotal = tokens.cache5mTokens + tokens.cache1hTokens;
  const write5mRatio = writeTotal > 0 ? tokens.cache5mTokens / writeTotal : 0;

  if (json) {
    console.log(
      JSON.stringify(
        {
          weeks: WEEKS,
          hitRate,
          write5mRatio,
          totals: summary.totals,
          weekly: weeks.map(({ weekStart, cost }) => ({
            weekStart,
            netSavings: cost.cacheSavings.net,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n${pc.bold("캐시 분석")} · 최근 ${WEEKS}주\n`);
  if (summary.totals.requestCount === 0) {
    console.log(pc.dim("이 기간에 기록된 사용량이 없습니다."));
    return;
  }

  const { gross, writePremium, net } = summary.totals.cacheSavings;
  console.log(
    `  히트율      ${pc.bold(pc.green(`${(hitRate * 100).toFixed(1)}%`))}  ${pc.dim(
      `(캐시 읽기 ${formatTokens({ count: tokens.cacheReadTokens })} / 신규 입력 ${formatTokens({ count: tokens.inputTokens })})`,
    )}`,
  );
  console.log(
    `  쓰기 비중   5분 ${Math.round(write5mRatio * 100)}% · 1시간 ${Math.round(
      (1 - write5mRatio) * 100,
    )}%  ${pc.dim(`(총 ${formatTokens({ count: writeTotal })} 토큰)`)}`,
  );
  console.log(
    `  순절감      ${pc.bold(pc.green(formatCost({ usd: net })))}  ${pc.dim(
      `(읽기 절감 ${formatCost({ usd: gross })} − 쓰기 프리미엄 ${formatCost({ usd: writePremium })})`,
    )}`,
  );

  console.log(`\n${pc.bold("모델별 절감")}`);
  const table = usageTable({ head: ["모델", "캐시 읽기", "순절감", "비용", ""] });
  const maxSavings = Math.max(
    ...summary.models.map(({ cost }) => cost.cacheSavings.net),
  );
  for (const model of summary.models) {
    table.push([
      pc.cyan(model.model),
      { content: formatTokens({ count: model.tokens.cacheReadTokens }), hAlign: "right" },
      {
        content: pc.green(formatCost({ usd: model.cost.cacheSavings.net })),
        hAlign: "right",
      },
      costCell({ cost: model.cost }),
      costBar({ value: model.cost.cacheSavings.net, max: maxSavings, width: 8 }),
    ]);
  }
  console.log(table.toString());

  const savingsSeries = weeks.map(({ cost }) => cost.cacheSavings.net);
  const peak = weeks.reduce(
    (best, week) =>
      week.cost.cacheSavings.net > best.value
        ? { value: week.cost.cacheSavings.net, weekStart: week.weekStart }
        : best,
    { value: 0, weekStart: "" },
  );
  console.log(`\n${pc.bold("주별 순절감 추이")}`);
  console.log(
    `  ${pc.green(sparkline({ values: savingsSeries }))}  ${pc.dim(
      peak.weekStart === ""
        ? ""
        : `최대 ${formatCost({ usd: peak.value })} (${peak.weekStart.slice(5)} 주)`,
    )}`,
  );
  warnUnknownModels({ unknownModels: summary.unknownModels });
};
