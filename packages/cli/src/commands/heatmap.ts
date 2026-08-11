import { getHeatmapTotals, type HeatmapCell } from "@tokkaebi/core";
import pc from "picocolors";
import { createContext } from "../context.js";
import { endOfLocalDay, localTzOffsetMs } from "../dates.js";
import { formatCost } from "../render/format.js";
import { heatLevel, weekdayLabel } from "../render/korean.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// 월→일 순서로 렌더 (한국 달력 관례), 값은 JS getDay 인덱스
const ROW_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const LEVEL_CHARS = ["· ", "░░", "▒▒", "▓▓", "██"] as const;

export const runHeatmap = async ({
  weeks,
  json,
  sync,
}: {
  weeks: number;
  json: boolean;
  sync: boolean;
}) => {
  const now = new Date();
  const untilEpoch = endOfLocalDay({ now });
  const sinceEpoch = untilEpoch - weeks * 7 * DAY_MS;
  const tzOffsetMs = localTzOffsetMs({ now });

  const { db, pricing } = await createContext({ sync, quiet: json });
  const cells = getHeatmapTotals({
    db,
    table: pricing.table,
    sinceEpoch,
    untilEpoch,
    tzOffsetMs,
  });

  if (json) {
    console.log(JSON.stringify({ weeks, cells }, null, 2));
    return;
  }

  console.log(`\n${pc.bold("시간대 히트맵")} · 최근 ${weeks}주 · 비용 기준\n`);
  if (cells.length === 0) {
    console.log(pc.dim("이 기간에 기록된 사용량이 없습니다."));
    return;
  }

  const byCell = new Map<string, HeatmapCell>(
    cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell]),
  );
  const maxCost = Math.max(...cells.map(({ cost }) => cost.totalCost));
  const maxCell = cells.find(({ cost }) => cost.totalCost === maxCost);

  // 열 헤더: 짝수 시각만 표기 (셀 폭 2칸에 맞춤)
  const header = Array.from({ length: 24 }, (_, hour) =>
    hour % 2 === 0 ? String(hour).padEnd(2) : "  ",
  ).join("");
  console.log(`     ${pc.dim(header)}`);

  for (const weekday of ROW_ORDER) {
    const row = Array.from({ length: 24 }, (_, hour) => {
      const cost = byCell.get(`${weekday}:${hour}`)?.cost.totalCost ?? 0;
      const level = heatLevel({ value: cost, max: maxCost });
      return level === 0 ? pc.dim(LEVEL_CHARS[0]) : pc.green(LEVEL_CHARS[level]);
    }).join("");
    console.log(`  ${weekdayLabel({ weekday })} ${row}`);
  }

  console.log(
    `\n  ${pc.dim("적음")} ${pc.dim("·")} ${pc.green("░ ▒ ▓ █")} ${pc.dim("많음")}` +
      (maxCell
        ? pc.dim(
            ` · 최대 셀 ${formatCost({ usd: maxCost })} (${
              ["일", "월", "화", "수", "목", "금", "토"][maxCell.weekday]
            } ${maxCell.hour}시)`,
          )
        : ""),
  );
};
