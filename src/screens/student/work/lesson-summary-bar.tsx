import { View } from 'react-native';

import { useCountdown } from '@/components/retry-wait';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Icon, Text } from '@/ui';

export type LessonTimeLeftProps = {
  /** Scheduled end of the lesson on the DEVICE clock (epoch ms): `endsAt − serverClockOffset`. */
  endsAtDeviceMs: number;
};

/**
 * «52 мин» next to a clock — the time left until the scheduled end of the lesson, beside the number of the
 * current problem (03 §1 L2 "Mobile translation"; the site shows no timer). A screen reader hears the whole
 * phrase, «Осталось 52 минуты». It owns the one-second tick, so the card around it does not re-render
 * every second.
 */
export function LessonTimeLeft({ endsAtDeviceMs }: LessonTimeLeftProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = m.studentWork.lesson;
  const seconds = useCountdown(endsAtDeviceMs);
  const minutes = Math.ceil(seconds / 60);
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={seconds >= 60 ? plural(locale, minutes, t.remainingMinuteForms) : t.remainingLessThanMinute}
      style={styles.row}
      testID="lesson-time-left"
    >
      <Icon name="clock" size={16} color="textMuted" />
      <Text variant="small" color="textMuted" tabular numberOfLines={1}>
        {seconds >= 60 ? format(dict.planner.common.minutesShort, { n: minutes }) : t.lessThanMinuteShort}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.xxs, flexShrink: 0 },
}));
