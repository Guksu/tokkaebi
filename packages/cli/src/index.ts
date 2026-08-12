import { Command, type Help } from "commander";
import pc from "picocolors";
import packageJson from "../package.json" with { type: "json" };

const program = new Command();

// commander 기본 헬프의 영문 섹션 제목(Usage/Options/Commands)을 한글로
const formatHelp = (cmd: Command, helper: Help) => {
  const termWidth = helper.padWidth(cmd, helper);
  const row = (term: string, description: string) =>
    `  ${pc.cyan(term.padEnd(termWidth + 2))}${description}`;

  const lines: string[] = [];
  lines.push(`\n${pc.bold("사용법:")} ${helper.commandUsage(cmd)}`);

  const description = helper.commandDescription(cmd);
  if (description !== "") lines.push("", description);

  const commands = helper.visibleCommands(cmd);
  if (commands.length > 0) {
    lines.push("", pc.bold("명령:"));
    for (const sub of commands) {
      lines.push(row(helper.subcommandTerm(sub), helper.subcommandDescription(sub)));
    }
  }

  const options = helper.visibleOptions(cmd);
  if (options.length > 0) {
    lines.push("", pc.bold("옵션:"));
    for (const option of options) {
      lines.push(row(helper.optionTerm(option), helper.optionDescription(option)));
    }
  }

  lines.push("");
  return lines.join("\n");
};

program
  .name("tokkaebi")
  .description(
    "🧌 셀프호스팅 AI 사용량 추적기 — Claude Code 세션 로그를 로컬에서 집계합니다.\n데이터는 내 머신 밖으로 나가지 않습니다.",
  )
  .version(packageJson.version, "-V, --version", "버전 표시")
  .helpOption("-h, --help", "도움말 표시")
  .helpCommand(false)
  .configureHelp({ formatHelp });

const withCommonOptions = (command: Command) =>
  command
    .configureHelp({ formatHelp })
    .option("--json", "표 대신 원시 데이터를 JSON으로 출력", false)
    .option("--no-sync", "조회 전 자동 동기화 생략 (DB만 조회, 빠름)");

program
  .command("sync")
  .description("세션 로그를 스캔해 로컬 DB 갱신 (새 데이터만 증분 수집)")
  .configureHelp({ formatHelp })
  .option("--json", "동기화 리포트를 JSON으로 출력", false)
  .action(({ json }: { json: boolean }) => import("./commands/sync.js").then(({ runSync }) => runSync({ json })));

withCommonOptions(
  program
    .command("today")
    .description("오늘 사용량 — 모델별 · 프로젝트/브랜치별 비용, 캐시 절감, 연속 사용일"),
).action(({ json, sync }: { json: boolean; sync: boolean }) => import("./commands/today.js").then(({ runToday }) => runToday({ json, sync })));

withCommonOptions(
  program.command("week").description("최근 7일 — 일별 추이 + 프로젝트별 합계"),
).action(({ json, sync }: { json: boolean; sync: boolean }) =>
  import("./commands/daily.js").then(({ runDaily }) => runDaily({ window: "week", json, sync })),
);

withCommonOptions(
  program.command("month").description("이번 달 — 일별 추이 + 프로젝트별 합계"),
).action(({ json, sync }: { json: boolean; sync: boolean }) =>
  import("./commands/daily.js").then(({ runDaily }) => runDaily({ window: "month", json, sync })),
);

withCommonOptions(
  program
    .command("sessions")
    .description("비용 상위 세션 랭킹 (프로젝트 · 브랜치 · 비용)")
    .option("--top <n>", "표시할 세션 수", "10"),
).action(({ top, json, sync }: { top: string; json: boolean; sync: boolean }) =>
  import("./commands/sessions.js").then(({ runSessions }) => runSessions({ top: Number.parseInt(top, 10) || 10, json, sync })),
);

const budget = program
  .command("budget")
  .description("월 예산 관리 — 게이지와 월말 페이스 예측")
  .configureHelp({ formatHelp });
withCommonOptions(budget).action(({ json, sync }: { json: boolean; sync: boolean }) =>
  import("./commands/budget.js").then(({ runBudgetShow }) => runBudgetShow({ json, sync })),
);
budget
  .command("set <금액>")
  .description("월 예산 설정 (USD, 예: 200)")
  .configureHelp({ formatHelp })
  .action((amount: string) => import("./commands/budget.js").then(({ runBudgetSet }) => runBudgetSet({ amount })));
budget
  .command("clear")
  .description("월 예산 해제")
  .configureHelp({ formatHelp })
  .action(() => import("./commands/budget.js").then(({ runBudgetClear }) => runBudgetClear()));

program
  .command("status")
  .description("셸 프롬프트·tmux용 한 줄 요약 (동기화 없음, 빠름)")
  .configureHelp({ formatHelp })
  .option("--plain", "색·이모지 없이 출력", false)
  .option("--json", "JSON으로 출력", false)
  .action(({ plain, json }: { plain: boolean; json: boolean }) =>
    import("./commands/status.js").then(({ runStatus }) => runStatus({ plain, json })),
  );

withCommonOptions(
  program.command("agents").description("서브에이전트별 사용량 · 비용 (전체 기간)"),
).action(({ json, sync }: { json: boolean; sync: boolean }) => import("./commands/agents.js").then(({ runAgents }) => runAgents({ json, sync })));

withCommonOptions(
  program
    .command("heatmap")
    .description("요일 × 시간대 사용 히트맵 — 언제 많이 쓰는지 한눈에")
    .option("--weeks <n>", "집계 기간(주)", "8"),
).action(({ weeks, json, sync }: { weeks: string; json: boolean; sync: boolean }) =>
  import("./commands/heatmap.js").then(({ runHeatmap }) =>
    runHeatmap({ weeks: Number.parseInt(weeks, 10) || 8, json, sync }),
  ),
);

withCommonOptions(
  program
    .command("trend")
    .description("주간 비용 추이 — 스파크라인 + 전주 대비 증감")
    .option("--weeks <n>", "집계 기간(주)", "12")
    .option("--daily", "최근 30일 일별 추이로 보기", false),
).action(
  ({
    weeks,
    daily,
    json,
    sync,
  }: {
    weeks: string;
    daily: boolean;
    json: boolean;
    sync: boolean;
  }) =>
    import("./commands/trend.js").then(({ runTrend }) =>
      runTrend({ weeks: Number.parseInt(weeks, 10) || 12, daily, json, sync }),
    ),
);

withCommonOptions(
  program
    .command("wrapped")
    .description("도깨비 결산 — 이번 달(기본) 또는 연간 하이라이트와 등급")
    .option("--year [yyyy]", "연간 결산 (연도 생략 시 올해)"),
).action(
  ({ year, json, sync }: { year?: boolean | string; json: boolean; sync: boolean }) =>
    import("./commands/wrapped.js").then(({ runWrapped }) =>
      runWrapped({ year: year ?? false, json, sync }),
    ),
);

await program.parseAsync();
