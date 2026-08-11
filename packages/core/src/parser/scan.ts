import fg from "fast-glob";

// **/*.jsonl만 잡는다 — agent-*.meta.json, memory/*.md 등이 자연 배제된다
export const scanJsonlFiles = async ({
  rootDir,
}: {
  rootDir: string;
}): Promise<string[]> => {
  const files = await fg("**/*.jsonl", {
    cwd: rootDir,
    absolute: true,
    onlyFiles: true,
    suppressErrors: true,
  });
  return files.sort();
};
