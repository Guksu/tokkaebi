import {
  computeStreak,
  getBranchTotals,
  getPeriodSummary,
  getUsageDayIndexes,
  toDayIndex,
} from "@tokkaebi/core";
import pc from "picocolors";
import { createContext, warnUnknownModels } from "../context.js";
import { endOfLocalDay, localTzOffsetMs, startOfLocalDay } from "../dates.js";
import { formatCost } from "../render/format.js";
import { costBar, koreanWeekday } from "../render/korean.js";
import { costCell, tokenCells, usageTable } from "../render/table.js";

export const runToday = async ({
  by,
  json,
  sync,
}: {
  by: "model" | "branch";
  json: boolean;
  sync: boolean;
}) => {
  const now = new Date();
  const sinceEpoch = startOfLocalDay({ now });
  const untilEpoch = endOfLocalDay({ now });
  const tzOffsetMs = localTzOffsetMs({ now });

  const { db, pricing } = await createContext({ sync, quiet: json });
  const summary = getPeriodSummary({ db, table: pricing.table, sinceEpoch, untilEpoch });
  const dayIndexes = getUsageDayIndexes({ db, tzOffsetMs });
  const streak = computeStreak({
    dayIndexes,
    todayIndex: toDayIndex({ epochMs: now.getTime(), tzOffsetMs }),
  });

  if (json) {
    console.log(JSON.stringify({ date: now.toISOString(), summary, streak }, null, 2));
    return;
  }

  const date = new Date(sinceEpoch).toLocaleDateString("sv-SE");
  console.log(
    `\n${pc.bold("오늘 사용량")} · ${date} (${koreanWeekday({ date })}) · ${pc.bold(
      pc.green(formatCost({ usd: summary.totals.totalCost })),
    )}\n`,
  );

  if (summary.totals.requestCount === 0) {
    console.log(pc.dim("오늘 기록된 사용량이 없습니다."));
    return;
  }

  const groupHead = by === "branch" ? "브랜치" : "모델";
  const table = usageTable({
    head: [groupHead, "입력", "출력", "캐시 읽기", "캐시 쓰기", "비용", ""],
  });

  const rows =
    by === "branch"
      ? getBranchTotals({ db, table: pricing.table, sinceEpoch, untilEpoch }).map(
          (row) => ({
            label: row.branch ?? pc.dim("(브랜치 없음)"),
            tokens: row.tokens,
            cost: row.cost,
          }),
        )
      : summary.models.map((row) => ({
          label: row.unknown ? `${row.model} ${pc.yellow("?")}` : pc.cyan(row.model),
          tokens: row.tokens,
          cost: row.cost,
        }));

  const maxCost = Math.max(...rows.map(({ cost }) => cost.totalCost));
  for (const row of rows) {
    table.push([
      row.label,
      ...tokenCells({ tokens: row.tokens }),
      costCell({ cost: row.cost }),
      costBar({ value: row.cost.totalCost, max: maxCost, width: 8 }),
    ]);
  }
  table.push([
    pc.bold("합계"),
    ...tokenCells({ tokens: summary.totals.tokens }),
    { content: pc.bold(pc.green(formatCost({ usd: summary.totals.totalCost }))), hAlign: "right" },
    "",
  ]);
  console.log(table.toString());

  const { net, gross } = summary.totals.cacheSavings;
  console.log(
    `\n💰 ${pc.bold("캐시 절감")}  ${pc.green(formatCost({ usd: net }))}  ${pc.dim(
      `— 캐시가 없었다면 오늘 ${formatCost({
        usd: summary.totals.totalCost + net,
      })} (읽기 절감 ${formatCost({ usd: gross })})`,
    )}`,
  );
  console.log(`🧌 ${pc.bold("연속 사용")}  ${pc.bold(String(streak))}일째`);
  warnUnknownModels({ unknownModels: summary.unknownModels });
};
