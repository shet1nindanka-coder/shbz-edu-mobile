import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Platform, RefreshControl, View } from 'react-native';

import { hasErrorCode, qk, useApi } from '@/api';
import type { ManagedStudent, ManagedTeacher, OwnerChange } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { useRefetchOnFocus } from '@/screens/teacher/home/use-refetch-on-focus';
import {
  CredentialsSheet,
  DeleteStudentDialog,
  errorText,
  invalidateStudents,
  ResetPasswordSheet,
  useLatched,
  type CreatedCredentials,
} from '@/screens/teacher/students';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, ErrorState, LoadingState, Notice, PageHeader, Screen, Segmented, Text } from '@/ui';

import {
  filterAccounts,
  isOwnerDirty,
  ownerChanges,
  selectedOwnerId,
  teacherNameOf,
  withOwnerDraft,
  type AccountRole,
  type DirectoryTab,
  type OwnerDrafts,
} from './accounts/accounts-logic';
import { CreateAccountSheet } from './accounts/create-account-sheet';
import { DeleteTeacherDialog } from './accounts/delete-teacher-dialog';
import { DirectorySearch } from './accounts/directory-search';
import { OwnerSaveBar } from './accounts/owner-save-bar';
import { ResetTeacherPasswordSheet } from './accounts/reset-teacher-password-sheet';
import { StudentDetailSheet, type StudentAction } from './accounts/student-detail-sheet';
import { StudentRow } from './accounts/student-row';
import { TeacherActionsSheet, type TeacherAction } from './accounts/teacher-actions-sheet';
import { TeacherRow } from './accounts/teacher-row';

type PageNotice = { tone: 'success' | 'error'; text: string };

type Target = { id: string; name: string };

/** The one sheet or dialog that is open; two modals are never on screen together. */
type Overlay =
  | { kind: 'create' }
  | { kind: 'credentials'; credentials: CreatedCredentials; role: AccountRole }
  | { kind: 'teacher'; teacher: ManagedTeacher }
  | { kind: 'student'; studentId: string }
  | { kind: 'resetTeacher'; teacher: Target }
  | { kind: 'resetStudent'; student: Target }
  | { kind: 'deleteTeacher'; teacher: ManagedTeacher }
  | { kind: 'deleteStudent'; student: Target };

type Row = { kind: 'teacher'; teacher: ManagedTeacher } | { kind: 'student'; student: ManagedStudent };

const NO_TEACHERS: readonly ManagedTeacher[] = [];
const NO_STUDENTS: readonly ManagedStudent[] = [];
const NO_DRAFTS: OwnerDrafts = {};

/**
 * `developer.accounts` (docs/spec/04-teacher-students.md S9): every teacher and student of the school.
 * «Новый аккаунт» creates either; a teacher row offers the login, a password reset and deletion with
 * transfer of the students; a student row adds the owner picker. Owner changes are drafts until the bar at
 * the bottom saves them all at once. Results appear as a banner above the list — the phone form of the
 * site's redirect notices.
 */
