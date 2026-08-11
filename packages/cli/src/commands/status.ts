import {
  getDbPath,
  getPeriodSummary,
  getTokkaebiHome,
  loadPricingTable,
  openDatabase,
  readConfig,
} from "@tokkaebi/core/lite";
import pc from "picocolors";
import { endOfLocalDay, startOfLocalDay, startOfLocalMonth } from "../dates.js";
import { formatCost } from "../render/format.js";

// 셸 프롬프트/tmux에 매번 뜨는 명령 — sync도, 단가 fetch도 하지 않는다 (<100ms 목표).
// 최신 수집이 필요하면 tokkaebi sync를 따로 실행한다.
export const runStatus = async ({ plain, json }: { plain: boolean; json: boolean }) => {
  const now = new Date();
  const db = openDatabase({ dbPath: getDbPath() });
  const pricing = await loadPricingTable({ cacheDir: getTokkaebiHome(), offline: true });
  const config = await readConfig({});

  const untilEpoch = endOfLocalDay({ now });
  const todayUsd = getPeriodSummary({
    db,
    table: pricing.table,
    sinceEpoch: startOfLocalDay({ now }),
    untilEpoch,
  }).totals.totalCost;
  const monthUsd = getPeriodSummary({
    db,
    table: pricing.table,
    sinceEpoch: startOfLocalMonth({ now }),
    untilEpoch,
  }).totals.totalCost;

  const budgetUsd = config.budget?.monthlyUsd ?? null;

  if (json) {
    console.log(
      JSON.stringify({
        todayUsd,
        monthUsd,
        budget:
          budgetUsd == null ? null : { monthlyUsd: budgetUsd, ratio: monthUsd / budgetUsd },
      }),
    );
    return;
  }

  const monthPart =
    budgetUsd == null
      ? `월 ${formatCost({ usd: monthUsd })}`
      : `월 ${Math.round((monthUsd / budgetUsd) * 100)}% (${formatCost({ usd: monthUsd })}/${formatCost({ usd: budgetUsd })})`;

  if (plain) {
    console.log(`오늘 ${formatCost({ usd: todayUsd })} · ${monthPart}`);
    return;
  }
  console.log(
    `🧌 오늘 ${pc.green(formatCost({ usd: todayUsd }))} ${pc.dim("·")} ${monthPart}`,
  );
};
