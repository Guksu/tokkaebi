import { getAgentTotals } from "@tokkaebi/core";
import pc from "picocolors";
import { createContext } from "../context.js";
import { formatTokens } from "../render/format.js";
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

  console.log(`\n${pc.bold("Usage by subagent")}\n`);
  if (agents.length === 0) {
    console.log(pc.dim("서브에이전트 사용 기록이 없습니다."));
    return;
  }

  const table = usageTable({
    head: ["Agent", "Requests", "Input", "Output", "Cache Read", "Cache Write", "Cost"],
  });
  for (const agent of agents) {
    table.push([
      agent.agent,
      { content: formatTokens({ count: agent.requestCount }), hAlign: "right" },
      ...tokenCells({ tokens: agent.tokens }),
      costCell({ cost: agent.cost }),
    ]);
  }
  console.log(table.toString());
};
