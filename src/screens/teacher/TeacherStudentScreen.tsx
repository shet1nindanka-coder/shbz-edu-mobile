// The student card — `teacher.student.review`, `.assign` and `.lessons` are ONE screen with three
// segments (docs/spec/00-unified-contract.md §3.1; docs/spec/04-teacher-students.md S3 – S6, S8). Each
// segment has its own route (the site's three URLs), so switching uses `navigation.replace(...)`; the
// three routes are shown without a transition.
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { isNotFoundError, qk, useApi } from '@/api';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { DetailAppBar, NotFoundScreen, screenTitle } from '@/screens/shell';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, ErrorState, IconButton, LoadingState, Notice, Screen, Segmented, Spinner, Text } from '@/ui';

import { AssignTab } from './card/assign-tab';
import type { CardChrome } from './card/card-screen';
import { LessonsTab } from './card/lessons-tab';
import { ReviewTab } from './card/review-tab';
import { StudentMenuSheet, type StudentMenuAction } from './card/student-menu-sheet';
import { useStudentReport } from './card/use-student-report';
import { useRefetchOnFocus } from './home/use-refetch-on-focus';
import { DeleteStudentDialog } from './students/delete-student-dialog';
import { errorText } from './students/error-text';
import { RateLimitLine } from './students/rate-limit-line';
import { ResetPasswordSheet } from './students/reset-password-sheet';

export type TeacherStudentSegment = 'review' | 'assign' | 'lessons';

export type TeacherStudentScreenProps = ScreenParams['teacher.student.review'] & {
  /** Which segment the route stands for; default segment of the card is `review`. */
  segment: TeacherStudentSegment;
};

const SCREEN = {
  review: 'teacher.student.review',
  assign: 'teacher.student.assign',
  lessons: 'teacher.student.lessons',
} as const;

/** The one sheet or dialog that is open; two modals are never on screen together. */
type Overlay = 'menu' | 'reset' | 'delete';

/**
 * The student card: app bar with the student's name and login, the "⋯" menu (PDF reports, reset
 * password, delete student) and the three segments — homework review (default), assigning a homework,
 * lessons. Results of the menu's actions appear as a banner under the segments: the site redirects to the
 * students list with a notice, a phone stays where the teacher is.
 */
