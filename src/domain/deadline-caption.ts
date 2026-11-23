/**
 * The one caption of a homework row (docs/design/glass-over-paper.md §7, principles 2 – 3): its deadline in
 * the shortest wording that is still exact — «сегодня до 23:59», «до завтра, 23:59», «до пятницы», «до 20
 * ноября» — and, when it has passed, «просрочено 2 дня», which is the only caption that asks for attention.
 * Moscow calendar days, like every "today" of the app. Pure.
 */
import { formatMsk } from "@/domain/dates";
import { calendarDaysBetweenMsk, mskWeekdayIndex, toEpochMs, type DateInput } from "@/domain/moscow-time";
import { format, plural, type Locale } from "@/lib/i18n";

/** `m.common.deadline`. */
export type DeadlineCaptionCopy = {
  none: string;
  done: string;
  today: string;
  tomorrow: string;
  /** «до {weekday}»; `weekdays` are in the case that wording needs, Monday first. */
  weekday: string;
  weekdays: readonly string[];
  date: string;
  overdueToday: string;
  overdue: string;
  dayForms: readonly string[];
};

export type DeadlineCaption = {
  text: string;
  /** The deadline has passed and the homework is not done: the caption is drawn in the status red. */
  attention: boolean;
};

export function deadlineCaption(
  deadlineAt: DateInput | null | undefined,
  done: boolean,
  now: number,
  locale: Locale,
  copy: DeadlineCaptionCopy,
): DeadlineCaption {
  if (done) return { text: copy.done, attention: false };
  if (deadlineAt === null || deadlineAt === undefined || deadlineAt === "") return { text: copy.none, attention: false };
  const deadline = toEpochMs(deadlineAt);
  if (Number.isNaN(deadline)) return { text: copy.none, attention: false };
  const time = formatMsk(deadline, "time", locale) ?? "";

  if (deadline < now) {
    const days = calendarDaysBetweenMsk(deadline, now);
    return { text: days < 1 ? copy.overdueToday : format(copy.overdue, { days: plural(locale, days, copy.dayForms) }), attention: true };
  }

  const days = calendarDaysBetweenMsk(now, deadline);
  if (days === 0) return { text: format(copy.today, { time }), attention: false };
  if (days === 1) return { text: format(copy.tomorrow, { time }), attention: false };
  if (days < 7) return { text: format(copy.weekday, { weekday: copy.weekdays[mskWeekdayIndex(deadline)] ?? "" }), attention: false };
  return { text: format(copy.date, { date: formatMsk(deadline, "dayMonth", locale) ?? "" }), attention: false };
}
