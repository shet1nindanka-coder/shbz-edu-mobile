import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText } from '@/api';
import type { TeacherHomeworkAssignment, TeacherHomeworkCheck } from '@/api/types';
import { HIGHLIGHT_FLASH_MS } from '@/api/types/limits';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { ProgressHistorySheet } from '@/components/progress-history';
import { useRetryWait } from '@/components/retry-wait';
import { UndoToast } from '@/components/undo-toast';
import { getFileExtension, getMimeTypeFromExtension } from '@/domain/files';
import { homeworkAssignmentLabel } from '@/domain/homework-label';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { useNowTick } from '@/services/clock';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, ListRow, LoadingState, Notice, Panel, Panels } from '@/ui';

import { useLatched } from '../students/use-latched';
import { usePanelRow } from '../students/use-panel-row';
import { useNoticeScroll } from '../students/use-notice-scroll';
import { CancelHomeworkDialog } from './cancel-homework-dialog';
import { CardScreen, type CardChrome } from './card-screen';
import { DisclosureRow } from './disclosure-row';
import { ReviewAssignmentCard } from './review-assignment-card';
import { ReviewAssignmentPanel } from './review-assignment-panel';
import { buildReviewRows, completedAssignmentIds, hasDiagnostics, reviewRowIndex, type ReviewRow } from './review-logic';
import { ReviewNumbersSheet } from './review-numbers-sheet';
import { reviewSummary } from './review-summary';
import { useReview } from './use-review';
import { useStudentGone } from './use-student-gone';

export type ReviewTabProps = {
  studentId: string;
  /** Scroll the list to this homework (a "open homework" reference of the status history). */
  assignmentId?: string;
  chrome: CardChrome;
};

type ListNotice = { tone: 'success' | 'error'; text: string };

const NO_ROWS: readonly ReviewRow[] = [];
/** Lets the list lay out the rows of a fresh response before it is scrolled. */
const SCROLL_DELAY_MS = 350;

/** A check snapshot photo has no stored MIME type; the name's extension tells PNG from JPEG. */
function photoMimeType(originalName: string): string {
  const mime = getMimeTypeFromExtension(getFileExtension(originalName));
  return mime.startsWith('image/') ? mime : 'image/jpeg';
}

/** The numbers sheet: the grid of one homework's numbers (`numberId` null) or the details of one of them. */
type NumbersTarget = { assignmentId: string; numberId: string | null; viaAll: boolean };

/**
 * `teacher.student.review` (docs/spec/04-teacher-students.md S4; layout: the `PT-student` / `T-student`
 * mockups): every homework issued to the student. A phone lists them as cards — a summary with the bar by
 * status that unfolds into the review; a tablet lists them on the left and shows the selected one on the
 * right. The review of a homework is «Нужно проверить» — rows of numbers with the three status marks —
 * with the photos, "accept AI verdicts" and its 10-second undo, the check history and cancelling; every
 * number, with its verdict, diagnostics and statement, opens in one sheet. Completed homework is folded
 * under one disclosure.
 */
