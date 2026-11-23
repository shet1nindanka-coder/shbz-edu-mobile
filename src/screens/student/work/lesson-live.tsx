import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { ActiveLessonDto, GetLessonResponse, LessonItemDto, PhotoUpload } from '@/api/types';
import { PhotoSourceSheet } from '@/components/files';
import { RetryWaitLine } from '@/components/retry-wait';
import { format, plural, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Card, Icon, Notice, NumberTile, Text, TextButton } from '@/ui';

import { LessonItemCard } from './lesson-item-card';
import { LessonSubmitSheet } from './lesson-submit-sheet';
import { LessonTimeLeft } from './lesson-summary-bar';
import { lessonParts, lessonTileStatus, pickLessonItemId, visibleLessonItems } from './logic';
import { useLiveLesson } from './use-live-lesson';
import { usePhotoSource } from './use-photo-source';

export type LessonLiveProps = {
  data: GetLessonResponse;
  lesson: ActiveLessonDto;
  /** `serverClockOffset` of the response that carried the lesson. */
  serverOffsetMs: number;
  /** The tab is focused and the app is in the foreground. */
  live: boolean;
  /** Text of a failed re-read while the cached lesson stays on screen. */
  refreshError: string | null;
};

/**
 * The «Урок» tab during a lesson (docs/spec/03-student-homework-lesson.md §1 L2; layout: docs/design/
 * glass-over-paper.md §8): a strip of the lesson's numbers — the main part, then the extra part once every
 * main item is closed — and ONE card, of the current number, with its statement, the check's remark and
 * the main action «Сдать решение» (camera first, then a look at the shots before they go to the check).
 * The tiles are coloured by the outcome; a student only chooses which number to look at.
 */
export function LessonLive({ data, lesson, serverOffsetMs, live, refreshError }: LessonLiveProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.student.lessonView;
  const state = useLiveLesson(lesson, live);
  const maxPhotos = data.limits.maxPhotosPerSubmission;

  const parts = useMemo(() => lessonParts(lesson.items), [lesson.items]);
  const items = useMemo(() => visibleLessonItems(parts), [parts]);
  // The number whose card is shown; null = let the screen choose (the first that can be submitted).
  const [pickedId, setPickedId] = useState<string | null>(null);
  const currentId = pickLessonItemId(items, pickedId);
  const current = items.find((item) => item.id === currentId) ?? null;
  const currentIndex = current ? (current.isExtra ? parts.extra : parts.main).indexOf(current) + 1 : 0;

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

  const isTarget = current !== null && target?.id === current.id;

  return (
    <View style={styles.root} testID="lesson-live">
      <Text variant="kicker" color="textMuted" style={styles.summary} testID="lesson-summary">
        {format(m.studentWork.lesson.closedOf, { closed: parts.closedMain, total: parts.main.length })}
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
      {/* A cool-down locks the submit button of every number, also the ones never tried: say why once, for
          as long as it lasts — not under a card's error notice, which can be dismissed (90-addendum-1 A.3). */}
      <RetryWaitLine wait={state.limit} testID="lesson-submit-wait" />

      {items.length === 0 ? (
        <Card dashed testID="lesson-no-items">
          <Text variant="small" color="textMuted">
            {m.studentWork.lesson.noItems}
          </Text>
        </Card>
      ) : (
        // One row, scrolled sideways; the screen gutter is cancelled so the tiles run to the edges.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripContent} testID="lesson-items">
          {items.map((item) => (
            <NumberTile
              key={item.id}
              label={item.number}
              status={lessonTileStatus(item)}
              current={item.id === currentId}
              onPress={() => setPickedId(item.id)}
              testID={`lesson-tile-${item.number}`}
            />
          ))}
        </ScrollView>
      )}

      {current ? (
        <LessonItemCard
          // Another number must not carry this one's notices.
          key={current.id}
          item={current}
          index={currentIndex}
          maxPhotos={maxPhotos}
          uploading={state.uploadingItemId === current.id}
          uploadPercent={state.uploadPercent}
          submitDisabled={submitDisabled}
          submitError={state.submitErrors[current.id] ?? null}
          onDismissSubmitError={() => state.dismissSubmitError(current.id)}
          pickProblem={isTarget && !previewOpen ? source.problem : null}
          onDismissPickProblem={clearProblem}
          preparing={isTarget && source.preparing && !previewOpen}
          onSubmit={begin}
          aside={<LessonTimeLeft endsAtDeviceMs={Date.parse(lesson.endsAt) - serverOffsetMs} />}
        />
      ) : null}

      {parts.extra.length > 0 && !parts.extraUnlocked ? (
        <View style={styles.locked} testID="lesson-extra-locked">
          <Icon name="lock" size={16} color="textMuted" />
          <View style={styles.lockedTexts}>
            <Text variant="small" color="textMuted">
              {t.extraLocked}
            </Text>
            <Hint>
              <Text variant="hint">{format(t.extraLockedHint, { count: plural(locale, parts.remainingMain, t.problemForms) })}</Text>
            </Hint>
          </View>
        </View>
      ) : null}

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
  root: { gap: t.space.block },
  summary: { paddingHorizontal: t.space.xxs },
  strip: { marginHorizontal: -t.space.gutter, flexGrow: 0 },
  stripContent: { gap: t.space.sm, paddingHorizontal: t.space.gutter },
  locked: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm, paddingHorizontal: t.space.xxs },
  lockedTexts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
