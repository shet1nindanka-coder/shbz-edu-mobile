import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type ScrollViewInstance } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { ImportTarget } from '@/api/types';
import type { ViewerFile } from '@/components/files';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, type ScreenParams } from '@/navigation';
import { Hint, useCurrentUser } from '@/providers';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles } from '@/theme';
import { Button, IconButton, LoadingState, Notice, Screen, Segmented, Text, TextButton } from '@/ui';

import { AnswersSection } from './edit/answers-section';
import { NumbersConfirmDialog } from './edit/numbers-confirm-dialog';
import { findNumberEntry, pageOfNumber } from './edit/topic-edit';
import { TopicFormSection } from './edit/topic-form-section';
import { useTopicEditForm, type EditNotice } from './edit/use-topic-edit-form';
import { DeleteTopicDialog } from './shared/delete-topic-dialog';
import { clearEditorFocus, markOpenedFromEditor, peekEditorFocus } from './shared/editor-links';
import { ImportPanelView } from './shared/import-panel';
import { pinnedColumn } from './shared/pinned-column';
import { postTopicDeleted } from './shared/topics-flash';
import { useImportPanel } from './shared/use-import-panel';

/** Route params of `content.topicEdit` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type ContentTopicEditScreenProps = ScreenParams['content.topicEdit'];

/** Space left above the ringed row when the screen scrolls to it. */
const FOCUS_SCROLL_MARGIN = 12;

/** A teacher never loads the editor's topic. */
const NO_QUERIES: readonly [] = [];

type TopicMode = 'view' | 'edit';
/** The site's long page, split as its phone mapping proposes (07 §1.3): the form, the per-number materials, the import. */
type EditSection = 'topic' | 'answers' | 'import';

/**
 * `content.topicEdit` (docs/spec/07-developer-content.md §1.3, §1.5; DEVELOPER only): title, description,
 * the numbers field that replaces the whole set (with the destructive-change preview), the theory and
 * homework files, the statements-and-answers list, the import of numbers into this topic, and «Удалить
 * тему» with its real impact.
 */
