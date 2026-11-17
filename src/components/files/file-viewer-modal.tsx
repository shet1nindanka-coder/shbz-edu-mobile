// `FileViewer` in a full-screen modal, for screens that open a file in place instead of navigating to
// the `shared.fileViewer` route. Closes on the close button and on the system back gesture / Esc.
import { Modal, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { OverlayCoverSlot, WindowInsetsScope, useOverlayCovered } from '@/ui';

import { FileViewer, type FileViewerProps } from './file-viewer';

export type FileViewerModalProps = FileViewerProps & { visible: boolean };

export function FileViewerModal({ visible, onClose, ...viewer }: FileViewerModalProps) {
  // Under the lock cover the viewer stays open but the back button must not close it.
  const covered = useOverlayCovered();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      // Not portrait-only (the default): on an iPad the viewer follows the orientation of the app.
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']}
      onRequestClose={covered ? undefined : onClose}
    >
      {/* A modal is a separate native root: gestures need their own root view inside it. */}
      <GestureHandlerRootView style={styles.root}>
        {/* Its own window: the viewer pads the device insets, not those of the screen that opened it. */}
        <WindowInsetsScope>{visible ? <FileViewer {...viewer} onClose={onClose} /> : null}</WindowInsetsScope>
        {/* The app-wide cover (biometric lock) is repeated inside this window; the root one cannot reach it. */}
        <OverlayCoverSlot />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
