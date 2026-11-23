import { View } from 'react-native';

import type { LessonBoardItem, LessonItemResult } from '@/api/types';
import { RetryWaitLine } from '@/components/retry-wait';
import { LESSON_RESULT_ORDER, lessonResultMeta } from '@/domain/statuses';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { StatusOptionGroup, Text } from '@/ui';

export type ItemResultBarProps = {
  /** The number picked in the grid. */
  item: LessonBoardItem;
  /** Another request of this participant, a save of this result, or the cool-down: no marking now. */
  disabled: boolean;
  /** Seconds until result marks may be saved again (`429` / `503` of the result bucket); 0 when free. */
  waitSeconds: number;
  onResult: (result: LessonItemResult | null) => void;
  /** Whose results these are: the id of the wait line. */
  participantId: string;
};

/**
 * «Итог урока» of the picked number (docs/spec/05-teacher-lessons-plans.md §1.3 "Result toggle"; layout:
 * mockup `T-board`): the lesson-result options with the site's wording, pinned under the student's numbers
 * — the sheet's footer on a phone, the panel's footer on a tablet — so tapping a tile and then a result
 * never needs a scroll. Tapping the active option clears it.
 */
export function ItemResultBar({ item, disabled, waitSeconds, onResult, participantId }: ItemResultBarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const results = dict.students.lessonResult;
  const numberSign = format(dict.planner.common.numberSign, { n: item.number });

  return (
    <View style={styles.bar}>
      <Text variant="label" color="textMuted">
        {results.aria}
      </Text>
      <StatusOptionGroup
        // The same group serves every number: the number tells its options apart out of context.
        accessibilityLabel={format(m.planner.lessonBoard.resultGroupAria, { number: numberSign })}
        options={LESSON_RESULT_ORDER.map((value) => ({
          value,
          label: results[value],
          accessibilityLabel: format(m.planner.lessonBoard.resultOptionAria, { number: numberSign, result: results[value] }),
          tone: lessonResultMeta[value].tone,
        }))}
        value={item.result}
        onChange={onResult}
        // One row where the four labels fit (a tablet panel), a 2 × 2 grid on a phone.
        columns={theme.tablet ? 4 : 2}
        disabled={disabled}
        testID={`lesson-item-result-${item.id}`}
      />
      {/* The result bucket locks every mark of the board: the reason stays next to the locked buttons. */}
      <RetryWaitLine seconds={waitSeconds} testID={`lesson-result-wait-${participantId}`} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: { gap: t.space.xs },
}));
