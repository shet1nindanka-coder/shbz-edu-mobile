import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { makeStyles, useTheme } from '@/theme';
import { Text } from '@/ui';

import { donutArcs, type DistributionSegment } from '../logic';
import { segmentColor } from './palette';

const SIZE = 184;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type DonutChartProps = {
  segments: readonly DistributionSegment[];
  total: number;
  /** «62%» */
  centerValue: string;
  /** «решено» */
  centerLabel: string;
  /** Read out instead of the drawing. */
  accessibilityLabel: string;
};

/**
 * The donut of «Как решаются выданные ДЗ» (the site's conic gradient): one arc per non-empty segment in
 * its status colour, clockwise from the top, with the solved share in the middle. Nothing issued → one
 * neutral ring.
 */
export function DonutChart({ segments, total, centerValue, centerLabel, accessibilityLabel }: DonutChartProps) {
  const styles = useStyles();
  const theme = useTheme();
  const arcs = donutArcs(segments, total);

  return (
    <View style={styles.root} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} testID="stats-donut">
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={theme.colors.soft2} strokeWidth={STROKE} />
        {arcs.map((arc) => (
          <Circle
            key={arc.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={segmentColor(arc.key, theme)}
            strokeWidth={STROKE}
            // A circle's stroke starts at 3 o'clock: turn it so that the first arc starts at the top.
            strokeDasharray={[arc.length * CIRCUMFERENCE, CIRCUMFERENCE]}
            strokeDashoffset={-arc.start * CIRCUMFERENCE}
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        ))}
      </Svg>
      <View style={styles.center}>
        <Text variant="metric" tabular>
          {centerValue}
        </Text>
        <Text variant="small" color="textMuted">
          {centerLabel}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: { width: SIZE, height: SIZE, alignSelf: 'center' },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
}));
