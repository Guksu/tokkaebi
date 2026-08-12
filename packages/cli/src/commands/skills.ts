import { getSkillTotals } from "@tokkaebi/core";
import pc from "picocolors";
import { createContext } from "../context.js";
import { formatTokens } from "../render/format.js";
import { costBar } from "../render/korean.js";
import { costCell, tokenCells, usageTable } from "../render/table.js";

// 스킬·플러그인별 비용 가시화 — attribution_skill 기준
export const runSkills = async ({ json, sync }: { json: boolean; sync: boolean }) => {
  const { db, pricing } = await createContext({ sync, quiet: json });
  const skills = getSkillTotals({
    db,
    table: pricing.table,
    sinceEpoch: 0,
    untilEpoch: Number.MAX_SAFE_INTEGER,
  });

  if (json) {
    console.log(JSON.stringify({ skills }, null, 2));
    return;
  }

  console.log(`\n${pc.bold("스킬별 사용량")} ${pc.dim("(전체 기간)")}\n`);
  if (skills.length === 0) {
    console.log(pc.dim("스킬 사용 기록이 없습니다."));
    return;
  }

  const table = usageTable({
    head: ["스킬", "요청", "입력", "출력", "캐시 읽기", "캐시 쓰기", "비용", ""],
  });
  const maxCost = Math.max(...skills.map(({ cost }) => cost.totalCost));
  for (const skill of skills) {
    table.push([
      pc.cyan(skill.skill),
      { content: formatTokens({ count: skill.requestCount }), hAlign: "right" },
      ...tokenCells({ tokens: skill.tokens }),
      costCell({ cost: skill.cost }),
      costBar({ value: skill.cost.totalCost, max: maxCost, width: 8 }),
    ]);
  }
  console.log(table.toString());
};
