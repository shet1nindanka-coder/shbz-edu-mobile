import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type ScrollViewInstance } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { ImportTarget } from '@/api/types';
import type { ViewerFile } from '@/components/files';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, useStillHere, type ScreenParams } from '@/navigation';
import { Hint, useCurrentUser } from '@/providers';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, IconButton, LoadingState, Notice, Panel, Panels, Screen, Segmented, Text, TextButton } from '@/ui';

import { AnswersSection } from './edit/answers-section';
import { NumbersConfirmDialog } from './edit/numbers-confirm-dialog';
import { findNumberEntry, pageOfNumber } from './edit/topic-edit';
import { TopicFormSection } from './edit/topic-form-section';
import { useTopicEditForm, type EditNotice } from './edit/use-topic-edit-form';
import { DeleteTopicDialog } from './shared/delete-topic-dialog';
import { clearEditorFocus, markOpenedFromEditor, peekEditorFocus } from './shared/editor-links';
import { ImportPanelView } from './shared/import-panel';
import { postTopicDeleted } from './shared/topics-flash';
import { useImportPanel } from './shared/use-import-panel';

/** Route params of `content.topicEdit` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type ContentTopicEditScreenProps = ScreenParams['content.topicEdit'];

/** A teacher never loads the editor's topic. */
const NO_QUERIES: readonly [] = [];

/** The site's long page, split as its phone mapping proposes (07 §1.3): the form, the per-number materials, the import. */
type EditSection = 'topic' | 'answers' | 'import';
/** What the panel next to the form shows on a tablet. */
type SideSection = Exclude<EditSection, 'topic'>;

/** Where the pieces above the highlighted row start; the screen scrolls to it once all are known. */
type FocusScroll = { header: number | null; panels: number | null; row: number | null; done: boolean; timer: ReturnType<typeof setTimeout> | null };

/**
 * `content.topicEdit` (docs/spec/07-developer-content.md §1.3, §1.5; DEVELOPER only; layout: the
 * `D-topic-edit` mockup): the form — title, description, the numbers field that replaces the whole set
 * (with the destructive-change preview), the two files — the statements-and-answers list, the import of
 * numbers into this topic, and «Удалить тему» with its real impact.
 *
 * A phone shows one of the three at a time (the switch is in the header), with «Сохранить изменения» as
 * the sticky action of the form. A tablet keeps the form in the left panel and the import or the
 * statements-and-answers list in the right one; saving and deleting sit in the header.
 */
