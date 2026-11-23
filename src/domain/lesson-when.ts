/**
 * When a lesson is, in one short line for the overview cards: «Урок сегодня в 17:00», «Урок завтра в
 * 16:00», «Урок 24 ноября в 16:00» — or «Урок идёт сейчас». Moscow calendar days. Pure.
 */
import { formatMsk } from "@/domain/dates";
import { calendarDaysBetweenMsk, type DateInput } from "@/domain/moscow-time";
import { format, type Locale } from "@/lib/i18n";

export type LessonWhenCopy = { lessonNow: string; lessonToday: string; lessonTomorrow: string; lessonOn: string };

export function lessonWhen(startsAt: DateInput, running: boolean, now: number, locale: Locale, copy: LessonWhenCopy): string {
  if (running) return copy.lessonNow;
  const time = formatMsk(startsAt, "time", locale) ?? "";
  const days = calendarDaysBetweenMsk(now, startsAt);
  if (days <= 0) return format(copy.lessonToday, { time });
  if (days === 1) return format(copy.lessonTomorrow, { time });
  return format(copy.lessonOn, { date: formatMsk(startsAt, "dayMonth", locale) ?? "", time });
}
