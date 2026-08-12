// 누적 마일스톤 임계값 — 넘는 순간 today가 한 줄 축하를 띄운다
export const TOKEN_MILESTONES = [1e6, 1e7, 1e8, 1e9, 1e10, 1e11];
export const COST_MILESTONES = [10, 100, 500, 1_000, 5_000, 10_000]; // USD

// 새로 넘은 임계값 중 최댓값 하나만 반환한다.
// total === threshold는 도달로 인정(>=), celebrated와 같으면 재축하 없음(>).
export const findNewMilestone = ({
  total,
  celebrated,
  thresholds,
}: {
  total: number;
  celebrated: number;
  thresholds: number[];
}) => {
  const crossed = thresholds.filter(
    (threshold) => total >= threshold && threshold > celebrated,
  );
  return crossed.length === 0 ? null : Math.max(...crossed);
};
