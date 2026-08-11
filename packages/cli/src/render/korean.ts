import pc from "picocolors";
import type { SkipReason } from "@tokkaebi/core";

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

// "YYYY-MM-DD"(로컬 달력 날짜) → 요일 한 글자. 일요일 빨강·토요일 파랑
export const koreanWeekday = ({ date }: { date: string }) => {
  const day = new Date(`${date}T00:00:00`).getDay();
  const label = WEEKDAYS_KO[day] ?? "?";
  if (day === 0) return pc.red(label);
  if (day === 6) return pc.blue(label);
  return label;
};

export const SKIP_REASON_KO: Record<SkipReason, string> = {
  empty_line: "빈 줄",
  json_parse_error: "JSON 파싱 실패",
  non_assistant: "어시스턴트 외 레코드",
  schema_mismatch: "스키마 불일치",
  synthetic_model: "API 에러 레코드",
  no_dedupe_key: "dedupe 키 없음",
  duplicate_in_file: "중복 usage 복제분",
};

export const PRICING_SOURCE_KO: Record<string, string> = {
  fetch: "LiteLLM 원격 (방금 갱신)",
  disk: "디스크 캐시",
  snapshot: "번들 스냅샷 (오프라인)",
};

// 월 예산 게이지 — 초과분은 넘치지 않게 클램프하고 색으로 경고한다
export const budgetGauge = ({
  spent,
  budget,
  width = 10,
}: {
  spent: number;
  budget: number;
  width?: number;
}) => {
  const ratio = budget > 0 ? spent / budget : 0;
  const filled = Math.min(width, Math.max(spent > 0 ? 1 : 0, Math.round(ratio * width)));
  const color = ratio >= 1 ? pc.red : ratio >= 0.8 ? pc.yellow : pc.green;
  return `[${color("▮".repeat(filled))}${pc.dim("▯".repeat(width - filled))}]`;
};

// 기간 대비 비율 막대 — 표 안에서 하루/항목의 비중을 한눈에 보여준다
export const costBar = ({
  value,
  max,
  width = 10,
}: {
  value: number;
  max: number;
  width?: number;
}) => {
  if (max <= 0) return "";
  const filled = Math.max(value > 0 ? 1 : 0, Math.round((value / max) * width));
  return pc.green("▮".repeat(filled)) + pc.dim("▯".repeat(width - filled));
};
