import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Text } from '@/ui';

import { DiamondMark } from './diamond-mark';

/** Legend under the month grid: amber diamond, red diamond, the "today" ring. */
export function CalendarLegend() {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.student.calendar;
  return (
    <View style={styles.legend} testID="calendar-legend">
      <View style={styles.item}>
        <DiamondMark tone="done" />
        <Text variant="meta" color="textMuted">
          {t.legendDeadline}
        </Text>
      </View>
      <View style={styles.item}>
        <DiamondMark tone="late" />
        <Text variant="meta" color="textMuted">
          {t.legendIncomplete}
        </Text>
      </View>
      <View style={styles.item}>
        <View style={styles.today} />
        <Text variant="meta" color="textMuted">
          {t.legendToday}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.space.field, rowGap: t.space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  today: {
    width: 14,
    height: 14,
    borderRadius: t.radii.swatch,
    borderWidth: t.borders.strong,
    borderColor: t.colors.calRing,
    backgroundColor: t.colors.calCellBg,
  },
}));
