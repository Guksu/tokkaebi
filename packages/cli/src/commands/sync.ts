import pc from "picocolors";
import { createContext } from "../context.js";

export const runSync = async ({ json }: { json: boolean }) => {
  const { syncReport, pricing } = await createContext({ sync: true, quiet: true });
  if (syncReport == null) return;

  if (json) {
    console.log(JSON.stringify({ syncReport, pricingSource: pricing.source }, null, 2));
    return;
  }

  console.log(`\n${pc.bold("Sync complete")}\n`);
  console.log(`  files scanned   ${syncReport.filesScanned}`);
  console.log(`  files changed   ${syncReport.filesChanged}`);
  console.log(`  reparsed files  ${syncReport.reparsedFiles}`);
  console.log(`  new records     ${pc.green(String(syncReport.newRecords))}`);

  const skipEntries = Object.entries(syncReport.skips);
  if (skipEntries.length > 0) {
    console.log(`\n${pc.dim("skipped lines (by reason):")}`);
    for (const [reason, count] of skipEntries) {
      console.log(pc.dim(`  ${reason.padEnd(18)} ${count}`));
    }
  }
  console.log(pc.dim(`\npricing source: ${pricing.source}`));
};
