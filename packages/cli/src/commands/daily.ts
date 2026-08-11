import { getDailyTotals, getPeriodSummary, getProjectTotals } from "@tokkaebi/core";
import pc from "picocolors";
import { createContext, warnUnknownModels } from "../context.js";
import {
  endOfLocalDay,
  localTzOffsetMs,
  startOfLocalMonth,
  startOfLocalWeekWindow,
} from "../dates.js";
import { formatCost, formatTokens, shortenPath } from "../render/format.js";
import { costBar, koreanWeekday } from "../render/korean.js";
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
  const projects = getProjectTotals({ db, table: pricing.table, sinceEpoch, untilEpoch });

  if (json) {
    console.log(JSON.stringify({ window, days, projects, totals: summary }, null, 2));
    return;
  }

  const title = window === "week" ? "최근 7일" : "이번 달";
  console.log(
    `\n${pc.bold(title)} · ${pc.bold(
      pc.green(formatCost({ usd: summary.totals.totalCost })),
    )}\n`,
  );

  if (days.length === 0) {
    console.log(pc.dim("이 기간에 기록된 사용량이 없습니다."));
    return;
  }

  const table = usageTable({
    head: ["날짜", "요청", "입력", "출력", "캐시 읽기", "비용", ""],
  });
  const maxCost = Math.max(...days.map(({ cost }) => cost.totalCost));
  for (const day of days) {
    table.push([
      `${day.date.slice(5)} (${koreanWeekday({ date: day.date })})`,
      { content: formatTokens({ count: day.requestCount }), hAlign: "right" },
      { content: formatTokens({ count: day.tokens.inputTokens }), hAlign: "right" },
      { content: formatTokens({ count: day.tokens.outputTokens }), hAlign: "right" },
      { content: formatTokens({ count: day.tokens.cacheReadTokens }), hAlign: "right" },
      costCell({ cost: day.cost }),
      costBar({ value: day.cost.totalCost, max: maxCost }),
    ]);
  }
  table.push([
    pc.bold("합계"),
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
    {
      content: pc.bold(pc.green(formatCost({ usd: summary.totals.totalCost }))),
      hAlign: "right",
    },
    "",
  ]);
  console.log(table.toString());

  console.log(`\n${pc.bold("프로젝트별")}`);
  const projectTable = usageTable({
    head: ["프로젝트", "요청", "입력", "출력", "캐시 읽기", "비용", ""],
  });
  const maxProjectCost = Math.max(...projects.map(({ cost }) => cost.totalCost));
  for (const project of projects) {
    projectTable.push([
      pc.cyan(shortenPath({ cwd: project.cwd })),
      { content: formatTokens({ count: project.requestCount }), hAlign: "right" },
      { content: formatTokens({ count: project.tokens.inputTokens }), hAlign: "right" },
      { content: formatTokens({ count: project.tokens.outputTokens }), hAlign: "right" },
      {
        content: formatTokens({ count: project.tokens.cacheReadTokens }),
        hAlign: "right",
      },
      costCell({ cost: project.cost }),
      costBar({ value: project.cost.totalCost, max: maxProjectCost }),
    ]);
  }
  console.log(projectTable.toString());

  console.log(
    `\n💰 ${pc.bold("캐시 절감")}  ${pc.green(
      formatCost({ usd: summary.totals.cacheSavings.net }),
    )}`,
  );
  warnUnknownModels({ unknownModels: summary.unknownModels });
};
