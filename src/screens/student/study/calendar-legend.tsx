import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Text } from '@/ui';

import { DiamondMark } from './diamond-mark';

/** Legend under the month grid: a deadline that is still ahead (yellow) and an overdue one (red). */
export function CalendarLegend() {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.student.calendar;
  return (
    <View style={styles.legend} testID="calendar-legend">
      <View style={styles.item}>
        <DiamondMark tone="due" />
        <Text variant="small" color="textMuted">
          {t.legendDeadline}
        </Text>
      </View>
      <View style={styles.item}>
        <DiamondMark tone="late" />
        <Text variant="small" color="textMuted">
          {t.legendIncomplete}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.space.field, rowGap: t.space.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
}));
