import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { ScrollViewInstance } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { TeacherStudentListItem } from '@/api/types';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, ListCard, LoadingState, Notice, Panel, Panels, Screen } from '@/ui';

import { CreateStudentSheet } from './students/create-student-sheet';
import { CredentialsSheet, type CreatedCredentials } from './students/credentials-sheet';
import { DeleteStudentDialog } from './students/delete-student-dialog';
import { useStudentsListNotice } from './students/list-notice';
import { ResetPasswordSheet } from './students/reset-password-sheet';
import { StudentActionsSheet, type StudentAction } from './students/student-actions-sheet';
import { StudentRow } from './students/student-row';
import { StudentSummary } from './students/student-summary';

type ListNotice = { tone: 'success' | 'error'; text: string };

const NO_STUDENTS: readonly TeacherStudentListItem[] = [];

type StudentTarget = { id: string; name: string };

/** The one sheet or dialog that is open; two modals are never on screen together. */
type Overlay =
  | { kind: 'create' }
  | { kind: 'actions'; student: TeacherStudentListItem }
  | { kind: 'credentials'; credentials: CreatedCredentials }
  | { kind: 'reset'; student: StudentTarget }
  | { kind: 'delete'; student: StudentTarget };

/** Lets the banner be laid out, and the sheet that produced it start closing, before the page moves. */
const NOTICE_SCROLL_DELAY_MS = 200;

/**
 * `teacher.students` (docs/spec/04-teacher-students.md S2; layout: docs/design/glass-over-paper.md §7):
 * the teacher's own students, name ascending, as rows of one card — the avatar, the name, the login and
 * one fact. «Добавить ученика» is the button of the header: it opens the create form in a sheet, and the
 * new account's login and password are then shown once. Results of the mutations appear as a banner above
 * the list — the phone form of the site's redirect notices.
 *
 * A phone row opens the student's card; its "⋯" menu holds the login to copy, the password reset and
 * deletion. A tablet shows the list on the left and the selected student's summary on the right, with the
 * same actions behind the summary's "⋯".
 */
