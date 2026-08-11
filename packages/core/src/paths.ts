import { homedir } from "node:os";
import { join } from "node:path";

// 테스트·이식성을 위해 env로 오버라이드 가능하게 둔다
export const getTokkaebiHome = () =>
  process.env.TOKKAEBI_HOME ?? join(homedir(), ".tokkaebi");

export const getClaudeProjectsDir = () =>
  process.env.TOKKAEBI_CLAUDE_DIR ?? join(homedir(), ".claude", "projects");

export const getDbPath = () => join(getTokkaebiHome(), "data.db");
