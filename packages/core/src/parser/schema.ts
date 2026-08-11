import { z } from "zod";

const nonNegativeInt = z.int().nonnegative();

// usage 키셋은 CC 버전에 따라 3종이 관측됐다 — 공통 키만 정의하고 나머지는 zod가 strip한다.
// iterations(내부에 usage가 중첩되어 상위와 중복)는 의도적으로 정의하지 않아 합산 사고를 차단한다.
const usageSchema = z.object({
  input_tokens: nonNegativeInt.default(0),
  output_tokens: nonNegativeInt.default(0),
  cache_read_input_tokens: nonNegativeInt.default(0),
  // 스칼라는 cache_creation 객체(5m+1h)와 같은 값의 이중 표현 — 절대 둘을 합산하지 않는다
  cache_creation_input_tokens: nonNegativeInt.default(0),
  cache_creation: z
    .object({
      ephemeral_5m_input_tokens: nonNegativeInt.default(0),
      ephemeral_1h_input_tokens: nonNegativeInt.default(0),
    })
    .nullish(),
});

export const assistantRecordSchema = z.object({
  type: z.literal("assistant"),
  uuid: z.string(),
  // camelCase sessionId가 정본 — snake_case session_id와 불일치하는 레코드가 실존한다
  sessionId: z.string().min(1),
  timestamp: z.string(),
  cwd: z.string(),
  gitBranch: z.string().nullish(),
  isSidechain: z.boolean().default(false),
  version: z.string().nullish(),
  // API 에러 레코드는 requestId가 없다 — message.id로 fallback
  requestId: z.string().nullish(),
  agentId: z.string().nullish(),
  attributionAgent: z.string().nullish(),
  attributionSkill: z.string().nullish(),
  attributionPlugin: z.string().nullish(),
  message: z.object({
    id: z.string().nullish(),
    model: z.string(),
    usage: usageSchema,
  }),
});

export type AssistantRecord = z.infer<typeof assistantRecordSchema>;
