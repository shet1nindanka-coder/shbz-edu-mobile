import type { ReactNode } from 'react';
import { Platform, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { makeStyles, type MetricTone } from '@/theme';

import { MetricPill } from './metric-pill';
import { Text } from './text';
import { TextButton } from './text-button';
import { TitleDot } from './title-dot';

export type PageHeaderMetric = { label: string; value: string | number; tone?: MetricTone };

export type PageHeaderProps = {
  title: string;
  /** Uppercase over-title. */
  kicker?: string;
  /** Muted paragraph under the title. It is a hint: pass it only when hints are on. */
  description?: string;
  /** Back link above the kicker, e.g. "← Ко всем темам" (the text already contains the arrow). */
  backLabel?: string;
  onBack?: () => void;
  /** Metric pills under the title. */
  metrics?: readonly PageHeaderMetric[];
  /** Full-width node under the title: search pill, actions row. */
  aside?: ReactNode;
  /** Bottom margin; default 40 (the site's header gap). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

/** Web only: the last word of the title and its dot stay on one line (`white-space` is not a native style). */
const LAST_WORD = (Platform.OS === 'web' ? { whiteSpace: 'nowrap' } : null) as TextStyle | null;

/** Page header (`ShbzPageHeader`): kicker, display title with the gradient dot, optional aside below. */
export function PageHeader({
  title,
  kicker,
  description,
  backLabel,
  onBack,
  metrics,
  aside,
  gap,
  style,
}: PageHeaderProps) {
  const styles = useStyles();
  // The part before the last word may wrap freely; the last word carries the dot.
  const cut = title.lastIndexOf(' ');
  const head = cut < 0 ? '' : title.slice(0, cut + 1);
  const lastWord = cut < 0 ? title : title.slice(cut + 1);
  return (
    <View style={[styles.header, gap === undefined ? null : { marginBottom: gap }, style]}>
      {backLabel && onBack ? (
        <View style={styles.back}>
          <TextButton label={backLabel} tone="muted" variant="smallStrong" onPress={onBack} />
        </View>
      ) : null}
      <View style={styles.titles}>
        {kicker ? <Text variant="kicker">{kicker}</Text> : null}
        <Text variant="display" accessibilityRole="header">
          {head}
          {/*
            The dot rides on the last line of the title, 12 after the text, centered on the line — and it
            never wraps to a line of its own: it is tied to the last word (a word joiner for the native
            line breakers, a no-wrap span for the browser, which breaks before an inline box regardless).
          */}
          <Text variant="display" style={LAST_WORD}>
            {lastWord}
            {'\u2060'}
            <View style={styles.dotWrap}>
              <TitleDot />
            </View>
          </Text>
        </Text>
      </View>
      {description ? (
        <Text variant="small" color="textMuted">
          {description}
        </Text>
      ) : null}
      {metrics && metrics.length > 0 ? (
        <View style={styles.metrics}>
          {metrics.map((metric) => (
            <MetricPill key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
          ))}
        </View>
      ) : null}
      {aside ? <View style={styles.aside}>{aside}</View> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { gap: t.space.md, marginBottom: t.space.headerGap },
  back: { alignItems: 'flex-start', marginBottom: 4 },
  titles: { gap: 10 },
  // An inline view sits on the text baseline: a box as tall as the capitals with the dot centered in it
  // puts the dot on the optical middle of the line.
  dotWrap: {
    width: 12 + t.sizes.titleDot,
    height: Math.round(t.typography.display.fontSize * 0.7),
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md, marginTop: 6 },
  aside: { marginTop: 8 },
}));
