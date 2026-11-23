import type { ReactNode, Ref } from 'react';
import { RefreshControl, ScrollView, View, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { Card } from '@/ui';

export type ScrollPanelProps = {
  children?: ReactNode;
  /** Share of the row's width (`flex`). Default 1. */
  weight?: number;
  /** Inner padding of the card. Default on; switch off for a panel of rows (they bring their own). */
  padded?: boolean;
  /** Fixed node above the scrolling content (a title row, the tabs). */
  header?: ReactNode;
  /** Fixed node under the scrolling content (an action). */
  footer?: ReactNode;
  /** The panel's scroller: a list scrolls a row into view through it. */
  scrollRef?: Ref<ScrollViewInstance>;
  /** Pull-to-refresh: pass both to enable. */
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * A tablet panel of `Panels` whose scroller the screen can reach. The kit's `Panel` keeps its scroll view
 * to itself; on a tablet the page does not scroll, so a panel that must be pulled to refresh, or scrolled
 * to a row, needs its own. The look is the kit panel's: a card that takes its share of the row and runs
 * down to the dock, with an optional fixed header and footer.
 *
 * The same file lives in `src/screens/groups/shared` — two areas need it and neither owns the kit.
 */
export function ScrollPanel({
  children,
  weight = 1,
  padded = true,
  header,
  footer,
  scrollRef,
  refreshing,
  onRefresh,
  testID,
  contentStyle,
}: ScrollPanelProps) {
  const styles = useStyles();
  const theme = useTheme();
  const padding = padded ? theme.space.card : 0;
  // Fixed parts are padded like the card even when the rows of the content bring their own padding.
  const edge = theme.space.card;
  return (
    <Card padded={false} testID={testID} style={[styles.panel, { flex: weight }]}>
      {header ? <View style={{ paddingHorizontal: edge, paddingTop: edge }}>{header}</View> : null}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: padding,
            paddingTop: header ? theme.space.md : padded ? padding : theme.space.sm,
            paddingBottom: footer ? theme.space.md : padded ? padding : theme.space.sm,
          },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
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
      >
        {children}
      </ScrollView>
      {footer ? <View style={{ paddingHorizontal: edge, paddingBottom: edge }}>{footer}</View> : null}
    </Card>
  );
}

const useStyles = makeStyles(() => ({
  panel: { minWidth: 0, minHeight: 0, overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { flexGrow: 1 },
}));
