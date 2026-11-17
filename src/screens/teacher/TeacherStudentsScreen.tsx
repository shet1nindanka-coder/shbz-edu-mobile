import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { TeacherStudentListItem } from '@/api/types';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, LoadingState, Notice, PageHeader, Screen, Text } from '@/ui';

import { CreateStudentSheet } from './students/create-student-sheet';
import { CredentialsSheet, type CreatedCredentials } from './students/credentials-sheet';
import { DeleteStudentDialog } from './students/delete-student-dialog';
import { useStudentsListNotice } from './students/list-notice';
import { ResetPasswordSheet } from './students/reset-password-sheet';
import { StudentActionsSheet, type StudentAction } from './students/student-actions-sheet';
import { StudentRow } from './students/student-row';
import { useNoticeScroll } from './students/use-notice-scroll';

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

/**
 * `teacher.students` (docs/spec/04-teacher-students.md S2): the teacher's own students, name ascending.
 * A row opens the student's card; its "⋯" (or a long press) offers the login to copy, a password reset and
 * deletion. «Добавить ученика» opens the create form; the new account's login and password are then shown
 * once. Results of the three mutations appear as a banner above the list — the phone form of the site's
 * redirect notices.
 */
export function TeacherStudentsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.students.list;
  const navigation = useAppNavigation();
  const listRef = useRef<FlashListRef<TeacherStudentListItem>>(null);

  const [notice, setNotice] = useState<ListNotice | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // The sheet to open once the current one has finished closing.
  const queued = useRef<Overlay | null>(null);

  const students = useQuery({
    queryKey: qk('teacherStudents', 'listStudents'),
    queryFn: () => api.teacherStudents.listStudents(),
  });
  const list = students.data?.students;
  useRefetchOnFocus([students]);
  const studentsFailure = loadFailureOf(students);

  const { refreshing, refresh } = usePullRefresh([students]);

  /** A banner is useless below the fold: bring the list back to its top with it. */
  const announce = (next: ListNotice) => setNotice(next);
  useNoticeScroll(listRef, notice);

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

  const header = (
    <View style={styles.header}>
      <PageHeader title={t.title} gap={0} />
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
      <Button
        label={t.addStudent}
        size="lg"
        leftIcon="userPlus"
        fullWidth
        onPress={() => {
          setNotice(null);
          setOverlay({ kind: 'create' });
        }}
        testID="students-add"
      />
      <View style={styles.sectionRow}>
        <Text variant="sectionTitle" accessibilityRole="header" style={styles.sectionTitle}>
          {t.currentStudents}
        </Text>
        {list && list.length > 0 ? (
          <Text variant="meta" tabular testID="students-count">
            {list.length}
          </Text>
        ) : null}
      </View>
    </View>
  );

  // Loading and failure live inside the list, under the same header: the title and «Добавить ученика»
  // never jump, and adding a student does not depend on the list having loaded.
  const body = list ? (
    <EmptyState title={t.empty} testID="students-empty" />
  ) : studentsFailure ? (
    <LoadFailure query={students} testID="students-error" />
  ) : (
    <LoadingState variant="cards" count={6} cardHeight={70} accessibilityLabel={m.common.a11y.loading} testID="students-loading" />
  );

  return (
    <Screen
      testID="teacher-students-screen"
      header={<ShellAppBar title={screenTitle('teacher.students', m.shell.tabs)} />}
      bottomInset={false}
      scroll={false}
      padded={false}
    >
      <FlashList
        ref={listRef}
        data={list ?? NO_STUDENTS}
        keyExtractor={(student) => student.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <StudentRow student={item} onOpen={openStudent} onActions={(student) => setOverlay({ kind: 'actions', student })} />
          </View>
        )}
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
        testID="students-list"
      />

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
        onClose={() => {
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
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.field, paddingBottom: t.space.md },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', gap: t.space.sm, marginTop: t.space.xs },
  sectionTitle: { flexShrink: 1 },
  item: { paddingBottom: t.space.md },
}));
