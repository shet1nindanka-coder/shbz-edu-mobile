import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { HIGHLIGHT_FLASH_MS, errorText, hasErrorCode, qk, useApi } from '@/api';
import type { StudentCheckResultDto } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { NumbersOverview } from '@/components/numbers';
import { deadlineCaption } from '@/domain/deadline-caption';
import { pickFocusNumberId } from '@/domain/number-focus';
import { serverClockOffset } from '@/domain/server-clock';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { screenTitle } from '@/screens/shell';
import { useServerNow } from '@/services/clock';
import { refreshQueries, usePullRefresh } from '@/services/query';
import { makeStyles } from '@/theme';
import { Card, LoadingState, Notice } from '@/ui';

import { HomeworkCheckBlock } from './homework-check-block';
import { HomeworkNumberCard } from './homework-number-card';
import { HomeworkPhotosBlock } from './homework-photos-block';
import { UNAVAILABLE_RECHECK_MS, homeworkLabel, isHomeworkCompleted } from './logic';
import { useHomeworkCheck } from './use-homework-check';
import { useOnReturn, useScreenLive } from './use-screen-live';

export type HomeworkDetailParts = {
  /** The homework's own name, or its topic. */
  title: string;
  /** «ДЗ 2» of the topic, when the homework has no name of its own. */
  subtitle?: string;
  /** The blocks of the homework: the numbers overview, the selected number, photos and the AI check. */
  body: ReactNode;
  refreshing: boolean;
  refresh: () => void;
};

export type HomeworkDetailProps = {
  assignmentId: string;
  /** Show every number as a grid of tiles instead of one row (a tablet panel has the room). */
  grid?: boolean;
  /** «Перерешать № N» selected a number: bring its card (at the top) into view. */
  onScrollToTop?: () => void;
  /** Places the parts: the phone screen puts them into a `Screen`, the tablet list into its right panel. */
  children: (parts: HomeworkDetailParts) => ReactNode;
};

/**
 * One homework (docs/spec/03-student-homework-lesson.md §1 H2 – H4; layout: docs/design/
 * glass-over-paper.md §7, principle 5). It does not grow with the number of problems: «Осталось 13 из
 * 50», the bar by status, one row of tiles with the numbers that still need work and ONE card — of the
 * selected number, with its statement and the student's note; every number is in the sheet «Все номера».
 * Below: the photo batch and the AI check with its verdicts.
 * A homework that no longer exists (cancelled by the teacher) leads back to the list (00 §3.3).
 *
 * The same blocks are a pushed screen on a phone and the right panel of the homework list on a tablet,
 * so the owner places them through `children`.
 */
export function HomeworkDetail({ assignmentId, grid = false, onScrollToTop, children }: HomeworkDetailProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const { dict, m, locale } = useI18n();
  const live = useScreenLive();

  // The number whose card is shown; null = let the screen choose (the first that needs help).
  const [pickedId, setPickedId] = useState<string | null>(null);
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

  // «Перерешать № N» of a verdict: that number becomes the shown card, the screen returns to it and the
  // card is ringed for a moment.
  const redo = (result: StudentCheckResultDto) => {
    if (!data) return;
    if (!data.assignment.numbers.some((number) => number.homeworkNumberId === result.homeworkNumberId)) return;
    setPickedId(result.homeworkNumberId);
    onScrollToTop?.();
    setHighlighted(result.homeworkNumberId);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlighted(null), HIGHLIGHT_FLASH_MS);
  };

  const assignment = data?.assignment;
  const label = assignment ? homeworkLabel(assignment, dict.common.homeworkN) : screenTitle('student.homework', m.shell.tabs);

  let body;
  if (data && assignment && !gone) {
    const completed = isHomeworkCompleted(assignment);
    const deadline = deadlineCaption(assignment.deadlineAt, completed, nowMs, locale, m.common.deadline);
    const numbers = assignment.numbers.map((number) => ({ id: number.homeworkNumberId, number: number.number, status: number.status }));
    const selectedId = pickFocusNumberId(numbers, pickedId);
    const selected = assignment.numbers.find((number) => number.homeworkNumberId === selectedId);

    body = (
      <>
        {/* The cached homework stays on screen when a refresh fails (offline): say so instead of replacing it. */}
        {detail.isError ? (
          <Notice tone="error" text={errorText(detail.error, m.studentWork.homework.refreshFailed)} testID="homework-refresh-error" />
        ) : null}

        {numbers.length > 0 ? (
          <Card testID="homework-numbers">
            <NumbersOverview
              numbers={numbers}
              selectedId={selectedId}
              onSelect={setPickedId}
              aside={deadline.text}
              asideTone={deadline.attention ? 'attention' : 'muted'}
              grid={grid}
              testID="homework-overview"
            />
          </Card>
        ) : null}

        {selected ? (
          <HomeworkNumberCard
            // Another number must not carry this one's unsaved draft.
            key={selected.homeworkNumberId}
            number={selected}
            notesEnabled={data.notesEnabled}
            noteMaxLength={data.limits.noteMaxLength}
            highlighted={highlighted === selected.homeworkNumberId}
          />
        ) : null}

        <Card style={styles.work}>
          <HomeworkPhotosBlock
            assignmentId={assignmentId}
            photos={assignment.photos}
            maxPhotos={data.limits.maxPhotosPerAssignment}
            onGone={leave}
          />
          <HomeworkCheckBlock
            check={assignment.latestCheck}
            hasPhotos={assignment.photos.length > 0}
            available={data.aiCheckAvailable}
            state={check}
            onRedo={redo}
          />
        </Card>
      </>
    );
  } else if (isLoadFailed(detail) && !gone) {
    body = <LoadFailure query={detail} testID="homework-error" />;
  } else {
    body = <LoadingState variant="cards" accessibilityLabel={m.common.a11y.loading} testID="homework-loading" />;
  }

  return children({
    // The title is the homework's own name or its topic; «ДЗ 2» of that topic goes under it.
    title: assignment ? (assignment.title ?? assignment.topicTitle) : label,
    subtitle: assignment && !assignment.title ? label : undefined,
    body,
    refreshing,
    refresh,
  });
}

const useStyles = makeStyles((t) => ({
  work: { gap: t.space.md },
}));
