import { getTopSessions } from "@tokkaebi/core";
import pc from "picocolors";
import { createContext } from "../context.js";
import { formatTokens, shortenPath } from "../render/format.js";
import { costBar } from "../render/korean.js";
import { costCell, usageTable } from "../render/table.js";

export const runSessions = async ({
  top,
  json,
  sync,
}: {
  top: number;
  json: boolean;
  sync: boolean;
}) => {
  const { db, pricing } = await createContext({ sync, quiet: json });
  const sessions = getTopSessions({ db, table: pricing.table, limit: top });

  if (json) {
    console.log(JSON.stringify({ sessions }, null, 2));
    return;
  }

  console.log(`\n${pc.bold(`비용 상위 세션 TOP ${top}`)}\n`);
  if (sessions.length === 0) {
    console.log(pc.dim("기록된 세션이 없습니다."));
    return;
  }

  const table = usageTable({
    head: ["시작", "프로젝트", "브랜치", "요청", "토큰", "비용", ""],
  });
  const maxCost = Math.max(...sessions.map(({ totalCost }) => totalCost));
  for (const session of sessions) {
    const totalTokens =
      session.tokens.inputTokens +
      session.tokens.outputTokens +
      session.tokens.cacheReadTokens +
      session.tokens.cache5mTokens +
      session.tokens.cache1hTokens;
    table.push([
      pc.dim(new Date(session.startedAt).toLocaleString("sv-SE").slice(0, 16)),
      pc.cyan(shortenPath({ cwd: session.projectCwd })),
      session.gitBranch ?? pc.dim("-"),
      { content: formatTokens({ count: session.requestCount }), hAlign: "right" },
      { content: formatTokens({ count: totalTokens }), hAlign: "right" },
      costCell({ cost: session.totalCost }),
      costBar({ value: session.totalCost, max: maxCost, width: 8 }),
    ]);
  }
  console.log(table.toString());
};
