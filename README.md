# tokkaebi 🧌

셀프호스팅 AI 사용량 추적기 — Claude Code 세션 로그를 로컬에서 파싱해 토큰 사용량과 비용을 집계합니다. **데이터는 내 머신 밖으로 나가지 않습니다.**

> A self-hosted, local-first usage tracker for Claude Code. No servers, no telemetry — your usage data never leaves your machine.

```
$ tokkaebi today
✔ synced 269 files · +128 records (0.4s)

Today · 2026-08-11 (Tue)

┌────────────────┬───────┬─────────┬────────────┬─────────────┬────────┐
│ Model          │ Input │ Output  │ Cache Read │ Cache Write │ Cost   │
│ claude-fable-5 │   344 │ 216,689 │ 28,139,441 │   1,166,290 │ $61.97 │
│ claude-opus-5  │    28 │      35 │    329,533 │      36,817 │  $0.40 │
│ Total          │   372 │ 216,724 │ 28,468,974 │   1,203,107 │ $62.36 │
└────────────────┴───────┴─────────┴────────────┴─────────────┴────────┘

Cache saved  $243.36  (read savings $254.74, without cache today would cost $305.73)
Streak       2 days 🧌
```

## 왜 tokkaebi인가

- **데이터 주권** — 훅도, 원격 서버도 없습니다. `~/.claude/projects/`의 세션 로그(JSONL)를 직접 파싱해 로컬 SQLite에만 저장합니다. 사내 도입 시 보안 심사 대상이 되는 외부 전송이 아예 없습니다.
- **소급 집계** — 훅 기반 도구는 설치 시점 이후만 기록하지만, tokkaebi는 원본 로그를 읽으므로 설치 전 과거 사용량까지 전부 집계됩니다. Claude Code가 오래된 로그를 지워도 이미 수집된 기록은 DB에 남습니다.
- **정확한 비용** — 하나의 API 응답이 로그에 여러 줄로 중복 기록되는 것을 dedupe하고(나이브 합산 대비 **약 2.4배 과대 집계 방지**), 5분/1시간 캐시 쓰기 단가를 분리해 계산합니다. 실측 교차검증: DB 레코드 수 == `jq` 독립 집계 결과 정확 일치.
- **심층 attribution** — 프로젝트별은 물론 **git 브랜치별, 서브에이전트별** 비용까지 분석합니다. 어떤 브랜치가, 어떤 에이전트가 토큰을 태우는지 보입니다.

## 설치

Node.js 20+ / pnpm 필요.

```bash
git clone https://github.com/Guksu/tokkaebi.git
cd tokkaebi
pnpm install && pnpm build
pnpm --filter tokkaebi link --global   # 이제 어디서든 `tokkaebi`
```

## 명령어

| 명령 | 설명 |
|------|------|
| `tokkaebi sync` | 세션 로그를 스캔해 DB 갱신 (증분 — 새 바이트만 파싱) |
| `tokkaebi today` | 오늘 사용량: 모델별 비용, 캐시 절감액, 스트릭 |
| `tokkaebi today --by branch` | 오늘 사용량을 **git 브랜치별**로 |
| `tokkaebi week` / `month` | 최근 7일 / 이번 달, 일별 breakdown |
| `tokkaebi sessions --top 10` | 비용 높은 세션 순위 (프로젝트·브랜치·비용) |
| `tokkaebi agents` | **서브에이전트별** 사용량·비용 |

공통 옵션: `--json`(스크립팅용 원시 데이터), `--no-sync`(자동 sync 생략). 조회 명령은 기본적으로 실행 전에 자동 sync합니다.

## 프라이버시 원칙

1. **원문 미저장** — DB에는 메타데이터만 저장합니다: 토큰 수·모델명·타임스탬프·프로젝트 경로·브랜치명. 프롬프트/응답 본문은 어떤 형태로도 저장하지 않으며, 스키마 마이그레이션에서 원문 컬럼 추가를 금지하고 있습니다.
2. **외부 미전송** — 네트워크 요청은 단 하나, [LiteLLM 공개 단가표](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) 다운로드(24시간 캐시)뿐입니다. 사용량 데이터는 어디로도 전송되지 않습니다. 오프라인에서도 번들 스냅샷 단가로 완전히 동작합니다.

## 아키텍처

```
packages/
  core/   # 파서(zod) · 비용(LiteLLM) · 저장(SQLite) · 집계 쿼리 — 터미널 출력 0줄
  cli/    # commander + cli-table3 — SQL 0줄, core의 plain object API만 소비
apps/
  web/    # (예정) 대시보드 placeholder
```

수집 파이프라인: `**/*.jsonl` 스캔 → 스트리밍 라인 파싱(수 MB 단일 라인 대응) → zod 검증 + 방어적 스킵(알 수 없는 레코드는 사유별 카운트) → `requestId` 기준 dedupe → SQLite 증분 저장(파일별 byte offset, 잘린 줄 재시도) → 조회 시 단가 적용.

비용을 DB에 저장하지 않고 조회 시 계산하므로, 단가표가 갱신되면 과거 기록의 비용도 자동으로 재계산됩니다.

## 로드맵

- [ ] 웹 대시보드 (`apps/web`, Next.js)
- [ ] MCP 서버 — Claude에서 "이번 주 얼마 썼어?"
- [ ] 팀 모드 — 셀프호스팅 서버로 집계 스냅샷 push (개인 데이터는 여전히 로컬)

## License

[MIT](./LICENSE)
