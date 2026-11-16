// `FileViewer` in a full-screen modal, for screens that open a file in place instead of navigating to
// the `shared.fileViewer` route. Closes on the close button and on the system back gesture / Esc.
import { Modal, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { FileViewer, type FileViewerProps } from './file-viewer';

export type FileViewerModalProps = FileViewerProps & { visible: boolean };

export function FileViewerModal({ visible, onClose, ...viewer }: FileViewerModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* A modal is a separate native root: gestures need their own root view inside it. */}
      <GestureHandlerRootView style={styles.root}>
        {visible ? <FileViewer {...viewer} onClose={onClose} /> : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
