import {
  computeStreak,
  COST_MILESTONES,
  findNewMilestone,
  getPeriodSummary,
  getProjectBranchTotals,
  getUsageDayIndexes,
  projectMonthlySpend,
  readConfig,
  toDayIndex,
  TOKEN_MILESTONES,
  writeConfig,
  type TokenCounts,
} from "@tokkaebi/core";
import pc from "picocolors";
import { createContext, warnUnknownModels } from "../context.js";
import {
  endOfLocalDay,
  localTzOffsetMs,
  startOfLocalDay,
  startOfLocalMonth,
} from "../dates.js";
import { formatCost, shortenPath } from "../render/format.js";
import {
  budgetGauge,
  costBar,
  goblinTier,
  koreanTokenLabel,
  koreanWeekday,
} from "../render/korean.js";
import { costCell, tokenCells, usageTable } from "../render/table.js";
import { paceLine } from "./budget.js";

export const runToday = async ({ json, sync }: { json: boolean; sync: boolean }) => {
  const now = new Date();
  const sinceEpoch = startOfLocalDay({ now });
  const untilEpoch = endOfLocalDay({ now });
  const tzOffsetMs = localTzOffsetMs({ now });

  const { db, pricing } = await createContext({ sync, quiet: json });
  const summary = getPeriodSummary({ db, table: pricing.table, sinceEpoch, untilEpoch });
  const projectBranches = getProjectBranchTotals({
    db,
    table: pricing.table,
    sinceEpoch,
    untilEpoch,
  });
  const dayIndexes = getUsageDayIndexes({ db, tzOffsetMs });
  const streak = computeStreak({
    dayIndexes,
    todayIndex: toDayIndex({ epochMs: now.getTime(), tzOffsetMs }),
  });

  const config = await readConfig({});

  // 마일스톤: 누적 합계가 임계값을 새로 넘었을 때 1회만 축하한다.
  // 조회 명령이 파일을 쓰는 유일한 예외 경로 — 실패해도 출력은 성공해야 한다.
  const sumTokens = ({ tokens }: { tokens: TokenCounts }) =>
    tokens.inputTokens +
    tokens.outputTokens +
    tokens.cacheReadTokens +
    tokens.cache5mTokens +
    tokens.cache1hTokens;
  const cumulative = getPeriodSummary({
    db,
    table: pricing.table,
    sinceEpoch: 0,
    untilEpoch: Number.MAX_SAFE_INTEGER,
  });
  const cumulativeTokens = sumTokens({ tokens: cumulative.totals.tokens });
  const tokenMilestone = findNewMilestone({
    total: cumulativeTokens,
    celebrated: config.milestones?.celebratedTokens ?? 0,
    thresholds: TOKEN_MILESTONES,
  });
  const costMilestone = findNewMilestone({
    total: cumulative.totals.totalCost,
    celebrated: config.milestones?.celebratedCostUsd ?? 0,
    thresholds: COST_MILESTONES,
  });
  if (tokenMilestone != null || costMilestone != null) {
    try {
      await writeConfig({
        config: {
          milestones: {
            celebratedTokens: tokenMilestone ?? config.milestones?.celebratedTokens ?? 0,
            celebratedCostUsd: costMilestone ?? config.milestones?.celebratedCostUsd ?? 0,
          },
        },
      });
    } catch {
      // 축하 상태 저장 실패는 조용히 무시 — 다음 실행에서 다시 축하될 뿐이다
    }
  }

  const budgetUsd = config.budget?.monthlyUsd ?? null;
  const monthSpentUsd =
    budgetUsd == null
      ? null
      : getPeriodSummary({
          db,
          table: pricing.table,
          sinceEpoch: startOfLocalMonth({ now }),
          untilEpoch,
        }).totals.totalCost;

  if (json) {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const budget =
      budgetUsd == null || monthSpentUsd == null
        ? null
        : {
            monthlyUsd: budgetUsd,
            spentUsd: monthSpentUsd,
            ratio: monthSpentUsd / budgetUsd,
            ...projectMonthlySpend({
              spentUsd: monthSpentUsd,
              dayOfMonth: now.getDate(),
              daysInMonth,
            }),
          };
    const milestone =
      tokenMilestone != null
        ? { type: "tokens", threshold: tokenMilestone }
        : costMilestone != null
          ? { type: "cost", threshold: costMilestone }
          : null;
    console.log(
      JSON.stringify(
        { date: now.toISOString(), summary, projectBranches, streak, budget, milestone },
        null,
        2,
      ),
    );
    return;
  }

  const date = new Date(sinceEpoch).toLocaleDateString("sv-SE");
  console.log(
    `\n${pc.bold("오늘 사용량")} · ${date} (${koreanWeekday({ date })}) · ${pc.bold(
      pc.green(formatCost({ usd: summary.totals.totalCost })),
    )}\n`,
  );

  const printMilestones = () => {
    if (tokenMilestone != null) {
      console.log(
        pc.yellow(
          `🎉 누적 ${koreanTokenLabel({ count: tokenMilestone })} 토큰 돌파! ${pc.bold(
            goblinTier({ totalTokens: cumulativeTokens }),
          )} 등급입니다`,
        ),
      );
    }
    if (costMilestone != null) {
      console.log(pc.yellow(`🎉 누적 지출 ${formatCost({ usd: costMilestone })} 돌파!`));
    }
  };

  if (summary.totals.requestCount === 0) {
    console.log(pc.dim("오늘 기록된 사용량이 없습니다."));
    // 마일스톤은 이미 소비(config 기록)됐으므로 빈 날에도 반드시 보여준다
    printMilestones();
    return;
  }

  console.log(pc.bold("모델별"));
  const modelTable = usageTable({
    head: ["모델", "입력", "출력", "캐시 읽기", "캐시 쓰기", "비용", ""],
  });
  const maxModelCost = Math.max(...summary.models.map(({ cost }) => cost.totalCost));
  for (const row of summary.models) {
    modelTable.push([
      row.unknown ? `${row.model} ${pc.yellow("?")}` : pc.cyan(row.model),
      ...tokenCells({ tokens: row.tokens }),
      costCell({ cost: row.cost }),
      costBar({ value: row.cost.totalCost, max: maxModelCost, width: 8 }),
    ]);
  }
  modelTable.push([
    pc.bold("합계"),
    ...tokenCells({ tokens: summary.totals.tokens }),
    {
      content: pc.bold(pc.green(formatCost({ usd: summary.totals.totalCost }))),
      hAlign: "right",
    },
    "",
  ]);
  console.log(modelTable.toString());

  console.log(`\n${pc.bold("프로젝트 · 브랜치별")}`);
  const projectTable = usageTable({
    head: ["프로젝트", "브랜치", "입력", "출력", "캐시 읽기", "캐시 쓰기", "비용", ""],
  });
  const maxProjectCost = Math.max(...projectBranches.map(({ cost }) => cost.totalCost));
  for (const row of projectBranches) {
    projectTable.push([
      pc.cyan(shortenPath({ cwd: row.cwd })),
      row.branch ?? pc.dim("-"),
      ...tokenCells({ tokens: row.tokens }),
      costCell({ cost: row.cost }),
      costBar({ value: row.cost.totalCost, max: maxProjectCost, width: 8 }),
    ]);
  }
  console.log(projectTable.toString());

  const { net, gross } = summary.totals.cacheSavings;
  console.log(
    `\n💰 ${pc.bold("캐시 절감")}  ${pc.green(formatCost({ usd: net }))}  ${pc.dim(
      `— 캐시가 없었다면 오늘 ${formatCost({
        usd: summary.totals.totalCost + net,
      })} (읽기 절감 ${formatCost({ usd: gross })})`,
    )}`,
  );
  console.log(`🧌 ${pc.bold("연속 사용")}  ${pc.bold(String(streak))}일째`);
  if (budgetUsd != null && monthSpentUsd != null) {
    const percent = Math.round((monthSpentUsd / budgetUsd) * 100);
    console.log(
      `📊 ${pc.bold("월 예산")}   ${budgetGauge({ spent: monthSpentUsd, budget: budgetUsd })} ${percent}% · ${formatCost(
        { usd: monthSpentUsd },
      )}/${formatCost({ usd: budgetUsd })} · ${paceLine({
        spentUsd: monthSpentUsd,
        budgetUsd,
        now,
      })}`,
    );
  }
  printMilestones();
  warnUnknownModels({ unknownModels: summary.unknownModels });
};
