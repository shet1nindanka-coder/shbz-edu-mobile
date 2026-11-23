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

/** Page-header metric (`.ui-metric-pill`): soft panel, label over a toned value. */
export function MetricPill({ label, value, tone = 'default', style }: MetricPillProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.pill, style]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="captionStrong" color="kicker" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="smallExtra" tabular numberOfLines={1} style={{ color: metricToneColor(tone, theme.colors) }}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  pill: {
    minWidth: 120,
    minHeight: 72,
    flexGrow: 1,
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
}));