export function ReviewTab({ studentId, assignmentId, chrome }: ReviewTabProps) {
  const styles = useStyles();
  const theme = useTheme();
  const navigation = useAppNavigation();
  const { dict, m, locale } = useI18n();
  const t = dict.students.review;
  const tablet = theme.tablet;
  const panelRow = usePanelRow();

  const review = useReview(studentId);
  const { homeworks, data, assignments } = review;
  useStudentGone(studentId, homeworks.error);
  const homeworksFailure = loadFailureOf(homeworks);
  const now = useNowTick(60_000);
  const listRef = useRef<FlashListRef<ReviewRow>>(null);

  // Local view state, reset when the screen is opened again (04 §4.3).
  const [lessonMode, setLessonMode] = useState(false);
  const [expandedIds, setExpandedIds] = useState<readonly string[]>(assignmentId ? [assignmentId] : []);
  const [completedToggled, setCompletedToggled] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<ListNotice | null>(null);
  const [cancelFor, setCancelFor] = useState<TeacherHomeworkAssignment | null>(null);
  // Cancelling has its own bucket (shared with issuing, 120 / 60 s), separate from the status marks.
  const cancelWait = useRetryWait();
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [numbersFor, setNumbersFor] = useState<NumbersTarget | null>(null);
  // The status history asked for from the numbers sheet: opened once that sheet has left.
  const queuedHistory = useRef<string | null>(null);
  // The homework the tablet's second panel shows; null = the first of the list.
  const [pickedId, setPickedId] = useState<string | null>(assignmentId ?? null);
  // The homework to bring into view: from the route (a history reference) or from the open history sheet.
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(assignmentId ? { id: assignmentId, seq: 0 } : null);
  const [focusedParam, setFocusedParam] = useState(assignmentId);
  const [flashId, setFlashId] = useState<string | null>(null);
  const handledFocus = useRef(-1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const focusAssignment = (id: string) => {
    setExpandedIds((current) => (current.includes(id) ? current : [...current, id]));
    setCompletedToggled(null);
    setFocus((current) => ({ id, seq: (current?.seq ?? 0) + 1 }));
    setPickedId(id);
  };
  // The same screen instance was given another target.
  if (assignmentId !== focusedParam) {
    setFocusedParam(assignmentId);
    if (assignmentId) focusAssignment(assignmentId);
  }

  // Order and grouping follow the server's answer (attention sort, completed under the disclosure); the
  // colours of writes still in flight do not move a card.
  const completedIds = useMemo(() => completedAssignmentIds(data?.assignments ?? []), [data]);
  const completedOpen = completedToggled ?? (focus !== null && completedIds.has(focus.id));
  const rows = useMemo(
    () => (assignments ? buildReviewRows(assignments, completedIds, completedOpen) : NO_ROWS),
    [assignments, completedIds, completedOpen],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!focus || handledFocus.current === focus.seq) return;
    const index = reviewRowIndex(rows, focus.id);
    // Not loaded yet — or the homework was cancelled meanwhile: then there is nothing to scroll to.
    if (index < 0) return;
    handledFocus.current = focus.seq;
    const id = focus.id;
    timers.current.push(
      setTimeout(() => {
        void listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
        setFlashId(id);
      }, SCROLL_DELAY_MS),
      setTimeout(() => setFlashId((current) => (current === id ? null : current)), SCROLL_DELAY_MS + HIGHLIGHT_FLASH_MS),
    );
  }, [focus, rows]);

  const { refreshing, refresh } = usePullRefresh([homeworks]);

  const announce = (next: ListNotice) => setNotice(next);
  useNoticeScroll(listRef, notice);

  const toggle = (id: string) => setExpandedIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const openPending = (assignment: TeacherHomeworkAssignment, index: number) =>
    navigation.openFiles(
      assignment.photos.map((photo) => ({ id: photo.fileId, originalName: photo.originalName, mimeType: photo.mimeType })),
      { initialIndex: index, title: homeworkAssignmentLabel(assignment, locale) },
    );

  const openCheckPhoto = (check: TeacherHomeworkCheck, index: number) =>
    navigation.openFiles(
      check.photos.map((photo) => ({ id: photo.fileId, originalName: photo.originalName, mimeType: photoMimeType(photo.originalName) })),
      { initialIndex: index, title: t.attemptPhotos },
    );

  const showLessonMode = assignments ? hasDiagnostics(assignments) : false;

  // The sheet keeps its homework while it slides away.
  const shownNumbers = useLatched(numbersFor);
  const numbersAssignment = shownNumbers ? (assignments?.find((assignment) => assignment.id === shownNumbers.assignmentId) ?? null) : null;

  const notices = (
    <>
      {notice ? (
        <Notice tone={notice.tone} text={notice.text} onDismiss={() => setNotice(null)} dismissLabel={m.common.actions.close} testID="review-notice" />
      ) : null}
      {/* Cached homework stays on screen when a refresh fails (offline): say so instead of replacing it. */}
      {homeworks.isError && data ? <Notice tone="error" text={errorText(homeworks.error, m.common.errors.generic)} testID="review-refresh-error" /> : null}
      {data && !data.assignmentsEnabled ? <Notice tone="warning" text={t.dbOutdated} testID="review-db-outdated" /> : null}
    </>
  );

  const lessonModeButton = showLessonMode ? (
    <Button
      label={lessonMode ? t.showDiagnostics : t.hideDiagnostics}
      variant="outline"
      size="sm"
      leftIcon={lessonMode ? 'eye' : 'eyeOff'}
      onPress={() => setLessonMode((value) => !value)}
      wrapLabel
      testID="review-lesson-mode"
      style={styles.lessonMode}
    />
  ) : null;

  const placeholder = data ? (
    data.assignmentsEnabled ? (
      <EmptyState title={t.emptyTitle} hint={t.emptyHint} testID="review-empty" />
    ) : null
  ) : homeworksFailure ? (
    <LoadFailure query={homeworks} testID="review-error" />
  ) : (
    <LoadingState variant="list" count={3} accessibilityLabel={m.common.a11y.loading} testID="review-loading" />
  );

  /** What every view of a homework's review needs besides the homework itself. */
  const reviewProps = (assignment: TeacherHomeworkAssignment) => ({
    assignment,
    lessonMode,
    now,
    savingIds: review.savingIds,
    numberErrors: review.numberErrors,
    blocked: review.wait.waiting,
    waitSeconds: review.wait.seconds,
    error: review.assignmentErrors[assignment.id],
    accepting: review.acceptingId === assignment.id,
    onDismissError: () => review.dismissAssignmentError(assignment.id),
    onStatus: review.setStatus,
    onAccept: () => review.acceptVerdicts(assignment),
    onCancel: () => setCancelFor(assignment),
    onOpenNumber: (homeworkNumberId: string) => setNumbersFor({ assignmentId: assignment.id, numberId: homeworkNumberId, viaAll: false }),
    onOpenAll: () => setNumbersFor({ assignmentId: assignment.id, numberId: null, viaAll: true }),
    onOpenPending: (index: number) => openPending(assignment, index),
    onOpenCheckPhoto: openCheckPhoto,
  });

  const completedToggle = (row: Extract<ReviewRow, { kind: 'completedToggle' }>) => (
    <DisclosureRow
      label={format(t.completedHomeworks, { n: row.count })}
      expanded={row.open}
      onToggle={() => setCompletedToggled(!row.open)}
      testID="review-completed-toggle"
    />
  );

  const renderRow = ({ item: row }: { item: ReviewRow }) => {
    if (row.kind === 'completedToggle') return <View style={styles.completed}>{completedToggle(row)}</View>;
    const { assignment } = row;
    return (
      // Keyed by the homework: a recycled cell must not carry another card's open rows.
      <View key={assignment.id} style={styles.item}>
        <ReviewAssignmentCard
          {...reviewProps(assignment)}
          expanded={expandedIds.includes(assignment.id)}
          highlighted={flashId === assignment.id}
          onToggle={() => toggle(assignment.id)}
        />
      </View>
    );
  };

  let content;
  if (!tablet) {
    content = (
      <FlashList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        renderItem={renderRow}
        // Everything a card shows besides its homework: expansion, lesson mode, the clock and the request states.
        extraData={[expandedIds, lessonMode, now, flashId, review.savingIds, review.numberErrors, review.assignmentErrors, review.wait.seconds, review.acceptingId]}
        ListHeaderComponent={
          <View style={styles.header}>
            {notices}
            {lessonModeButton}
          </View>
        }
        ListEmptyComponent={placeholder}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accentSolid}
            colors={[theme.colors.accentSolid]}
            progressBackgroundColor={theme.colors.cardBg}
          />
        }
        testID="review-list"
      />
    );
  } else {
    const first = rows.find((row) => row.kind === 'assignment');
    const selected =
      rows.find((row) => row.kind === 'assignment' && row.assignment.id === pickedId) ?? first ?? null;
    const selectedAssignment = selected && selected.kind === 'assignment' ? selected.assignment : null;
    content = (
      <>
        {notices}
        {rows.length === 0 ? (
          placeholder
        ) : (
          <Panels testID="review-panels">
            <Panel weight={2} padded={false} contentStyle={styles.listPanel} footer={lessonModeButton ? <View style={styles.panelFooter}>{lessonModeButton}</View> : undefined} testID="review-list">
              {rows.map((row) => {
                if (row.kind === 'completedToggle') {
                  return (
                    <View key={row.key} style={styles.panelToggle}>
                      {completedToggle(row)}
                    </View>
                  );
                }
                const summary = reviewSummary(row.assignment, now, locale, m);
                return (
                  <ListRow
                    key={row.key}
                    title={summary.title}
                    titleLines={2}
                    subtitle={summary.caption}
                    subtitleTone={summary.attention ? 'attention' : 'muted'}
                    meta={summary.done}
                    selected={row.assignment.id === selectedAssignment?.id}
                    {...panelRow(row.assignment.id === selectedAssignment?.id, true)}
                    onPress={() => setPickedId(row.assignment.id)}
                    accessibilityLabel={`${summary.title}. ${summary.caption}. ${summary.done}`}
                    testID={`review-assignment-toggle-${row.assignment.id}`}
                  />
                );
              })}
            </Panel>
            <Panel weight={3} testID="review-detail">
              {selectedAssignment ? (
                // Another homework must not carry this one's kept rows and open disclosures.
                <ReviewAssignmentPanel key={selectedAssignment.id} {...reviewProps(selectedAssignment)} />
              ) : null}
            </Panel>
          </Panels>
        )}
      </>
    );
  }

  return (
    <CardScreen chrome={chrome} panels={tablet}>
      {content}

      {review.undo ? <UndoToast text={review.undo.label} undoLabel={t.undo} onUndo={review.undoAccept} testID="review-undo-toast" /> : null}

      <CancelHomeworkDialog
        assignment={cancelFor}
        wait={cancelWait}
        onClose={() => setCancelFor(null)}
        onCancelled={() => setCancelFor(null)}
        onMissing={(message) => {
          setCancelFor(null);
          announce({ tone: 'error', text: message });
        }}
      />

      <ReviewNumbersSheet
        visible={numbersFor !== null}
        assignment={numbersAssignment}
        numberId={shownNumbers?.numberId ?? null}
        viaAll={shownNumbers?.viaAll ?? false}
        lessonMode={lessonMode}
        savingIds={review.savingIds}
        numberErrors={review.numberErrors}
        blocked={review.wait.waiting}
        onClose={() => {
          queuedHistory.current = null;
          setNumbersFor(null);
        }}
        onClosed={() => {
          const next = queuedHistory.current;
          queuedHistory.current = null;
          if (next) setHistoryFor(next);
        }}
        onShow={(numberId) => setNumbersFor((current) => (current ? { ...current, numberId } : current))}
        onStatus={review.setStatus}
        onHistory={(homeworkNumberId) => {
          queuedHistory.current = homeworkNumberId;
          setNumbersFor(null);
        }}
      />

      <ProgressHistorySheet
        visible={historyFor !== null}
        studentId={studentId}
        homeworkNumberId={historyFor ?? ''}
        onClose={() => setHistoryFor(null)}
        // Already on this student's review: bring the homework into view instead of opening the card again.
        onOpenHomework={focusAssignment}
      />
    </CardScreen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingHorizontal: t.space.gutter, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.md, paddingBottom: t.space.md },
  // Never wider than the row: on a 320 pt phone the label takes a second line instead of running off the edge.
  lessonMode: { alignSelf: 'flex-end', maxWidth: '100%' },
  item: { paddingBottom: t.space.block },
  completed: { paddingHorizontal: t.space.xxs, paddingBottom: t.space.sm },
  // Rows bring their own height and hairlines; the panel adds the card's top and bottom room.
  listPanel: { gap: 0, paddingVertical: t.space.sm },
  panelToggle: { paddingHorizontal: t.space.card },
  panelFooter: { paddingHorizontal: t.space.card, paddingBottom: t.space.card },
}));
