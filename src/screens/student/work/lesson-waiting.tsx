import { View } from 'react-native';

import type { UpcomingLessonDto } from '@/api/types';
import { useCountdown, useWaitText } from '@/components/retry-wait';
import { formatDateTime } from '@/domain/dates';
import { lessonWhen } from '@/domain/lesson-when';
import { format, useI18n } from '@/i18n';
import { useServerNow } from '@/services/clock';
import { makeStyles } from '@/theme';
import { Card, Icon, Spinner, Text } from '@/ui';

import { secondsUntil } from './logic';

/** The countdown appears in the last hour before the start. */
const COUNTDOWN_WINDOW_SECONDS = 60 * 60;

export type LessonWaitingProps = {
  upcoming: UpcomingLessonDto | null;
  /** `serverClockOffset` of the response that carried `upcoming`. */
  serverOffsetMs: number;
};

/**
 * The «Урок» tab while no lesson is in progress (docs/spec/03-student-homework-lesson.md §1 L1; the text
 * diet of docs/design/glass-over-paper.md §1a): one line — «Сейчас урока нет» — and when the next one
 * starts: «завтра, 16:00», a countdown in the last hour. The screen switches to the lesson by itself at
 * the start moment; the site's sentences about it are kept for screen readers only.
 */
export function LessonWaiting({ upcoming, serverOffsetMs }: LessonWaitingProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.student.lesson;
  const nowMs = useServerNow(serverOffsetMs, 15_000);
  const startsInSeconds = upcoming ? secondsUntil(upcoming.startsAt, nowMs) : null;
  const when = upcoming
    ? lessonWhen(upcoming.startsAt, false, nowMs, locale, {
        lessonNow: '',
        lessonToday: m.common.deadline.today,
        lessonTomorrow: m.common.deadline.tomorrow,
        lessonOn: dict.student.notifications.dateTime,
      })
    : null;

  return (
    <View style={styles.wrap} testID="lesson-waiting">
      <Card style={styles.card}>
        <Text variant="sectionTitle" accessibilityRole="header" accessibilityHint={upcoming ? undefined : t.noUpcoming}>
          {t.noLessonTitle}
        </Text>

        {upcoming && when ? (
          startsInSeconds !== null && startsInSeconds <= COUNTDOWN_WINDOW_SECONDS ? (
            <StartCountdown startsAtDeviceMs={Date.parse(upcoming.startsAt) - serverOffsetMs} />
          ) : (
            <View
              accessible
              accessibilityLabel={format(t.upcoming, {
                title: upcoming.title,
                date: formatDateTime(upcoming.startsAt, locale),
                group: upcoming.groupName ? ` · ${upcoming.groupName}` : '',
              })}
              style={styles.when}
              testID="lesson-upcoming"
            >
              <Icon name="calendarDays" size={16} color="textMuted" />
              <Text variant="small" color="textMuted" tabular style={styles.whenText} testID="lesson-waiting-text">
                {when}
              </Text>
            </View>
          )
        ) : null}
      </Card>
    </View>
  );
}

/** «через 2 минуты» — ticks every second, so it lives in its own component. */
function StartCountdown({ startsAtDeviceMs }: { startsAtDeviceMs: number }) {
  const styles = useStyles();
  const { m } = useI18n();
  const waitText = useWaitText();
  const seconds = useCountdown(startsAtDeviceMs);
  const text =
    seconds > 0
      ? format(m.studentWork.lesson.startsIn, { time: waitText.time(seconds) })
      : m.studentWork.lesson.startsSoon;
  return (
    <View style={styles.when} accessible accessibilityRole="timer" accessibilityLabel={text} testID="lesson-countdown">
      {seconds > 0 ? <Icon name="clock" size={16} color="accentSolid" /> : <Spinner size={14} />}
      <Text variant="smallStrong" color="accentSolid" tabular style={styles.whenText}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.lg },
  card: { gap: t.space.sm },
  when: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  whenText: { flexShrink: 1, minWidth: 0 },
}));
