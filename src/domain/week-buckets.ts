// Ported from the site (lib/week-buckets.ts). [MOBILE] The site reads the process-local clock (TZ=Europe/Moscow);
// here every calendar-day computation goes through the fixed-offset helpers of ./moscow-time, so the result
// is the same on a device in any time zone.
/*
 * Недельные корзины для графиков «сколько занятий по неделям».
 * Чистая логика без БД. Границы недель — московские понедельники 00:00.
 */

import { dayKeyToDate, mskAddDays, mskMonday, mskWeekdayIndex } from "./moscow-time";

export type WeekBucket = {
  /** Понедельник 00:00 по московскому времени. */
  start: Date;
  /** Следующий понедельник 00:00 (эксклюзивно). */
  end: Date;
};

/** Индекс дня недели в формате Пн=0 … Вс=6 для даты вида YYYY-MM-DD. */
export function getDayOfWeekIndex(dateString: string) {
  return mskWeekdayIndex(dayKeyToDate(dateString));
}

/** Понедельник 00:00 по московскому времени для переданной даты. */
export function mondayOf(date: Date): Date {
  return mskMonday(date);
}

/** Последние `count` недель, включая текущую; от старой к новой. */
export function buildWeekBuckets(now: Date, count: number): WeekBucket[] {
  const currentMonday = mondayOf(now);
  const buckets: WeekBucket[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const start = mskAddDays(currentMonday, -index * 7);
    const end = mskAddDays(start, 7);
    buckets.push({ start, end });
  }

  return buckets;
}

/** Раскладывает даты по корзинам; даты вне диапазона не считаются. */
export function countByWeek(dates: Date[], buckets: WeekBucket[]): number[] {
  const counts = buckets.map(() => 0);

  for (const date of dates) {
    const time = date.getTime();

    for (let index = 0; index < buckets.length; index += 1) {
      if (time >= buckets[index].start.getTime() && time < buckets[index].end.getTime()) {
        counts[index] += 1;
        break;
      }
    }
  }

  return counts;
}
