import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { qk, useApi } from '@/api';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { mskToday } from '@/domain/moscow-time';
import { correctedNow } from '@/domain/server-clock';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { ShellAppBar } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { ListRow, Panel, Panels, Screen, Text, useDockInset } from '@/ui';

import { CalendarSkeleton } from './study/calendar-skeleton';
import { DayHomeworks } from './study/day-homeworks';
import { DaySheet } from './study/day-sheet';
import {
  dayTitle,
  groupByMskDay,
  monthOfInstant,
  nearestDeadlineDay,
  shiftMonth,
  toDeadlineItems,
  type CalendarMonth,
  type DeadlineItem,
} from './study/deadline-model';
import { DeadlinesCalendar } from './study/deadlines-calendar';
import { RefreshError } from './study/refresh-error';
import { useNow } from './study/use-now';

/**
 * `student.deadlines` — «Дедлайны» (docs/spec/02-student-study.md S4). The screen IS the month (the owner:
 * «один календарь, на котором всё отмечено, а при желании разворачивать отдельный день, как в календаре
 * на айфоне»): the grid fills the screen down to the dock and every homework with a deadline — done ones
 * included — is a mark under its day. There is no list under it and no week / month switch. Pressing a day
 * that has homeworks unfolds it: a sheet titled with the date, a row per homework, a row opens the
 * homework. A free day only takes the selection.
 *
 * A tablet keeps the month in the left panel and the picked day's homeworks in the right one; before
 * anything is picked that is today, or the nearest day with a homework, so the panel is never empty.
 */
export function StudentDeadlinesScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m, locale } = useI18n();
  const navigation = useAppNavigation();
  const dockInset = useDockInset();

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
  // Until the user turns a page the calendar follows the current month.
  const [chosenMonth, setChosenMonth] = useState<CalendarMonth | null>(null);
  const month = chosenMonth ?? monthOfInstant(now);
  // The day the user pressed; it keeps its disc after the sheet is closed, like in a calendar app.
  const [pickedDayKey, setPickedDayKey] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const items = useMemo(() => (data ? toDeadlineItems(data.items, locale) : []), [data, locale]);
  const byDay = useMemo(() => groupByMskDay(items), [items]);
  // A tablet always shows a day next to the month.
  const dayKey = pickedDayKey ?? (theme.tablet ? nearestDeadlineDay(items, mskToday(now)) : null);
  const dayItems = dayKey ? (byDay.get(dayKey) ?? []) : [];

  const openHomework = (item: DeadlineItem) => {
    setSheetVisible(false);
    navigation.open({ screen: 'student.homework', assignmentId: item.assignmentId });
  };

  const calendar = (bare: boolean) => (
    <DeadlinesCalendar
      items={items}
      month={month}
      now={now}
      selectedDayKey={dayKey}
      bare={bare}
      onChangeMonth={(delta) => setChosenMonth(shiftMonth(month, delta))}
      onSelectDay={(pressed, pressedItems) => {
        setPickedDayKey(pressed);
        // A phone unfolds the day in a sheet; a tablet already shows it in the panel next to the month.
        if (!theme.tablet && pressedItems.length > 0) setSheetVisible(true);
      }}
    />
  );

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
              <Text variant="sectionTitle" accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.dayTitle} testID="deadlines-day-title">
                {dayKey ? dayTitle(dayKey, m.student.calendar.weekdays, locale) : ''}
              </Text>
            }
            contentStyle={styles.dayPanel}
            testID="deadlines-list"
          >
            {dayItems.length === 0 ? (
              <ListRow title={dict.student.calendar.emptyDay} titleLines={2} divider={false} testID="deadlines-list-empty" />
            ) : (
              <DayHomeworks items={dayItems} now={now} onOpenHomework={openHomework} />
            )}
          </Panel>
        </Panels>
      </Screen>
    );
  }

  return (
    <Screen
      testID="student-deadlines-screen"
      header={<ShellAppBar title={m.shell.tabs.deadlines} />}
      refreshing={refreshing}
      onRefresh={refresh}
      // The month runs down to the dock, like a tablet panel: the page keeps its scroller only for
      // pull-to-refresh (and for a window too short for six rows), so it needs no room after the card.
      contentContainerStyle={dockInset > 0 ? { paddingBottom: dockInset + theme.space.xxs } : undefined}
    >
      {data ? (
        <>
          {deadlines.isError ? <RefreshError error={deadlines.error} testID="deadlines-refresh-error" /> : null}
          {calendar(false)}
        </>
      ) : isLoadFailed(deadlines) ? (
        <LoadFailure query={deadlines} home testID="deadlines-error" />
      ) : (
        <CalendarSkeleton />
      )}

      <DaySheet visible={sheetVisible} dayKey={dayKey} items={dayItems} now={now} onClose={() => setSheetVisible(false)} onOpenHomework={openHomework} />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  dayTitle: { paddingHorizontal: t.space.card, paddingTop: t.space.card },
  dayPanel: { gap: 0, paddingBottom: t.space.sm },
}));
