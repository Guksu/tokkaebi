import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanJsonlFiles } from "../src/parser/scan.js";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

describe("scanJsonlFiles", () => {
  it("finds only .jsonl files, excluding meta.json and memory files", async () => {
    const rootDir = join(fixturesDir, "session-with-subagent");

    const files = await scanJsonlFiles({ rootDir });

    expect(files).toHaveLength(2);
    expect(files.every((file) => file.endsWith(".jsonl"))).toBe(true);
    expect(files.some((file) => file.includes("subagents/agent-abc123.jsonl"))).toBe(
      true,
    );
  });

  it("returns an empty list for a missing directory", async () => {
    const files = await scanJsonlFiles({
      rootDir: join(fixturesDir, "does-not-exist"),
    });

    expect(files).toEqual([]);
  });
});