export function TeacherStudentsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.students.list;
  const navigation = useAppNavigation();
  const scrollRef = useRef<ScrollViewInstance>(null);

  const [notice, setNotice] = useState<ListNotice | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // The sheet to open once the current one has finished closing.
  const queued = useRef<Overlay | null>(null);
  // The student whose summary the tablet's second panel shows; null = the first of the list.
  const [pickedId, setPickedId] = useState<string | null>(null);

  const students = useQuery({
    queryKey: qk('teacherStudents', 'listStudents'),
    queryFn: () => api.teacherStudents.listStudents(),
  });
  const list = students.data?.students;
  useRefetchOnFocus([students]);
  const studentsFailure = loadFailureOf(students);

  const { refreshing, refresh } = usePullRefresh([students]);

  const announce = (next: ListNotice) => setNotice(next);
  // A banner is useless below the fold: every new one brings the page back to its top.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), NOTICE_SCROLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // A student deleted from the card: the card returns here and leaves the notice (D3).
  useStudentsListNotice((key) => announce({ tone: 'success', text: t.notices[key] }));

  const closeOverlay = () => {
    queued.current = null;
    setOverlay(null);
  };

  /** Closes the open sheet and opens `next` after its exit animation. */
  const switchOverlay = (next: Overlay) => {
    queued.current = next;
    setOverlay(null);
  };

  const openQueued = () => {
    const next = queued.current;
    queued.current = null;
    if (next) setOverlay(next);
  };

  const openStudent = (student: TeacherStudentListItem) =>
    navigation.open({ screen: 'teacher.student.review', studentId: student.id });

  const onAction = (action: StudentAction, student: TeacherStudentListItem) => {
    const target = { id: student.id, name: student.name };
    if (action === 'open') {
      closeOverlay();
      openStudent(student);
      return;
    }
    // The banner of the previous action would read as the result of this one.
    setNotice(null);
    switchOverlay(action === 'resetPassword' ? { kind: 'reset', student: target } : { kind: 'delete', student: target });
  };

  const selected = list ? (list.find((student) => student.id === pickedId) ?? list[0] ?? null) : null;

  const rows = (list ?? NO_STUDENTS).map((student, index, all) => (
    <StudentRow
      key={student.id}
      student={student}
      onPress={theme.tablet ? (picked) => setPickedId(picked.id) : openStudent}
      selected={theme.tablet && student.id === selected?.id}
      divider={index < all.length - 1}
    />
  ));

  // Loading and failure never hide the header: adding a student does not depend on the list having loaded.
  const placeholder = list ? (
    <EmptyState title={t.empty} testID="students-empty" />
  ) : studentsFailure ? (
    <LoadFailure query={students} testID="students-error" />
  ) : (
    <LoadingState variant="list" count={6} accessibilityLabel={m.common.a11y.loading} testID="students-loading" />
  );

  return (
    <Screen
      testID="teacher-students-screen"
      header={
        <ShellAppBar
          title={screenTitle('teacher.students', m.shell.tabs)}
          aside={
            <Button
              label={t.addStudent}
              leftIcon="plus"
              onPress={() => {
                setNotice(null);
                setOverlay({ kind: 'create' });
              }}
              testID="students-add"
              // A phone shows the header controls in a row of their own: the button keeps its own width there.
              style={styles.add}
            />
          }
        />
      }
      scroll={!theme.tablet}
      maxWidth="full"
      scrollRef={scrollRef}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {notice ? (
        <Notice
          tone={notice.tone}
          text={notice.text}
          onDismiss={() => setNotice(null)}
          dismissLabel={m.common.actions.close}
          testID="students-notice"
        />
      ) : null}
      {/* Cached students stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {students.isError && list ? (
        <Notice tone="error" text={errorText(students.error, m.common.errors.generic)} testID="students-refresh-error" />
      ) : null}

      {!list || list.length === 0 ? (
        placeholder
      ) : theme.tablet ? (
        <Panels testID="students-panels">
          <Panel weight={2} padded={false} contentStyle={styles.listPanel} testID="students-list">
            {rows}
          </Panel>
          <Panel weight={3} testID="students-summary">
            {selected ? (
              <StudentSummary
                // Another student must not show this one's reads while its own are on their way.
                key={selected.id}
                student={selected}
                onActions={(student) => setOverlay({ kind: 'actions', student })}
              />
            ) : null}
          </Panel>
        </Panels>
      ) : (
        <ListCard testID="students-list">{rows}</ListCard>
      )}

      <StudentActionsSheet
        student={overlay?.kind === 'actions' ? overlay.student : null}
        onClose={closeOverlay}
        onSelect={onAction}
        onClosed={openQueued}
      />
      <CreateStudentSheet
        visible={overlay?.kind === 'create'}
        onClose={closeOverlay}
        onCreated={(credentials) => switchOverlay({ kind: 'credentials', credentials })}
        onClosed={openQueued}
      />
      <CredentialsSheet
        credentials={overlay?.kind === 'credentials' ? overlay.credentials : null}
        title={dict.students.createForm.createdTitle}
        onDone={() => {
          closeOverlay();
          announce({ tone: 'success', text: t.notices.studentCreated });
        }}
      />
      <ResetPasswordSheet
        student={overlay?.kind === 'reset' ? overlay.student : null}
        onClose={closeOverlay}
        onDone={() => {
          closeOverlay();
          announce({ tone: 'success', text: t.notices.passwordReset });
        }}
        onMissing={(message) => {
          closeOverlay();
          announce({ tone: 'error', text: message });
        }}
      />
      <DeleteStudentDialog
        student={overlay?.kind === 'delete' ? overlay.student : null}
        onClose={closeOverlay}
        onDeleted={() => {
          closeOverlay();
          announce({ tone: 'success', text: t.notices.studentDeleted });
        }}
        onMissing={(message) => {
          closeOverlay();
          announce({ tone: 'error', text: message });
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  add: { alignSelf: 'flex-start' },
  // Rows bring their own height and hairlines; the panel adds the card's top and bottom room.
  listPanel: { gap: 0, paddingVertical: t.space.sm },
}));
