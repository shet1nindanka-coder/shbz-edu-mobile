import { View } from 'react-native';

import type { GradeRow } from '@/domain/exam-scores';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Text } from '@/ui';

export type GradeListProps = {
  items: readonly GradeRow[];
};

/** «Оценка по первичным»: one soft card per grade with its raw-score range and an optional condition. */
export function GradeList({ items }: GradeListProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.student.examInfo;
  return (
    <>
      {items.map((item) => (
        <View key={item.grade} style={styles.card} testID={`exam-grade-${item.grade}`}>
          <Text variant="kickerSm">{format(t.grade, { grade: item.grade })}</Text>
          <View style={styles.range}>
            <Text variant="metric" tabular>
              {item.range}
            </Text>
            <Text variant="smallStrong" color="textMuted">
              {t.points}
            </Text>
          </View>
          {item.note ? (
            <Text variant="hint" color="textMuted">
              {item.note}
            </Text>
          ) : null}
        </View>
      ))}
    </>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    gap: t.space.xxs,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  range: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
}));
