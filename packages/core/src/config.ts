import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getTokkaebiHome } from "./paths.js";

export type TokkaebiConfig = {
  budget?: { monthlyUsd: number };
  milestones?: { celebratedTokens?: number; celebratedCostUsd?: number };
};

export const getConfigPath = () => join(getTokkaebiHome(), "config.json");

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const readRaw = async ({ configPath }: { configPath: string }) => {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // 없거나 깨진 파일 — 죽지 않고 빈 설정으로 (사용자가 수기 편집하는 파일이다)
    return {};
  }
};

export const readConfig = async ({
  configPath = getConfigPath(),
}: { configPath?: string } = {}): Promise<TokkaebiConfig> => {
  const raw = await readRaw({ configPath });
  const config: TokkaebiConfig = {};

  const budget = raw.budget as Record<string, unknown> | undefined;
  const monthlyUsd = asNumber(budget?.monthlyUsd);
  if (monthlyUsd !== undefined) config.budget = { monthlyUsd };

  const milestones = raw.milestones as Record<string, unknown> | undefined;
  const celebratedTokens = asNumber(milestones?.celebratedTokens);
  const celebratedCostUsd = asNumber(milestones?.celebratedCostUsd);
  if (celebratedTokens !== undefined || celebratedCostUsd !== undefined) {
    config.milestones = {
      ...(celebratedTokens !== undefined && { celebratedTokens }),
      ...(celebratedCostUsd !== undefined && { celebratedCostUsd }),
    };
  }

  return config;
};

// 알 수 없는 키는 보존한 채 관리 필드만 덮어쓴다 — 사용자 수기 편집 존중
export const writeConfig = async ({
  config,
  configPath = getConfigPath(),
}: {
  config: TokkaebiConfig;
  configPath?: string;
}) => {
  const raw = await readRaw({ configPath });
  const merged: Record<string, unknown> = { ...raw, ...config };
  // {budget: undefined}를 명시적으로 넘긴 경우(= budget clear)만 키를 지운다.
  // 키 자체가 없으면 기존 값을 건드리지 않는다 (milestones만 갱신하는 today 경로 보호)
  if ("budget" in config && config.budget === undefined) delete merged.budget;
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`);
};
