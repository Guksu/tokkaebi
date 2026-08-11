import { mkdtemp, appendFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseJsonlFrom } from "../src/parser/stream.js";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));
const fixture = (name: string) => join(fixturesDir, name);

describe("parseJsonlFrom", () => {
  it("parses every assistant record in a clean file", async () => {
    const { records, consumed, skips } = await parseJsonlFrom({
      filePath: fixture("basic.jsonl"),
    });

    expect(records).toHaveLength(3);
    expect(records.map(({ model }) => model)).toEqual([
      "claude-fable-5",
      "claude-opus-5",
      "claude-haiku-4-5-20251001",
    ]);
    expect(consumed).toBe((await stat(fixture("basic.jsonl"))).size);
    expect(skips).toEqual({});
  });

  it("keeps one record per requestId when content blocks duplicate the usage", async () => {
    const { records, skips } = await parseJsonlFrom({
      filePath: fixture("dup-request-id.jsonl"),
    });

    expect(records).toHaveLength(1);
    expect(skips.duplicate_in_file).toBe(2);
    expect(records[0]?.outputTokens).toBe(1424);
  });

  it("dedupes by message.id when requestId is absent", async () => {
    const { records, skips } = await parseJsonlFrom({
      filePath: fixture("no-request-id.jsonl"),
    });

    expect(records).toHaveLength(1);
    expect(records[0]?.dedupeKey).toBe("msg_norid_001");
    expect(skips.duplicate_in_file).toBe(1);
  });

  it("counts synthetic error records without storing them", async () => {
    const { records, skips } = await parseJsonlFrom({
      filePath: fixture("synthetic.jsonl"),
    });

    expect(records).toHaveLength(0);
    expect(skips.synthetic_model).toBe(1);
  });

  it("treats the legacy scalar as 5m cache writes", async () => {
    const { records } = await parseJsonlFrom({
      filePath: fixture("legacy-usage.jsonl"),
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      model: "claude-opus-4-8",
      cache5mTokens: 300,
      cache1hTokens: 0,
      ccVersion: "2.0.25",
    });
  });

  it("splits 1h and 5m cache writes from the cache_creation object", async () => {
    const { records } = await parseJsonlFrom({ filePath: fixture("cache-1h.jsonl") });

    expect(records[0]).toMatchObject({ cache5mTokens: 1000, cache1hTokens: 2000 });
  });

  it("skips non-assistant record types while keeping counts per reason", async () => {
    const { records, skips } = await parseJsonlFrom({
      filePath: fixture("mixed-types.jsonl"),
    });

    expect(records).toHaveLength(1);
    expect(skips.non_assistant).toBe(6);
    expect(skips.empty_line).toBe(1);
  });

  it("parses parent and subagent files that share a sessionId", async () => {
    const parent = await parseJsonlFrom({
      filePath: fixture(
        "session-with-subagent/00000000-0000-4000-8000-00000000aaaa.jsonl",
      ),
    });
    const subagent = await parseJsonlFrom({
      filePath: fixture(
        "session-with-subagent/00000000-0000-4000-8000-00000000aaaa/subagents/agent-abc123.jsonl",
      ),
    });

    expect(parent.records[0]?.sessionId).toBe(subagent.records[0]?.sessionId);
    expect(parent.records[0]?.isSidechain).toBe(false);
    expect(subagent.records[0]).toMatchObject({
      isSidechain: true,
      agentId: "abc123",
      attributionAgent: "Explore",
    });
  });

  it("leaves a truncated tail unconsumed so the next sync can retry it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tokkaebi-stream-"));
    const filePath = join(dir, "active-session.jsonl");
    const [fullLine] = (
      await import("node:fs/promises").then(({ readFile }) =>
        readFile(fixture("basic.jsonl"), "utf8"),
      )
    ).split("\n");
    if (!fullLine) throw new Error("fixture is empty");

    const half = fullLine.slice(0, Math.floor(fullLine.length / 2));
    await writeFile(filePath, `${fullLine}\n${half}`);

    const first = await parseJsonlFrom({ filePath });
    expect(first.records).toHaveLength(1);
    expect(first.consumed).toBe(Buffer.byteLength(`${fullLine}\n`));

    // 잘린 꼬리가 마저 기록된 뒤 offset에서 재개하면 그 레코드가 복구된다
    await appendFile(filePath, `${fullLine.slice(half.length)}\n`);
    const second = await parseJsonlFrom({ filePath, start: first.consumed });
    expect(second.records).toHaveLength(1);
    expect(second.records[0]?.dedupeKey).toBe(first.records[0]?.dedupeKey);
  });

  it("consumes a complete final line even without a trailing newline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tokkaebi-stream-"));
    const filePath = join(dir, "no-trailing-newline.jsonl");
    const [fullLine] = (
      await import("node:fs/promises").then(({ readFile }) =>
        readFile(fixture("cache-1h.jsonl"), "utf8"),
      )
    ).split("\n");
    await writeFile(filePath, fullLine ?? "");

    const { records, consumed } = await parseJsonlFrom({ filePath });

    expect(records).toHaveLength(1);
    expect(consumed).toBe((await stat(filePath)).size);
  });
});
