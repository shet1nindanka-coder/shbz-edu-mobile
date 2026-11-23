import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, metricToneColor, useTheme, type MetricTone } from '@/theme';

import { Text } from './text';

export type MetricPillProps = {
  label: string;
  value: string | number;
  /** `default` strong · `accent` · `success` green · `warning` yellow · `danger` red. */
  tone?: MetricTone;
  style?: StyleProp<ViewStyle>;
};

/** A summary figure (`.box`): a soft panel with the figure (20 / 800) over its caption. Red only when the tone asks for attention. */
export function MetricPill({ label, value, tone = 'default', style }: MetricPillProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.pill, style]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="miniStat" tabular numberOfLines={1} style={{ color: metricToneColor(tone, theme.colors) }}>
        {value}
      </Text>
      <Text variant="small" color="textMuted" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  pill: {
    minWidth: 96,
    flexGrow: 1,
    flexBasis: 0,
    justifyContent: 'center',
    gap: t.space.xxs,
    paddingVertical: t.space.md,
    paddingHorizontal: t.space.lg,
    borderRadius: t.radii.lg,
    backgroundColor: t.colors.softBg,
  },
}));
