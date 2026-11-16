import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { View, type ScrollViewInstance } from 'react-native';

import { isNotFoundError, qk, useApi } from '@/api';
import type { ImportTarget } from '@/api/types';
import type { ViewerFile } from '@/components/files';
import { useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { Hint, useCurrentUser } from '@/providers';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { makeStyles } from '@/theme';
import { Button, IconButton, LoadingState, Notice, Screen, Segmented, Tabs, Text, TextButton } from '@/ui';

import { AnswersSection } from './edit/answers-section';
import { NumbersConfirmDialog } from './edit/numbers-confirm-dialog';
import { TopicFormSection } from './edit/topic-form-section';
import { useTopicEditForm, type EditNotice } from './edit/use-topic-edit-form';
import { DeleteTopicDialog } from './shared/delete-topic-dialog';
import { errorText } from './shared/error-text';
import { ImportPanelView } from './shared/import-panel';
import { LoadFailure, loadFailureOf } from './shared/load-failure';
import { postTopicsFlash } from './shared/topics-flash';
import { useImportPanel } from './shared/use-import-panel';

/** Route params of `content.topicEdit` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type ContentTopicEditScreenProps = ScreenParams['content.topicEdit'];

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

  const [section, setSection] = useState<EditSection>('topic');
  const [notice, setNotice] = useState<EditNotice | null>(null);
  const [answersPage, setAnswersPage] = useState(1);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Deleted from this screen: it is on its way out, so the 404 of the last refetch is not news.
  const [deleted, setDeleted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const detail = useQuery({
    queryKey: qk('content', 'getTopic', topicId),
    queryFn: () => api.content.getTopic(topicId),
    enabled: isDeveloper,
  });
  const data = detail.data;
  const failure = loadFailureOf(detail);

  // Both keep their state while another section is shown (typed text, picked files, a loaded JSON).
  const form = useTopicEditForm({ topicId, detail: data, onNotice: setNotice });
  const importTarget = useMemo<ImportTarget>(() => ({ topicId }), [topicId]);
  const importState = useImportPanel({ target: importTarget });

  // The edit screen is the developer's (07 §0.2); and a topic deleted elsewhere has nothing left to edit —
  // the cached copy must not stay editable.
  if (!isDeveloper || (!deleted && isNotFoundError(detail.error))) return <NotFoundScreen />;

  const refresh = () => {
    setRefreshing(true);
    void detail.refetch().finally(() => setRefreshing(false));
  };
  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: false });
  const openFile = (file: ViewerFile, title: string) => navigation.openFiles([file], { title });

  const topic = data?.topic;
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

          <Tabs<EditSection>
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
            fill
            testID="edit-sections"
          />

          {section === 'topic' ? <TopicFormSection topic={topic} form={form} onOpenFile={openFile} onNotice={setNotice} /> : null}

          {section === 'answers' ? (
            <AnswersSection
              numbers={topic.homeworkNumbers}
              page={answersPage}
              onPageChange={(page) => {
                setAnswersPage(page);
                scrollToTop();
              }}
              onOpenNumber={(entry) => navigation.push({ screen: 'content.number', topicId, number: entry.number })}
            />
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
        <LoadFailure error={failure.error} onRetry={() => void detail.refetch()} retrying={detail.isFetching && !detail.isPaused} testID="edit-error" />
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
          postTopicsFlash('deleted');
          navigation.open({ screen: 'content.topics' });
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.lg },
  banners: { gap: t.space.sm, paddingHorizontal: t.space.gutter, paddingVertical: t.space.md },
  section: { gap: t.space.md },
  sectionHead: { gap: t.space.xxs },
  footer: { gap: t.space.sm },
  unsaved: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  grow: { flex: 1 },
  touch: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
