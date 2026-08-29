import { dateKey, type CalendarItem } from "@/lib/calendar-engine";

const ACTIVE_START = 6;
const ACTIVE_END = 23;
export const DAY_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function isInactiveHour(hour: number) {
  return hour < ACTIVE_START || hour >= ACTIVE_END;
}

export function hourHeight(hour: number, rowHeight: number) {
  return isInactiveHour(hour) ? Math.max(18, rowHeight * 0.34) : rowHeight;
}

export function timeOffset(hour: number, minute: number, rowHeight: number) {
  const wholeHours = DAY_HOURS.slice(0, Math.min(24, hour)).reduce(
    (total, value) => total + hourHeight(value, rowHeight),
    0,
  );
  if (hour >= 24) return wholeHours;
  return wholeHours + (minute / 60) * hourHeight(hour, rowHeight);
}

export function timeAtOffset(offset: number, rowHeight: number) {
  let remaining = Math.max(0, offset);
  for (const hour of DAY_HOURS) {
    const height = hourHeight(hour, rowHeight);
    if (remaining <= height) {
      return {
        hour,
        minute: Math.min(45, Math.round((remaining / height) * 4) * 15),
      };
    }
    remaining -= height;
  }
  return { hour: 23, minute: 45 };
}

export function itemGeometry(item: CalendarItem, rowHeight: number) {
  const start = new Date(item.startsAt!);
  const end = new Date(item.endsAt!);
  const startTop = timeOffset(start.getHours(), start.getMinutes(), rowHeight);
  const endTop =
    dateKey(start) === dateKey(end)
      ? timeOffset(end.getHours(), end.getMinutes(), rowHeight)
      : timeOffset(24, 0, rowHeight);
  return {
    top: startTop,
    height: Math.max(28, endTop - startTop),
  };
}

export function overlapLayout(items: CalendarItem[]) {
  const result = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime(),
  );
  let group: CalendarItem[] = [];
  let groupEnd = -Infinity;

  const placeGroup = () => {
    const laneEnds: number[] = [];
    const placements = group.map((item) => {
      const start = new Date(item.startsAt!).getTime();
      const end = new Date(item.endsAt!).getTime();
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = end;
      return { item, lane };
    });
    const lanes = Math.max(1, laneEnds.length);
    placements.forEach(({ item, lane }) => result.set(item.id, { lane, lanes }));
  };

  sorted.forEach((item) => {
    const start = new Date(item.startsAt!).getTime();
    const end = new Date(item.endsAt!).getTime();
    if (group.length && start >= groupEnd) {
      placeGroup();
      group = [];
      groupEnd = -Infinity;
    }
    group.push(item);
    groupEnd = Math.max(groupEnd, end);
  });
  if (group.length) placeGroup();
  return result;
}
