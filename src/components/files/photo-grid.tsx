// Grid of solution photos with an optional "add" tile — the phone form of the site's dropzone + thumbnail
// strip (docs/spec/03-student-homework-lesson.md §1, docs/spec/08-design-system.md §5.15: drag-and-drop
// does not exist on a phone, the tile is a tap target that opens camera / gallery).
import { useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Icon, PressableScale, Spinner, Text } from '@/ui';

import { photoGridPositions } from './photo-label';
import { PhotoThumb } from './photo-thumb';

export type PhotoGridItem = {
  /** Unique key of the tile: the photo row id, or a temporary id for a photo being uploaded. */
  key: string;
  /** `StoredFile` id. */
  fileId: string;
  name: string;
  /** Local picture shown while (or instead of) the stored one. */
  localUri?: string;
  uploading?: boolean;
};

export type PhotoGridProps = {
  photos: PhotoGridItem[];
  /** Tiles per row. Default 3. */
  columns?: number;
  /** Opens photo `index` full screen. */
  onOpen?: (index: number) => void;
  /** Shows a remove button on every tile. */
  onRemove?: (photo: PhotoGridItem, index: number) => void;
  /** Key of the photo whose removal is in flight. */
  removingKey?: string | null;
  /** Shows the "add" tile after the photos. */
  onAdd?: () => void;
  /** Text of the add tile. Default `m.common.photos.add`. */
  addLabel?: string;
  /** The add tile is visible but inert (limit reached, upload running). */
  addDisabled?: boolean;
  /** The add tile shows a spinner instead of the plus (photos are being prepared or uploaded). */
  addBusy?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const GAP = 10;

export function PhotoGrid({
  photos,
  columns = 3,
  onOpen,
  onRemove,
  removingKey = null,
  onAdd,
  addLabel,
  addDisabled = false,
  addBusy = false,
  testID,
  style,
}: PhotoGridProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { m } = useI18n();
  const [width, setWidth] = useState(0);
  // Whole pixels: a fractional tile makes the last one of a row wrap on some densities.
  const tile = width > 0 ? Math.floor((width - GAP * (columns - 1)) / columns) : 0;

  const positions = photoGridPositions(photos);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  return (
    <View onLayout={onLayout} testID={testID} style={[styles.grid, style]}>
      {tile > 0
        ? photos.map((photo, index) => (
            <PhotoThumb
              key={photo.key}
              fileId={photo.fileId}
              name={photo.name}
              // Each tile names its place in the set: three photos are not three identical «Удалить фото».
              // Photos still uploading are not counted (`photoGridPositions`).
              position={positions[index]}
              size={tile}
              localUri={photo.localUri}
              uploading={photo.uploading}
              removing={removingKey === photo.key}
              onPress={onOpen ? () => onOpen(index) : undefined}
              onRemove={onRemove ? () => onRemove(photo, index) : undefined}
            />
          ))
        : null}
      {tile > 0 && onAdd ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? m.common.photos.add}
          accessibilityState={{ disabled: addDisabled, busy: addBusy }}
          disabled={addDisabled || addBusy}
          onPress={onAdd}
          pressedStyle={{ borderColor: theme.colors.accentSolid }}
          style={[styles.add, { width: tile, height: tile }, addDisabled ? styles.addDisabled : null]}
        >
          <View style={styles.addIcon}>
            {addBusy ? <Spinner size={18} /> : <Icon name="plus" size={20} color="greenText" />}
          </View>
          <Text variant="captionStrong" color="label" align="center" numberOfLines={2}>
            {addLabel ?? m.common.photos.add}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // The top padding leaves room for the remove buttons that overhang the first row.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingTop: 8, alignSelf: 'stretch' },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    paddingHorizontal: t.space.xs,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
    borderStyle: 'dashed',
    borderColor: t.colors.inputBorder,
    backgroundColor: t.colors.dropzoneBg,
  },
  addDisabled: { opacity: 0.5 },
  addIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.md,
    backgroundColor: t.colors.greenSoft,
  },
}));
