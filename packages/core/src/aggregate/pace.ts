// 월 지출 페이스 예측 — 단순 일평균 × 월 일수.
// 시간 비례(오늘 몇 시인지) 보정은 하지 않는다: 월초 과대 예측 노이즈보다 단순함이 낫다.
export const projectMonthlySpend = ({
  spentUsd,
  dayOfMonth,
  daysInMonth,
}: {
  spentUsd: number;
  dayOfMonth: number;
  daysInMonth: number;
}) => {
  const dailyAvgUsd = dayOfMonth > 0 ? spentUsd / dayOfMonth : 0;
  return { dailyAvgUsd, projectedUsd: dailyAvgUsd * daysInMonth };
};
