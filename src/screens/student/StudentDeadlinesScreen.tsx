import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { qk, useApi } from '@/api';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { deadlineCaption } from '@/domain/deadline-caption';
import { mskToday } from '@/domain/moscow-time';
import { correctedNow } from '@/domain/server-clock';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { Hint } from '@/providers';
import { ShellAppBar } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { ListCard, ListRow, Panel, Panels, Screen, Segmented, Text } from '@/ui';

import { CalendarSkeleton } from './study/calendar-skeleton';
import { DaySheet } from './study/day-sheet';
import {
  groupByMskDay,
  monthOfInstant,
  selectUpcoming,
  shiftMonth,
  toDeadlineItems,
  type CalendarMonth,
  type DeadlineItem,
} from './study/deadline-model';
import { DeadlinesCalendar } from './study/deadlines-calendar';
import { RefreshError } from './study/refresh-error';
import { useNow } from './study/use-now';
import { WeekStrip } from './study/week-strip';

type CalendarView = 'week' | 'month';

/** Rows of the list under the calendar: every unfinished homework, nearest deadline first. */
const LIST_LIMIT = 50;

/**
 * `student.deadlines` — «Дедлайны» (docs/spec/02-student-study.md S4; layout: docs/design/
 * glass-over-paper.md §8): the current week — or the month, by the switch in the header — with the days
 * that have deadlines marked, and under it the list of what is still to hand in, nearest first. A marked
 * day opens a sheet with that day's homeworks; a row opens its homework. Every homework with a deadline is
 * marked in the calendar, done ones included.
 */
export function StudentDeadlinesScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m, locale } = useI18n();
  const [view, setView] = useState<CalendarView>('week');
  const navigation = useAppNavigation();

  const deadlines = useQuery({
    queryKey: qk('studentStudy', 'getHomeworkDeadlines'),
    queryFn: () => api.studentStudy.getHomeworkDeadlines(),
  });
  const { refreshing, refresh } = usePullRefresh([deadlines]);
  // 00 §2.3: realtime first, a refetch when the tab regains focus as the fallback.
  useRefetchOnFocus([deadlines]);

  const data = deadlines.data;
  const deviceNow = useNow();
  const now = correctedNow(data?.serverNow, deadlines.dataUpdatedAt, deviceNow);
  const today = mskToday(now);
  // Until the user turns a page the calendar follows the current month.
  const [chosenMonth, setChosenMonth] = useState<CalendarMonth | null>(null);
  const month = chosenMonth ?? monthOfInstant(now);
  // The day stays "open" (ring, sheet content) until the sheet has finished leaving the screen.
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const items = useMemo(() => (data ? toDeadlineItems(data.items, locale) : []), [data, locale]);
  const dayItems = useMemo(() => (openDayKey ? (groupByMskDay(items).get(openDayKey) ?? []) : []), [items, openDayKey]);

  const openHomework = (item: DeadlineItem) => {
    setSheetVisible(false);
    navigation.open({ screen: 'student.homework', assignmentId: item.assignmentId });
  };

  const upcoming = useMemo(() => selectUpcoming(items, LIST_LIMIT), [items]);
  const openDay = (dayKey: string) => {
    setOpenDayKey(dayKey);
    setSheetVisible(true);
  };

  const rows =
    upcoming.length === 0 ? (
      <ListRow title={m.student.calendar.nothingDue} titleLines={2} testID="deadlines-list-empty" />
    ) : (
      upcoming.map((item, index) => {
        const caption = deadlineCaption(item.deadlineAt, false, now, locale, m.common.deadline);
        return (
          <ListRow
            key={item.id}
            title={item.label}
            subtitle={caption.text}
            subtitleTone={caption.attention ? 'attention' : 'muted'}
            divider={index < upcoming.length - 1}
            onPress={() => openHomework(item)}
            accessibilityLabel={format(m.student.calendar.rowA11y, { title: item.label, caption: caption.text })}
            testID={`deadlines-row-${item.id}`}
          />
        );
      })
    );
  const calendar = (bare: boolean) => (
    <DeadlinesCalendar
      items={items}
      month={month}
      today={today}
      openDayKey={openDayKey}
      bare={bare}
      onChangeMonth={(delta) => {
        setSheetVisible(false);
        setOpenDayKey(null);
        setChosenMonth(shiftMonth(month, delta));
      }}
      onOpenDay={openDay}
    />
  );
  const daySheet = (
    <DaySheet
      visible={sheetVisible}
      dayKey={openDayKey}
      items={dayItems}
      now={now}
      onClose={() => setSheetVisible(false)}
      onClosed={() => setOpenDayKey(null)}
      onOpenHomework={openHomework}
    />
  );

  // A tablet has the room for the month and the list side by side: no week / month switch.
  if (theme.tablet && data) {
    return (
      <Screen testID="student-deadlines-screen" header={<ShellAppBar title={m.shell.tabs.deadlines} />} scroll={false} maxWidth="full">
        {deadlines.isError ? <RefreshError error={deadlines.error} testID="deadlines-refresh-error" /> : null}
        <Panels>
          <Panel weight={3}>{calendar(true)}</Panel>
          <Panel
            weight={2}
            padded={false}
            header={
              <Text variant="sectionTitle" accessibilityRole="header" style={styles.listTitle}>
                {dict.student.upcoming.title}
              </Text>
            }
            contentStyle={styles.listPanel}
            testID="deadlines-list"
          >
            {rows}
          </Panel>
        </Panels>
        {daySheet}
      </Screen>
    );
  }

  return (
    <Screen
      testID="student-deadlines-screen"
      header={
        <ShellAppBar
          title={m.shell.tabs.deadlines}
          aside={
            <Segmented<CalendarView>
              options={[
                { value: 'week', label: m.student.calendar.week },
                { value: 'month', label: m.student.calendar.month },
              ]}
              value={view}
              onChange={(next) => {
                setSheetVisible(false);
                setOpenDayKey(null);
                setView(next);
              }}
              accessibilityLabel={m.student.calendar.viewA11y}
              fill
              testID="deadlines-view"
            />
          }
        />
      }
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {data ? (
        <>
          {deadlines.isError ? <RefreshError error={deadlines.error} testID="deadlines-refresh-error" /> : null}
          {view === 'week' ? (
            <WeekStrip items={items} now={now} today={today} openDayKey={openDayKey} onOpenDay={openDay} />
          ) : (
            <>
              {calendar(false)}
              <Hint>
                <Text variant="hint">{m.student.calendar.swipeHint}</Text>
              </Hint>
            </>
          )}

          <ListCard testID="deadlines-list">{rows}</ListCard>
        </>
      ) : isLoadFailed(deadlines) ? (
        <LoadFailure query={deadlines} home testID="deadlines-error" />
      ) : (
        <CalendarSkeleton />
      )}

      {daySheet}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  listTitle: { paddingHorizontal: t.space.card, paddingTop: t.space.card },
  listPanel: { gap: 0, paddingBottom: t.space.sm },
}));
