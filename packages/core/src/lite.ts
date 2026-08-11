// 지연 민감 경로(status 등)용 경량 엔트리 — 파서(zod)·스캔(fast-glob)·sync를 제외한다.
// 전체 API는 "." 엔트리(index.ts)를 사용할 것.
export {
  getAgentTotals,
  getBranchTotals,
  getDailyTotals,
  getPeriodSummary,
  getProjectBranchTotals,
  getProjectTotals,
  getTopSessions,
  getUsageDayIndexes,
} from "./aggregate/queries.js";
export { computeStreak, dayIndexToDate, toDayIndex } from "./aggregate/streak.js";
export { projectMonthlySpend } from "./aggregate/pace.js";
export {
  getConfigPath,
  readConfig,
  writeConfig,
  type TokkaebiConfig,
} from "./config.js";
export { openDatabase } from "./db/database.js";
export { loadPricingTable, type LoadedPricing } from "./pricing/litellm.js";
export { getClaudeProjectsDir, getDbPath, getTokkaebiHome } from "./paths.js";
export type { CostBreakdown, PricingTable, TokenCounts } from "./types.js";
