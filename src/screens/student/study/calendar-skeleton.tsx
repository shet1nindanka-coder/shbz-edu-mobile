import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Skeleton, Spinner } from '@/ui';

import { CALENDAR_CELL_HEIGHT } from './calendar-day-cell';

const WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
const WEEKS = [0, 1, 2, 3, 4, 5] as const;

/** Loading shell of the calendar (`StudentDeadlinesCalendarSkeleton`): spinner, month row, 7 + 42 blocks. */
export function CalendarSkeleton() {
  const styles = useStyles();
  const { m } = useI18n();
  return (
    <Card padded={12} testID="deadlines-skeleton">
      <View accessible accessibilityRole="progressbar" accessibilityLabel={m.common.a11y.loading} accessibilityState={{ busy: true }}>
        <View style={styles.header}>
          <Skeleton width={40} height={40} />
          <View style={styles.title}>
            <Spinner size={20} />
            <Skeleton width={132} height={22} />
          </View>
          <Skeleton width={40} height={40} />
        </View>
        <View style={styles.row}>
          {WEEK.map((day) => (
            <Skeleton key={day} height={16} radius="sm" style={styles.cell} />
          ))}
        </View>
        <View style={styles.grid}>
          {WEEKS.map((week) => (
            <View key={week} style={styles.row}>
              {WEEK.map((day) => (
                <Skeleton key={day} height={CALENDAR_CELL_HEIGHT} radius="md" index={week} style={styles.cell} />
              ))}
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.space.field },
  title: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  grid: { gap: t.space.xxs, marginTop: t.space.sm },
  row: { flexDirection: 'row', gap: t.space.xxs },
  cell: { flex: 1 },
}));
