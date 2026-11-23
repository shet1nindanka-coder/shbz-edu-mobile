import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { qk, useApi } from '@/api';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { deadlineCaption } from '@/domain/deadline-caption';
import { lessonWhen } from '@/domain/lesson-when';
import { correctedNow } from '@/domain/server-clock';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { useCurrentUser } from '@/providers';
import { ShellAppBar, useStreakToday, useStudentStreak } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles } from '@/theme';
import {
  Card,
  CardPressArea,
  Enter,
  Icon,
  IconTile,
  ListCard,
  ListRow,
  LoadingState,
  Notice,
  Screen,
  SectionCaption,
  Text,
  TextButton,
  navIcons,
} from '@/ui';

import { selectUpcoming, toDeadlineItems, type DeadlineItem } from './study/deadline-model';
import { RefreshError } from './study/refresh-error';
import { useNow } from './study/use-now';
import { WeekCard } from './study/week-card';

/**
 * `student.home` — «Обзор» (docs/spec/02-student-study.md S1; layout: docs/design/glass-over-paper.md §8):
 * what is next and nothing else. One card for the nearest lesson, the nearest homeworks as rows — a title,
 * the deadline, «1 из 3» — and one card «За неделю» with the streak. Everything opens by a tap.
 *
 * Reads: the light deadline list, the shell's streak query (00 §3.2) and the lesson read of the «урок» tab
 * (the same cache entry). Freshness (00 §2.3): the realtime bridge invalidates them on the student's own
 * events, they are refetched when the tab regains focus with stale data, and pull-to-refresh re-queries.
 */
export function StudentHomeScreen() {
  const styles = useStyles();
  const api = useApi();
  const user = useCurrentUser();
  const { dict, m, locale } = useI18n();
  const navigation = useAppNavigation();

  const deadlines = useQuery({
    queryKey: qk('studentStudy', 'getHomeworkDeadlines'),
    queryFn: () => api.studentStudy.getHomeworkDeadlines(),
  });
  const lesson = useQuery({
    queryKey: qk('studentWork', 'getLiveLesson'),
    queryFn: ({ signal }) => api.studentWork.getLiveLesson({ signal }),
  });
  const streak = useStudentStreak();
  // The same day the streak is counted on everywhere in the shell.
  const streakToday = useStreakToday();
  const { refreshing, refresh } = usePullRefresh([deadlines, streak, lesson]);
  useRefetchOnFocus([deadlines, streak, lesson]);

  const data = deadlines.data;
  const deviceNow = useNow();
  const now = correctedNow(data?.serverNow, deadlines.dataUpdatedAt, deviceNow);
  const upcoming = data ? selectUpcoming(toDeadlineItems(data.items, locale)) : null;
  // The homework tab is selected and the detail pushed over its list, so "back" returns to the list.
  const openHomework = (item: DeadlineItem) => navigation.open({ screen: 'student.homework', assignmentId: item.assignmentId });

  const firstName = user.name.trim().split(/\s+/)[0] ?? '';
  const title = firstName ? format(m.student.home.greeting, { name: firstName }) : m.student.home.greetingNoName;

  const nextLesson = lesson.data?.active ?? lesson.data?.upcoming ?? null;
  const when = nextLesson ? lessonWhen(nextLesson.startsAt, Boolean(lesson.data?.active), now, locale, {
        lessonNow: m.student.home.lessonNow,
        lessonToday: m.student.home.lessonToday,
        lessonTomorrow: m.student.home.lessonTomorrow,
        lessonOn: m.student.home.lessonOn,
      }) : null;

  return (
    <Screen testID="student-home-screen" header={<ShellAppBar title={title} />} refreshing={refreshing} onRefresh={refresh}>
      {deadlines.isError && data ? <RefreshError error={deadlines.error} testID="home-refresh-error" /> : null}

      {nextLesson && when ? (
        <Enter index={0}>
          <Card padded={false} testID="home-lesson">
            <CardPressArea
              onPress={() => navigation.open({ screen: 'student.lesson' })}
              accessibilityLabel={format(m.student.home.lessonA11y, { when, title: nextLesson.title })}
              style={styles.lesson}
              testID="home-lesson-card"
            >
              <IconTile icon={navIcons.student.lesson} />
              <View style={styles.lessonTexts}>
                <Text variant="bodyBold" numberOfLines={1}>
                  {when}
                </Text>
                <Text variant="small" color="textMuted" numberOfLines={1}>
                  {nextLesson.title}
                </Text>
              </View>
              <Icon name="chevronRight" size={20} color="textMuted" />
            </CardPressArea>
          </Card>
        </Enter>
      ) : null}

      {upcoming ? (
        <Enter index={1} style={styles.block}>
          <SectionCaption>{dict.student.homeworks.kicker}</SectionCaption>
          <ListCard testID="home-upcoming">
            {upcoming.length === 0 ? (
              <ListRow title={dict.student.upcoming.empty} testID="home-upcoming-empty" />
            ) : (
              upcoming.map((item) => {
                const caption = deadlineCaption(item.deadlineAt, item.status === 'DONE', now, locale, m.common.deadline);
                const done = format(m.common.numbers.doneOf, { done: item.solvedNumbers, total: item.totalNumbers });
                return (
                  <ListRow
                    key={item.id}
                    title={item.label}
                    subtitle={caption.text}
                    subtitleTone={caption.attention ? 'attention' : 'muted'}
                    meta={done}
                    onPress={() => openHomework(item)}
                    accessibilityLabel={format(m.studentWork.list.rowA11y, { title: item.label, caption: caption.text, done })}
                    testID={`home-upcoming-card-${item.id}`}
                  />
                );
              })
            )}
          </ListCard>
        </Enter>
      ) : isLoadFailed(deadlines) ? (
        // No «На главную» here: this is the home screen. «Попробовать снова» re-reads the streak as well.
        <LoadFailure
          query={{
            isError: deadlines.isError,
            error: deadlines.error,
            failureReason: deadlines.failureReason,
            fetchStatus: deadlines.fetchStatus,
            errorUpdatedAt: deadlines.errorUpdatedAt,
            refetch: refresh,
          }}
          testID="home-error"
        />
      ) : (
        <LoadingState variant="list" count={3} accessibilityLabel={m.common.a11y.loading} testID="student-home-skeleton" />
      )}

      {streak.data ? (
        <Enter index={2}>
          <WeekCard streak={streak.data} today={streakToday} testID="home-streak" />
        </Enter>
      ) : isLoadFailed(streak) ? (
        <Notice
          tone="error"
          text={m.student.home.streakFailed}
          action={<TextButton label={dict.common.retry} tone="danger" onPress={() => void streak.refetch()} testID="home-streak-retry" />}
          testID="home-streak-error"
        />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.sm },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, padding: t.space.card },
  lessonTexts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
