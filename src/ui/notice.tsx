import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme, type Theme } from '@/theme';

import { IconButton } from './icon-button';
import { Text } from './text';

export type NoticeTone = 'error' | 'success' | 'warning';

export type NoticeProps = {
  tone: NoticeTone;
  /** The message. Use `children` instead for rich content. */
  text?: string;
  /** Optional bold first line. */
  title?: string;
  children?: ReactNode;
  /** Node under the message (a retry text button). */
  action?: ReactNode;
  /** Shows a close button; needs `dismissLabel`. */
  onDismiss?: () => void;
  dismissLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

function noticeColors(tone: NoticeTone, t: Theme) {
  const c = t.colors;
  switch (tone) {
    case 'success':
      // `shbz-notice-success`: fill and border are the same soft green, i.e. no visible hairline.
      return { bg: c.greenSoft, border: 'transparent', text: c.greenText };
    case 'warning':
      return { bg: c.yellowSoft, border: c.yellowBorder, text: c.yellowText };
    default:
      return { bg: c.dangerBg, border: c.dangerBorder, text: c.dangerText };
  }
}

/**
 * Inline banner (`shbz-notice-*`). The site has no toasts: feedback lives at the top of the card it
 * concerns and stays until the state changes. Errors are announced to screen readers.
 */
export function Notice({ tone, text, title, children, action, onDismiss, dismissLabel, testID, style }: NoticeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const colors = noticeColors(tone, theme);
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      testID={testID}
      style={[styles.notice, { backgroundColor: colors.bg, borderColor: colors.border }, style]}
    >
      <View style={styles.body}>
        {title ? (
          <Text variant="smallBold" style={{ color: colors.text }}>
            {title}
          </Text>
        ) : null}
        {text ? (
          <Text variant="smallMedium" style={{ color: colors.text }}>
            {text}
          </Text>
        ) : null}
        {children}
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      {onDismiss && dismissLabel ? (
        <IconButton
          icon="close"
          variant="ghost"
          accessibilityLabel={dismissLabel}
          onPress={onDismiss}
          iconSize={16}
          tint={colors.text}
          style={styles.dismiss}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.sm,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
  },
  body: { flex: 1, minWidth: 0, gap: 4 },
  action: { marginTop: 4, alignItems: 'flex-start' },
  dismiss: { width: 28, height: 28, marginVertical: -4, marginRight: -6 },
}));
