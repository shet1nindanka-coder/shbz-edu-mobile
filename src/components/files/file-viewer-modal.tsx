// `FileViewer` in a full-screen modal, for screens that open a file in place instead of navigating to
// the `shared.fileViewer` route. Closes on the close button and on the system back gesture / Esc.
import { Modal, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { OverlayCoverSlot, WindowInsetsScope, coveredAccessibilityProps, useCloseOnBlur, useOverlayCovered } from '@/ui';

import { FileViewer, type FileViewerProps } from './file-viewer';

export type FileViewerModalProps = FileViewerProps & { visible: boolean };

export function FileViewerModal({ visible, onClose, ...viewer }: FileViewerModalProps) {
  // Under the lock cover the viewer stays open but the back button must not close it.
  const covered = useOverlayCovered();
  // A full-screen window of its own: leaving the screen that opened it closes it (`useCloseOnBlur`).
  useCloseOnBlur(visible, onClose);
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
        {/* Under the cover the viewer leaves the accessibility tree; only the slot below stays reachable. */}
        <View style={styles.root} {...coveredAccessibilityProps(covered)}>
          <WindowInsetsScope>{visible ? <FileViewer {...viewer} onClose={onClose} /> : null}</WindowInsetsScope>
        </View>
        {/* The app-wide cover (biometric lock) is repeated inside this window; the root one cannot reach it. */}
        <OverlayCoverSlot />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
