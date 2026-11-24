import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

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
import { makeStyles, useTheme } from '@/theme';
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
  Panel,
  Panels,
  Screen,
  Text,
  TextButton,
  navIcons,
} from '@/ui';

import { monthOfInstant, selectUpcoming, shiftMonth, toDeadlineItems, type CalendarMonth, type DeadlineItem } from './study/deadline-model';
import { DeadlinesCalendar } from './study/deadlines-calendar';
import { RefreshError } from './study/refresh-error';
import { useNow } from './study/use-now';
import { WeekCard } from './study/week-card';

/**
 * `student.home` — «Обзор» (docs/spec/02-student-study.md S1; layout: docs/design/glass-over-paper.md §8,
 * the text diet of §1a): what is next and nothing else. One line for the nearest lesson («Урок · завтра
 * 16:00»), the nearest homeworks as rows — a title, the deadline, «1/3» — and the week: one figure, the
 * streak chip and a bar per day. No captions above the blocks; everything opens by a tap.
 *
 * Reads: the light deadline list, the shell's streak query (00 §3.2) and the lesson read of the «урок» tab
 * (the same cache entry). Freshness (00 §2.3): the realtime bridge invalidates them on the student's own
 * events, they are refetched when the tab regains focus with stale data, and pull-to-refresh re-queries.
 */
export function StudentHomeScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const user = useCurrentUser();
  // Tablet: the month shown in the calendar panel; null = the current one.
  const [chosenMonth, setChosenMonth] = useState<CalendarMonth | null>(null);
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

  const homeworkRows = () =>
    !upcoming ? null : upcoming.length === 0 ? (
      <ListRow title={dict.student.upcoming.empty} testID="home-upcoming-empty" />
    ) : (
      upcoming.map((item, index) => {
        const caption = deadlineCaption(item.deadlineAt, item.status === 'DONE', now, locale, m.common.deadline);
        const done = format(m.common.numbers.doneOf, { done: item.solvedNumbers, total: item.totalNumbers });
        return (
          <ListRow
            key={item.id}
            title={item.label}
            subtitle={caption.text}
            subtitleTone={caption.attention ? 'attention' : 'muted'}
            meta={done}
            divider={index < upcoming.length - 1}
            onPress={() => openHomework(item)}
            accessibilityLabel={format(m.studentWork.list.rowA11y, { title: item.label, caption: caption.text, done })}
            testID={`home-upcoming-card-${item.id}`}
          />
        );
      })
    );
  const streakFailure = isLoadFailed(streak) ? (
    <Notice
      tone="error"
      text={m.student.home.streakFailed}
      action={<TextButton label={dict.common.retry} tone="danger" onPress={() => void streak.refetch()} testID="home-streak-retry" />}
      testID="home-streak-error"
    />
  ) : null;

  // One line says when; the lesson's own title is on the «урок» tab and in the accessible name.
  const lessonCard =
    nextLesson && when ? (
      <Card padded={false} testID="home-lesson">
        <CardPressArea
          onPress={() => navigation.open({ screen: 'student.lesson' })}
          accessibilityLabel={format(m.student.home.lessonA11y, { when, title: nextLesson.title })}
          style={styles.lesson}
          testID="home-lesson-card"
        >
          <IconTile icon={navIcons.student.lesson} />
          <Text variant="bodyBold" numberOfLines={1} style={styles.lessonText}>
            {when}
          </Text>
          <Icon name="chevronRight" size={20} color="textMuted" />
        </CardPressArea>
      </Card>
    ) : null;

  // Tablet (docs/design/glass-over-paper.md §1 rule 7): the lesson line across the top, then three panels
  // down to the dock — the homeworks, the week, the month with its deadlines.
  if (theme.tablet && data && upcoming) {
    const month = chosenMonth ?? monthOfInstant(now);
    return (
      <Screen testID="student-home-screen" header={<ShellAppBar title={title} />} scroll={false} maxWidth="full">
        {deadlines.isError ? <RefreshError error={deadlines.error} testID="home-refresh-error" /> : null}
        {lessonCard}
        <Panels>
          <Panel padded={false} contentStyle={styles.rowsPanel} testID="home-upcoming">
            {homeworkRows()}
          </Panel>
          {streak.data ? <WeekCard streak={streak.data} today={streakToday} fill testID="home-streak" /> : <Panel>{streakFailure}</Panel>}
          <Panel testID="home-calendar">
            <DeadlinesCalendar
              bare
              items={toDeadlineItems(data.items, locale)}
              month={month}
              now={now}
              selectedDayKey={null}
              onChangeMonth={(delta) => setChosenMonth(shiftMonth(month, delta))}
              // The day's homeworks are one tap further, in the deadlines section.
              onSelectDay={(_day, dayItems) => {
                if (dayItems.length > 0) navigation.open({ screen: 'student.deadlines' });
              }}
            />
          </Panel>
        </Panels>
      </Screen>
    );
  }

  return (
    <Screen testID="student-home-screen" header={<ShellAppBar title={title} />} refreshing={refreshing} onRefresh={refresh}>
      {deadlines.isError && data ? <RefreshError error={deadlines.error} testID="home-refresh-error" /> : null}

      {lessonCard ? <Enter index={0}>{lessonCard}</Enter> : null}

      {upcoming ? (
        <Enter index={1}>
          <ListCard testID="home-upcoming">{homeworkRows()}</ListCard>
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
      ) : (
        streakFailure
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  lesson: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, padding: t.space.card },
  lessonText: { flex: 1, minWidth: 0 },
  rowsPanel: { gap: 0, paddingVertical: t.space.sm },
}));
