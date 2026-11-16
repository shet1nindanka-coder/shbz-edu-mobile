import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { isApiError, qk, useApi } from '@/api';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { ShellAppBar } from '@/screens/shell';
import { makeStyles } from '@/theme';
import { Enter, ErrorState, LoadingState, Notice, PageHeader, Screen } from '@/ui';

import { buildHomeCards, pickCallCounts, type HomeCard } from './home/home-cards';
import { HomeNavCard } from './home/home-nav-card';
import { useRefetchOnFocus } from './home/use-refetch-on-focus';

/**
 * `teacher.home` (docs/spec/04-teacher-students.md S1): the teacher's landing tab — three navigation cards
 * (topics, students, parent calls) with their counters. Topics, problems and files are the shared bank;
 * students and call reminders are the teacher's own.
 */
export function TeacherHomeScreen() {
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.teacherHome;
  const navigation = useAppNavigation();
  const [refreshing, setRefreshing] = useState(false);

  const home = useQuery({
    queryKey: qk('teacherStudents', 'getTeacherHome'),
    queryFn: () => api.teacherStudents.getTeacherHome(),
  });
  // The calls section refreshes this read after a call is recorded; the overview follows it (00 §3.2).
  const callCounts = useQuery({
    queryKey: qk('groups', 'getParentCallCounts'),
    queryFn: () => api.groups.getParentCallCounts(),
  });

  useRefetchOnFocus([home, callCounts]);

  const summary = home.data;
  const cards = summary
    ? buildHomeCards(
        summary.stats,
        pickCallCounts(
          { data: summary.calls, updatedAt: home.dataUpdatedAt },
          callCounts.data ? { data: callCounts.data, updatedAt: callCounts.dataUpdatedAt } : null,
        ),
        t,
      )
    : null;

  const refresh = () => {
    setRefreshing(true);
    void Promise.all([home.refetch(), callCounts.refetch()]).finally(() => setRefreshing(false));
  };

  const open = (card: HomeCard) => navigation.open(card.link);

  return (
    <Screen
      testID="teacher-home-screen"
      header={<ShellAppBar />}
      bottomInset={false}
      glow="dashboard"
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <PageHeader kicker={t.kicker} title={t.title} gap={24} />

      {cards ? (
        <View style={styles.cards}>
          {/* The cached counters stay on screen when a refresh fails (offline): say so instead of hiding them. */}
          {home.isError ? (
            <Notice
              tone="error"
              text={isApiError(home.error) ? home.error.message : m.common.errors.generic}
              testID="teacher-home-refresh-error"
            />
          ) : null}
          {cards.map((card, index) => (
            <Enter key={card.id} index={index}>
              <HomeNavCard card={card} goLabel={dict.common.go} onOpen={open} />
            </Enter>
          ))}
        </View>
      ) : home.isError ? (
        <ErrorState
          title={dict.shells.errorTitle}
          description={isApiError(home.error) ? home.error.message : dict.shells.errorDescription}
          retryLabel={dict.common.retry}
          onRetry={() => void home.refetch()}
          retrying={home.isFetching}
          testID="teacher-home-error"
        />
      ) : (
        <LoadingState
          variant="cards"
          count={3}
          cardHeight={198}
          accessibilityLabel={m.common.a11y.loading}
          testID="teacher-home-loading"
        />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  cards: { gap: t.space.lg },
}));
