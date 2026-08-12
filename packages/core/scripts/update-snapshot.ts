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

// claude가 들어간 모든 키 유지 — Bedrock(anthropic.claude*, 리전 프리픽스 포함)·
// Vertex(vertex_ai/claude*) 배포 경로의 모델 ID도 오프라인에서 단가를 찾아야 한다
const filtered = Object.fromEntries(
  Object.entries(raw).filter(([key]) => key.toLowerCase().includes("claude")),
);

await writeFile(snapshotPath, `${JSON.stringify(filtered, null, 2)}\n`);
console.log(`snapshot.json updated: ${Object.keys(filtered).length} models`);
