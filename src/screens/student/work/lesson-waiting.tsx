import { View } from 'react-native';

import type { UpcomingLessonDto } from '@/api/types';
import { useCountdown, useWaitText } from '@/components/retry-wait';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Icon, PageHeader, Spinner, Text } from '@/ui';

import { secondsUntil } from './logic';
import { useServerNow } from '@/services/clock';

/** The countdown appears in the last hour before the start. */
const COUNTDOWN_WINDOW_SECONDS = 60 * 60;

export type LessonWaitingProps = {
  upcoming: UpcomingLessonDto | null;
  /** `serverClockOffset` of the response that carried `upcoming`. */
  serverOffsetMs: number;
};

/**
 * The «Урок» tab while no lesson is in progress (docs/spec/03-student-homework-lesson.md §1 L1): what
 * the tab is for, the nearest scheduled lesson when there is one, and the promise that the lesson opens
 * by itself — the screen switches at the start moment without a reload.
 */
export function LessonWaiting({ upcoming, serverOffsetMs }: LessonWaitingProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.student.lesson;
  const nowMs = useServerNow(serverOffsetMs, 15_000);
  const startsInSeconds = upcoming ? secondsUntil(upcoming.startsAt, nowMs) : null;
  const date = upcoming ? formatDateTime(upcoming.startsAt, locale) : '';

  return (
    <View style={styles.wrap} testID="lesson-waiting">
      <PageHeader kicker={t.kicker} title={t.title} gap={0} />
      <Card style={styles.card}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {t.noLessonTitle}
        </Text>
        <Text variant="small" color="textMuted" testID="lesson-waiting-text">
          {upcoming
            ? format(t.upcoming, { title: upcoming.title, date, group: upcoming.groupName ? ` · ${upcoming.groupName}` : '' })
            : t.noUpcoming}
        </Text>

        {upcoming ? (
          <Card variant="soft" padded={16} style={styles.next} testID="lesson-upcoming">
            <Text variant="cardKicker">{m.studentWork.lesson.nextLesson}</Text>
            <Text variant="bodyBold">{upcoming.title}</Text>
            <View style={styles.when}>
              <Icon name="calendar" size={14} color="kicker" />
              <Text variant="meta" style={styles.whenText}>
                {date} · {upcoming.groupName ?? m.studentWork.lesson.individual}
              </Text>
            </View>
            {startsInSeconds !== null && startsInSeconds <= COUNTDOWN_WINDOW_SECONDS ? (
              <StartCountdown startsAtDeviceMs={Date.parse(upcoming.startsAt) - serverOffsetMs} />
            ) : null}
          </Card>
        ) : null}

        {/* Always visible on the site (not a hint): it tells the student not to hunt for a reload. */}
        <Text variant="small">{m.studentWork.lesson.autoRefresh}</Text>
      </Card>
    </View>
  );
}

/** «Начнётся через 2 минуты» — ticks every second, so it lives in its own component. */
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
      {seconds > 0 ? <Icon name="clock" size={14} color="accentSolid" /> : <Spinner size={14} />}
      <Text variant="meta" color="accentSolid" tabular style={styles.whenText}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.lg },
  card: { gap: t.space.md },
  next: { gap: t.space.xs },
  when: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  // `minWidth: 0`: on web a Text keeps its longest word as min-width, so a long group name would leave the card.
  whenText: { flexShrink: 1, minWidth: 0 },
}));
