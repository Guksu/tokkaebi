import {
  getClaudeProjectsDir,
  getDbPath,
  getTokkaebiHome,
  loadPricingTable,
  openDatabase,
  syncUsage,
  type LoadedPricing,
  type SyncReport,
} from "@tokkaebi/core";
import pc from "picocolors";

export type CliContext = {
  db: ReturnType<typeof openDatabase>;
  pricing: LoadedPricing;
  syncReport: SyncReport | null;
};

// 조회 명령의 공통 진입로: (옵션에 따라) 자동 sync → 단가표 로드
export const createContext = async ({
  sync,
  quiet,
}: {
  sync: boolean;
  quiet: boolean;
}): Promise<CliContext> => {
  const db = openDatabase({ dbPath: getDbPath() });

  let syncReport: SyncReport | null = null;
  if (sync) {
    const startedAt = Date.now();
    syncReport = await syncUsage({ db, claudeProjectsDir: getClaudeProjectsDir() });
    if (!quiet) {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        pc.dim(
          `✔ synced ${syncReport.filesScanned} files · +${syncReport.newRecords} records (${seconds}s)`,
        ),
      );
    }
  }

  const pricing = await loadPricingTable({ cacheDir: getTokkaebiHome() });
  return { db, pricing, syncReport };
};

export const warnUnknownModels = ({ unknownModels }: { unknownModels: string[] }) => {
  if (unknownModels.length === 0) return;
  console.log(
    pc.yellow(
      `⚠ 단가 미확인 모델 (비용 $0 처리): ${[...new Set(unknownModels)].join(", ")}`,
    ),
  );
};
