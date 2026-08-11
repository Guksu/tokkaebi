import { dayIndexToDate } from "./streak.js";

// dayIndex 0 = 1970-01-01 = 목요일. JS getDay() 관례(0=일 … 6=토)에 맞추면 +4.
// 데이터는 전부 1970 이후(dayIndex 양수)라 음수 보정이 필요 없다.
export const dayIndexToWeekday = ({ dayIndex }: { dayIndex: number }) =>
  (dayIndex + 4) % 7;

// 월요일 시작 주. 1970-01-05(dayIndex 4)가 최초의 월요일 = weekIndex 0.
// dayIndex가 항상 양수라 SQLite의 0방향 절단 나눗셈과 Math.floor가 같은 결과를 낸다.
export const toWeekIndex = ({ dayIndex }: { dayIndex: number }) =>
  Math.floor((dayIndex - 4) / 7);

export const weekIndexToStartDate = ({ weekIndex }: { weekIndex: number }) =>
  dayIndexToDate({ dayIndex: weekIndex * 7 + 4 });
