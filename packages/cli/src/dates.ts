const DAY_MS = 24 * 60 * 60 * 1000;

export const startOfLocalDay = ({ now }: { now: Date }) => {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};

export const startOfLocalWeekWindow = ({ now }: { now: Date }) =>
  startOfLocalDay({ now }) - 6 * DAY_MS;

export const startOfLocalMonth = ({ now }: { now: Date }) => {
  const first = new Date(now);
  first.setDate(1);
  first.setHours(0, 0, 0, 0);
  return first.getTime();
};

export const endOfLocalDay = ({ now }: { now: Date }) =>
  startOfLocalDay({ now }) + DAY_MS;

export const localTzOffsetMs = ({ now }: { now: Date }) =>
  -now.getTimezoneOffset() * 60 * 1000;
