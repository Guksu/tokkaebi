import { stat } from "node:fs/promises";
import type { Database } from "better-sqlite3";
import { scanJsonlFiles } from "../parser/scan.js";
import { parseJsonlFrom } from "../parser/stream.js";
import type { SkipCounts, SkipReason, UsageRecordInput } from "../types.js";

export type SyncReport = {
  filesScanned: number;
  filesChanged: number;
  /** 재생성(축소) 감지로 처음부터 다시 파싱한 파일 수 */
  reparsedFiles: number;
  newRecords: number;
  skips: SkipCounts;
};

type FileRow = {
  id: number;
  byte_offset: number;
  size: number;
  mtime_ms: number;
};

const mergeSkips = ({ into, from }: { into: SkipCounts; from: SkipCounts }) => {
  for (const [reason, count] of Object.entries(from)) {
    into[reason as SkipReason] = (into[reason as SkipReason] ?? 0) + (count ?? 0);
  }
};

export const syncUsage = async ({
  db,
  claudeProjectsDir,
}: {
  db: Database;
  claudeProjectsDir: string;
}): Promise<SyncReport> => {
  const report: SyncReport = {
    filesScanned: 0,
    filesChanged: 0,
    reparsedFiles: 0,
    newRecords: 0,
    skips: {},
  };

  const selectFile = db.prepare("SELECT id, byte_offset, size, mtime_ms FROM files WHERE path = ?");
  const upsertFile = db.prepare(`
    INSERT INTO files (path, byte_offset, size, mtime_ms, last_synced_at)
    VALUES (@path, @byteOffset, @size, @mtimeMs, @lastSyncedAt)
    ON CONFLICT(path) DO UPDATE SET
      byte_offset = excluded.byte_offset,
      size = excluded.size,
      mtime_ms = excluded.mtime_ms,
      last_synced_at = excluded.last_synced_at
    RETURNING id
  `);
  const resetFileRecords = db.prepare("DELETE FROM usage_records WHERE file_id = ?");
  const insertRecord = db.prepare(`
    INSERT OR IGNORE INTO usage_records (
      dedupe_key, file_id, session_id, ts_epoch, timestamp, model,
      input_tokens, output_tokens, cache_read_tokens, cache_5m_tokens, cache_1h_tokens,
      cwd, git_branch, is_sidechain, agent_id,
      attribution_agent, attribution_skill, attribution_plugin, cc_version
    ) VALUES (
      @dedupeKey, @fileId, @sessionId, @tsEpoch, @timestamp, @model,
      @inputTokens, @outputTokens, @cacheReadTokens, @cache5mTokens, @cache1hTokens,
      @cwd, @gitBranch, @isSidechain, @agentId,
      @attributionAgent, @attributionSkill, @attributionPlugin, @ccVersion
    )
  `);

  // 파싱(비동기)은 트랜잭션 밖에서 하고, DB 쓰기만 파일 단위 트랜잭션으로 묶는다
  const commitFile = db.transaction(
    ({
      path,
      records,
      byteOffset,
      size,
      mtimeMs,
      resetFirst,
      priorFileId,
    }: {
      path: string;
      records: UsageRecordInput[];
      byteOffset: number;
      size: number;
      mtimeMs: number;
      resetFirst: boolean;
      priorFileId: number | null;
    }) => {
      if (resetFirst && priorFileId != null) resetFileRecords.run(priorFileId);
      const { id: fileId } = upsertFile.get({
        path,
        byteOffset,
        size,
        mtimeMs,
        lastSyncedAt: Date.now(),
      }) as { id: number };

      let inserted = 0;
      for (const record of records) {
        const result = insertRecord.run({
          ...record,
          fileId,
          isSidechain: record.isSidechain ? 1 : 0,
        });
        inserted += result.changes;
      }
      return inserted;
    },
  );

  const paths = await scanJsonlFiles({ rootDir: claudeProjectsDir });
  for (const path of paths) {
    report.filesScanned += 1;
    const stats = await stat(path);
    const row = (selectFile.get(path) as FileRow | undefined) ?? null;

    // 변화 없음 + 지난번에 파일 끝까지 소화했을 때만 빠른 스킵.
    // (잘린 꼬리가 남아 byte_offset < size인 파일은 재시도해야 한다)
    if (
      row != null &&
      stats.size === row.size &&
      Math.trunc(stats.mtimeMs) === row.mtime_ms &&
      row.byte_offset === row.size
    ) {
      continue;
    }

    // 파일 축소 = 재생성으로 간주 → 이 파일 유래 레코드를 버리고 처음부터
    const shrunk = row != null && stats.size < row.byte_offset;
    const start = shrunk ? 0 : (row?.byte_offset ?? 0);
    if (shrunk) report.reparsedFiles += 1;

    const { records, consumed, skips } = await parseJsonlFrom({
      filePath: path,
      start,
    });
    mergeSkips({ into: report.skips, from: skips });

    const inserted = commitFile({
      path,
      records,
      byteOffset: start + consumed,
      size: stats.size,
      mtimeMs: Math.trunc(stats.mtimeMs),
      resetFirst: shrunk,
      priorFileId: row?.id ?? null,
    });
    report.newRecords += inserted;
    if (inserted > 0 || shrunk) report.filesChanged += 1;
  }

  return report;
};
