import { createReadStream } from "node:fs";
import type { ParseResult, SkipCounts, SkipReason, UsageRecordInput } from "../types.js";
import { classifyLine } from "./classify.js";

const NEWLINE = 0x0a;

// 한 줄이 수 MB일 수 있으므로(thinking·base64) 파일 전체를 로드하지 않고,
// UTF-8 멀티바이트 경계 문제를 피하기 위해 Buffer 레벨에서 \n을 찾은 뒤 라인만 디코드한다.
export const parseJsonlFrom = async ({
  filePath,
  start = 0,
}: {
  filePath: string;
  start?: number;
}): Promise<ParseResult> => {
  const records: UsageRecordInput[] = [];
  const skips: SkipCounts = {};
  const seenKeys = new Set<string>();
  let consumed = 0;
  let pending: Buffer = Buffer.alloc(0);

  const countSkip = (reason: SkipReason) => {
    skips[reason] = (skips[reason] ?? 0) + 1;
  };

  const handleLine = (lineBuffer: Buffer) => {
    const result = classifyLine({ line: lineBuffer.toString("utf8") });
    if (result.kind === "skip") {
      countSkip(result.reason);
      return;
    }
    // 하나의 API 응답이 content block별 여러 줄로 기록되며 동일 usage를 복제한다 —
    // 파일 내 첫 레코드만 취한다 (DB의 UNIQUE 제약이 2차 방어)
    if (seenKeys.has(result.record.dedupeKey)) {
      countSkip("duplicate_in_file");
      return;
    }
    seenKeys.add(result.record.dedupeKey);
    records.push(result.record);
  };

  const stream = createReadStream(filePath, { start });
  for await (const chunk of stream) {
    const buffer = chunk as Buffer;
    pending = pending.length === 0 ? buffer : Buffer.concat([pending, buffer]);

    let newlineIndex: number;
    while ((newlineIndex = pending.indexOf(NEWLINE)) >= 0) {
      const lineBuffer = pending.subarray(0, newlineIndex);
      pending = pending.subarray(newlineIndex + 1);
      consumed += lineBuffer.length + 1;
      handleLine(lineBuffer);
    }
  }

  if (pending.length > 0) {
    // 개행 없는 마지막 줄: 완결된 JSON이면 소비하고(활성 세션은 개행 전에 flush될 수 있다),
    // 잘린 JSON이면 소비하지 않아 offset이 줄 시작에 머물고 다음 sync가 재시도한다.
    try {
      JSON.parse(pending.toString("utf8"));
      consumed += pending.length;
      handleLine(pending);
    } catch {
      // 잘린 꼬리 — 미소비로 남긴다
    }
  }

  return { records, consumed, skips };
};
