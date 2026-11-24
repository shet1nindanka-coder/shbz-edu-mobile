// The student card — `teacher.student.review`, `.assign` and `.lessons` are ONE screen with three
// segments (docs/spec/00-unified-contract.md §3.1; docs/spec/04-teacher-students.md S3 – S6, S8). Each
// segment has its own route (the site's three URLs), so switching uses `navigation.replace(...)`; the
// three routes are shown without a transition.
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { RetryWaitLine } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, useScreenFocused, useStillHere, type ScreenParams } from '@/navigation';
import { DetailAppBar, NotFoundScreen, screenTitle } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Button, IconButton, LoadingState, Notice, Screen, Segmented, Spinner, Text } from '@/ui';

import { AssignTab } from './card/assign-tab';
import type { CardChrome } from './card/card-screen';
import { LessonsTab } from './card/lessons-tab';
import { ReviewTab } from './card/review-tab';
import { StudentMenuSheet, type StudentMenuAction } from './card/student-menu-sheet';
import { useStudentReport } from './card/use-student-report';
import { DeleteStudentDialog } from './students/delete-student-dialog';
import { postStudentsListNotice } from './students/list-notice';
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
 * The student card: the header with the student's name, the "⋯" menu (the login, PDF reports, reset
 * password, delete student) and the three segments — homework review (default), assigning a homework,
 * lessons. Results of the menu's actions appear as a short banner under the header: the site redirects to
 * the students list with a notice, a phone stays where the teacher is.
 */
