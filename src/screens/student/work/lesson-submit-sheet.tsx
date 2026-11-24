import { View } from 'react-native';

import type { PhotoUpload } from '@/api/types';
import { PhotoGrid } from '@/components/files';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button } from '@/ui';

import { PickProblemNotice, type PickProblem } from './use-photo-source';

export type LessonSubmitSheetProps = {
  visible: boolean;
  /** Label of the problem the photos are for. */
  number: string;
  photos: PhotoUpload[];
  /** `limits.maxPhotosPerSubmission` (3). */
  maxPhotos: number;
  /** A picker is open or photos are being re-encoded. */
  preparing: boolean;
  problem: PickProblem | null;
  onDismissProblem: () => void;
  onAddFromCamera: () => void;
  onAddFromLibrary: () => void;
  onRemove: (index: number) => void;
  onSend: () => void;
  onClose: () => void;
};

/**
 * "Look before you send" step of a lesson submission (docs/spec/03-student-homework-lesson.md §1 L2
 * "Mobile translation", §7 Q15): the taken photos, a way to retake or add up to the limit (the add buttons
 * go away at the limit — no line explains it), and one button that sends them. On the site picking files submits at once; with a camera a blurred shot would burn one
 * of the hourly checks.
 */
export function LessonSubmitSheet({
  visible,
  number,
  photos,
  maxPhotos,
  preparing,
  problem,
  onDismissProblem,
  onAddFromCamera,
  onAddFromLibrary,
  onRemove,
  onSend,
  onClose,
}: LessonSubmitSheetProps) {
  const styles = useStyles();
  const { m } = useI18n();
  const t = m.studentWork.preview;
  const canAdd = photos.length < maxPhotos;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      closeLabel={m.common.actions.close}
      title={format(t.title, { number })}
      footer={
        // Closing the sheet (the cross, the backdrop, a swipe down) is the "cancel": nothing has been sent yet.
        <Button
          label={t.send}
          leftIcon="send"
          disabled={photos.length === 0 || preparing}
          onPress={onSend}
          fullWidth
          testID="lesson-preview-send"
        />
      }
      testID="lesson-preview"
    >
      <View style={styles.content}>
        {problem ? <PickProblemNotice problem={problem} onDismiss={onDismissProblem} /> : null}
        <PhotoGrid
          photos={photos.map((photo, index) => ({ key: `${index}-${photo.uri}`, fileId: photo.uri, name: photo.name, localUri: photo.uri }))}
          onRemove={(_photo, index) => onRemove(index)}
          testID="lesson-preview-grid"
        />
        {canAdd ? (
          <View style={styles.add}>
            <Button
              label={m.common.photos.takePhoto}
              variant="outline"
              leftIcon="camera"
              loading={preparing}
              onPress={onAddFromCamera}
              style={styles.action}
              testID="lesson-preview-camera"
            />
            <Button
              label={m.common.photos.chooseFromGallery}
              variant="outline"
              leftIcon="image"
              disabled={preparing}
              onPress={onAddFromLibrary}
              style={styles.action}
              testID="lesson-preview-library"
            />
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md, paddingBottom: t.space.md },
  add: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  // Wide enough for «Выбрать из галереи»: on a phone the two buttons stack, on a tablet they share a row.
  action: { flexGrow: 1, flexBasis: 220 },
}));
