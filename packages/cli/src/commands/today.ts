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
import { costCell, tokenCells, usageTable } from "../render/table.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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

  const dateLabel = `${new Date(sinceEpoch).toLocaleDateString("sv-SE")} (${WEEKDAYS[now.getDay()]})`;
  console.log(`\n${pc.bold("Today")} · ${dateLabel}\n`);

  if (summary.totals.requestCount === 0) {
    console.log(pc.dim("오늘 기록된 사용량이 없습니다."));
    return;
  }

  const groupHead = by === "branch" ? "Branch" : "Model";
  const table = usageTable({
    head: [groupHead, "Input", "Output", "Cache Read", "Cache Write", "Cost"],
  });

  if (by === "branch") {
    const branches = getBranchTotals({ db, table: pricing.table, sinceEpoch, untilEpoch });
    for (const row of branches) {
      table.push([
        row.branch ?? pc.dim("(no branch)"),
        ...tokenCells({ tokens: row.tokens }),
        costCell({ cost: row.cost }),
      ]);
    }
  } else {
    for (const row of summary.models) {
      table.push([
        row.unknown ? `${row.model} ${pc.yellow("?")}` : row.model,
        ...tokenCells({ tokens: row.tokens }),
        costCell({ cost: row.cost }),
      ]);
    }
  }
  table.push([
    pc.bold("Total"),
    ...tokenCells({ tokens: summary.totals.tokens }),
    costCell({ cost: summary.totals.totalCost }),
  ]);
  console.log(table.toString());

  const { net, gross } = summary.totals.cacheSavings;
  console.log(
    `\n${pc.bold("Cache saved")}  ${pc.green(formatCost({ usd: net }))}  ${pc.dim(
      `(read savings ${formatCost({ usd: gross })}, without cache today would cost ${formatCost(
        { usd: summary.totals.totalCost + net },
      )})`,
    )}`,
  );
  console.log(`${pc.bold("Streak")}       ${streak} day${streak === 1 ? "" : "s"} 🧌`);
  warnUnknownModels({ unknownModels: summary.unknownModels });
};
