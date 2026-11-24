import { View } from 'react-native';

import type { LessonItemResult } from '@/api/types';
import { LESSON_RESULT_ORDER, lessonResultMeta } from '@/domain/statuses';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { IconButton, StatusOptionGroup, Text } from '@/ui';

import type { LessonItem } from './lessons-logic';

export type LessonItemRowProps = {
  item: LessonItem;
  /** The lesson has a set save or a retry in flight, or set saves are cooling down: editing is paused. */
  busy: boolean;
  /** The result of this item is being saved. */
  saving: boolean;
  /** Result marks are cooling down after a rate-limit refusal. */
  resultsBlocked: boolean;
  /** Hairline under the row. */
  divider: boolean;
  onResult: (result: LessonItemResult | null) => void;
  onRemove: () => void;
};

/**
 * One problem of the student's set in a lesson (docs/spec/04-teacher-students.md S6 "row"): the number,
 * "remove from the set", and the "how did it go" marks under them — four worded options do not fit next
 * to a number on a phone. The number's topic is spoken with it, not shown: the row is its number.
 */
export function LessonItemRow({ item, busy, saving, resultsBlocked, divider, onResult, onRemove }: LessonItemRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.students.lessons;
  const results = dict.students.lessonResult;
  const numberSign = format(t.number, { n: item.number });
  return (
    <View style={[styles.row, divider ? styles.divider : null]} testID={`lesson-item-${item.id}`}>
      <View style={styles.head}>
        <Text variant="bodyBold" tabular accessibilityLabel={`${numberSign}. ${item.topicTitle}`} style={styles.titles}>
          {item.number}
        </Text>
        <IconButton
          icon="trash"
          variant="ghost"
          tint={theme.colors.textMuted}
          iconSize={theme.sizes.icon.md}
          accessibilityLabel={format(t.removeAria, { n: item.number })}
          disabled={busy}
          onPress={onRemove}
          testID={`lesson-item-remove-${item.id}`}
        />
      </View>
      <StatusOptionGroup
        // Every row has the same group and options: the number tells them apart out of context (as on the
        // lesson board).
        accessibilityLabel={format(m.planner.lessonBoard.resultGroupAria, { number: numberSign })}
        options={LESSON_RESULT_ORDER.map((value) => ({
          value,
          label: results[value],
          accessibilityLabel: format(m.planner.lessonBoard.resultOptionAria, { number: numberSign, result: results[value] }),
          tone: lessonResultMeta[value].tone,
        }))}
        value={item.result}
        onChange={onResult}
        columns={theme.tablet ? 4 : 2}
        size="md"
        disabled={busy || saving || resultsBlocked}
        testID={`lesson-item-result-${item.id}`}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { gap: t.space.xs, paddingVertical: t.space.md },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  titles: { flex: 1, minWidth: 0 },
}));
