import Table from "cli-table3";
import pc from "picocolors";
import type { CostBreakdown, TokenCounts } from "@tokkaebi/core";
import { formatCost, formatTokens } from "./format.js";

const tableChars = { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" };

export const usageTable = ({ head }: { head: string[] }) =>
  new Table({
    head: head.map((title) => pc.bold(title)),
    chars: tableChars,
    style: { head: [], border: [] },
  });

export const tokenCells = ({ tokens }: { tokens: TokenCounts }) => [
  { content: formatTokens({ count: tokens.inputTokens }), hAlign: "right" as const },
  { content: formatTokens({ count: tokens.outputTokens }), hAlign: "right" as const },
  { content: formatTokens({ count: tokens.cacheReadTokens }), hAlign: "right" as const },
  {
    content: formatTokens({ count: tokens.cache5mTokens + tokens.cache1hTokens }),
    hAlign: "right" as const,
  },
];

export const costCell = ({ cost }: { cost: CostBreakdown | number }) => ({
  content: pc.green(formatCost({ usd: typeof cost === "number" ? cost : cost.totalCost })),
  hAlign: "right" as const,
});