export function TeacherStudentScreen({ studentId, segment, assignmentId }: TeacherStudentScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const navigation = useAppNavigation();
  const stillHere = useStillHere();
  const focused = useScreenFocused();
  const { dict, m } = useI18n();
  const t = dict.students.detail;

  const card = useQuery({
    queryKey: qk('teacherStudents', 'getStudentCard', studentId),
    queryFn: () => api.teacherStudents.getStudentCard(studentId),
  });
  useRefetchOnFocus([card]);
  const cardFailure = loadFailureOf(card);
  const report = useStudentReport(studentId);

  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // What to do once the menu has finished closing.
  const queued = useRef<StudentMenuAction | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [deleted, setDeleted] = useState(false);

  const student = card.data?.student;
  const fallbackTitle = screenTitle('teacher.students', m.shell.tabs);

  // The account was deleted from this card: the list is already being opened with its notice (D3). Until
  // this screen is popped it shows nothing of the student — and not the "not found" page its reads now give.
  if (deleted) {
    return <Screen testID="teacher-student-screen" header={<DetailAppBar title={fallbackTitle} />} />;
  }

  // Unknown, deleted or somebody else's student: indistinguishable for a teacher (04 §0.1).
  if (isNotFoundError(card.error)) return <NotFoundScreen />;

  if (!student) {
    return (
      <Screen testID="teacher-student-screen" header={<DetailAppBar title={fallbackTitle} />}>
        {cardFailure ? (
          <LoadFailure query={card} testID="student-card-error" />
        ) : (
          <LoadingState variant="list" count={3} accessibilityLabel={m.common.a11y.loading} testID="student-card-loading" />
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

  const hasBanners = notice !== null || report.ready !== null || Boolean(report.error) || report.waitSeconds > 0 || card.isError;

  const chrome: CardChrome = {
    header: (actions) => (
      <DetailAppBar
        title={student.name}
        backTitle={m.shell.tabs.students}
        right={
          <>
            {actions}
            <IconButton
              icon="more"
              accessibilityLabel={format(m.teacher.students.actionsFor, { name: student.name })}
              onPress={() => setOverlay('menu')}
              testID="student-card-menu"
            />
          </>
        }
        aside={
          <Segmented<TeacherStudentSegment>
            role="tab"
            // A phone gets the short labels and never cuts them: on a narrow phone or with a large OS font
            // the bar scrolls. A tablet has the room for the full ones next to the title.
            scrollable={!theme.tablet}
            options={[
              {
                value: 'review',
                label: theme.tablet
                  ? activeCount > 0
                    ? format(t.tabReviewWithCount, { n: activeCount })
                    : t.tabReview
                  : activeCount > 0
                    ? format(t.tabReviewShortWithCount, { n: activeCount })
                    : t.tabReviewShort,
              },
              { value: 'assign', label: theme.tablet ? t.tabAssign : t.tabAssignShort },
              { value: 'lessons', label: t.tabLessons },
            ]}
            value={segment}
            accessibilityLabel={t.tabsAria}
            onChange={(next) => {
              if (next !== segment) navigation.replace({ screen: SCREEN[next], studentId });
            }}
            testID="student-card-segments"
          />
        }
        testID="student-card-app-bar"
      />
    ),
    top: hasBanners ? (
      <>
        {notice ? (
          <Notice tone={notice.tone} text={notice.text} onDismiss={() => setNotice(null)} dismissLabel={m.common.actions.close} testID="student-card-notice" />
        ) : null}
        {report.ready ? (
          <Notice
            tone="success"
            text={format(m.teacher.report.ready, { title: report.ready.title })}
            // It appears without the teacher's action on this screen: VoiceOver says it, but only once the card
            // is in front again (it is set while the teacher is elsewhere and the card stays mounted).
            announcement={focused ? format(m.teacher.report.ready, { title: report.ready.title }) : null}
            onDismiss={report.dismissReady}
            dismissLabel={m.common.actions.close}
            action={
              <Button
                label={dict.planner.common.open}
                accessibilityLabel={m.teacher.report.open}
                size="sm"
                variant="outline"
                onPress={report.openReady}
                testID="student-report-ready-open"
              />
            }
            testID="student-report-ready"
          />
        ) : null}
        {report.error ? (
          <Notice tone="error" text={report.error} onDismiss={report.dismissError} dismissLabel={m.common.actions.close} testID="student-report-error" />
        ) : null}
        {/* The wait outlives a dismissed notice: the report actions stay disabled, so the reason stays on screen. */}
        <RetryWaitLine seconds={report.waitSeconds} testID="student-report-wait" />
        {/* The header stays readable when a refresh fails (offline): say so instead of dropping the card. */}
        {card.isError ? <Notice tone="error" text={errorText(card.error, m.common.errors.generic)} testID="student-card-refresh-error" /> : null}
      </>
    ) : null,
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

      {/* S8: generation takes seconds — a blocking indicator; the report opens when the sheet is gone.
          Leaving the card (a deep link pushes a screen over it) does not end the build: BottomSheet hides its
          window while the card is not focused and shows it again on return; a report that finishes meanwhile
          is kept and offered on the card (`report.ready`). */}
      <BottomSheet
        visible={report.pendingPeriod !== null}
        onClose={() => undefined}
        onClosed={report.onProgressClosed}
        closeLabel={m.common.actions.close}
        dismissible={false}
        showClose={false}
        testID="student-report-progress"
      >
        <View accessibilityRole="progressbar" accessibilityLabel={m.teacher.report.preparing} accessibilityLiveRegion="polite" style={styles.progress}>
          <Spinner size={theme.sizes.icon.md} color="accentSolid" />
          <Text variant="bodyStrong">{m.teacher.report.preparing}</Text>
        </View>
      </BottomSheet>

      <ResetPasswordSheet
        student={overlay === 'reset' ? target : null}
        onClose={() => setOverlay(null)}
        onDone={() => {
          setOverlay(null);
          setNotice({ tone: 'success', text: m.teacher.students.passwordChanged });
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
          // D3: back to the students list, which shows «Ученик удалён…».
          postStudentsListNotice('studentDeleted');
          // The delete answered after the teacher went elsewhere: the card shows the gone state on return,
          // nobody is pulled away from where they are now.
          if (stillHere()) navigation.open({ screen: 'teacher.students' });
        }}
        onMissing={() => setOverlay(null)}
      />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  progress: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.lg },
}));
