import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useTheme } from '@/theme';

import { Icon } from './icon';
import { PressableScale } from './internal/pressable-scale';
import { Text } from './text';

export type ScreenHeaderProps = {
  /** Screen title: 24 on a phone, 34 on a tablet. */
  title?: string;
  /** Replaces the title text (a logo). */
  titleNode?: ReactNode;
  /** One muted line under the title (13): «11А · осталось 52 минуты». */
  subtitle?: string;
  /**
   * The link above the title: «‹ Домашние задания» — where "back" leads. `accessibilityLabel` is what a
   * screen reader says («Вернуться назад»).
   */
  back?: { label: string; onPress: () => void; accessibilityLabel?: string };
  /** Round buttons on the right: search, bell, avatar. */
  actions?: ReactNode;
  /**
   * Screen controls that belong to the header: a segmented switch, the main button. On a tablet they sit in
   * the header row between the title and the round buttons; on a phone they take a row of their own under it.
   */
  aside?: ReactNode;
  /** Pad the status-bar inset; default on. Switch off inside a sheet. */
  safeTop?: boolean;
  /** Horizontal gutter; default on. Switch off when the parent already pads. */
  padded?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The header of every screen (`.hd`): the title on the left — with the "back" link above it on a pushed
 * screen — and the round glass buttons on the right. There is no bar: the header sits on the page, over
 * the glow, and scrolls with the content.
 */
export function ScreenHeader({
  title,
  titleNode,
  subtitle,
  back,
  actions,
  aside,
  safeTop = true,
  padded = true,
  testID,
  style,
}: ScreenHeaderProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const top = (safeTop ? insets.top : 0) + (theme.tablet ? theme.space.xl : theme.space.md);
  return (
    <View
      testID={testID}
      style={[styles.header, padded ? styles.padded : null, { paddingTop: top }, style]}
    >
      <View style={styles.row}>
        <View style={styles.titles}>
          {back ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={back.accessibilityLabel ?? back.label}
              onPress={back.onPress}
              scaleTo={1}
              hitSlop={{ top: 14, bottom: 8, left: 8, right: 16 }}
              pressedStyle={styles.pressed}
              testID={testID ? `${testID}-back` : undefined}
              style={styles.back}
            >
              <Icon name="chevronLeft" size={16} color="textMuted" />
              <Text variant="link" color="textMuted" numberOfLines={1} style={styles.backLabel}>
                {back.label}
              </Text>
            </PressableScale>
          ) : null}
          {titleNode ??
            (title ? (
              <Text variant="pageTitle" accessibilityRole="header" numberOfLines={2}>
                {title}
              </Text>
            ) : null)}
          {subtitle ? (
            <Text variant="small" color="textMuted" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {theme.tablet && aside ? <View style={styles.asideInline}>{aside}</View> : null}
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {!theme.tablet && aside ? <View style={styles.asideBelow}>{aside}</View> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { paddingBottom: t.space.block, gap: t.space.md },
  padded: { paddingHorizontal: t.space.gutter },
  row: { minHeight: t.sizes.appBar, flexDirection: 'row', alignItems: 'flex-end', gap: t.tablet ? t.space.lg : t.space.md },
  titles: { flex: 1, minWidth: 0, gap: t.tablet ? t.space.xxs : t.space.xxxs },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: t.space.xxs, maxWidth: '100%' },
  backLabel: { flexShrink: 1 },
  pressed: { opacity: 0.6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  asideInline: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, flexShrink: 1 },
  asideBelow: { alignSelf: 'stretch' },
}));
