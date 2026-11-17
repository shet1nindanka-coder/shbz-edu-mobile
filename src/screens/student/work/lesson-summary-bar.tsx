import { View } from 'react-native';

import { useCountdown } from '@/components/retry-wait';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Icon, ProgressBar, Text, completionPercent } from '@/ui';

export type LessonSummaryBarProps = {
  closed: number;
  total: number;
  /** Scheduled end of the lesson on the DEVICE clock (epoch ms): `endsAt − serverClockOffset`. */
  endsAtDeviceMs: number;
};

/**
 * Sticky strip of the live lesson: «Закрыто X из Y» of the main part with a bar, and the time left until
 * the scheduled end (03 §1 L2 "Mobile translation"; the site shows no timer). It owns the one-second tick,
 * so the list under it does not re-render every second.
 */
export function LessonSummaryBar({ closed, total, endsAtDeviceMs }: LessonSummaryBarProps) {
  const styles = useStyles();
  const { m, locale } = useI18n();
  const t = m.studentWork.lesson;
  const seconds = useCountdown(endsAtDeviceMs);
  const remaining = seconds >= 60 ? plural(locale, Math.ceil(seconds / 60), t.remainingMinuteForms) : t.remainingLessThanMinute;

  return (
    <View style={styles.bar} testID="lesson-summary-bar">
      <View style={styles.row}>
        <Text variant="smallBold" tabular style={styles.closed}>
          {format(t.closedOf, { closed, total })}
        </Text>
        <View style={styles.time} accessible accessibilityRole="timer" accessibilityLabel={remaining}>
          <Icon name="clock" size={14} color="kicker" />
          <Text variant="captionStrong" color="textMuted" tabular>
            {remaining}
          </Text>
        </View>
      </View>
      <ProgressBar value={completionPercent(closed, total)} accessibilityLabel={format(t.progressA11y, { closed, total })} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    gap: t.space.xs,
    paddingHorizontal: t.space.gutter,
    paddingVertical: t.space.sm,
    backgroundColor: t.colors.pageBg,
    borderBottomWidth: t.borders.hairline,
    borderBottomColor: t.colors.headerBorder,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  closed: { flex: 1, minWidth: 0 },
  time: { flexDirection: 'row', alignItems: 'center', gap: t.space.xxs },
}));
