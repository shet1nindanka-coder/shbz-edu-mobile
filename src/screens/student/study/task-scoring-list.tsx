import { View } from 'react-native';

import type { TaskScoringRow } from '@/domain/exam-scores';
import { makeStyles } from '@/theme';
import { AccentGradient, Text } from '@/ui';

export type TaskScoringListProps = {
  items: readonly TaskScoringRow[];
};

/** «Сколько даёт каждое задание»: a gradient badge with the points and the tasks it applies to. */
export function TaskScoringList({ items }: TaskScoringListProps) {
  const styles = useStyles();
  return (
    <>
      {items.map((item) => (
        <View key={item.text} accessible accessibilityLabel={item.text} style={styles.row} testID={`exam-task-${item.badge}`}>
          <AccentGradient style={styles.badge}>
            <Text variant="chip" color="onAccent" tabular style={styles.badgeText}>
              {item.badge}
            </Text>
          </AccentGradient>
          <Text variant="bodyStrong" style={styles.text}>
            {item.text}
          </Text>
        </View>
      ))}
    </>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  badge: { minWidth: 44, alignItems: 'center', borderRadius: t.radii.sm, paddingHorizontal: 12, paddingVertical: 7 },
  badgeText: { fontFamily: t.fonts.extrabold },
  text: { flex: 1 },
}));
