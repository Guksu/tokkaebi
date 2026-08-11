import { getTopSessions } from "@tokkaebi/core";
import pc from "picocolors";
import { createContext } from "../context.js";
import { formatTokens, shortenPath } from "../render/format.js";
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

  console.log(`\n${pc.bold(`Top ${top} sessions by cost`)}\n`);
  if (sessions.length === 0) {
    console.log(pc.dim("기록된 세션이 없습니다."));
    return;
  }

  const table = usageTable({
    head: ["Started", "Project", "Branch", "Requests", "Tokens", "Cost"],
  });
  for (const session of sessions) {
    const totalTokens =
      session.tokens.inputTokens +
      session.tokens.outputTokens +
      session.tokens.cacheReadTokens +
      session.tokens.cache5mTokens +
      session.tokens.cache1hTokens;
    table.push([
      new Date(session.startedAt).toLocaleString("sv-SE").slice(0, 16),
      shortenPath({ cwd: session.projectCwd }),
      session.gitBranch ?? pc.dim("-"),
      { content: formatTokens({ count: session.requestCount }), hAlign: "right" },
      { content: formatTokens({ count: totalTokens }), hAlign: "right" },
      costCell({ cost: session.totalCost }),
    ]);
  }
  console.log(table.toString());
};
