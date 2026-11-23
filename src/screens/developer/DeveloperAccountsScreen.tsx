import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Platform, RefreshControl, View } from 'react-native';

import { errorText, hasErrorCode, qk, useApi } from '@/api';
import type { ManagedStudent, ManagedTeacher, OwnerChange } from '@/api/types';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { format, useI18n } from '@/i18n';
import { useRefetchOnFocus } from '@/navigation';
import { Hint } from '@/providers';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import {
  CredentialsSheet,
  DeleteStudentDialog,
  invalidateStudents,
  ResetPasswordSheet,
  useLatched,
  useNoticeScroll,
  type CreatedCredentials,
} from '@/screens/teacher/students';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, Card, EmptyState, LoadingState, Notice, Panel, Panels, Screen, SectionCaption, Segmented, Text } from '@/ui';

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
import { CreateAccountFields } from './accounts/create-account-fields';
import { CreateAccountSheet } from './accounts/create-account-sheet';
import { CreateAccountSubmit } from './accounts/create-account-submit';
import { DeleteTeacherDialog } from './accounts/delete-teacher-dialog';
import { DirectorySearch } from './accounts/directory-search';
import { OwnerSaveBar } from './accounts/owner-save-bar';
import { ResetTeacherPasswordSheet } from './accounts/reset-teacher-password-sheet';
import { StudentDetailSheet, type StudentAction } from './accounts/student-detail-sheet';
import { StudentRow } from './accounts/student-row';
import { TeacherActionsSheet, type TeacherAction } from './accounts/teacher-actions-sheet';
import { TeacherRow } from './accounts/teacher-row';
import { useCreateAccountForm } from './accounts/use-create-account-form';
import { ListSlice } from './list-slice';

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

/** A cell of the list: the caption of a section, or one account as a piece of that section's card. */
type Row =
  | { kind: 'caption'; section: 'teachers' | 'students'; title: string }
  | { kind: 'teacher'; teacher: ManagedTeacher; first: boolean; last: boolean }
  | { kind: 'student'; student: ManagedStudent; first: boolean; last: boolean };

const NO_TEACHERS: readonly ManagedTeacher[] = [];
const NO_STUDENTS: readonly ManagedStudent[] = [];
const NO_DRAFTS: OwnerDrafts = {};

