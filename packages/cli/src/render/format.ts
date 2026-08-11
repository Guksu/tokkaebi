import { basename } from "node:path";

export const formatCost = ({ usd }: { usd: number }) => {
  // 소액이 $0.00으로 뭉개지면 안 보인다 — 1센트 미만은 유효숫자 2자리로
  if (usd !== 0 && Math.abs(usd) < 0.01) return `$${Number(usd.toPrecision(2))}`;
  return `$${usd.toFixed(2)}`;
};

export const formatTokens = ({ count }: { count: number }) =>
  count.toLocaleString("en-US");

export const shortenPath = ({ cwd }: { cwd: string }) => {
  const name = basename(cwd);
  return name === "" ? cwd : name;
};
