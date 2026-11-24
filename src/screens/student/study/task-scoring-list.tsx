import { View } from 'react-native';

import type { TaskScoringRow } from '@/domain/exam-scores';
import { makeStyles } from '@/theme';
import { Text } from '@/ui';

export type TaskScoringListProps = {
  items: readonly TaskScoringRow[];
};

/** The site writes a row as «№ 1–12 — по 1 первичному баллу»: the tasks, a dash, the points in words. */
const TASKS_END = ' — ';

/**
 * «Первичные баллы» of the exam info: a row per group of tasks — which tasks on the left, the raw points
 * one of them gives as a figure on the right. The site's whole sentence is the row's accessible name.
 */
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
          <Text variant="bodyStrong" style={styles.text}>
            {item.text.split(TASKS_END)[0]}
          </Text>
          <Text variant="sectionTitle" tabular>
            {item.badge}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { minHeight: t.sizes.control.lg, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.line },
  text: { flex: 1, minWidth: 0 },
}));
