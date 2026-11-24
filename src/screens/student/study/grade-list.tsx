import { View } from 'react-native';

import type { GradeRow } from '@/domain/exam-scores';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Text } from '@/ui';

export type GradeListProps = {
  items: readonly GradeRow[];
};

/**
 * «Оценка по первичным»: one row per grade — the grade as a figure, the raw-score range on the right, and
 * under the grade the one condition the exam attaches to it (geometry points for a «3»). «Оценка 5,
 * 22–31 баллов» is what a screen reader hears.
 */
export function GradeList({ items }: GradeListProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.student.examInfo;
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={item.grade}
          accessible
          accessibilityLabel={[`${format(t.grade, { grade: item.grade })}, ${item.range} ${t.points}`, item.note].filter(Boolean).join(', ')}
          style={[styles.row, index < items.length - 1 ? styles.divider : null]}
          testID={`exam-grade-${item.grade}`}
        >
          <View style={styles.texts}>
            <Text variant="sectionTitle" tabular>
              {item.grade}
            </Text>
            {item.note ? (
              <Text variant="small" color="textMuted">
                {item.note}
              </Text>
            ) : null}
          </View>
          <Text variant="bodyStrong" tabular>
            {item.range}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { minHeight: t.sizes.control.lg, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.line },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
