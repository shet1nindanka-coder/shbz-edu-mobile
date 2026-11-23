import { useCountdown } from '@/components/retry-wait';
import { plural, useI18n } from '@/i18n';
import { Text } from '@/ui';

export type LessonTimeLeftProps = {
  /** Scheduled end of the lesson on the DEVICE clock (epoch ms): `endsAt − serverClockOffset`. */
  endsAtDeviceMs: number;
};

/**
 * «Осталось 52 минуты» — the time left until the scheduled end of the lesson, next to the number of the
 * current problem (03 §1 L2 "Mobile translation"; the site shows no timer). It owns the one-second tick,
 * so the card around it does not re-render every second.
 */
export function LessonTimeLeft({ endsAtDeviceMs }: LessonTimeLeftProps) {
  const { m, locale } = useI18n();
  const t = m.studentWork.lesson;
  const seconds = useCountdown(endsAtDeviceMs);
  const remaining = seconds >= 60 ? plural(locale, Math.ceil(seconds / 60), t.remainingMinuteForms) : t.remainingLessThanMinute;
  return (
    <Text variant="small" color="textMuted" tabular accessibilityRole="timer" numberOfLines={1} testID="lesson-time-left">
      {remaining.toLocaleLowerCase()}
    </Text>
  );
}
