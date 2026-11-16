import type { ReactNode } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { Icon } from './icon';
import { PressableScale } from './internal/pressable-scale';
import { Text } from './text';

export type ListRowProps = {
  title: string;
  /** Second line (12.5, muted). */
  subtitle?: string;
  /** Short trailing text before the chevron (13/600, muted). */
  meta?: string;
  /** Node before the texts (avatar, icon tile, unread dot). */
  left?: ReactNode;
  /** Node after the texts; replaces `meta` and the chevron. */
  right?: ReactNode;
  /** Trailing chevron; default is on when the row is pressable and has no `right`. */
  chevron?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  /** Bottom hairline (`rowBorder`). Switch it off on the last row. */
  divider?: boolean;
  /** Horizontal padding; default 16. Pass 0 for rows inside an already padded card. */
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

/** List row: at least 44 high, soft fill while pressed, hairline separator. */
export function ListRow({
  title,
  subtitle,
  meta,
  left,
  right,
  chevron,
  onPress,
  divider = true,
  inset = 16,
  emphasized = false,
  titleLines = 1,
  subtitleLines = 2,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ListRowProps) {
  const styles = useStyles();
  const showChevron = chevron ?? (Boolean(onPress) && !right);
  const content = (
    <>
      {left}
      <View style={styles.texts}>
        <Text variant={emphasized ? 'smallExtra' : 'smallStrong'} numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="hint" color="textMuted" numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ??
        (meta ? (
          <Text variant="meta" numberOfLines={1} style={styles.meta}>
            {meta}
          </Text>
        ) : null)}
      {showChevron ? <Icon name="chevronRight" size={16} color="kicker" /> : null}
    </>
  );
  const rowStyle: StyleProp<ViewStyle> = [
    styles.row,
    { paddingHorizontal: inset },
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
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: 12,
  },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  pressed: { backgroundColor: t.colors.softBg },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  meta: { flexShrink: 0, maxWidth: '45%' },
  disabled: { opacity: 0.5 },
}));
