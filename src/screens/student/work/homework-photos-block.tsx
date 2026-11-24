import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText, hasErrorCode, qk, useApi } from '@/api';
import type { AttachedPhoto, GetHomeworkResponse, PhotoUpload } from '@/api/types';
import { PhotoGrid, PhotoSourceSheet, photoPlaceLabel, type PhotoGridItem } from '@/components/files';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { makeStyles } from '@/theme';
import { Dialog, Notice, ProgressBar, Text, useEventAnnouncement } from '@/ui';

import { applyDeletedPhoto, applyUploadedPhotos, freePhotoSlots } from './logic';
import { mergeLocalWrite } from './merge-local-write';
import { PickProblemNotice, usePhotoSource } from './use-photo-source';

/** How long the "photos added" confirmation stays (the site's `SUCCESS_HOLD_MS`). */
const SUCCESS_HOLD_MS = 900;

type PendingPhoto = { key: string; uri: string; name: string };

export type HomeworkPhotosBlockProps = {
  assignmentId: string;
  /** Current batch, oldest first. */
  photos: AttachedPhoto[];
  /** `limits.maxPhotosPerAssignment`. */
  maxPhotos: number;
  /** The homework is gone (`404 homeworkNotFound`): the screen leaves. */
  onGone: () => void;
};

/**
 * «Фото решений» — the photo batch of a homework (docs/spec/03-student-homework-lesson.md §1 H2.a, H4):
 * a grid of thumbnails with an "add" tile (camera first, then the gallery), the counter «3/10», the real
 * upload percentage, and a confirmation before a photo is deleted. No instructions under the grid. All photos of one upload are stored or none.
 */
