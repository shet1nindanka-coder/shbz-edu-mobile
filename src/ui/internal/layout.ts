import type { ViewStyle } from 'react-native';

/** `position: absolute` covering the parent (RN's `StyleSheet.absoluteFillObject` is gone in strict types). */
export const absoluteFill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const satisfies ViewStyle;

/**
 * `supportedOrientations` for every `Modal` of the app (iOS-only prop). A modal is portrait-only by
 * default, while an iPad may hold the app in any orientation (`supportsTablet`): a sheet would then be
 * presented sideways relative to the screen under it. A modal follows whatever the app itself allows.
 */
export const MODAL_ORIENTATIONS = ['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right'] as const;
