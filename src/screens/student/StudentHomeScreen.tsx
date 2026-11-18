import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { qk, useApi } from '@/api';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { correctedNow } from '@/domain/server-clock';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { ShellAppBar, useStreakToday, useStudentStreak } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Card, Chip, Enter, Icon, ListRow, Notice, PageHeader, Screen, TextButton, navIcons } from '@/ui';

import { DeadlineCard } from './study/deadline-card';
import { splitUpcoming, toDeadlineItems, type DeadlineItem } from './study/deadline-model';
import { HomeSection } from './study/home-section';
import { HomeSkeleton } from './study/home-skeleton';
import { RefreshError } from './study/refresh-error';
import { StreakWidget } from './study/streak-widget';
import { useNow } from './study/use-now';

/**
 * `student.home` — «Обзор» (docs/spec/02-student-study.md S1): what is next (the nearest unfinished
 * homework), the streak and the weekly rhythm, and a short list of the following homeworks. Two reads:
 * the light deadline list and the shell's streak query (00 §3.2).
 *
 * Freshness (00 §2.3): the realtime bridge invalidates both reads on the student's own events, both are
 * refetched when the tab regains focus with stale data, pull-to-refresh re-queries both, and a reconnect
 * invalidates everything.
 */
export function StudentHomeScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m, locale } = useI18n();
  const navigation = useAppNavigation();

  const deadlines = useQuery({
    queryKey: qk('studentStudy', 'getHomeworkDeadlines'),
    queryFn: () => api.studentStudy.getHomeworkDeadlines(),
  });
  const streak = useStudentStreak();
  // The same day the app bar's streak pill reads the cached streak on.
  const streakToday = useStreakToday();
  const { refreshing, refresh } = usePullRefresh([deadlines, streak]);
  useRefetchOnFocus([deadlines, streak]);

  const data = deadlines.data;
  const deviceNow = useNow();
  const now = correctedNow(data?.serverNow, deadlines.dataUpdatedAt, deviceNow);
  const blocks = data ? splitUpcoming(toDeadlineItems(data.items, locale)) : null;
  // The homework tab is selected and the detail pushed over its list, so "back" returns to the list.
  const openHomework = (item: DeadlineItem) => navigation.open({ screen: 'student.homework', assignmentId: item.assignmentId });

  const streakBlock = streak.data ? (
    <HomeSection title={dict.student.weekly.title} testID="home-streak">
      <StreakWidget streak={streak.data} today={streakToday} />
    </HomeSection>
  ) : isLoadFailed(streak) ? (
    <HomeSection title={dict.student.weekly.title} testID="home-streak">
      <Notice
        tone="error"
        text={m.student.home.streakFailed}
        action={<TextButton label={dict.common.retry} tone="danger" onPress={() => void streak.refetch()} testID="home-streak-retry" />}
        testID="home-streak-error"
      />
    </HomeSection>
  ) : (
    <HomeSkeleton parts="streak" />
  );

  return (
    <Screen
      testID="student-home-screen"
      header={<ShellAppBar />}
      bottomInset={false}
      glow="dashboard"
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {/* The gap under the header is shorter than the site's 40: on a phone there is no aside under it. */}
      <PageHeader kicker={dict.studentHome.kicker} title={dict.studentHome.title} gap={theme.space.cardWide} />

      {blocks ? (
        <View style={styles.sections}>
          {deadlines.isError ? <RefreshError error={deadlines.error} testID="home-refresh-error" /> : null}

          {blocks.hero ? (
            <Enter index={0}>
              <HomeSection title={dict.student.upcoming.whatsNext} testID="home-whats-next">
                <DeadlineCard item={blocks.hero} variant="compact" now={now} onPress={openHomework} testID="home-hero-card" />
              </HomeSection>
            </Enter>
          ) : null}

          <Enter index={1}>{streakBlock}</Enter>

          {blocks.showList ? (
            <Enter index={2}>
              <HomeSection title={dict.student.upcoming.title} testID="home-upcoming">
                {blocks.list.length === 0 ? (
                  <Chip label={dict.student.upcoming.empty} style={styles.emptyChip} />
                ) : (
                  blocks.list.map((item) => (
                    <DeadlineCard
                      key={item.id}
                      item={item}
                      variant="full"
                      now={now}
                      onPress={openHomework}
                      testID={`home-upcoming-card-${item.id}`}
                    />
                  ))
                )}
              </HomeSection>
            </Enter>
          ) : null}

          {/* SPEC-GAP: 00 §3.1 puts «общая инфа» behind "a row on student.home" without giving its texts:
              the section name and the page's own title are used. */}
          <Enter index={3}>
            <Card variant="outline" padded={false}>
              <ListRow
                title={m.shell.tabs.info}
                subtitle={dict.student.info.title}
                left={
                  <View style={styles.infoTile}>
                    <Icon name={navIcons.student.info} size={18} color="accentSolid" />
                  </View>
                }
                divider={false}
                accessibilityLabel={m.student.home.infoRowAria}
                onPress={() => navigation.push({ screen: 'student.info' })}
                testID="home-info-row"
              />
            </Card>
          </Enter>
        </View>
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
        <HomeSkeleton />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  sections: { gap: t.space.pageTop },
  // The site's inline grey chip: it hugs its text instead of stretching to the column.
  emptyChip: { alignSelf: 'flex-start' },
  infoTile: {
    width: t.sizes.iconCircle,
    height: t.sizes.iconCircle,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.md,
    backgroundColor: t.colors.accentSoft,
  },
}));