export function ContentTopicEditScreen({ topicId }: ContentTopicEditScreenProps) {
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.topics.edit;
  const s = dict.topics.submit;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const isDeveloper = user.role === 'DEVELOPER';

  // Opened by «← К теме» of a number reached through number search: the site's `/edit?number=N#topic-answers`
  // (07 §1.3, §1.4b) — the statements-and-answers section, on the page of that number, the number ringed.
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
  const focusScroll = useRef<{ sectionY: number | null; rowY: number | null; done: boolean }>({ sectionY: null, rowY: null, done: false });

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
  // The ringed number may sit below the fold of its page: once the section and the row know where they
  // are, the screen scrolls to the row — one time, never against the user's own scrolling later.
  const placeFocus = (part: 'sectionY' | 'rowY', y: number) => {
    const focus = focusScroll.current;
    if (focus.done) return;
    focus[part] = y;
    if (focus.sectionY === null || focus.rowY === null) return;
    focus.done = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, focus.sectionY + focus.rowY - FOCUS_SCROLL_MARGIN), animated: false });
  };
  const openFile = (file: ViewerFile, title: string) => navigation.openFiles([file], { title });

  const topic = data?.topic;
  const focused = topic ? findNumberEntry(topic.homeworkNumbers, focusNumber) : null;
  const shownAnswersPage = answersPage ?? (topic ? pageOfNumber(topic.homeworkNumbers, focusNumber) : null) ?? 1;
  const uploading = form.theory.uploading || form.homework.uploading;
  const formBusy = form.phase !== 'idle';

  const banners =
    topic && (notice || form.previewError || (detail.isError && !deleted)) ? (
      <View style={styles.banners}>
        {/* In the order things happened: the check that could not be made, then the outcome of the save. */}
        {form.previewError ? <Notice tone="error" text={form.previewError} testID="edit-preview-error" /> : null}
        {notice ? (
          <Notice
            tone={notice.tone}
            text={notice.text}
            onDismiss={() => setNotice(null)}
            dismissLabel={m.common.actions.close}
            testID="edit-notice"
          />
        ) : null}
        {/* The cached topic stays on screen when a refresh fails (offline): say so instead of replacing it. */}
        {detail.isError && !deleted ? (
          <Notice tone="error" text={errorText(detail.error, m.common.errors.generic)} testID="edit-refresh-error" />
        ) : null}
      </View>
    ) : null;

  const footer =
    topic && section === 'topic' ? (
      <View style={styles.footer} testID="edit-save-bar">
        {form.dirty && !formBusy ? (
          <View style={styles.unsaved}>
            <Text variant="caption" color="textMuted" style={styles.grow} testID="edit-unsaved">
              {uploading ? m.content.edit.waitUploads : m.content.edit.unsaved}
            </Text>
            <TextButton label={m.content.edit.reset} tone="muted" onPress={form.reset} style={styles.touch} testID="edit-reset" />
          </View>
        ) : null}
        <Button
          label={form.phase === 'saving' ? s.saving : form.phase === 'checking' ? s.checking : s.save}
          loading={formBusy}
          // Nothing to send while the form equals the saved topic; a running upload has no file id yet.
          disabled={!form.dirty || uploading}
          onPress={form.save}
          testID="edit-save"
        />
        {form.phase === 'saving' ? (
          <Hint>
            <Text variant="hint" testID="edit-pending-hint">
              {s.pendingHint}
            </Text>
          </Hint>
        ) : null}
      </View>
    ) : undefined;

  return (
    <Screen
      testID="content-topic-edit-screen"
      header={
        <>
          <DetailAppBar
            title={t.sectionTitle}
            subtitle={topic?.title}
            right={
              topic ? (
                <IconButton
                  icon="trash"
                  accessibilityLabel={dict.topics.deleteTopic.label}
                  disabled={formBusy}
                  onPress={() => setDeleteOpen(true)}
                  testID="edit-delete-topic"
                />
              ) : undefined
            }
          />
          {/* Pinned under the bar: the result of a save stays in view wherever the form is scrolled to. */}
          {banners}
        </>
      }
      footer={footer}
      scrollRef={scrollRef}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {topic ? (
        <View style={styles.root}>
          <Segmented<TopicMode>
            options={[
              { value: 'view', label: dict.topics.tabs.view },
              { value: 'edit', label: dict.topics.tabs.edit },
            ]}
            value="edit"
            onChange={(mode) => {
              if (mode === 'view') navigation.open({ screen: 'content.topic', topicId });
            }}
            accessibilityLabel={dict.topics.tabs.aria}
            role="tab"
            fill
            plain
            testID="edit-mode"
          />

          {/* In-page tabs like every other section switch of the app (08 §5.7 `--plain`); the ink pill is
              the style of the top-level navigation bar. */}
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
            plain
            scrollable
            testID="edit-sections"
          />

          {section === 'topic' ? <TopicFormSection topic={topic} form={form} onOpenFile={openFile} onNotice={setNotice} /> : null}

          {section === 'answers' ? (
            <View onLayout={focused ? (event) => placeFocus('sectionY', event.nativeEvent.layout.y) : undefined}>
              <AnswersSection
                numbers={topic.homeworkNumbers}
                page={shownAnswersPage}
                highlightedId={focused?.id}
                onHighlightLayout={(y) => placeFocus('rowY', y)}
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
            </View>
          ) : null}

          {section === 'import' ? (
            <View style={styles.section} testID="edit-import">
              <View style={styles.sectionHead}>
                <Text variant="sectionTitle" accessibilityRole="header">
                  {m.content.edit.importTitle}
                </Text>
                <Hint>
                  <Text variant="hint">{m.content.edit.importHint}</Text>
                </Hint>
              </View>
              <ImportPanelView state={importState} />
            </View>
          ) : null}
        </View>
      ) : failure ? (
        <LoadFailure query={detail} testID="edit-error" />
      ) : (
        <LoadingState variant="cards" accessibilityLabel={m.common.a11y.loading} testID="edit-loading" />
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
          navigation.open({ screen: 'content.topics' });
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.lg },
  banners: { ...pinnedColumn, gap: t.space.sm, paddingHorizontal: t.space.gutter, paddingVertical: t.space.md },
  section: { gap: t.space.md },
  sectionHead: { gap: t.space.xxs },
  footer: { gap: t.space.sm },
  unsaved: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  grow: { flex: 1 },
  touch: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
