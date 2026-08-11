import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PricingTable } from "../types.js";
import snapshot from "./snapshot.json" with { type: "json" };

export const LITELLM_PRICES_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 4000;
const CACHE_FILE = "pricing-cache.json";

// LiteLLM에 캐시 단가가 없을 때 쓰는 Anthropic 공식 배율:
// read = input × 0.1, 5m 쓰기 = input × 1.25, 1h 쓰기 = 5m × 2
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_5M_WRITE_MULTIPLIER = 1.25;
const CACHE_1H_OVER_5M_MULTIPLIER = 2;

type LitellmEntry = {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  cache_creation_input_token_cost_above_1hr?: number;
};

export const parseLitellmTable = ({
  raw,
}: {
  raw: Record<string, unknown>;
}): PricingTable => {
  const table: PricingTable = {};

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "object" || value === null) continue;
    const entry = value as LitellmEntry;
    const input = entry.input_cost_per_token;
    const output = entry.output_cost_per_token;
    if (typeof input !== "number" || typeof output !== "number") continue;

    const cache5m =
      entry.cache_creation_input_token_cost ?? input * CACHE_5M_WRITE_MULTIPLIER;
    table[key] = {
      inputCostPerToken: input,
      outputCostPerToken: output,
      cacheReadCostPerToken:
        entry.cache_read_input_token_cost ?? input * CACHE_READ_MULTIPLIER,
      cache5mWriteCostPerToken: cache5m,
      cache1hWriteCostPerToken:
        entry.cache_creation_input_token_cost_above_1hr ??
        cache5m * CACHE_1H_OVER_5M_MULTIPLIER,
    };
  }

  return table;
};

type DiskCache = { fetchedAt: number; models: Record<string, unknown> };

export type LoadedPricing = {
  table: PricingTable;
  source: "disk" | "fetch" | "snapshot";
  fetchedAt: number | null;
};

const readDiskCache = async ({ cacheDir }: { cacheDir: string }) => {
  try {
    const parsed = JSON.parse(
      await readFile(join(cacheDir, CACHE_FILE), "utf8"),
    ) as DiskCache;
    if (typeof parsed.fetchedAt !== "number" || typeof parsed.models !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const fetchLitellm = async ({ fetchImpl }: { fetchImpl: typeof fetch }) => {
  const response = await fetchImpl(LITELLM_PRICES_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`LiteLLM fetch failed: ${response.status}`);
  const raw = (await response.json()) as Record<string, unknown>;
  // 디스크 캐시를 수십 KB로 유지 — normalize 체인이 조회하는 키 범위와 일치
  return Object.fromEntries(
    Object.entries(raw).filter(([key]) => /^(anthropic\/)?claude/.test(key)),
  );
};

// 단가 획득 체인: 신선한 디스크 캐시 → fetch(성공 시 디스크 갱신) → stale 디스크 → 번들 스냅샷.
// fetch 실패는 절대 호출자를 실패시키지 않는다 — 오프라인에서도 항상 단가표가 나온다.
export const loadPricingTable = async ({
  cacheDir,
  ttlMs = DEFAULT_TTL_MS,
  fetchImpl = fetch,
  now = () => Date.now(),
  offline = false,
}: {
  cacheDir: string;
  ttlMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** true면 fetch를 절대 하지 않는다 — stale 디스크 → 번들 스냅샷 (status 등 지연 민감 경로용) */
  offline?: boolean;
}): Promise<LoadedPricing> => {
  const disk = await readDiskCache({ cacheDir });
  if (offline) {
    if (disk != null) {
      return {
        table: parseLitellmTable({ raw: disk.models }),
        source: "disk",
        fetchedAt: disk.fetchedAt,
      };
    }
    return {
      table: parseLitellmTable({ raw: snapshot as Record<string, unknown> }),
      source: "snapshot",
      fetchedAt: null,
    };
  }
  if (disk != null && now() - disk.fetchedAt < ttlMs) {
    return {
      table: parseLitellmTable({ raw: disk.models }),
      source: "disk",
      fetchedAt: disk.fetchedAt,
    };
  }

  try {
    const models = await fetchLitellm({ fetchImpl });
    const fetchedAt = now();
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      join(cacheDir, CACHE_FILE),
      JSON.stringify({ fetchedAt, models } satisfies DiskCache),
    );
    return { table: parseLitellmTable({ raw: models }), source: "fetch", fetchedAt };
  } catch {
    if (disk != null) {
      return {
        table: parseLitellmTable({ raw: disk.models }),
        source: "disk",
        fetchedAt: disk.fetchedAt,
      };
    }
    return {
      table: parseLitellmTable({ raw: snapshot as Record<string, unknown> }),
      source: "snapshot",
      fetchedAt: null,
    };
  }
};
