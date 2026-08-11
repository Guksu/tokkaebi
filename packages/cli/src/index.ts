import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };

const program = new Command();

program
  .name("tokkaebi")
  .description(
    "Self-hosted AI usage tracker — aggregates Claude Code token usage and costs locally",
  )
  .version(packageJson.version);

program.parse();
