import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme, type Theme } from '@/theme';

import { accessibilityLabelOf } from './a11y';
import { IconButton } from './icon-button';
import { Text } from './text';
import { useAnnounce, useStatusAnnouncement } from './use-announce';

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
  /**
   * What screen readers speak when the notice appears or changes. Default (prop left out): `title` and
   * `text` of an error or warning notice — a polite live region on Android, `useAnnounce` on iOS. When the
   * prop is given, the notice is NOT a live region and exactly this string is announced on both platforms
   * (`useStatusAnnouncement`), so nothing else in the notice is ever read out by itself: pass it for a
   * message in `children`, a success that must be heard, or a text with a value that changes (a countdown —
   * though a countdown belongs in a `RetryWaitLine` beside the notice); pass `null` for a silent notice.
   */
  announcement?: string | null;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

function noticeColors(tone: NoticeTone, t: Theme) {
  const c = t.colors;
  switch (tone) {
    // A soft status fill with the status text, no outline (`.box` in the status tone).
    case 'success':
      return { bg: c.greenSoft, border: 'transparent', text: c.greenText };
    case 'warning':
      return { bg: c.yellowSoft, border: 'transparent', text: c.yellowText };
    default:
      return { bg: c.redSoft, border: 'transparent', text: c.redText };
  }
}

/**
 * Inline banner: a soft panel (radius 16) in the status tone. There are no toasts: feedback lives at the top of the card it
 * concerns and stays until the state changes. Errors and warnings are announced to screen readers: a
 * polite live region on Android, `useAnnounce` on iOS (where live regions do not exist); with an
 * `announcement`, that string on both platforms and no live region.
 */
export function Notice({ tone, text, title, children, action, onDismiss, dismissLabel, announcement, testID, style }: NoticeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const colors = noticeColors(tone, theme);
  // Either the live region speaks on Android (default) or the fixed announcement does — never both, and a
  // live region never wraps a text that the owner says must not be read as it changes.
  const fixed = announcement !== undefined;
  useAnnounce(fixed ? null : tone === 'success' ? null : accessibilityLabelOf([title, text], '. '));
  useStatusAnnouncement(fixed ? announcement : null);
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={fixed ? 'none' : 'polite'}
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
    paddingVertical: t.space.md,
    paddingHorizontal: t.space.lg,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
  },
  body: { flex: 1, minWidth: 0, gap: t.space.xxs },
  action: { marginTop: t.space.xxs, alignItems: 'flex-start' },
  dismiss: { width: t.sizes.control.xs, height: t.sizes.control.xs, marginVertical: -t.space.xxs, marginRight: -t.space.sm },
}));