export function ContentTopicEditScreen({ topicId }: ContentTopicEditScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.topics.edit;
  const s = dict.topics.submit;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const stillHere = useStillHere();
  const isDeveloper = user.role === 'DEVELOPER';

  // Opened by «← К теме» of a number reached through number search: the site's `/edit?number=N#topic-answers`
  // (07 §1.3, §1.4b) — the statements-and-answers section, on the page of that number, the number highlighted.
  const [focusNumber] = useState(() => peekEditorFocus(topicId));
  useEffect(() => clearEditorFocus(), []);
  const [section, setSection] = useState<EditSection>(focusNumber === null ? 'topic' : 'answers');
  const [notice, setNotice] = useState<EditNotice | null>(null);
  // `null` until the user turns a page: the list then opens on the page of the focused number (or the first).
  const [answersPage, setAnswersPage] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Deleted from this screen: it is on its way out, so the 404 of the last refetch is not news.
  const [deleted, setDeleted] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const focusScroll = useRef<FocusScroll>({ header: null, panels: null, row: null, done: false, timer: null });
  useEffect(
    () => () => {
      const { timer } = focusScroll.current;
      if (timer) clearTimeout(timer);
    },
    [],
  );

  const detail = useQuery({
    queryKey: qk('content', 'getTopic', topicId),
    queryFn: () => api.content.getTopic(topicId),
    enabled: isDeveloper,
  });
  const data = detail.data;
  const failure = loadFailureOf(detail);
  // The editor stays mounted under the number screen: realtime first, and a stale topic is asked again when
  // the editor is returned to (00 §2.3). Nothing is asked for a role the screen is not for.
  useRefetchOnFocus(isDeveloper ? [detail] : NO_QUERIES);
  const { refreshing, refresh } = usePullRefresh([isDeveloper && detail]);

  // Both keep their state while another section is shown (typed text, picked files, a loaded JSON).
  const form = useTopicEditForm({ topicId, detail: data, onNotice: setNotice });
  const importTarget = useMemo<ImportTarget>(() => ({ topicId }), [topicId]);
  const importState = useImportPanel({ target: importTarget });

  // The edit screen is the developer's (07 §0.2); and a topic deleted elsewhere has nothing left to edit —
  // the cached copy must not stay editable.
  if (!isDeveloper || (!deleted && isNotFoundError(detail.error))) return <NotFoundScreen />;

  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: false });
  // The highlighted number may sit below the fold of its page: once the header, the card and the row know
  // where they are, the screen scrolls to the row — one time, never against the user's own scrolling later.
  // (A tablet page does not scroll: the list is in a panel of its own.)
  const placeFocus = (part: 'header' | 'panels' | 'row', y: number) => {
    const focus = focusScroll.current;
    if (focus.done) return;
    focus[part] = y;
    if (focus.header === null || focus.panels === null || focus.row === null || focus.timer !== null) return;
    // The layout events of one pass arrive one by one: scroll after the last of them.
    focus.timer = setTimeout(() => {
      focus.timer = null;
      if (focus.done || focus.header === null || focus.panels === null || focus.row === null) return;
      focus.done = true;
      // The row's offset is counted from the card's content: the card padding lies between the two.
      const y = focus.header + focus.panels + theme.space.card + focus.row - theme.space.md;
      scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false });
    }, 0);
  };
  const openFile = (file: ViewerFile, title: string) => navigation.openFiles([file], { title });

  const topic = data?.topic;
  const focused = topic ? findNumberEntry(topic.homeworkNumbers, focusNumber) : null;
  const shownAnswersPage = answersPage ?? (topic ? pageOfNumber(topic.homeworkNumbers, focusNumber) : null) ?? 1;
  const uploading = form.theory.uploading || form.homework.uploading;
  const formBusy = form.phase !== 'idle';
  const side: SideSection = section === 'answers' ? 'answers' : 'import';

  const saveButton = (
    <Button
      label={form.phase === 'saving' ? s.saving : form.phase === 'checking' ? s.checking : s.save}
      loading={formBusy}
      // Nothing to send while the form equals the saved topic; a running upload has no file id yet.
      disabled={!form.dirty || uploading}
      onPress={form.save}
      testID="edit-save"
    />
  );
  const deleteButton = (
    <Button
      label={dict.topics.deleteTopic.label}
      variant="danger"
      leftIcon="trash"
      disabled={formBusy}
      onPress={() => setDeleteOpen(true)}
      testID="edit-delete-topic"
    />
  );
  const unsaved =
    form.dirty && !formBusy ? (
      <View style={styles.unsaved}>
        <Text variant="small" color="textMuted" style={styles.grow} testID="edit-unsaved">
          {uploading ? m.content.edit.waitUploads : m.content.edit.unsaved}
        </Text>
        <TextButton label={m.content.edit.reset} tone="muted" onPress={form.reset} style={styles.touch} testID="edit-reset" />
      </View>
    ) : null;
  const pendingHint =
    form.phase === 'saving' ? (
      <Hint>
        <Text variant="hint" testID="edit-pending-hint">
          {s.pendingHint}
        </Text>
      </Hint>
    ) : null;

  const sections = (
    <Segmented<EditSection>
      options={[
        { value: 'topic', label: m.content.edit.sections.topic },
        { value: 'answers', label: m.content.edit.sections.answers },
        { value: 'import', label: m.content.edit.sections.import },
      ]}
      value={section}
      onChange={(next) => {
        setSection(next);
        scrollToTop();
      }}
      accessibilityLabel={m.content.edit.sectionsAria}
      role="tab"
      scrollable
      testID="edit-sections"
    />
  );
  const sideSections = (
    <Segmented<SideSection>
      options={[
        { value: 'import', label: m.content.edit.sections.import },
        { value: 'answers', label: m.content.edit.sections.answers },
      ]}
      value={side}
      onChange={setSection}
      accessibilityLabel={m.content.edit.sectionsAria}
      role="tab"
      fill
      testID="edit-sections"
    />
  );

  const answers = topic ? (
    <AnswersSection
      numbers={topic.homeworkNumbers}
      page={shownAnswersPage}
      highlightedId={focused?.id}
      onHighlightLayout={(y) => placeFocus('row', y)}
      onPageChange={(page) => {
        setAnswersPage(page);
        scrollToTop();
      }}
      onOpenNumber={(entry) => {
        // The number screen's «← К теме» then steps back here instead of opening a second editor.
        markOpenedFromEditor(topicId, entry.number);
        navigation.push({ screen: 'content.number', topicId, number: entry.number });
      }}
    />
  ) : null;
  const importer = (
    <View style={styles.section} testID="edit-import">
      <View style={styles.sectionHead}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {m.content.edit.importTitle}
        </Text>
        <Hint>
          <Text variant="hint">{m.content.edit.importHint}</Text>
        </Hint>
      </View>
      {/* On a tablet the header's «Сохранить изменения» is the screen's gradient action. */}
      <ImportPanelView state={importState} secondary={theme.tablet} />
    </View>
  );

  const footer =
    topic && !theme.tablet && section === 'topic' ? (
      <View style={styles.footer} testID="edit-save-bar">
        {unsaved}
        {saveButton}
        {pendingHint}
      </View>
    ) : undefined;

  return (
    <Screen
      testID="content-topic-edit-screen"
      header={
        <View onLayout={(event) => placeFocus('header', event.nativeEvent.layout.height)}>
          <DetailAppBar
            // The topic is the title; the line under it says this is its editor.
            title={topic?.title ?? t.sectionTitle}
            subtitle={topic ? t.sectionTitle : undefined}
            backTitle={m.shell.tabs.topics}
            right={
              topic ? (
                <IconButton
                  icon="eye"
                  accessibilityLabel={dict.topics.tabs.view}
                  onPress={() => navigation.open({ screen: 'content.topic', topicId })}
                  testID="edit-mode"
                />
              ) : undefined
            }
            aside={
              topic ? (
                theme.tablet ? (
                  <>
                    {deleteButton}
                    {saveButton}
                  </>
                ) : (
                  sections
                )
              ) : undefined
            }
          />
        </View>
      }
      footer={footer}
      scrollRef={scrollRef}
      // A tablet page does not scroll: each panel scrolls its own content down to the dock.
      scroll={!theme.tablet}
      maxWidth="full"
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {topic ? (
        <>
          {/* In the order things happened: the check that could not be made, then the outcome of the save. */}
          {form.previewError ? <Notice tone="error" text={form.previewError} testID="edit-preview-error" /> : null}
          {notice ? (
            <Notice tone={notice.tone} text={notice.text} onDismiss={() => setNotice(null)} dismissLabel={m.common.actions.close} testID="edit-notice" />
          ) : null}
          {/* The cached topic stays on screen when a refresh fails (offline): say so instead of replacing it. */}
          {detail.isError && !deleted ? (
            <Notice tone="error" text={errorText(detail.error, m.common.errors.generic)} testID="edit-refresh-error" />
          ) : null}

          <View style={theme.tablet ? styles.fill : undefined} onLayout={(event) => placeFocus('panels', event.nativeEvent.layout.y)}>
            <Panels>
              {theme.tablet || section === 'topic' ? (
                <Panel
                  weight={2}
                  footer={
                    theme.tablet && (unsaved || pendingHint) ? (
                      <View style={styles.footer}>
                        {unsaved}
                        {pendingHint}
                      </View>
                    ) : undefined
                  }
                >
                  <TopicFormSection topic={topic} form={form} onOpenFile={openFile} onNotice={setNotice} />
                </Panel>
              ) : null}
              {theme.tablet ? (
                <Panel weight={3} header={sideSections}>
                  {side === 'answers' ? answers : importer}
                </Panel>
              ) : section === 'answers' ? (
                <Panel>{answers}</Panel>
              ) : section === 'import' ? (
                <Panel>{importer}</Panel>
              ) : null}
            </Panels>
          </View>

          {/* The last thing of the form on a phone; a tablet keeps it in the header, next to «Сохранить». */}
          {!theme.tablet && section === 'topic' ? deleteButton : null}
        </>
      ) : failure ? (
        <LoadFailure query={detail} testID="edit-error" />
      ) : (
        <LoadingState variant="cards" count={2} accessibilityLabel={m.common.a11y.loading} testID="edit-loading" />
      )}

      <NumbersConfirmDialog
        plan={form.plan}
        error={form.planError}
        allowAssigned={form.allowAssigned}
        onAllowAssignedChange={form.setAllowAssigned}
        saving={form.phase === 'saving'}
        onConfirm={form.confirm}
        onCancel={form.cancelConfirm}
      />

      <DeleteTopicDialog
        topic={deleteOpen && topic ? { id: topic.id, title: topic.title } : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          setDeleted(true);
          // Back to the list, as the site's redirect does; the list shows «Тема успешно удалена».
          postTopicDeleted(topicId);
          // Answered after the user went elsewhere: the screen shows the gone state on return instead.
          if (stillHere()) navigation.open({ screen: 'content.topics' });
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  // Tablet: the wrapper that reports where the panels start passes the page height on to them.
  fill: { flex: 1, minHeight: 0 },
  section: { gap: t.space.md },
  sectionHead: { gap: t.space.xxs },
  footer: { gap: t.space.sm },
  unsaved: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  grow: { flex: 1, minWidth: 0 },
  touch: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
