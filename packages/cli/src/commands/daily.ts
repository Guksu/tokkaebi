import { getDailyTotals, getPeriodSummary } from "@tokkaebi/core";
import pc from "picocolors";
import { createContext, warnUnknownModels } from "../context.js";
import {
  endOfLocalDay,
  localTzOffsetMs,
  startOfLocalMonth,
  startOfLocalWeekWindow,
} from "../dates.js";
import { formatCost, formatTokens } from "../render/format.js";
import { costCell, usageTable } from "../render/table.js";

// week(최근 7일)·month(이번 달 1일부터)는 같은 일별 breakdown 뷰를 공유한다
export const runDaily = async ({
  window,
  json,
  sync,
}: {
  window: "week" | "month";
  json: boolean;
  sync: boolean;
}) => {
  const now = new Date();
  const sinceEpoch =
    window === "week" ? startOfLocalWeekWindow({ now }) : startOfLocalMonth({ now });
  const untilEpoch = endOfLocalDay({ now });
  const tzOffsetMs = localTzOffsetMs({ now });

  const { db, pricing } = await createContext({ sync, quiet: json });
  const days = getDailyTotals({
    db,
    table: pricing.table,
    sinceEpoch,
    untilEpoch,
    tzOffsetMs,
  });
  const summary = getPeriodSummary({ db, table: pricing.table, sinceEpoch, untilEpoch });

  if (json) {
    console.log(JSON.stringify({ window, days, totals: summary }, null, 2));
    return;
  }

  const title = window === "week" ? "Last 7 days" : "This month";
  console.log(`\n${pc.bold(title)}\n`);

  if (days.length === 0) {
    console.log(pc.dim("이 기간에 기록된 사용량이 없습니다."));
    return;
  }

  const table = usageTable({
    head: ["Date", "Requests", "Input", "Output", "Cache Read", "Cost"],
  });
  for (const day of days) {
    table.push([
      day.date,
      { content: formatTokens({ count: day.requestCount }), hAlign: "right" },
      { content: formatTokens({ count: day.tokens.inputTokens }), hAlign: "right" },
      { content: formatTokens({ count: day.tokens.outputTokens }), hAlign: "right" },
      { content: formatTokens({ count: day.tokens.cacheReadTokens }), hAlign: "right" },
      costCell({ cost: day.cost }),
    ]);
  }
  table.push([
    pc.bold("Total"),
    { content: formatTokens({ count: summary.totals.requestCount }), hAlign: "right" },
    {
      content: formatTokens({ count: summary.totals.tokens.inputTokens }),
      hAlign: "right",
    },
    {
      content: formatTokens({ count: summary.totals.tokens.outputTokens }),
      hAlign: "right",
    },
    {
      content: formatTokens({ count: summary.totals.tokens.cacheReadTokens }),
      hAlign: "right",
    },
    costCell({ cost: summary.totals.totalCost }),
  ]);
  console.log(table.toString());

  console.log(
    `\n${pc.bold("Cache saved")}  ${pc.green(
      formatCost({ usd: summary.totals.cacheSavings.net }),
    )}`,
  );
  warnUnknownModels({ unknownModels: summary.unknownModels });
};
