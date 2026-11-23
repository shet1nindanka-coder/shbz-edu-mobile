import { View } from 'react-native';

import type { TaskScoringRow } from '@/domain/exam-scores';
import { makeStyles } from '@/theme';
import { Chip, Text } from '@/ui';

export type TaskScoringListProps = {
  items: readonly TaskScoringRow[];
};

/** «Сколько даёт каждое задание»: rows with the points in a mint chip and the tasks they apply to. */
export function TaskScoringList({ items }: TaskScoringListProps) {
  const styles = useStyles();
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={item.text}
          accessible
          accessibilityLabel={item.text}
          style={[styles.row, index < items.length - 1 ? styles.divider : null]}
          testID={`exam-task-${item.badge}`}
        >
          <Chip tone="accent" label={String(item.badge)} style={styles.badge} />
          <Text variant="bodyStrong" style={styles.text}>
            {item.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { minHeight: t.sizes.row, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.line },
  badge: { minWidth: t.sizes.chip, alignItems: 'center', flexShrink: 0 },
  text: { flex: 1, minWidth: 0 },
}));
