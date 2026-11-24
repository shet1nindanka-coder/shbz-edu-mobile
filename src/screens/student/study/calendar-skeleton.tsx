import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, Skeleton } from '@/ui';

import { calendarCellMinHeight } from './calendar-day-cell';

const WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
const WEEKS = [0, 1, 2, 3, 4, 5] as const;

/** Loading shell of the calendar: the month name and 6 × 7 day discs in the geometry of the real month. */
export function CalendarSkeleton() {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();
  const disc = theme.sizes.control.sm;
  return (
    <Card padded={false} style={styles.card} testID="deadlines-skeleton">
      <View accessible accessibilityRole="progressbar" accessibilityLabel={m.common.a11y.loading} accessibilityState={{ busy: true }} style={styles.fill}>
        <View style={styles.header}>
          <Skeleton width={132} height={22} />
        </View>
        {WEEKS.map((week) => (
          <View key={week} style={styles.row}>
            {WEEK.map((day) => (
              <View key={day} style={styles.cell}>
                <Skeleton width={disc} height={disc} index={week} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { flex: 1, minHeight: 0, paddingHorizontal: t.space.sm, paddingTop: t.space.sm, paddingBottom: t.space.xxs },
  fill: { flex: 1 },
  header: { minHeight: t.sizes.minTouch, justifyContent: 'center', paddingLeft: t.space.sm, marginBottom: t.space.xl },
  row: { flex: 1, flexDirection: 'row', minHeight: calendarCellMinHeight(t), borderTopWidth: t.borders.hairline, borderTopColor: t.colors.line },
  cell: { flex: 1, alignItems: 'center', paddingVertical: t.space.xxs },
}));
