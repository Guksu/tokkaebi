import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { runAgents } from "./commands/agents.js";
import { runDaily } from "./commands/daily.js";
import { runSessions } from "./commands/sessions.js";
import { runSync } from "./commands/sync.js";
import { runToday } from "./commands/today.js";

const program = new Command();

program
  .name("tokkaebi")
  .description(
    "Self-hosted AI usage tracker — aggregates Claude Code token usage and costs locally",
  )
  .version(packageJson.version);

program
  .command("sync")
  .description("scan Claude Code session logs and update the local database")
  .option("--json", "print the sync report as JSON", false)
  .action(({ json }: { json: boolean }) => runSync({ json }));

program
  .command("today")
  .description("today's usage: cost per model, cache savings, streak")
  .option("--by <dimension>", "group by 'model' or 'branch'", "model")
  .option("--json", "print raw data as JSON", false)
  .option("--no-sync", "skip the automatic sync before querying")
  .action(({ by, json, sync }: { by: string; json: boolean; sync: boolean }) =>
    runToday({ by: by === "branch" ? "branch" : "model", json, sync }),
  );

program
  .command("week")
  .description("last 7 days with a daily breakdown")
  .option("--json", "print raw data as JSON", false)
  .option("--no-sync", "skip the automatic sync before querying")
  .action(({ json, sync }: { json: boolean; sync: boolean }) =>
    runDaily({ window: "week", json, sync }),
  );

program
  .command("month")
  .description("this month with a daily breakdown")
  .option("--json", "print raw data as JSON", false)
  .option("--no-sync", "skip the automatic sync before querying")
  .action(({ json, sync }: { json: boolean; sync: boolean }) =>
    runDaily({ window: "month", json, sync }),
  );

program
  .command("sessions")
  .description("most expensive sessions")
  .option("--top <n>", "number of sessions to show", "10")
  .option("--json", "print raw data as JSON", false)
  .option("--no-sync", "skip the automatic sync before querying")
  .action(({ top, json, sync }: { top: string; json: boolean; sync: boolean }) =>
    runSessions({ top: Number.parseInt(top, 10) || 10, json, sync }),
  );

program
  .command("agents")
  .description("usage attributed to subagents (sidechains)")
  .option("--json", "print raw data as JSON", false)
  .option("--no-sync", "skip the automatic sync before querying")
  .action(({ json, sync }: { json: boolean; sync: boolean }) =>
    runAgents({ json, sync }),
  );

await program.parseAsync();
