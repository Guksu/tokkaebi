import { appendFile, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/database.js";
import { syncUsage } from "../src/db/sync.js";

const fixturesDir = fileURLToPath(new URL("./fixtures", import.meta.url));

const openTestDb = () => openDatabase({ dbPath: ":memory:" });

const makeAssistantLine = ({
  dedupeKey,
  sessionId = "00000000-0000-4000-8000-000000000099",
  inputTokens = 10,
}: {
  dedupeKey: string;
  sessionId?: string;
  inputTokens?: number;
}) =>
  JSON.stringify({
    type: "assistant",
    uuid: `uuid-${dedupeKey}`,
    sessionId,
    timestamp: "2026-08-11T09:00:00.000Z",
    cwd: "/home/user/project-tmp",
    gitBranch: "main",
    isSidechain: false,
    userType: "external",
    version: "2.1.227",
    requestId: dedupeKey,
    message: {
      id: `msg-${dedupeKey}`,
      model: "claude-fable-5",
      usage: {
        input_tokens: inputTokens,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 0,
        },
      },
    },
  });

const countRecords = (db: ReturnType<typeof openTestDb>) =>
  (db.prepare("SELECT COUNT(*) AS n FROM usage_records").get() as { n: number }).n;

let cleanupDirs: string[] = [];
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "tokkaebi-sync-"));
  cleanupDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  cleanupDirs = [];
});

describe("syncUsage", () => {
  it("ingests every fixture file with correct dedupe and skip counts", async () => {
    const db = openTestDb();

    const report = await syncUsage({ db, claudeProjectsDir: fixturesDir });

    // basic 3 + dup 1 + no-request-id 1 + legacy 1 + cache-1h 1 + mixed 1
    // + synthetic 0 + 부모 세션 1 + 서브에이전트 1 = 10
    expect(report.newRecords).toBe(10);
    expect(countRecords(db)).toBe(10);
    expect(report.skips.duplicate_in_file).toBe(3);
    expect(report.skips.synthetic_model).toBe(1);
    expect(report.filesScanned).toBe(9);
  });

  it("is idempotent — a second sync ingests nothing", async () => {
    const db = openTestDb();
    await syncUsage({ db, claudeProjectsDir: fixturesDir });

    const second = await syncUsage({ db, claudeProjectsDir: fixturesDir });

    expect(second.newRecords).toBe(0);
    expect(second.filesChanged).toBe(0);
    expect(countRecords(db)).toBe(10);
  });

  it("parses only appended bytes on incremental sync", async () => {
    const db = openTestDb();
    const dir = await tempDir();
    const filePath = join(dir, "session.jsonl");
    await writeFile(filePath, `${makeAssistantLine({ dedupeKey: "req_inc_1" })}\n`);
    await syncUsage({ db, claudeProjectsDir: dir });

    await appendFile(filePath, `${makeAssistantLine({ dedupeKey: "req_inc_2" })}\n`);
    const report = await syncUsage({ db, claudeProjectsDir: dir });

    expect(report.newRecords).toBe(1);
    expect(countRecords(db)).toBe(2);
  });

  it("retries a truncated tail once the writer completes the line", async () => {
    const db = openTestDb();
    const dir = await tempDir();
    const filePath = join(dir, "active.jsonl");
    const full = makeAssistantLine({ dedupeKey: "req_tail_1" });
    const tail = makeAssistantLine({ dedupeKey: "req_tail_2" });
    await writeFile(filePath, `${full}\n${tail.slice(0, 40)}`);

    const first = await syncUsage({ db, claudeProjectsDir: dir });
    expect(first.newRecords).toBe(1);

    await appendFile(filePath, `${tail.slice(40)}\n`);
    const second = await syncUsage({ db, claudeProjectsDir: dir });

    expect(second.newRecords).toBe(1);
    expect(countRecords(db)).toBe(2);
  });

  it("reparses a file from scratch when it shrinks (recreated log)", async () => {
    const db = openTestDb();
    const dir = await tempDir();
    const filePath = join(dir, "recreated.jsonl");
    await writeFile(
      filePath,
      `${makeAssistantLine({ dedupeKey: "req_old_1" })}\n${makeAssistantLine({ dedupeKey: "req_old_2" })}\n`,
    );
    await syncUsage({ db, claudeProjectsDir: dir });
    expect(countRecords(db)).toBe(2);

    await writeFile(filePath, `${makeAssistantLine({ dedupeKey: "req_new_1" })}\n`);
    const report = await syncUsage({ db, claudeProjectsDir: dir });

    expect(report.reparsedFiles).toBe(1);
    expect(countRecords(db)).toBe(1);
    const keys = db
      .prepare("SELECT dedupe_key FROM usage_records ORDER BY dedupe_key")
      .all() as { dedupe_key: string }[];
    expect(keys.map(({ dedupe_key }) => dedupe_key)).toEqual(["req_new_1"]);
  });

  it("preserves records from deleted files (retroactive history)", async () => {
    const db = openTestDb();
    const dir = await tempDir();
    const filePath = join(dir, "ephemeral.jsonl");
    await writeFile(filePath, `${makeAssistantLine({ dedupeKey: "req_keep_1" })}\n`);
    await syncUsage({ db, claudeProjectsDir: dir });

    await rm(filePath);
    const report = await syncUsage({ db, claudeProjectsDir: dir });

    expect(report.newRecords).toBe(0);
    expect(countRecords(db)).toBe(1);
  });

  it("ignores a dedupe key that already exists in another file", async () => {
    const db = openTestDb();
    const dir = await tempDir();
    await writeFile(
      join(dir, "a.jsonl"),
      `${makeAssistantLine({ dedupeKey: "req_shared", inputTokens: 10 })}\n`,
    );
    await writeFile(
      join(dir, "b.jsonl"),
      `${makeAssistantLine({ dedupeKey: "req_shared", inputTokens: 999 })}\n`,
    );

    const report = await syncUsage({ db, claudeProjectsDir: dir });

    expect(report.newRecords).toBe(1);
    expect(countRecords(db)).toBe(1);
  });

  it("stores sidechain attribution columns for subagent files", async () => {
    const db = openTestDb();
    const dir = await tempDir();
    await mkdir(join(dir, "session-a", "subagents"), { recursive: true });
    await cp(
      join(
        fixturesDir,
        "session-with-subagent/00000000-0000-4000-8000-00000000aaaa/subagents/agent-abc123.jsonl",
      ),
      join(dir, "session-a", "subagents", "agent-abc123.jsonl"),
    );

    await syncUsage({ db, claudeProjectsDir: dir });

    const row = db
      .prepare(
        "SELECT is_sidechain, agent_id, attribution_agent FROM usage_records LIMIT 1",
      )
      .get() as { is_sidechain: number; agent_id: string; attribution_agent: string };
    expect(row).toEqual({
      is_sidechain: 1,
      agent_id: "abc123",
      attribution_agent: "Explore",
    });
  });
});

describe("openDatabase", () => {
  it("applies migrations and exposes the sessions view", async () => {
    const db = openTestDb();

    const version = db.pragma("user_version", { simple: true });
    expect(version).toBe(1);

    // sessions 뷰: 부모+서브에이전트 레코드가 session_id로 자연 병합된다
    await syncUsage({
      db,
      claudeProjectsDir: join(fixturesDir, "session-with-subagent"),
    });
    const session = db
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get("00000000-0000-4000-8000-00000000aaaa") as Record<string, unknown>;
    expect(session.request_count).toBe(2);
    expect(session.input_tokens).toBe(70);
  });
});
