import type { ViewStyle } from 'react-native';

/**
 * Banners pinned under the app bar sit outside the `Screen` primitive's scroll column; on a wide window
 * (tablet, web) they take the same centred column as the content below them (`Screen`'s default
 * `maxWidth`), instead of spanning the whole width.
 */
export const pinnedColumn: ViewStyle = { width: '100%', maxWidth: 720, alignSelf: 'center' };
