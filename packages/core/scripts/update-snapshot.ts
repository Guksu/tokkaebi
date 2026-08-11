// 번들 단가 스냅샷 갱신 스크립트 — 릴리스 전 수동 실행:
//   pnpm --filter @tokkaebi/core exec tsx scripts/update-snapshot.ts
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LITELLM_PRICES_URL } from "../src/pricing/litellm.js";

const snapshotPath = fileURLToPath(
  new URL("../src/pricing/snapshot.json", import.meta.url),
);

const response = await fetch(LITELLM_PRICES_URL);
if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
const raw = (await response.json()) as Record<string, unknown>;

// bare 키와 anthropic/ 프리픽스 키만 유지 — normalize 체인이 조회하는 범위와 일치시켜
// 스냅샷을 수십 KB로 유지한다 (bedrock·vertex 변형 키는 제외)
const filtered = Object.fromEntries(
  Object.entries(raw).filter(([key]) => /^(anthropic\/)?claude/.test(key)),
);

await writeFile(snapshotPath, `${JSON.stringify(filtered, null, 2)}\n`);
console.log(`snapshot.json updated: ${Object.keys(filtered).length} models`);
