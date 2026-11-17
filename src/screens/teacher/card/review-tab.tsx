import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import type { TeacherHomeworkAssignment, TeacherHomeworkCheck } from '@/api/types';
import { HIGHLIGHT_FLASH_MS } from '@/api/types/limits';
import { ProgressHistorySheet } from '@/components/progress-history';
import { getFileExtension, getMimeTypeFromExtension } from '@/domain/files';
import { homeworkAssignmentLabel } from '@/domain/homework-label';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, ErrorState, LoadingState, Notice, Text } from '@/ui';

import { errorText, loadFailureOf } from '../students/error-text';
import { useNoticeScroll } from '../students/use-notice-scroll';
import { CancelHomeworkDialog } from './cancel-homework-dialog';
import { CardScreen, type CardChrome } from './card-screen';
import { DisclosureRow } from './disclosure-row';
import { ReviewAssignmentCard } from './review-assignment-card';
import { buildReviewRows, completedAssignmentIds, hasDiagnostics, reviewRowIndex, type ReviewRow } from './review-logic';
import { UndoToast } from './undo-toast';
import { useNowTick } from './use-now-tick';
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

/**
 * `teacher.student.review` (docs/spec/04-teacher-students.md S4): every homework issued to the student
 * as a collapsible card — photos, AI verdicts, manual traffic-light marks, "accept AI verdicts" with a
 * 10-second undo, the check history and cancelling. Completed homework is folded under one disclosure.
 */
export function ReviewTab({ studentId, assignmentId, chrome }: ReviewTabProps) {
  const styles = useStyles();
  const theme = useTheme();
  const navigation = useAppNavigation();
  const { dict, m, locale } = useI18n();
  const t = dict.students.review;

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
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<ListNotice | null>(null);
  const [cancelFor, setCancelFor] = useState<TeacherHomeworkAssignment | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
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

  const refresh = () => {
    setRefreshing(true);
    void homeworks.refetch().finally(() => setRefreshing(false));
  };

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

  const header = (
    <View style={styles.header}>
      <Text variant="sectionTitle" accessibilityRole="header">
        {t.title}
      </Text>
      {notice ? (
        <Notice tone={notice.tone} text={notice.text} onDismiss={() => setNotice(null)} dismissLabel={m.common.actions.close} testID="review-notice" />
      ) : null}
      {/* Cached homework stays on screen when a refresh fails (offline): say so instead of replacing it. */}
      {homeworks.isError && data ? <Notice tone="error" text={errorText(homeworks.error, m.common.errors.generic)} testID="review-refresh-error" /> : null}
      {data && !data.assignmentsEnabled ? <Notice tone="warning" text={t.dbOutdated} testID="review-db-outdated" /> : null}
      {showLessonMode ? (
        <Button
          label={lessonMode ? t.showDiagnostics : t.hideDiagnostics}
          variant="outline"
          size="sm"
          leftIcon={lessonMode ? 'eye' : 'eyeOff'}
          onPress={() => setLessonMode((value) => !value)}
          testID="review-lesson-mode"
          style={styles.lessonMode}
        />
      ) : null}
    </View>
  );

  const body = data ? (
    data.assignmentsEnabled ? (
      <EmptyState title={t.emptyTitle} hint={t.emptyHint} testID="review-empty" />
    ) : null
  ) : homeworksFailure ? (
    <ErrorState
      title={dict.shells.errorTitle}
      description={errorText(homeworksFailure.error, dict.shells.errorDescription)}
      retryLabel={dict.common.retry}
      onRetry={() => void homeworks.refetch()}
      retrying={homeworks.isFetching}
      testID="review-error"
    />
  ) : (
    <LoadingState variant="cards" count={3} cardHeight={150} accessibilityLabel={m.common.a11y.loading} testID="review-loading" />
  );

  const renderRow = ({ item: row }: { item: ReviewRow }) => {
    if (row.kind === 'completedToggle') {
      return (
        <View style={styles.item}>
          <View style={styles.completed}>
            <DisclosureRow
              label={format(t.completedHomeworks, { n: row.count })}
              color="kicker"
              expanded={row.open}
              onToggle={() => setCompletedToggled(!row.open)}
              testID="review-completed-toggle"
            />
          </View>
        </View>
      );
    }
    const { assignment } = row;
    return (
      // Keyed by the homework: a recycled cell must not carry another card's open disclosures.
      <View key={assignment.id} style={styles.item}>
        <ReviewAssignmentCard
          assignment={assignment}
          expanded={expandedIds.includes(assignment.id)}
          highlighted={flashId === assignment.id}
          lessonMode={lessonMode}
          now={now}
          savingIds={review.savingIds}
          numberErrors={review.numberErrors}
          blocked={review.wait.waiting}
          waitSeconds={review.wait.seconds}
          error={review.assignmentErrors[assignment.id]}
          accepting={review.acceptingId === assignment.id}
          onToggle={() => toggle(assignment.id)}
          onDismissError={() => review.dismissAssignmentError(assignment.id)}
          onStatus={review.setStatus}
          onAccept={() => review.acceptVerdicts(assignment)}
          onCancel={() => setCancelFor(assignment)}
          onHistory={setHistoryFor}
          onOpenPending={(index) => openPending(assignment, index)}
          onOpenCheckPhoto={openCheckPhoto}
        />
      </View>
    );
  };

  return (
    <CardScreen chrome={chrome}>
      <FlashList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        renderItem={renderRow}
        // Everything a card shows besides its homework: expansion, lesson mode, the clock and the request states.
        extraData={[expandedIds, lessonMode, now, flashId, review.savingIds, review.numberErrors, review.assignmentErrors, review.wait.seconds, review.acceptingId]}
        ListHeaderComponent={header}
        ListEmptyComponent={body}
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

      {review.undo ? <UndoToast text={review.undo.label} undoLabel={t.undo} onUndo={review.undoAccept} testID="review-undo-toast" /> : null}

      <CancelHomeworkDialog
        assignment={cancelFor}
        onClose={() => setCancelFor(null)}
        onCancelled={() => setCancelFor(null)}
        onMissing={(message) => {
          setCancelFor(null);
          announce({ tone: 'error', text: message });
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
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.md, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.md, paddingBottom: t.space.md },
  lessonMode: { alignSelf: 'flex-end' },
  item: { paddingBottom: t.space.md },
  completed: { paddingHorizontal: t.space.md, borderRadius: t.radii.md, backgroundColor: t.colors.tabHover },
}));
