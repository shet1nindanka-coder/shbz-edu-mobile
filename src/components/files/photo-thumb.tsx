// One solution-photo tile: the `?thumb=1` variant of the file (docs/spec/03-student-homework-lesson.md
// §1 "Thumbnails"), an optional remove button over the corner, and the "uploading" look of
// docs/spec/08-design-system.md §5.15 (preview at 0.55 opacity with a 22 px spinner).
import { Image } from 'expo-image';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '@/i18n';
import { format } from '@/lib/i18n/format';
import { useFileService } from '@/services/files/file-service-context';
import { makeStyles } from '@/theme';
import { IconButton, PressableScale, Spinner } from '@/ui';

import { photoPlaceLabel } from './photo-label';

export const PHOTO_THUMB_SIZE = 96;

export type PhotoThumbProps = {
  /** `StoredFile` id. */
  fileId: string;
  /** Original file name: part of the accessible names of the tile. May be empty when unknown. */
  name?: string;
  /**
   * Place of the photo in its set (0-based `index` of `total`). With it every tile of a set has its own
   * spoken names — «Открыть фото 2 из 3, IMG_2042.jpg», «Удалить фото 2 из 3, IMG_2042.jpg» — instead of
   * several identical «Удалить фото» buttons. `PhotoGrid` passes it; a hand-made strip should too.
   */
  position?: { index: number; total: number };
  /** Side of the square tile in px. Default 96. */
  size?: number;
  /** Show this local picture instead of asking `FileService` (a photo that is still uploading). */
  localUri?: string;
  /** Opens the photo full screen. */
  onPress?: () => void;
  /** Shows the remove button. */
  onRemove?: () => void;
  /** Accessible name of the remove button. Default: «Удалить фото N из M, name» with `position`, else `dict.student.photos.deleteAria`. */
  removeLabel?: string;
  /** The remove request is running: the button is disabled. */
  removing?: boolean;
  uploading?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function PhotoThumb({
  fileId,
  name = '',
  position,
  size = PHOTO_THUMB_SIZE,
  localUri,
  onPress,
  onRemove,
  removeLabel,
  removing = false,
  uploading = false,
  testID,
  style,
}: PhotoThumbProps) {
  const styles = useStyles();
  const files = useFileService();
  const { dict, m } = useI18n();
  const source = localUri ? { uri: localUri } : files.source(fileId, 'thumb');
  const photos = m.common.photos;
  const openLabel = position ? photoPlaceLabel(photos.openPhotoOf, position.index, position.total, name) : format(photos.openPhoto, { name });
  const imageLabel = position ? photoPlaceLabel(photos.photoOf, position.index, position.total, name) : name;
  const removeName =
    removeLabel ?? (position ? photoPlaceLabel(photos.removePhotoOf, position.index, position.total, name) : dict.student.photos.deleteAria);

  const picture = (
    <Image
      source={source}
      contentFit="cover"
      transition={150}
      // In a recycling list the tile must not flash the previous photo.
      recyclingKey={localUri ?? fileId}
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.image, uploading || removing ? styles.dimmed : null]}
    />
  );

  return (
    <View testID={testID} style={[styles.tile, { width: size, height: size }, style]}>
      {onPress ? (
        <PressableScale
          accessibilityRole="imagebutton"
          accessibilityLabel={openLabel}
          disabled={uploading}
          onPress={onPress}
          style={styles.fill}
        >
          {picture}
        </PressableScale>
      ) : (
        <View accessible accessibilityRole="image" accessibilityLabel={imageLabel} style={styles.fill}>
          {picture}
        </View>
      )}
      {uploading ? (
        <View style={styles.overlay}>
          <Spinner size={22} accessibilityLabel={dict.student.photos.uploading} />
        </View>
      ) : null}
      {onRemove && !uploading ? (
        <IconButton
          icon="close"
          variant="dangerRaised"
          accessibilityLabel={removeName}
          disabled={removing}
          onPress={onRemove}
          style={styles.remove}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  tile: {
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  // The picture is clipped by its own rounded box, so the remove button may overhang the tile corner.
  fill: { flex: 1, borderRadius: t.radii.md - t.borders.hairline, overflow: 'hidden' },
  image: { flex: 1 },
  dimmed: { opacity: 0.55 },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  remove: { position: 'absolute', top: -8, right: -8 },
}));
