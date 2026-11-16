import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles } from '@/theme';

import { IconButton } from './icon-button';
import { Text } from './text';

export type AppBarProps = {
  /** Screen title (one line). Ignored when `left` is given. */
  title?: string;
  /** Small line under the title. */
  subtitle?: string;
  /** Replaces the title block — the logo on tab roots. */
  left?: ReactNode;
  /** Trailing controls: icon circles (search, bell, gear). */
  right?: ReactNode;
  /** Shows the back arrow; needs `backLabel`. */
  onBack?: () => void;
  backLabel?: string;
  /** Bottom hairline; default on. */
  border?: boolean;
  /** Pad the status-bar inset; default on. Switch off inside a modal sheet. */
  safeTop?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Slim top bar (`.shbz-topbar`): opaque page fill, bottom hairline, logo or title on the left, 40px icon
 * circles on the right.
 */
export function AppBar({
  title,
  subtitle,
  left,
  right,
  onBack,
  backLabel,
  border = true,
  safeTop = true,
  testID,
  style,
}: AppBarProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[styles.bar, border ? styles.border : null, { paddingTop: safeTop ? insets.top : 0 }, style]}
    >
      <View style={styles.row}>
        {onBack && backLabel ? (
          <IconButton icon="back" variant="ghost" accessibilityLabel={backLabel} onPress={onBack} style={styles.backButton} />
        ) : null}
        <View style={styles.left}>
          {left ?? (
            <>
              {title ? (
                <Text variant="cardTitle" numberOfLines={1} accessibilityRole="header">
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text variant="caption" color="textSoft" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </>
          )}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: { backgroundColor: t.colors.pageBg },
  border: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.headerBorder },
  row: {
    minHeight: t.sizes.appBar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingHorizontal: t.space.gutter,
    paddingVertical: 8,
  },
  backButton: { marginLeft: -8 },
  left: { flex: 1, minWidth: 0, justifyContent: 'center', alignItems: 'flex-start' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
