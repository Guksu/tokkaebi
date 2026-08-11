import pc from "picocolors";
import type { SkipReason } from "@tokkaebi/core";
import { createContext } from "../context.js";
import { formatTokens } from "../render/format.js";
import { PRICING_SOURCE_KO, SKIP_REASON_KO } from "../render/korean.js";

export const runSync = async ({ json }: { json: boolean }) => {
  const { syncReport, pricing } = await createContext({ sync: true, quiet: true });
  if (syncReport == null) return;

  if (json) {
    console.log(JSON.stringify({ syncReport, pricingSource: pricing.source }, null, 2));
    return;
  }

  console.log(`\n${pc.bold("동기화 완료")} ✔\n`);
  console.log(`  스캔한 파일    ${formatTokens({ count: syncReport.filesScanned })}개`);
  console.log(`  변경된 파일    ${formatTokens({ count: syncReport.filesChanged })}개`);
  console.log(`  재파싱 파일    ${formatTokens({ count: syncReport.reparsedFiles })}개`);
  console.log(
    `  신규 레코드    ${pc.green(`+${formatTokens({ count: syncReport.newRecords })}건`)}`,
  );

  const skipEntries = Object.entries(syncReport.skips) as [SkipReason, number][];
  if (skipEntries.length > 0) {
    console.log(`\n${pc.dim("스킵된 라인 (사유별):")}`);
    for (const [reason, count] of skipEntries) {
      const label = SKIP_REASON_KO[reason] ?? reason;
      console.log(pc.dim(`  · ${label}  ${formatTokens({ count })}`));
    }
  }
  console.log(
    pc.dim(`\n단가 출처: ${PRICING_SOURCE_KO[pricing.source] ?? pricing.source}`),
  );
};
