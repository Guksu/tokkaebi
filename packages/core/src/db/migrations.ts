import type { Database } from "better-sqlite3";

// 마이그레이션은 append-only — 배포된 항목은 수정하지 않고 새 항목을 추가한다.
// PRAGMA user_version이 적용된 마지막 인덱스+1을 가리킨다.
const migrations: string[] = [
  // v1: 초기 스키마.
  // 프롬프트/응답 원문 컬럼은 어떤 마이그레이션에서도 추가하지 않는다 —
  // 이 DB는 메타데이터(토큰·모델·시각·경로)만 저장한다.
  `
  CREATE TABLE files (
    id             INTEGER PRIMARY KEY,
    path           TEXT NOT NULL UNIQUE,
    byte_offset    INTEGER NOT NULL DEFAULT 0,
    size           INTEGER NOT NULL,
    mtime_ms       INTEGER NOT NULL,
    last_synced_at INTEGER NOT NULL
  );

  CREATE TABLE usage_records (
    id                 INTEGER PRIMARY KEY,
    dedupe_key         TEXT NOT NULL UNIQUE,
    file_id            INTEGER NOT NULL REFERENCES files(id),
    session_id         TEXT NOT NULL,
    ts_epoch           INTEGER NOT NULL,
    timestamp          TEXT NOT NULL,
    model              TEXT NOT NULL,
    input_tokens       INTEGER NOT NULL,
    output_tokens      INTEGER NOT NULL,
    cache_read_tokens  INTEGER NOT NULL,
    cache_5m_tokens    INTEGER NOT NULL,
    cache_1h_tokens    INTEGER NOT NULL,
    cwd                TEXT NOT NULL,
    git_branch         TEXT,
    is_sidechain       INTEGER NOT NULL DEFAULT 0,
    agent_id           TEXT,
    attribution_agent  TEXT,
    attribution_skill  TEXT,
    attribution_plugin TEXT,
    cc_version         TEXT
  );

  CREATE INDEX idx_usage_ts ON usage_records (ts_epoch);
  CREATE INDEX idx_usage_session ON usage_records (session_id, ts_epoch);

  -- 서브에이전트 파일이 부모 sessionId를 공유하므로 "파일=세션"이 아니다.
  -- 세션은 물리 테이블 대신 GROUP BY로 도출한다 (수만 행 규모라 ms 단위).
  CREATE VIEW sessions AS
  SELECT
    session_id,
    MIN(ts_epoch)          AS started_at,
    MAX(ts_epoch)          AS ended_at,
    MIN(cwd)               AS project_cwd,
    COUNT(*)               AS request_count,
    SUM(input_tokens)      AS input_tokens,
    SUM(output_tokens)     AS output_tokens,
    SUM(cache_read_tokens) AS cache_read_tokens,
    SUM(cache_5m_tokens)   AS cache_5m_tokens,
    SUM(cache_1h_tokens)   AS cache_1h_tokens
  FROM usage_records
  GROUP BY session_id;
  `,
];

export const migrate = ({ db }: { db: Database }) => {
  const applied = db.pragma("user_version", { simple: true }) as number;
  for (let version = applied; version < migrations.length; version += 1) {
    const sql = migrations[version];
    if (sql == null) continue;
    const run = db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version + 1}`);
    });
    run();
  }
};
