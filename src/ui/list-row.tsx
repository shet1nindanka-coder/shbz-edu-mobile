import type { ReactNode } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon } from './icon';
import { PressableScale } from './internal/pressable-scale';
import { Text } from './text';

export type ListRowProps = {
  title: string;
  /** Second line (13, muted): one caption per row. */
  subtitle?: string;
  /** `attention` draws the caption in the status red: something is overdue or needs help. Default `muted`. */
  subtitleTone?: 'muted' | 'attention';
  /** Short trailing text (13, muted, tabular): a neutral fact such as «37 из 50». */
  meta?: string;
  /** Node before the texts (avatar, icon tile, unread dot). */
  left?: ReactNode;
  /** Node after the texts; replaces `meta` and the chevron. At most ONE element on the right of a row. */
  right?: ReactNode;
  /** Trailing chevron: only for navigation rows of a menu (settings, «ещё»). Default off — the whole row is pressed. */
  chevron?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  /** Bottom hairline (`rowBorder`). Switch it off on the last row. */
  divider?: boolean;
  /** Horizontal padding; default = the card padding (16, 24 on a tablet). Pass 0 for rows inside an already padded card. */
  inset?: number;
  /** Bold title (unread notification). */
  emphasized?: boolean;
  titleLines?: number;
  subtitleLines?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * List row (`.row`): at least 60 high — a title (15 / 600), one caption (13, muted) and at most one element
 * on the right. The whole row is pressed (it dims); there are no «Открыть» buttons in rows.
 */
export function ListRow({
  title,
  subtitle,
  subtitleTone = 'muted',
  meta,
  left,
  right,
  chevron,
  onPress,
  divider = true,
  inset,
  emphasized = false,
  titleLines = 1,
  subtitleLines = 1,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ListRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const showChevron = chevron ?? false;
  const content = (
    <>
      {left}
      <View style={styles.texts}>
        <Text variant={emphasized ? 'bodyBold' : 'bodyStrong'} numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color={subtitleTone === 'attention' ? 'redText' : 'textMuted'} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ??
        (meta ? (
          <Text variant="small" color="textMuted" tabular numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
        ) : null)}
      {showChevron ? <Icon name="chevronRight" size={20} color="textMuted" /> : null}
    </>
  );
  const rowStyle: StyleProp<ViewStyle> = [
    styles.row,
    { paddingHorizontal: inset ?? theme.space.card },
    divider ? styles.divider : null,
    disabled ? styles.disabled : null,
    style,
  ];

  if (!onPress) {
    return (
      <View accessibilityLabel={accessibilityLabel} testID={testID} style={rowStyle}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={1}
      testID={testID}
      style={rowStyle}
      pressedStyle={styles.pressed}
    >
      {content}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    minHeight: t.sizes.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: t.space.sm,
  },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  pressed: { opacity: 0.6 },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexShrink: 0, maxWidth: '45%' },
  disabled: { opacity: 0.5 },
}));