export function DeveloperAccountsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.students.accounts;
  const tabs = dict.students.directory;
  const listRef = useRef<FlashListRef<Row>>(null);

  const [tab, setTab] = useState<DirectoryTab>('teachers');
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<OwnerDrafts>(NO_DRAFTS);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // The sheet to open once the current one has finished closing.
  const queued = useRef<Overlay | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const directory = useQuery({
    queryKey: qk('accounts', 'getAccounts'),
    queryFn: () => api.accounts.getAccounts(),
  });
  const loaded = directory.data !== undefined;
  const teachers = directory.data?.teachers ?? NO_TEACHERS;
  const students = directory.data?.students ?? NO_STUDENTS;
  useRefetchOnFocus([directory]);

  /** Accounts changed: this directory and every staff read that lists students or teachers' work. */
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk('accounts') });
    invalidateStudents(queryClient);
  };

  const refresh = () => {
    setRefreshing(true);
    void directory.refetch().finally(() => setRefreshing(false));
  };

  /** A banner is useless below the fold: bring the list back to its top with it. */
  const announce = (next: PageNotice) => {
    setNotice(next);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

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

  // Every pending change is sent, also for rows hidden by the search or by the other tab.
  const changes = ownerChanges(students, drafts, teachers);

  const saveOwners = useMutation({
    mutationFn: (input: OwnerChange[]) => api.accounts.changeStudentOwners(input),
    onSuccess: () => {
      setDrafts(NO_DRAFTS);
      setSaveError(null);
      invalidate();
      announce({ tone: 'success', text: t.notices.ownerChanged });
    },
    onError: (error) => {
      const text = errorText(error, t.notices.ownerSave);
      if (hasErrorCode(error, 'ownerInvalid')) {
        // A student or a teacher of the list is gone: nothing was applied. The fresh directory drops the
        // drafts that can no longer be saved; the rest stay for another try.
        setSaveError(null);
        invalidate();
        announce({ tone: 'error', text });
        return;
      }
      // saveFailed, serviceUnavailable, no connection: the drafts stay, the bar offers the retry.
      setSaveError(text);
    },
  });

  const onTeacherAction = (action: TeacherAction, teacher: ManagedTeacher) => {
    // The banner of the previous action would read as the result of this one.
    setNotice(null);
    switchOverlay(
      action === 'resetPassword' ? { kind: 'resetTeacher', teacher: { id: teacher.id, name: teacher.name } } : { kind: 'deleteTeacher', teacher },
    );
  };

  const onStudentAction = (action: StudentAction, student: ManagedStudent) => {
    const target = { id: student.id, name: student.name };
    setNotice(null);
    switchOverlay(action === 'resetPassword' ? { kind: 'resetStudent', student: target } : { kind: 'deleteStudent', student: target });
  };

  const detailStudent = overlay?.kind === 'student' ? (students.find((student) => student.id === overlay.studentId) ?? null) : null;
  // The dialog counts with the directory's current numbers; a teacher who has just left it keeps the
  // snapshot so the dialog does not vanish — the call then answers `teacherNotFound`.
  const deleteTeacher =
    overlay?.kind === 'deleteTeacher' ? (teachers.find((teacher) => teacher.id === overlay.teacher.id) ?? overlay.teacher) : null;

  // The heading must not flip while the credentials sheet plays its exit animation.
  const createdRole = useLatched(overlay?.kind === 'credentials' ? overlay.role : null);

  const visibleTeachers = filterAccounts(teachers, query);
  const visibleStudents = filterAccounts(students, query);
  const rows: Row[] =
    tab === 'teachers'
      ? visibleTeachers.map((teacher) => ({ kind: 'teacher', teacher }))
      : visibleStudents.map((student) => ({ kind: 'student', student }));

  const tabLabel = (label: string, count: number) => (loaded ? format(tabs.tabWithCount, { label, n: count }) : label);

  const header = (
    <View style={styles.header}>
      <PageHeader title={t.title} gap={0} />
      {notice ? (
        <Notice
          tone={notice.tone}
          text={notice.text}
          onDismiss={() => setNotice(null)}
          dismissLabel={m.common.actions.close}
          testID="accounts-notice"
        />
      ) : null}
      {/* The directory stays on screen when a refresh fails (offline): say so instead of replacing it. */}
      {directory.isError && loaded ? (
        <Notice tone="error" text={errorText(directory.error, m.common.errors.generic)} testID="accounts-refresh-error" />
      ) : null}
      <Button
        label={t.newAccount}
        size="lg"
        leftIcon="userPlus"
        fullWidth
        onPress={() => {
          setNotice(null);
          setOverlay({ kind: 'create' });
        }}
        testID="accounts-add"
      />
      <Text variant="sectionTitle" accessibilityRole="header" style={styles.sectionTitle}>
        {t.directory}
      </Text>
      <Segmented
        options={[
          { value: 'teachers', label: tabLabel(tabs.teachers, teachers.length) },
          { value: 'students', label: tabLabel(tabs.students, students.length) },
        ]}
        value={tab}
        onChange={setTab}
        accessibilityLabel={tabs.tabsAria}
        role="tab"
        fill
        plain
        testID="accounts-tabs"
      />
      <DirectorySearch tab={tab} value={query} onChange={setQuery} />
      {tab === 'students' && students.length > 0 && changes.length === 0 ? (
        <Hint>
          <Text variant="caption" color="textMuted" testID="accounts-owner-hint">
            {dict.students.studentsManager.pickHint}
          </Text>
        </Hint>
      ) : null}
    </View>
  );

  const manager = tab === 'teachers' ? dict.students.teachersManager : dict.students.studentsManager;
  const total = tab === 'teachers' ? teachers.length : students.length;

  // Loading and failure live inside the list, under the same header: the title and «Новый аккаунт» never
  // jump. Creating an account does not wait for the list (a student still needs a teacher from it).
  const body = loaded ? (
    total === 0 ? (
      <EmptyState title={manager.empty} testID="accounts-empty" />
    ) : (
      <EmptyState title={manager.notFound} hint={manager.notFoundHint} testID="accounts-no-matches" />
    )
  ) : directory.isError ? (
    <ErrorState
      title={dict.shells.errorTitle}
      description={errorText(directory.error, dict.shells.errorDescription)}
      retryLabel={dict.common.retry}
      onRetry={() => void directory.refetch()}
      retrying={directory.isFetching}
      testID="accounts-error"
    />
  ) : (
    <LoadingState variant="cards" count={6} cardHeight={84} accessibilityLabel={m.common.a11y.loading} testID="accounts-loading" />
  );

  return (
    <Screen
      testID="developer-accounts-screen"
      header={<ShellAppBar title={screenTitle('developer.accounts', m.shell.tabs)} />}
      bottomInset={false}
      scroll={false}
      padded={false}
      footer={
        changes.length > 0 ? (
          <OwnerSaveBar
            count={changes.length}
            saving={saveOwners.isPending}
            error={saveError}
            onDiscard={() => {
              setDrafts(NO_DRAFTS);
              setSaveError(null);
            }}
            onSave={() => {
              if (saveOwners.isPending) return;
              setSaveError(null);
              setNotice(null);
              saveOwners.mutate(changes);
            }}
          />
        ) : undefined
      }
    >
      <FlashList
        ref={listRef}
        data={rows}
        // A row's lines depend on the drafts and on the teachers' names, not only on its own account.
        extraData={drafts}
        keyExtractor={(row) => (row.kind === 'teacher' ? `t:${row.teacher.id}` : `s:${row.student.id}`)}
        getItemType={(row) => row.kind}
        renderItem={({ item }) => (
          <View style={styles.item}>
            {item.kind === 'teacher' ? (
              <TeacherRow teacher={item.teacher} onPress={(teacher) => setOverlay({ kind: 'teacher', teacher })} />
            ) : (
              <StudentRow
                student={item.student}
                ownerName={teacherNameOf(selectedOwnerId(item.student, drafts, teachers), teachers)}
                dirty={isOwnerDirty(item.student, drafts, teachers)}
                onPress={(student) => setOverlay({ kind: 'student', studentId: student.id })}
              />
            )}
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={body}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // On web any scroll event counts as a drag and would blur the search field while it is typed in.
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
        testID="accounts-list"
      />

      <CreateAccountSheet
        visible={overlay?.kind === 'create'}
        teachers={teachers}
        onClose={closeOverlay}
        onCreated={(account, credentials) => {
          invalidate();
          switchOverlay({ kind: 'credentials', credentials, role: account.role });
        }}
        onTeacherMissing={invalidate}
        onClosed={openQueued}
      />
      <CredentialsSheet
        credentials={overlay?.kind === 'credentials' ? overlay.credentials : null}
        title={
          createdRole === 'TEACHER' ? dict.students.actions.createAccount.teacherCreated : dict.students.actions.createAccount.studentCreated
        }
        onClose={() => {
          const role = overlay?.kind === 'credentials' ? overlay.role : 'STUDENT';
          closeOverlay();
          // The new account is on the tab of its role; show it there with the banner.
          setTab(role === 'TEACHER' ? 'teachers' : 'students');
          announce({ tone: 'success', text: role === 'TEACHER' ? t.notices.teacherCreated : t.notices.studentCreated });
        }}
      />

      <TeacherActionsSheet
        teacher={overlay?.kind === 'teacher' ? overlay.teacher : null}
        onClose={closeOverlay}
        onSelect={onTeacherAction}
        onClosed={openQueued}
      />
      <ResetTeacherPasswordSheet
        teacher={overlay?.kind === 'resetTeacher' ? overlay.teacher : null}
        onClose={closeOverlay}
        onDone={() => {
          closeOverlay();
          announce({ tone: 'success', text: t.notices.teacherPasswordReset });
        }}
        onMissing={(message) => {
          closeOverlay();
          invalidate();
          announce({ tone: 'error', text: message });
        }}
      />
      <DeleteTeacherDialog
        teacher={deleteTeacher}
        teachers={teachers}
        onClose={closeOverlay}
        onDeleted={() => {
          closeOverlay();
          invalidate();
          announce({ tone: 'success', text: t.notices.teacherDeleted });
        }}
        onMissing={(message) => {
          closeOverlay();
          invalidate();
          announce({ tone: 'error', text: message });
        }}
        onStale={invalidate}
      />

      <StudentDetailSheet
        student={detailStudent}
        teachers={teachers}
        ownerId={detailStudent ? selectedOwnerId(detailStudent, drafts, teachers) : null}
        dirty={detailStudent ? isOwnerDirty(detailStudent, drafts, teachers) : false}
        saving={saveOwners.isPending}
        onOwnerChange={(student, teacherId) => {
          setDrafts((current) => withOwnerDraft(current, student, teacherId));
          setSaveError(null);
        }}
        onSelect={onStudentAction}
        onClose={closeOverlay}
        onClosed={openQueued}
      />
      <ResetPasswordSheet
        student={overlay?.kind === 'resetStudent' ? overlay.student : null}
        onClose={closeOverlay}
        onDone={() => {
          closeOverlay();
          announce({ tone: 'success', text: t.notices.passwordReset });
        }}
        onMissing={(message) => {
          closeOverlay();
          invalidate();
          announce({ tone: 'error', text: message });
        }}
      />
      <DeleteStudentDialog
        student={overlay?.kind === 'deleteStudent' ? overlay.student : null}
        onClose={closeOverlay}
        onDeleted={() => {
          closeOverlay();
          invalidate();
          announce({ tone: 'success', text: t.notices.studentDeleted });
        }}
        onMissing={(message) => {
          closeOverlay();
          invalidate();
          announce({ tone: 'error', text: message });
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.field, paddingBottom: t.space.md },
  sectionTitle: { marginTop: t.space.xs },
  item: { paddingBottom: t.space.md },
}));
