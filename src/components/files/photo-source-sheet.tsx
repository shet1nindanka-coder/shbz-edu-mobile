// "Add a photo" action sheet: camera or gallery (docs/spec/03-student-homework-lesson.md — "the add tile
// opens an action sheet Camera / Photo library"). The caller runs the picker of its choice.
import { useI18n } from '@/i18n';
import { BottomSheet, Icon, ListRow } from '@/ui';

export type PhotoSource = 'camera' | 'library';

export type PhotoSourceSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The sheet closes itself first; start the picker from here. */
  onSelect: (source: PhotoSource) => void;
  /** Sheet title. Default `m.common.photos.add`. */
  title?: string;
};

export function PhotoSourceSheet({ visible, onClose, onSelect, title }: PhotoSourceSheetProps) {
  const { m } = useI18n();
  const choose = (source: PhotoSource) => {
    onClose();
    onSelect(source);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={m.common.actions.close} title={title ?? m.common.photos.add}>
      <ListRow
        title={m.common.photos.takePhoto}
        left={<Icon name="camera" size={20} color="kicker" />}
        onPress={() => choose('camera')}
        testID="photo-source-camera"
      />
      <ListRow
        title={m.common.photos.chooseFromGallery}
        left={<Icon name="image" size={20} color="kicker" />}
        divider={false}
        onPress={() => choose('library')}
        testID="photo-source-library"
      />
    </BottomSheet>
  );
}
