import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, RefreshControl, View } from 'react-native';

import { HIGHLIGHT_FLASH_MS, errorText, hasErrorCode, qk, useApi } from '@/api';
import type { StudentCheckResultDto, StudentHomeworkNumberDto } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { formatDateTime } from '@/domain/dates';
import { serverClockOffset } from '@/domain/server-clock';
import { isHomeworkOverdue } from '@/domain/statuses';
import { useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { DetailAppBar, screenTitle } from '@/screens/shell';
import { useServerNow } from '@/services/clock';
import { refreshQueries, usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Card, Chip, Divider, LoadingState, Notice, Screen, Text } from '@/ui';

import { HomeworkCheckBlock } from './work/homework-check-block';
import { HomeworkNumberCard } from './work/homework-number-card';
import { HomeworkPhotosBlock } from './work/homework-photos-block';
import { UNAVAILABLE_RECHECK_MS, homeworkDetailMeta, homeworkLabel, isHomeworkCompleted } from './work/logic';
import { useHomeworkCheck } from './work/use-homework-check';
import { useOnReturn, useScreenLive } from './work/use-screen-live';

/** Route params of `student.homework` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type StudentHomeworkScreenProps = ScreenParams['student.homework'];

/**
 * `student.homework` (docs/spec/03-student-homework-lesson.md §1 H2 – H4): one homework — the photo batch,
 * the AI check with its verdicts, and a card per problem with the statement and the student's note.
 * A homework that no longer exists (cancelled by the teacher) leads back to the list (00 §3.3).
 */
export function StudentHomeworkScreen({ assignmentId }: StudentHomeworkScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const { dict, m, locale } = useI18n();
  const t = dict.student.homework;
  const live = useScreenLive();

  const listRef = useRef<FlashListRef<StudentHomeworkNumberDto>>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

  const detail = useQuery({
    queryKey: qk('studentWork', 'getHomework', assignmentId),
    queryFn: ({ signal }) => api.studentWork.getHomework(assignmentId, { signal }),
    // The start button is off while the AI check is reported as switched off: keep asking.
    refetchInterval: (query) => (live && query.state.data && !query.state.data.aiCheckAvailable ? UNAVAILABLE_RECHECK_MS : false),
  });
  const data = detail.data;
  const { isStale } = detail;

  // `404 homeworkNotFound`: an unknown id, or a homework the teacher has cancelled — also when it is
  // discovered by an upload, a check start or a poll. The list is the place to land on (00 §3.3).
  const [reportedGone, setReportedGone] = useState(false);
  const leave = useCallback(() => setReportedGone(true), []);
  const gone = reportedGone || hasErrorCode(detail.error, 'homeworkNotFound');
  const left = useRef(false);
  useEffect(() => {
    // Only while this screen is in front: a 404 that arrives while the student is on another tab or in
    // the photo viewer (a realtime re-read, a request that was still in flight) must not pull them here.
    if (!gone || !live || left.current) return;
    left.current = true;
    queryClient.removeQueries({ queryKey: qk('studentWork', 'getHomework', assignmentId) });
    // The teacher cancelled it (a server-side change): a list read already on its way is kept.
    void refreshQueries(queryClient, { queryKey: qk('studentWork', 'listHomeworks') });
    void refreshQueries(queryClient, { queryKey: qk('studentStudy', 'getHomeworkDeadlines') });
    // `open`, not `replace`: the tab's stack always holds the list under a detail (its layout anchors
    // it), so replacing the detail with the list would leave two lists and "back" would show the same
    // screen again. Opening a tab root returns the stack to that one list.
    navigation.open({ screen: 'student.homeworks' });
  }, [assignmentId, gone, live, navigation, queryClient]);

  const check = useHomeworkCheck({
    assignmentId,
    check: data?.assignment.latestCheck ?? null,
    loaded: data !== undefined,
    live,
    onGone: leave,
  });

  // Back on the screen (another tab, the photo viewer, the background): statuses and the batch may have
  // changed meanwhile, and a check that is still running resumes its polling by itself.
  // Server-side changes: a read already on its way (a realtime re-read) is kept, not cancelled.
  useOnReturn(live, () => {
    if (isStale) void refreshQueries(queryClient, { queryKey: qk('studentWork', 'getHomework', assignmentId), exact: true });
  });

  const nowMs = useServerNow(data ? serverClockOffset(data.serverNow, detail.dataUpdatedAt) : 0);

  const pull = usePullRefresh([detail]);
  const { refreshing } = pull;
  const refresh = () => {
    check.retryPoll();
    pull.refresh();
  };

  const redo = (result: StudentCheckResultDto) => {
    if (!data) return;
    const index = data.assignment.numbers.findIndex((number) => number.homeworkNumberId === result.homeworkNumberId);
    if (index < 0) return;
    void listRef.current?.scrollToIndex({ index, animated: true, viewOffset: theme.space.md });
    setHighlighted(result.homeworkNumberId);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlighted(null), HIGHLIGHT_FLASH_MS);
  };

  const assignment = data?.assignment;
  const label = assignment ? homeworkLabel(assignment, dict.common.homeworkN) : screenTitle('student.homework', m.shell.tabs);

  let body;
  if (data && assignment && !gone) {
    const completed = isHomeworkCompleted(assignment);
    const overdue = isHomeworkOverdue(assignment.deadlineAt, completed, nowMs);
    const badges = dict.student.deadlineList;
    const header = (
      <View style={styles.header}>
        <View style={styles.meta}>
          <Text variant="small" color="textMuted" style={styles.metaText} testID="homework-meta">
            {homeworkDetailMeta(assignment, t, assignment.deadlineAt ? formatDateTime(assignment.deadlineAt, locale) : null)}
          </Text>
          {completed ? <Chip tone="green" label={badges.doneBadge} /> : null}
          {overdue ? <Chip tone="red" label={badges.overdueBadge} /> : null}
        </View>

        {/* The cached homework stays on screen when a refresh fails (offline): say so instead of replacing it. */}
        {detail.isError ? (
          <Notice tone="error" text={errorText(detail.error, m.studentWork.homework.refreshFailed)} testID="homework-refresh-error" />
        ) : null}

        <Card style={styles.work}>
          <HomeworkPhotosBlock
            assignmentId={assignmentId}
            photos={assignment.photos}
            maxPhotos={data.limits.maxPhotosPerAssignment}
            onGone={leave}
          />
          <Divider />
          <HomeworkCheckBlock
            check={assignment.latestCheck}
            hasPhotos={assignment.photos.length > 0}
            available={data.aiCheckAvailable}
            state={check}
            onRedo={redo}
          />
        </Card>

        {assignment.numbers.length > 0 ? (
          <Text variant="sectionTitle" accessibilityRole="header">
            {t.numbers}
          </Text>
        ) : null}
      </View>
    );

    body = (
      <FlashList
        ref={listRef}
        data={assignment.numbers}
        keyExtractor={(number) => number.homeworkNumberId}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <HomeworkNumberCard
              // A recycled row must not carry another problem's unsaved draft.
              key={item.homeworkNumberId}
              number={item}
              notesEnabled={data.notesEnabled}
              noteMaxLength={data.limits.noteMaxLength}
              highlighted={highlighted === item.homeworkNumberId}
            />
          </View>
        )}
        extraData={highlighted}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // On web any scroll counts as a drag, including the browser bringing a focused note into view.
        keyboardDismissMode={Platform.select({ ios: 'interactive', android: 'on-drag', default: 'none' })}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accentSolid}
            colors={[theme.colors.accentSolid]}
            progressBackgroundColor={theme.colors.cardBg}
          />
        }
        testID="homework-numbers"
      />
    );
  } else if (isLoadFailed(detail) && !gone) {
    body = <LoadFailure query={detail} testID="homework-error" />;
  } else {
    body = <LoadingState variant="cards" accessibilityLabel={m.common.a11y.loading} testID="homework-loading" />;
  }

  const showList = Boolean(data && assignment && !gone);

  return (
    <Screen
      testID="student-homework-screen"
      header={<DetailAppBar title={label} subtitle={assignment?.topicTitle} />}
      // The screen sits inside the «дз» tab: the tab bar owns the bottom inset.
      bottomInset={false}
      scroll={!showList}
      padded={!showList}
    >
      {body}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.field, paddingBottom: t.space.field },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.sm },
  metaText: { flexShrink: 1 },
  work: { gap: t.space.field },
  row: { paddingBottom: t.space.md },
}));
