import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readConfig, writeConfig } from "../src/config.js";

const tempConfigPath = async () => {
  const dir = await mkdtemp(join(tmpdir(), "tokkaebi-config-"));
  return join(dir, "config.json");
};

describe("readConfig", () => {
  it("returns an empty config when the file does not exist", async () => {
    expect(await readConfig({ configPath: await tempConfigPath() })).toEqual({});
  });

  it("returns an empty config for broken JSON instead of throwing", async () => {
    const configPath = await tempConfigPath();
    await writeFile(configPath, "{ not json");

    expect(await readConfig({ configPath })).toEqual({});
  });

  it("ignores fields with wrong types", async () => {
    const configPath = await tempConfigPath();
    await writeFile(
      configPath,
      JSON.stringify({ budget: { monthlyUsd: "abc" }, milestones: { celebratedTokens: 5 } }),
    );

    const config = await readConfig({ configPath });

    expect(config.budget).toBeUndefined();
    expect(config.milestones?.celebratedTokens).toBe(5);
  });
});

describe("writeConfig", () => {
  it("round-trips budget and milestone state", async () => {
    const configPath = await tempConfigPath();

    await writeConfig({
      config: { budget: { monthlyUsd: 200 }, milestones: { celebratedTokens: 1e8 } },
      configPath,
    });

    const config = await readConfig({ configPath });
    expect(config.budget?.monthlyUsd).toBe(200);
    expect(config.milestones?.celebratedTokens).toBe(1e8);
  });

  it("keeps the budget when only milestones are updated", async () => {
    const configPath = await tempConfigPath();
    await writeConfig({ config: { budget: { monthlyUsd: 200 } }, configPath });

    await writeConfig({ config: { milestones: { celebratedTokens: 1e7 } }, configPath });

    const config = await readConfig({ configPath });
    expect(config.budget?.monthlyUsd).toBe(200);
    expect(config.milestones?.celebratedTokens).toBe(1e7);
  });

  it("clears the budget only when explicitly set to undefined", async () => {
    const configPath = await tempConfigPath();
    await writeConfig({ config: { budget: { monthlyUsd: 200 } }, configPath });

    await writeConfig({ config: { budget: undefined }, configPath });

    expect((await readConfig({ configPath })).budget).toBeUndefined();
  });

  it("preserves unknown keys the user added by hand", async () => {
    const configPath = await tempConfigPath();
    await writeFile(
      configPath,
      JSON.stringify({ budget: { monthlyUsd: 100 }, myCustomNote: "keep me" }),
    );

    await writeConfig({ config: { budget: { monthlyUsd: 300 } }, configPath });

    const raw = JSON.parse(await readFile(configPath, "utf8"));
    expect(raw.myCustomNote).toBe("keep me");
    expect(raw.budget.monthlyUsd).toBe(300);
  });
});
