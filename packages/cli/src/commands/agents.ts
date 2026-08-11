import { getAgentTotals } from "@tokkaebi/core";
import pc from "picocolors";
import { createContext } from "../context.js";
import { formatTokens } from "../render/format.js";
import { costBar } from "../render/korean.js";
import { costCell, tokenCells, usageTable } from "../render/table.js";

// 서브에이전트(sidechain) 비용 가시화 — attribution_agent 기준
export const runAgents = async ({ json, sync }: { json: boolean; sync: boolean }) => {
  const { db, pricing } = await createContext({ sync, quiet: json });
  const agents = getAgentTotals({
    db,
    table: pricing.table,
    sinceEpoch: 0,
    untilEpoch: Number.MAX_SAFE_INTEGER,
  });

  if (json) {
    console.log(JSON.stringify({ agents }, null, 2));
    return;
  }

  console.log(`\n${pc.bold("서브에이전트별 사용량")} ${pc.dim("(전체 기간)")}\n`);
  if (agents.length === 0) {
    console.log(pc.dim("서브에이전트 사용 기록이 없습니다."));
    return;
  }

  const table = usageTable({
    head: ["에이전트", "요청", "입력", "출력", "캐시 읽기", "캐시 쓰기", "비용", ""],
  });
  const maxCost = Math.max(...agents.map(({ cost }) => cost.totalCost));
  for (const agent of agents) {
    table.push([
      pc.cyan(agent.agent),
      { content: formatTokens({ count: agent.requestCount }), hAlign: "right" },
      ...tokenCells({ tokens: agent.tokens }),
      costCell({ cost: agent.cost }),
      costBar({ value: agent.cost.totalCost, max: maxCost, width: 8 }),
    ]);
  }
  console.log(table.toString());
};
