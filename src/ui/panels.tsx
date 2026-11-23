import type { ReactNode, Ref } from 'react';
import { RefreshControl, ScrollView, View, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Card } from './card';

export type PanelsProps = {
  children?: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The tablet layout of a screen (docs/design/glass-over-paper.md §1 rule 7, §7): its `Panel`s stand side
 * by side and run the full height down to the dock — a list on the left, the content of the selected
 * item on the right — so a tablet screen is never half empty. On a phone the same panels are ordinary
 * cards stacked in the page.
 *
 * Use it inside `<Screen scroll={!theme.tablet} maxWidth="full">`: on a tablet the page itself does not
 * scroll, every panel scrolls its own content.
 */
export function Panels({ children, testID, style }: PanelsProps) {
  const styles = useStyles();
  return (
    <View testID={testID} style={[styles.panels, style]}>
      {children}
    </View>
  );
}

export type PanelProps = {
  children?: ReactNode;
  /** Share of the row's width on a tablet (`flex`). Default 1. */
  weight?: number;
  /** Inner padding of the card. Default on; switch off for a panel of rows (they bring their own). */
  padded?: boolean;
  /** Fixed node above the scrolling content of a tablet panel (a title row, a filter). */
  header?: ReactNode;
  /** Fixed node under the scrolling content of a tablet panel (the main action). */
  footer?: ReactNode;
  /** Leave the panel out on a phone (a detail that a phone opens as a pushed screen or a sheet). */
  tabletOnly?: boolean;
  /**
   * Pad the fixed header and footer like the card even when `padded` is off (a panel of rows with a title
   * above them). Default: they follow `padded`.
   */
  edges?: boolean;
  /** The scroller of a tablet panel: a list scrolls a row into view through it. */
  scrollRef?: Ref<ScrollViewInstance>;
  /** Pull-to-refresh of a tablet panel (the page itself does not scroll there): pass both to enable. */
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * One panel of `Panels`: a card. On a tablet it takes its share of the row, stretches to the dock and
 * scrolls its own content (with an optional fixed header and footer); on a phone it is a plain card.
 */
export function Panel({
  children,
  weight = 1,
  padded = true,
  header,
  footer,
  tabletOnly = false,
  edges = false,
  scrollRef,
  refreshing,
  onRefresh,
  testID,
  style,
  contentStyle,
}: PanelProps) {
  const theme = useTheme();
  const styles = useStyles();
  if (!theme.tablet) {
    if (tabletOnly) return null;
    return (
      <Card padded={padded} testID={testID} style={[styles.phone, style]}>
        {header}
        <View style={[styles.phoneContent, contentStyle]}>{children}</View>
        {footer}
      </Card>
    );
  }
  const padding = padded ? theme.space.card : 0;
  const edge = edges ? theme.space.card : padding;
  return (
    <Card padded={false} testID={testID} style={[styles.tablet, { flex: weight }, style]}>
      {header ? <View style={{ paddingHorizontal: edge, paddingTop: edge }}>{header}</View> : null}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={Boolean(refreshing)}
              onRefresh={onRefresh}
              tintColor={theme.colors.accentSolid}
              colors={[theme.colors.accentSolid]}
              progressBackgroundColor={theme.colors.cardBg}
            />
          ) : undefined
        }
        contentContainerStyle={[
          styles.scrollContent,
          // A panel of rows (`padded={false}`) has no gap between them: the hairlines separate the rows.
          padded ? styles.spaced : null,
          {
            paddingHorizontal: padding,
            paddingTop: header ? theme.space.md : padded ? padding : theme.space.sm,
            paddingBottom: footer ? theme.space.md : padded ? padding : theme.space.sm,
          },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: edge, paddingBottom: edge }}>{footer}</View> : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  panels: t.tablet ? { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'stretch', gap: t.space.lg } : { gap: t.space.block },
  phone: { gap: t.space.md },
  phoneContent: { gap: t.space.md },
  tablet: { minWidth: 0, minHeight: 0, overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  spaced: { gap: t.space.md },
}));
