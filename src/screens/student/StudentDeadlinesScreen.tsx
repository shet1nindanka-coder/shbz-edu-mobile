import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { qk, useApi } from '@/api';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { mskToday } from '@/domain/moscow-time';
import { correctedNow } from '@/domain/server-clock';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { Hint } from '@/providers';
import { ShellAppBar } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { PageHeader, Screen, Text } from '@/ui';

import { CalendarSkeleton } from './study/calendar-skeleton';
import { DaySheet } from './study/day-sheet';
import { groupByMskDay, monthOfInstant, shiftMonth, toDeadlineItems, type CalendarMonth, type DeadlineItem } from './study/deadline-model';
import { DeadlinesCalendar } from './study/deadlines-calendar';
import { RefreshError } from './study/refresh-error';
import { useNow } from './study/use-now';
import { useRefresh } from './study/use-refresh';

/**
 * `student.deadlines` — «Дедлайны» (docs/spec/02-student-study.md S4): a month calendar of homework
 * deadlines; a marked day opens a sheet with that day's homeworks. Every homework with a deadline is
 * shown, done ones included. With no deadlines the calendar is simply unmarked — there is no empty text.
 */
export function StudentDeadlinesScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m, locale } = useI18n();
  const navigation = useAppNavigation();

  const deadlines = useQuery({
    queryKey: qk('studentStudy', 'getHomeworkDeadlines'),
    queryFn: () => api.studentStudy.getHomeworkDeadlines(),
  });
  const { refetch } = deadlines;
  const { refreshing, refresh } = useRefresh(refetch);
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

  return (
    <Screen
      testID="student-deadlines-screen"
      header={<ShellAppBar title={m.shell.tabs.deadlines} />}
      bottomInset={false}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {/* The kicker («Дедлайны») is the app bar title. */}
      <PageHeader title={dict.student.deadlines.title} gap={theme.space.cardWide} />

      {data ? (
        <View style={styles.body}>
          {deadlines.isError ? <RefreshError error={deadlines.error} testID="deadlines-refresh-error" /> : null}
          <DeadlinesCalendar
            items={items}
            month={month}
            today={today}
            openDayKey={openDayKey}
            onChangeMonth={(delta) => {
              // Turning the month closes the open day, as on the site.
              setSheetVisible(false);
              setOpenDayKey(null);
              setChosenMonth(shiftMonth(month, delta));
            }}
            onOpenDay={(dayKey) => {
              setOpenDayKey(dayKey);
              setSheetVisible(true);
            }}
          />
          <Hint>
            <Text variant="hint">{m.student.calendar.swipeHint}</Text>
          </Hint>
        </View>
      ) : isLoadFailed(deadlines) ? (
        <LoadFailure query={deadlines} home testID="deadlines-error" />
      ) : (
        <CalendarSkeleton />
      )}

      <DaySheet
        visible={sheetVisible}
        dayKey={openDayKey}
        items={dayItems}
        now={now}
        onClose={() => setSheetVisible(false)}
        onClosed={() => setOpenDayKey(null)}
        onOpenHomework={openHomework}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.md },
}));
