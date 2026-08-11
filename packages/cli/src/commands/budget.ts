import {
  getPeriodSummary,
  projectMonthlySpend,
  readConfig,
  writeConfig,
} from "@tokkaebi/core";
import pc from "picocolors";
import { createContext } from "../context.js";
import { endOfLocalDay, startOfLocalMonth } from "../dates.js";
import { formatCost } from "../render/format.js";
import { budgetGauge } from "../render/korean.js";

export const paceLine = ({
  spentUsd,
  budgetUsd,
  now,
}: {
  spentUsd: number;
  budgetUsd: number;
  now: Date;
}) => {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const { dailyAvgUsd, projectedUsd } = projectMonthlySpend({
    spentUsd,
    dayOfMonth: now.getDate(),
    daysInMonth,
  });
  const projected = `일평균 ${formatCost({ usd: dailyAvgUsd })} → 이 속도면 월말 ${formatCost({ usd: projectedUsd })}`;
  if (projectedUsd >= budgetUsd * 1.2) return pc.red(`${projected} 🚨 예산 크게 초과 예상`);
  if (projectedUsd > budgetUsd) return pc.yellow(`${projected} ⚠ 예산 초과 예상`);
  return `${projected} ${pc.green("· 예산 내")}`;
};

export const runBudgetShow = async ({ json, sync }: { json: boolean; sync: boolean }) => {
  const config = await readConfig({});
  const budgetUsd = config.budget?.monthlyUsd;

  if (budgetUsd == null) {
    if (json) {
      console.log(JSON.stringify({ budget: null }, null, 2));
      return;
    }
    console.log(
      `\n월 예산이 설정되어 있지 않습니다. ${pc.cyan("tokkaebi budget set 200")} 으로 설정하세요.`,
    );
    return;
  }

  const now = new Date();
  const { db, pricing } = await createContext({ sync, quiet: json });
  const summary = getPeriodSummary({
    db,
    table: pricing.table,
    sinceEpoch: startOfLocalMonth({ now }),
    untilEpoch: endOfLocalDay({ now }),
  });
  const spentUsd = summary.totals.totalCost;

  if (json) {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    console.log(
      JSON.stringify(
        {
          budget: {
            monthlyUsd: budgetUsd,
            spentUsd,
            ratio: spentUsd / budgetUsd,
            ...projectMonthlySpend({ spentUsd, dayOfMonth: now.getDate(), daysInMonth }),
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const percent = Math.round((spentUsd / budgetUsd) * 100);
  console.log(`\n${pc.bold("월 예산")}  ${formatCost({ usd: budgetUsd })}\n`);
  console.log(
    `이번 달  ${budgetGauge({ spent: spentUsd, budget: budgetUsd })} ${percent}% · ${formatCost({ usd: spentUsd })} / ${formatCost({ usd: budgetUsd })}`,
  );
  console.log(`페이스   ${paceLine({ spentUsd, budgetUsd, now })}`);
};

export const runBudgetSet = async ({ amount }: { amount: string }) => {
  const monthlyUsd = Number.parseFloat(amount);
  if (!Number.isFinite(monthlyUsd) || monthlyUsd <= 0) {
    console.error(pc.red(`올바른 금액이 아닙니다: ${amount} (예: tokkaebi budget set 200)`));
    process.exitCode = 1;
    return;
  }
  await writeConfig({ config: { budget: { monthlyUsd } } });
  console.log(
    `월 예산을 ${pc.green(formatCost({ usd: monthlyUsd }))}로 설정했습니다. ${pc.dim("tokkaebi today에 게이지가 표시됩니다.")}`,
  );
};

export const runBudgetClear = async () => {
  await writeConfig({ config: { budget: undefined } });
  console.log("월 예산을 해제했습니다.");
};
