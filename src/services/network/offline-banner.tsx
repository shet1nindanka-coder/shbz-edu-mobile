import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Icon, Text, WindowFrameProvider } from '@/ui';

import { useIsOnline } from './network-state';

export type OfflineBannerHostProps = { children: ReactNode };

/**
 * Wraps the navigator: while the device is offline a slim strip sits above everything and says that saved
 * data is shown. The strip takes the status-bar inset itself and hands the tree below a zero top inset,
 * so app bars do not pad it a second time.
 *
 * Two things below still need the real geometry and get it through `WindowFrameProvider`: content drawn in
 * a native window of its own (sheets, the file viewer, iOS modal routes — they start at the top of the
 * screen, above the strip) reads the device insets, and `Screen` shifts its keyboard avoidance by the
 * height of the strip.
 */
export function OfflineBannerHost({ children }: OfflineBannerHostProps) {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { m } = useI18n();
  const [stripHeight, setStripHeight] = useState(0);

  // The tree shape is the same online and offline: toggling the strip must never remount the navigator.
  return (
    <View style={styles.root}>
      {online ? null : (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${m.common.offline.banner}. ${m.common.offline.bannerHint}`}
          testID="offline-banner"
          onLayout={(event) => setStripHeight(event.nativeEvent.layout.height)}
          style={[styles.strip, { paddingTop: insets.top + 6 }]}
        >
          <Icon name="wifiOff" size={14} color="yellowText" />
          <Text variant="captionStrong" color="yellowText" numberOfLines={1} style={styles.text}>
            {m.common.offline.banner}
          </Text>
        </View>
      )}
      <WindowFrameProvider insets={insets} contentTop={online ? 0 : stripHeight}>
        <SafeAreaInsetsContext.Provider value={online ? insets : { ...insets, top: 0 }}>
          <View style={styles.content}>{children}</View>
        </SafeAreaInsetsContext.Provider>
      </WindowFrameProvider>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.pageBg },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    paddingBottom: 6,
    paddingHorizontal: t.space.gutter,
    backgroundColor: t.colors.yellowSoft,
    borderBottomWidth: t.borders.hairline,
    borderBottomColor: t.colors.yellowBorder,
  },
  text: { flexShrink: 1 },
  content: { flex: 1 },
}));