/**
 * `developer.accounts` (docs/spec/04-teacher-students.md S9; layout: docs/design/glass-over-paper.md §7,
 * mockup D-accounts): every teacher and student of the school as rows of one card per section — a neutral
 * avatar, the name and one caption. The header switches between «Все / Учителя / Ученики». A row opens a
 * sheet with its actions: the login, a password reset, deletion (with transfer of a teacher's students)
 * and, for a student, the owner picker. Owner changes are drafts until the bar at the bottom saves them
 * all at once. «Новый аккаунт» is folded behind the header button on a phone and is the panel next to the
 * directory on a tablet. Results appear as a banner above the list — the app's form of the site's
 * redirect notices.
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

  const [tab, setTab] = useState<DirectoryTab>('all');
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<OwnerDrafts>(NO_DRAFTS);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // The sheet to open once the current one has finished closing.
  const queued = useRef<Overlay | null>(null);

  const directory = useQuery({
    queryKey: qk('accounts', 'getAccounts'),
    queryFn: () => api.accounts.getAccounts(),
  });
  const loaded = directory.data !== undefined;
  const directoryFailure = loadFailureOf(directory);
  const teachers = directory.data?.teachers ?? NO_TEACHERS;
  const students = directory.data?.students ?? NO_STUDENTS;
  useRefetchOnFocus([directory]);

  /** Accounts changed: this directory and every staff read that lists students or teachers' work. */
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk('accounts') });
    invalidateStudents(queryClient);
  };

  const { refreshing, refresh } = usePullRefresh([directory]);

  /** A banner is useless below the fold: bring the list back to its top with it. */
  const announce = (next: PageNotice) => setNotice(next);
  useNoticeScroll(listRef, notice);

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

  // The form of «Новый аккаунт» lives in the screen: a sheet on a phone, the panel next to the list on a tablet.
  const createForm = useCreateAccountForm({
    teachers,
    onCreated: (account, credentials) => {
      invalidate();
      const next: Overlay = { kind: 'credentials', credentials, role: account.role };
      // From the sheet: the credentials open once it has closed. From the tablet panel nothing is open.
      if (overlay?.kind === 'create') switchOverlay(next);
      else setOverlay(next);
    },
    onTeacherMissing: invalidate,
  });

  const visibleTeachers = tab === 'students' ? [] : filterAccounts(teachers, query);
  const visibleStudents = tab === 'teachers' ? [] : filterAccounts(students, query);
  const caption = (label: string, count: number) => format(tabs.tabWithCount, { label, n: count });
  const rows: Row[] = [];
  if (visibleTeachers.length > 0) {
    rows.push({ kind: 'caption', section: 'teachers', title: caption(tabs.teachers, teachers.length) });
    visibleTeachers.forEach((teacher, index) =>
      rows.push({ kind: 'teacher', teacher, first: index === 0, last: index === visibleTeachers.length - 1 }),
    );
  }
  if (visibleStudents.length > 0) {
    rows.push({ kind: 'caption', section: 'students', title: caption(tabs.students, students.length) });
    visibleStudents.forEach((student, index) =>
      rows.push({ kind: 'student', student, first: index === 0, last: index === visibleStudents.length - 1 }),
    );
  }

  const openCreate = () => {
    setNotice(null);
    setOverlay({ kind: 'create' });
  };

  const notices = (
    <>
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
    </>
  );

  // The head of the list: on a phone the banners scroll with it, on a tablet they stand above the panels.
  const listHeader = (
    <View style={[styles.listHeader, theme.tablet ? styles.listHeaderPanel : null]}>
      {theme.tablet ? null : notices}
      <DirectorySearch tab={tab} value={query} onChange={setQuery} />
      {tab !== 'teachers' && students.length > 0 && changes.length === 0 ? (
        <Hint>
          <Text variant="small" color="textMuted" testID="accounts-owner-hint">
            {dict.students.studentsManager.pickHint}
          </Text>
        </Hint>
      ) : null}
    </View>
  );

  const manager = tab === 'students' ? dict.students.studentsManager : dict.students.teachersManager;
  const total = tab === 'teachers' ? teachers.length : tab === 'students' ? students.length : teachers.length + students.length;

  // Loading and failure live inside the list, under the same header: the search never jumps. Creating an
  // account does not wait for the list (a student still needs a teacher from it).
  const body = (
    <View style={theme.tablet ? styles.bodyPanel : null}>
      {loaded ? (
        total === 0 ? (
          <EmptyState variant={theme.tablet ? 'plain' : 'panel'} title={manager.empty} testID="accounts-empty" />
        ) : (
          <EmptyState
            variant={theme.tablet ? 'plain' : 'panel'}
            title={manager.notFound}
            // «Все» searches both lists: the hint of one list would name only its own accounts.
            hint={tab === 'all' ? undefined : manager.notFoundHint}
            testID="accounts-no-matches"
          />
        )
      ) : directoryFailure ? (
        <LoadFailure query={directory} testID="accounts-error" />
      ) : (
        <LoadingState variant="list" count={6} accessibilityLabel={m.common.a11y.loading} testID="accounts-loading" />
      )}
    </View>
  );

  const list = (
    <FlashList
      ref={listRef}
      data={rows}
      // A row's caption depends on the drafts and on the teachers' names, not only on its own account.
      extraData={drafts}
      keyExtractor={(row) => (row.kind === 'caption' ? `c:${row.section}` : row.kind === 'teacher' ? `t:${row.teacher.id}` : `s:${row.student.id}`)}
      getItemType={(row) => row.kind}
      renderItem={({ item }) =>
        item.kind === 'caption' ? (
          // Inside the tablet panel a section is named by a title; on the page — by a caption above its card.
          theme.tablet ? (
            <Text variant="sectionTitle" accessibilityRole="header" style={styles.sectionTitle} testID={`accounts-section-${item.section}`}>
              {item.title}
            </Text>
          ) : (
            <SectionCaption style={styles.sectionCaption} testID={`accounts-section-${item.section}`}>
              {item.title}
            </SectionCaption>
          )
        ) : (
          <ListSlice first={item.first} last={item.last} inCard={theme.tablet}>
            {item.kind === 'teacher' ? (
              <TeacherRow teacher={item.teacher} divider={!item.last} onPress={(teacher) => setOverlay({ kind: 'teacher', teacher })} />
            ) : (
              <StudentRow
                student={item.student}
                ownerName={teacherNameOf(selectedOwnerId(item.student, drafts, teachers), teachers)}
                dirty={isOwnerDirty(item.student, drafts, teachers)}
                divider={!item.last}
                onPress={(student) => setOverlay({ kind: 'student', studentId: student.id })}
              />
            )}
          </ListSlice>
        )
      }
      ListHeaderComponent={listHeader}
      ListEmptyComponent={body}
      contentContainerStyle={theme.tablet ? styles.panelContent : styles.listContent}
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
  );

  return (
    <Screen
      testID="developer-accounts-screen"
      header={
        <ShellAppBar
          title={screenTitle('developer.accounts', m.shell.tabs)}
          aside={
            <View style={styles.aside}>
              <Segmented<DirectoryTab>
                options={[
                  { value: 'all', label: dict.planner.journal.filters.all },
                  { value: 'teachers', label: tabs.teachers },
                  { value: 'students', label: tabs.students },
                ]}
                value={tab}
                onChange={setTab}
                accessibilityLabel={tabs.tabsAria}
                role="tab"
                // Never cut: next to the button on a narrow phone the bar scrolls instead.
                scrollable={!theme.tablet}
                style={theme.tablet ? null : styles.segments}
                testID="accounts-tabs"
              />
              {/* A tablet shows the form itself in the panel next to the list. */}
              {theme.tablet ? null : (
                <Button
                  label={m.accounts.create.short}
                  accessibilityLabel={t.newAccount}
                  leftIcon="plus"
                  onPress={openCreate}
                  testID="accounts-add"
                />
              )}
            </View>
          }
        />
      }
      bottomInset={false}
      scroll={false}
      padded={theme.tablet}
      maxWidth="full"
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
      {theme.tablet ? (
        <>
          {notices}
          <Panels>
            {/* Not a `Panel`: that one scrolls its children, and this list scrolls (and virtualises) itself. */}
            <Card padded={false} style={styles.listPanel} testID="accounts-directory">
              {list}
            </Card>
            <Panel weight={2} testID="accounts-create-panel">
              <Text variant="sectionTitle" accessibilityRole="header">
                {t.newAccount}
              </Text>
              <CreateAccountFields form={createForm} />
              <CreateAccountSubmit form={createForm} />
              <Hint>
                <Text variant="small" color="textMuted">
                  {m.accounts.create.onceHint}
                </Text>
              </Hint>
            </Panel>
          </Panels>
        </>
      ) : (
        list
      )}

      <CreateAccountSheet visible={overlay?.kind === 'create'} form={createForm} onClose={closeOverlay} onClosed={openQueued} />
      <CredentialsSheet
        credentials={overlay?.kind === 'credentials' ? overlay.credentials : null}
        title={
          createdRole === 'TEACHER' ? dict.students.actions.createAccount.teacherCreated : dict.students.actions.createAccount.studentCreated
        }
        onDone={() => {
          const role = overlay?.kind === 'credentials' ? overlay.role : 'STUDENT';
          closeOverlay();
          // The new account must be on screen with the banner: «Все» shows it, a single list may not.
          if (tab !== 'all') setTab(role === 'TEACHER' ? 'teachers' : 'students');
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
          // 90-addendum-5 B.2.1: the directory is re-read after a student's password reset.
          invalidate();
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
  // Phone: the segments take the room left of the button; a tablet header sizes them by their labels.
  aside: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  // Longhands: on web the kit's own `flexGrow: 0` would win over a `flex` shorthand.
  segments: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  // Phone: the list is the page.
  listContent: { paddingHorizontal: t.space.gutter, paddingBottom: t.space.pageBottom },
  listHeader: { gap: t.space.md, paddingBottom: t.space.xxs },
  sectionCaption: { paddingTop: t.space.md, paddingBottom: t.space.sm },
  // Tablet: the list is the content of the left panel, a card that runs down to the dock.
  listPanel: { flex: 3, minWidth: 0, minHeight: 0, overflow: 'hidden' },
  panelContent: { paddingBottom: t.space.lg },
  listHeaderPanel: { paddingHorizontal: t.space.card, paddingTop: t.space.card },
  sectionTitle: { paddingHorizontal: t.space.card, paddingTop: t.space.lg, paddingBottom: t.space.xxs },
  bodyPanel: { paddingHorizontal: t.space.card, paddingTop: t.space.md },
}));
