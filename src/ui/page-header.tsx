import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, type MetricTone } from '@/theme';

import { MetricPill } from './metric-pill';
import { Text } from './text';

export type PageHeaderMetric = { label: string; value: string | number; tone?: MetricTone };

export type PageHeaderProps = {
  /** Not drawn: the screen title is the `ScreenHeader` title. Kept so callers need not change at once. */
  title: string;
  /** Not drawn: the design has no over-titles. */
  kicker?: string;
  /** Muted line under the header. It is a hint: pass it only when hints are on. */
  description?: string;
  /** Not drawn: the "back" link is part of the `ScreenHeader`. */
  backLabel?: string;
  onBack?: () => void;
  /** Summary figures under the header. */
  metrics?: readonly PageHeaderMetric[];
  /** Full-width node under the header: search field, actions row. */
  aside?: ReactNode;
  /** Not used: blocks of a page are spaced by the screen. */
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * What used to be the page header of the site-like design. The screen title, the over-title and the back
 * link moved into the `ScreenHeader` («no upper-case over-titles, no duplicated captions»), so this block
 * only carries what may follow the header: a hint, summary figures and a full-width node. It renders
 * nothing when none of them is given.
 */
export function PageHeader({ description, metrics, aside, style }: PageHeaderProps) {
  const styles = useStyles();
  const hasMetrics = Boolean(metrics && metrics.length > 0);
  if (!description && !hasMetrics && !aside) return null;
  return (
    <View style={[styles.header, style]}>
      {description ? (
        <Text variant="small" color="textMuted">
          {description}
        </Text>
      ) : null}
      {hasMetrics ? (
        <View style={styles.metrics}>
          {metrics?.map((metric) => (
            <MetricPill key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
          ))}
        </View>
      ) : null}
      {aside}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { gap: t.space.md },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
}));
