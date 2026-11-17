import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import type { ActiveLessonDto, GetLessonResponse, LessonItemDto, PhotoUpload } from '@/api/types';
import { PhotoSourceSheet } from '@/components/files';
import { RetryWaitLine } from '@/components/retry-wait';
import { format, plural, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { Card, Icon, Notice, PageHeader, Text, TextButton } from '@/ui';

import { LessonItemCard } from './lesson-item-card';
import { LessonSubmitSheet } from './lesson-submit-sheet';
import { LessonSummaryBar } from './lesson-summary-bar';
import { buildLessonRows, lessonParts, type LessonRow } from './logic';
import { useLiveLesson } from './use-live-lesson';
import { usePhotoSource } from './use-photo-source';

export type LessonLiveProps = {
  data: GetLessonResponse;
  lesson: ActiveLessonDto;
  /** `serverClockOffset` of the response that carried the lesson. */
  serverOffsetMs: number;
  /** The tab is focused and the app is in the foreground. */
  live: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  /** Text of a failed re-read while the cached lesson stays on screen. */
  refreshError: string | null;
};

/**
 * The «Урок» tab during a lesson (docs/spec/03-student-homework-lesson.md §1 L2): the main part, then the
 * extra part once every main item is closed. Each card sends photos of its problem — camera first, then
 * a look at the shots before they go to the check.
 */
export function LessonLive({ data, lesson, serverOffsetMs, live, refreshing, onRefresh, refreshError }: LessonLiveProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m, locale } = useI18n();
  const t = dict.student.lessonView;
  const state = useLiveLesson(lesson, live);
  const maxPhotos = data.limits.maxPhotosPerSubmission;

  const parts = useMemo(() => lessonParts(lesson.items), [lesson.items]);
  const rows = useMemo(() => buildLessonRows(parts), [parts]);

  // The item whose photos are being taken, and the shots waiting for «Отправить на проверку».
  const [target, setTarget] = useState<LessonItemDto | null>(null);
  const [draft, setDraft] = useState<PhotoUpload[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  const onPicked = useCallback(
    (files: PhotoUpload[]) => {
      setDraft((current) => [...current, ...files].slice(0, maxPhotos));
      setPreviewOpen(true);
    },
    [maxPhotos],
  );
  const source = usePhotoSource(maxPhotos - draft.length, onPicked);
  const { clearProblem, openSheet } = source;

  const begin = (item: LessonItemDto) => {
    setTarget(item);
    setDraft([]);
    // A preview that is still marked open was never presented (iOS refuses a modal asked for while the
    // system picker is still leaving the screen, and React Native does not ask again): the cards could only
    // be pressed because it is not on screen. Drop it, so the next pick presents a fresh sheet.
    setPreviewOpen(false);
    clearProblem();
    openSheet();
  };
  const closePreview = () => {
    setPreviewOpen(false);
    setDraft([]);
    clearProblem();
  };
  const send = () => {
    if (target && draft.length > 0) state.submit(target, draft);
    closePreview();
  };

  // `previewOpen` is deliberately not part of it: the open preview is a modal that covers the cards anyway,
  // and if it failed to appear the cards must stay usable — otherwise nothing on screen could reset it.
  const submitDisabled = state.uploadingItemId !== null || !data.lessonCheckAvailable || state.limit.waiting || source.preparing;

  const header = (
    <View style={styles.header}>
      <PageHeader
        kicker={lesson.groupName ? `${dict.student.lesson.kicker} · ${lesson.groupName}` : dict.student.lesson.kicker}
        title={lesson.title}
        gap={0}
      />
      <Text variant="small" color="textMuted" testID="lesson-summary">
        {format(t.summary, { closed: parts.closedMain, total: parts.main.length })}
      </Text>
      {refreshError ? <Notice tone="error" text={refreshError} testID="lesson-refresh-error" /> : null}
      {!data.lessonCheckAvailable ? (
        <Notice tone="warning" text={dict.apiStudent.lessonSubmissions.disabled} testID="lesson-check-disabled" />
      ) : null}
      {state.pollBroken ? (
        <Notice
          tone="error"
          text={m.studentWork.check.pollBroken}
          action={<TextButton label={m.studentWork.check.pollRetry} onPress={state.retryPoll} testID="lesson-poll-retry" />}
          testID="lesson-poll-broken"
        />
      ) : null}
      {/* A cool-down locks the submit button of every card, also the ones never tried: say why once, for as
          long as it lasts — not under a card's error notice, which can be dismissed (90-addendum-1 A.3). */}
      <RetryWaitLine wait={state.limit} testID="lesson-submit-wait" />
    </View>
  );

  const renderRow = ({ item: row }: { item: LessonRow }) => {
    switch (row.kind) {
      case 'section':
        return (
          <Text variant="sectionTitle" accessibilityRole="header" style={styles.section}>
            {row.part === 'main' ? t.mainPart : t.extraPart}
          </Text>
        );
      case 'noItems':
        return (
          <Card variant="soft" dashed style={styles.row} testID="lesson-no-items">
            <Text variant="small" color="textMuted">
              {m.studentWork.lesson.noItems}
            </Text>
          </Card>
        );
      case 'extraLocked':
        return (
          <Card variant="soft" dashed style={[styles.row, styles.locked]} testID="lesson-extra-locked">
            <View style={styles.lockedTitle}>
              <Icon name="lock" size={16} color="kicker" />
              <Text variant="smallStrong" style={styles.lockedText}>
                {t.extraLocked}
              </Text>
            </View>
            <Hint>
              <Text variant="hint">{format(t.extraLockedHint, { count: plural(locale, row.remaining, t.problemForms) })}</Text>
            </Hint>
          </Card>
        );
      case 'item': {
        const item = row.item;
        const isTarget = target?.id === item.id;
        return (
          <View style={styles.row}>
            <LessonItemCard
              item={item}
              index={row.index}
              maxPhotos={maxPhotos}
              uploading={state.uploadingItemId === item.id}
              uploadPercent={state.uploadPercent}
              submitDisabled={submitDisabled}
              submitError={state.submitErrors[item.id] ?? null}
              onDismissSubmitError={() => state.dismissSubmitError(item.id)}
              pickProblem={isTarget && !previewOpen ? source.problem : null}
              onDismissPickProblem={clearProblem}
              preparing={isTarget && source.preparing && !previewOpen}
              onSubmit={begin}
            />
          </View>
        );
      }
    }
  };

  return (
    <View style={styles.fill} testID="lesson-live">
      <LessonSummaryBar
        closed={parts.closedMain}
        total={parts.main.length}
        endsAtDeviceMs={Date.parse(lesson.endsAt) - serverOffsetMs}
      />
      <FlashList
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        renderItem={renderRow}
        // Upload progress, errors and the picker state live outside the rows' own data.
        extraData={[state, source.problem, source.preparing, previewOpen, target, submitDisabled]}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              state.retryPoll();
              onRefresh();
            }}
            tintColor={theme.colors.accentSolid}
            colors={[theme.colors.accentSolid]}
            progressBackgroundColor={theme.colors.cardBg}
          />
        }
        testID="lesson-items"
      />

      <PhotoSourceSheet
        visible={source.sheetOpen}
        onClose={source.closeSheet}
        onSelect={source.select}
        title={m.studentWork.photos.sourceTitle}
      />
      <LessonSubmitSheet
        visible={previewOpen}
        number={target?.number ?? ''}
        photos={draft}
        maxPhotos={maxPhotos}
        preparing={source.preparing}
        problem={previewOpen ? source.problem : null}
        onDismissProblem={clearProblem}
        onAddFromCamera={() => source.select('camera')}
        onAddFromLibrary={() => source.select('library')}
        onRemove={(index) => setDraft((current) => current.filter((_, position) => position !== index))}
        onSend={send}
        onClose={closePreview}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  fill: { flex: 1 },
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.md, paddingBottom: t.space.xs },
  section: { paddingTop: t.space.lg, paddingBottom: t.space.md },
  row: { marginBottom: t.space.md },
  locked: { gap: t.space.xs },
  lockedTitle: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  lockedText: { flex: 1, minWidth: 0 },
}));