export function TeacherStudentScreen({ studentId, segment, assignmentId }: TeacherStudentScreenProps) {
  const styles = useStyles();
  const api = useApi();
  const navigation = useAppNavigation();
  const { dict, m } = useI18n();
  const t = dict.students.detail;
  const notices = dict.students.list.notices;

  const card = useQuery({
    queryKey: qk('teacherStudents', 'getStudentCard', studentId),
    queryFn: () => api.teacherStudents.getStudentCard(studentId),
  });
  useRefetchOnFocus([card]);
  const report = useStudentReport(studentId);

  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // What to do once the menu has finished closing.
  const queued = useRef<StudentMenuAction | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [deleted, setDeleted] = useState(false);

  const student = card.data?.student;
  const fallbackTitle = screenTitle('teacher.students', m.shell.tabs);

  // The account was deleted from this card: nothing of it is left to show (D3: back to the list).
  if (deleted) {
    const toList = () => navigation.open({ screen: 'teacher.students' });
    return (
      <Screen testID="teacher-student-screen" header={<DetailAppBar title={student?.name ?? fallbackTitle} onBack={toList} />}>
        <View style={styles.deleted}>
          {/* SPEC-GAP: the site shows this notice on the students list after a redirect; the list screen
              takes no notice from outside, so it is shown here together with the way back. */}
          <Notice tone="success" text={notices.studentDeleted} testID="student-deleted-notice" />
          <Button label={t.backToAll} variant="outline" size="lg" onPress={toList} testID="student-deleted-back" />
        </View>
      </Screen>
    );
  }

  // Unknown, deleted or somebody else's student: indistinguishable for a teacher (04 §0.1).
  if (isNotFoundError(card.error)) return <NotFoundScreen />;

  if (!student) {
    return (
      <Screen testID="teacher-student-screen" header={<DetailAppBar title={fallbackTitle} />}>
        {card.isError ? (
          <ErrorState
            title={dict.shells.errorTitle}
            description={errorText(card.error, dict.shells.errorDescription)}
            retryLabel={dict.common.retry}
            onRetry={() => void card.refetch()}
            retrying={card.isFetching}
            testID="student-card-error"
          />
        ) : (
          <LoadingState variant="cards" tabs count={3} cardHeight={130} accessibilityLabel={m.common.a11y.loading} testID="student-card-loading" />
        )}
      </Screen>
    );
  }

  const activeCount = card.data?.activeHomeworksCount ?? 0;
  const target = { id: student.id, name: student.name };

  const runQueued = () => {
    const action = queued.current;
    queued.current = null;
    if (!action) return;
    // The banner of the previous action would read as the result of this one.
    setNotice(null);
    if (action.kind === 'report') report.start(action.period);
    else setOverlay(action.kind === 'resetPassword' ? 'reset' : 'delete');
  };

  const chrome: CardChrome = {
    header: (
      <DetailAppBar
        title={student.name}
        subtitle={student.email}
        right={
          <IconButton
            icon="more"
            accessibilityLabel={format(m.teacher.students.actionsFor, { name: student.name })}
            onPress={() => setOverlay('menu')}
            testID="student-card-menu"
          />
        }
        testID="student-card-app-bar"
      />
    ),
    top: (
      <View style={styles.top}>
        <Segmented<TeacherStudentSegment>
          fill
          plain
          role="tab"
          // Short labels always: the full ones do not fit three segments on a phone.
          options={[
            { value: 'review', label: activeCount > 0 ? format(t.tabReviewShortWithCount, { n: activeCount }) : t.tabReviewShort },
            { value: 'assign', label: t.tabAssignShort },
            { value: 'lessons', label: t.tabLessons },
          ]}
          value={segment}
          accessibilityLabel={t.tabsAria}
          onChange={(next) => {
            if (next !== segment) navigation.replace({ screen: SCREEN[next], studentId });
          }}
          testID="student-card-segments"
        />
        {notice ? (
          <Notice tone={notice.tone} text={notice.text} onDismiss={() => setNotice(null)} dismissLabel={m.common.actions.close} testID="student-card-notice" />
        ) : null}
        {report.error ? (
          <Notice tone="error" text={report.error} onDismiss={report.dismissError} dismissLabel={m.common.actions.close} testID="student-report-error" />
        ) : null}
        {/* The wait outlives a dismissed notice: the report actions stay disabled, so the reason stays on screen. */}
        <RateLimitLine seconds={report.waitSeconds} testID="student-report-wait" />
        {/* The header stays readable when a refresh fails (offline): say so instead of dropping the card. */}
        {card.isError ? <Notice tone="error" text={errorText(card.error, m.common.errors.generic)} testID="student-card-refresh-error" /> : null}
      </View>
    ),
  };

  return (
    <>
      {segment === 'review' ? (
        <ReviewTab studentId={studentId} assignmentId={assignmentId} chrome={chrome} />
      ) : segment === 'assign' ? (
        <AssignTab studentId={studentId} chrome={chrome} />
      ) : (
        <LessonsTab studentId={studentId} chrome={chrome} />
      )}

      <StudentMenuSheet
        visible={overlay === 'menu'}
        student={student}
        reportsBlocked={report.blocked}
        onClose={() => setOverlay(null)}
        onSelect={(action) => {
          queued.current = action;
          setOverlay(null);
        }}
        onClosed={runQueued}
      />

      {/* S8: generation takes seconds — a blocking indicator; the report opens when the sheet is gone. */}
      <BottomSheet
        visible={report.pendingPeriod !== null}
        onClose={() => undefined}
        onClosed={report.openReady}
        closeLabel={m.common.actions.close}
        dismissible={false}
        showClose={false}
        testID="student-report-progress"
      >
        <View accessibilityRole="progressbar" accessibilityLabel={m.teacher.report.preparing} accessibilityLiveRegion="polite" style={styles.progress}>
          <Spinner size={20} color="accentSolid" />
          <Text variant="bodyStrong">{m.teacher.report.preparing}</Text>
        </View>
      </BottomSheet>

      <ResetPasswordSheet
        student={overlay === 'reset' ? target : null}
        onClose={() => setOverlay(null)}
        onDone={() => {
          setOverlay(null);
          setNotice({ tone: 'success', text: notices.passwordReset });
        }}
        // `404`: the sheet has re-read the card, which now answers "not found" — the shell above takes over.
        onMissing={() => setOverlay(null)}
      />
      <DeleteStudentDialog
        student={overlay === 'delete' ? target : null}
        onClose={() => setOverlay(null)}
        onDeleted={() => {
          setOverlay(null);
          setDeleted(true);
        }}
        onMissing={() => setOverlay(null)}
      />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  top: { gap: t.space.sm, paddingHorizontal: t.space.gutter, paddingTop: t.space.md, paddingBottom: t.space.xs },
  progress: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.lg },
  deleted: { gap: t.space.field },
}));
