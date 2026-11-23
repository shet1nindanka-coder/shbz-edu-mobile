import { View } from 'react-native';

import type { GradeRow } from '@/domain/exam-scores';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Text } from '@/ui';

export type GradeListProps = {
  items: readonly GradeRow[];
};

/** «Оценка по первичным»: one row per grade — the grade, its condition when there is one, and the raw-score range on the right. */
export function GradeList({ items }: GradeListProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.student.examInfo;
  return (
    <View>
      {items.map((item, index) => (
        <View key={item.grade} style={[styles.row, index < items.length - 1 ? styles.divider : null]} testID={`exam-grade-${item.grade}`}>
          <View style={styles.texts}>
            <Text variant="bodyStrong">{format(t.grade, { grade: item.grade })}</Text>
            {item.note ? (
              <Text variant="small" color="textMuted">
                {item.note}
              </Text>
            ) : null}
          </View>
          <Text variant="small" color="textMuted" tabular>
            {item.range} {t.points}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { minHeight: t.sizes.row, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.line },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
