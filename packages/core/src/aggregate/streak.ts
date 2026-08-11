const DAY_MS = 24 * 60 * 60 * 1000;

// "로컬 달력의 하루"를 정수 인덱스로 — SQL date 함수 대신 산술로 TZ를 다룬다
export const toDayIndex = ({
  epochMs,
  tzOffsetMs,
}: {
  epochMs: number;
  tzOffsetMs: number;
}) => Math.floor((epochMs + tzOffsetMs) / DAY_MS);

export const dayIndexToDate = ({ dayIndex }: { dayIndex: number }) =>
  new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);

// 연속 사용일: 오늘 기록이 있으면 오늘부터, 아직 없으면 어제부터 거꾸로 센다
// (아침에 조회했다고 어제까지의 스트릭이 0이 되면 억울하다)
export const computeStreak = ({
  dayIndexes,
  todayIndex,
}: {
  dayIndexes: number[];
  todayIndex: number;
}) => {
  const days = new Set(dayIndexes);
  const anchor = days.has(todayIndex)
    ? todayIndex
    : days.has(todayIndex - 1)
      ? todayIndex - 1
      : null;
  if (anchor == null) return 0;

  let streak = 0;
  while (days.has(anchor - streak)) streak += 1;
  return streak;
};
