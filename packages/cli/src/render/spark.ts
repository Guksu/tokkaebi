const LEVELS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

// 값 1개당 1문자, max 기준 선형 스케일. 색은 호출부에서 입힌다(테스트 용이성).
export const sparkline = ({ values }: { values: number[] }) => {
  if (values.length === 0) return "";
  const max = Math.max(...values);
  if (max <= 0) return LEVELS[0].repeat(values.length);

  return values
    .map((value) => {
      const level = Math.min(
        LEVELS.length - 1,
        Math.floor((value / max) * LEVELS.length),
      );
      return LEVELS[Math.max(0, level)];
    })
    .join("");
};