export function HomeworkPhotosBlock({ assignmentId, photos, maxPhotos, onGone }: HomeworkPhotosBlockProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const { dict, m } = useI18n();
  const t = dict.student.photos;
  const confirm = dict.topics.widgets.confirm;
  const detailKey = qk('studentWork', 'getHomework', assignmentId);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [added, setAdded] = useState(false);
  const [deleting, setDeleting] = useState<AttachedPhoto | null>(null);
  // Upload and delete share one per-user bucket (60 / 60 s).
  const limit = useRetryWait();
  // «Фото добавлено» is spoken only on this screen; an upload that ends while another tab is in front is
  // spoken when the student comes back.
  const announce = useEventAnnouncement();

  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    },
    [],
  );

  const afterListChange = () => void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'listHomeworks') });

  const upload = useMutation({
    mutationFn: (files: PhotoUpload[]) =>
      api.studentWork.uploadHomeworkPhotos(assignmentId, files, { onProgress: (percent) => setProgress(percent) }),
    onMutate: (files) => {
      setError(null);
      setAdded(false);
      setProgress(0);
      setPending(files.map((file, index) => ({ key: `pending-${index}-${file.uri}`, uri: file.uri, name: file.name })));
    },
    onSuccess: (result) => {
      mergeLocalWrite<GetHomeworkResponse>(queryClient, detailKey, (detail) =>
        applyUploadedPhotos(detail, result.photos, result.photosCount),
      );
      afterListChange();
      setAdded(true);
      announce(m.studentWork.photos.added);
      if (addedTimer.current) clearTimeout(addedTimer.current);
      addedTimer.current = setTimeout(() => setAdded(false), SUCCESS_HOLD_MS);
    },
    onError: (failure) => {
      if (hasErrorCode(failure, 'homeworkNotFound')) return onGone();
      setError(errorText(failure, t.uploadFailed));
      limit.note(failure);
      // The batch on the server is not what the screen shows (limit reached elsewhere, a racing request).
      if (hasErrorCode(failure, 'photoLimit', 'concurrentChange')) void queryClient.invalidateQueries({ queryKey: detailKey });
    },
    onSettled: () => {
      setPending([]);
      setProgress(null);
    },
  });

  const remove = useMutation({
    mutationFn: (photo: AttachedPhoto) => api.studentWork.deleteHomeworkPhoto(assignmentId, photo.id),
    onMutate: () => setError(null),
    onSuccess: (result, photo) => {
      mergeLocalWrite<GetHomeworkResponse>(queryClient, detailKey, (detail) =>
        applyDeletedPhoto(detail, photo.id, result.photosCount),
      );
      afterListChange();
    },
    onError: (failure) => {
      setError(errorText(failure, t.deleteFailed));
      limit.note(failure);
      // The photo is already gone (deleted on another device, consumed by a finished check).
      if (hasErrorCode(failure, 'photoNotFound')) void queryClient.invalidateQueries({ queryKey: detailKey });
    },
    // On an error the dialog closes too and the notice of the block carries the message (03 §1 H4).
    onSettled: () => setDeleting(null),
  });

  const uploading = upload.isPending;
  const free = freePhotoSlots(maxPhotos, photos.length);
  const atLimit = free === 0;
  const { mutate: startUpload } = upload;
  const onPicked = useCallback((files: PhotoUpload[]) => startUpload(files), [startUpload]);
  const source = usePhotoSource(free, onPicked);

  const items: PhotoGridItem[] = [
    ...photos.map((photo) => ({ key: photo.id, fileId: photo.fileId, name: photo.originalName })),
    ...pending.map((photo) => ({ key: photo.key, fileId: photo.key, name: photo.name, localUri: photo.uri, uploading: true })),
  ];

  const openPhoto = (index: number) => {
    if (index >= photos.length) return;
    navigation.openFiles(
      photos.map((photo) => ({ id: photo.fileId, originalName: photo.originalName, mimeType: photo.mimeType })),
      { initialIndex: index, title: dict.student.photos.title },
    );
  };

  const counter = format(m.common.numbers.doneOf, { done: photos.length, total: maxPhotos });

  // The dialog names the photo («Фото 2 из 3, IMG_2.jpg»): its place is looked up by id in the current
  // batch, so a batch that changed while the dialog is open still names the right one.
  const deletingIndex = deleting ? photos.findIndex((photo) => photo.id === deleting.id) : -1;
  const deleteDescription =
    deleting && deletingIndex >= 0
      ? `${t.deleteDescription} ${photoPlaceLabel(m.common.photos.photoOf, deletingIndex, photos.length, deleting.originalName)}`
      : t.deleteDescription;

  return (
    <View style={styles.block} testID="homework-photos">
      <View style={styles.head}>
        <Text variant="bodyBold" accessibilityRole="header" style={styles.titles}>
          {t.title}
        </Text>
        {/* A neutral fact: plain grey text, not a chip. */}
        <Text
          variant="small"
          color="textMuted"
          tabular
          accessibilityLabel={format(m.studentWork.photos.counterA11y, { count: photos.length, max: maxPhotos })}
        >
          {counter}
        </Text>
      </View>

      {error ? (
        <Notice tone="error" text={error} onDismiss={() => setError(null)} dismissLabel={m.common.actions.close} testID="homework-photos-error" />
      ) : null}
      {source.problem ? (
        <PickProblemNotice problem={source.problem} onDismiss={source.clearProblem} testID="homework-photos-pick-problem" />
      ) : null}

      <PhotoGrid
        photos={items}
        onOpen={openPhoto}
        onRemove={(item) => {
          const photo = photos.find((candidate) => candidate.id === item.key);
          if (photo) setDeleting(photo);
        }}
        removingKey={remove.isPending ? (deleting?.id ?? null) : null}
        onAdd={source.openSheet}
        // The tile carries the state, like the site's dropzone title: uploading → "added" for a moment → idle.
        addLabel={
          uploading ? t.uploading : source.preparing ? m.common.photos.preparing : added ? m.studentWork.photos.added : undefined
        }
        addDisabled={atLimit || limit.waiting}
        addBusy={uploading || source.preparing}
        testID="homework-photos-grid"
      />
      {/* Why the add tile is off, for as long as it is — not inside the dismissible notice (90-addendum-1 A.3). */}
      <RetryWaitLine wait={limit} testID="homework-photos-wait" />

      {progress !== null ? (
        <ProgressBar
          value={progress}
          transition="linear"
          accessibilityLabel={format(m.studentWork.photos.uploadProgressA11y, { percent: progress })}
        />
      ) : null}

      {atLimit ? (
        // The limit is said when it is reached: it is why the add tile is switched off.
        <Text variant="small" color="textMuted" testID="homework-photos-limit">
          {format(t.limitReached, { max: maxPhotos })}
        </Text>
      ) : null}

      <PhotoSourceSheet
        visible={source.sheetOpen}
        onClose={source.closeSheet}
        onSelect={source.select}
        title={m.common.photos.add}
      />

      <Dialog
        visible={deleting !== null}
        kicker={confirm.kicker}
        title={t.deleteTitle}
        description={deleteDescription}
        confirmLabel={confirm.confirm}
        pendingLabel={confirm.pending}
        cancelLabel={confirm.cancel}
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
        onCancel={() => setDeleting(null)}
        testID="homework-photo-delete"
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  titles: { flex: 1, minWidth: 0 },
}));
