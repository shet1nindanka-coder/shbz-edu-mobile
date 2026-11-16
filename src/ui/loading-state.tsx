import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { Skeleton } from './skeleton';
import { Spinner } from './spinner';

export type LoadingStateProps = {
  /**
   * `cards` — the section skeleton: stacked 160-high cards (default).
   * `list` — rows with a dot, a title pill and a body pill (notifications, lists).
   * `spinner` — a centered 20px spinner for small areas.
   */
  variant?: 'cards' | 'list' | 'spinner';
  /** Number of cards / rows. Default 4 cards or 3 rows. */
  count?: number;
  /** Height of a skeleton card; default 160. */
  cardHeight?: number;
  /** Row of four 44-high pills above the cards (a section with tabs). */
  tabs?: boolean;
  /** Announced to screen readers, e.g. "Загрузка". */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const TAB_WIDTHS = [112, 112, 128, 144] as const;

/** Loading shells (`DashboardSectionLoadingState`): skeletons with the geometry of the real content. */
export function LoadingState({
  variant = 'cards',
  count,
  cardHeight = 160,
  tabs = false,
  accessibilityLabel,
  testID,
  style,
}: LoadingStateProps) {
  const styles = useStyles();
  const a11y = {
    accessible: true,
    accessibilityRole: 'progressbar',
    accessibilityLabel,
    accessibilityState: { busy: true },
    testID,
  } as const;

  if (variant === 'spinner') {
    return (
      <View {...a11y} style={[styles.spinner, style]}>
        <Spinner size={20} />
      </View>
    );
  }
  if (variant === 'list') {
    return (
      <View {...a11y} style={style}>
        {Array.from({ length: count ?? 3 }, (_, index) => (
          <View key={index} style={styles.row}>
            <Skeleton width={8} height={8} index={index} style={styles.dot} />
            <View style={styles.rowTexts}>
              <Skeleton width="62%" height={14} index={index} />
              <Skeleton width="88%" height={12} index={index} />
              <Skeleton width="30%" height={10} index={index} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View {...a11y} style={[styles.cards, style]}>
      {tabs ? (
        <View style={styles.tabs}>
          {TAB_WIDTHS.map((width, index) => (
            <Skeleton key={index} width={width} height={44} index={index} />
          ))}
        </View>
      ) : null}
      {Array.from({ length: count ?? 4 }, (_, index) => (
        <Skeleton key={index} height={cardHeight} radius="lg" index={index} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  cards: { gap: t.space.lg },
  tabs: { flexDirection: 'row', gap: t.space.md, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  dot: { marginTop: 5 },
  rowTexts: { flex: 1, gap: 8 },
  spinner: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
}));
