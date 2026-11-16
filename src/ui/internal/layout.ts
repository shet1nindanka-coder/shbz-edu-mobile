import type { ViewStyle } from 'react-native';

/** `position: absolute` covering the parent (RN's `StyleSheet.absoluteFillObject` is gone in strict types). */
export const absoluteFill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const satisfies ViewStyle;
