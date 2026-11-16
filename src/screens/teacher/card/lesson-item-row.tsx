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
  onResult: (result: LessonItemResult | null) => void;
  onRemove: () => void;
};

/**
 * One problem of the student's set in a lesson (docs/spec/04-teacher-students.md S6 "row"): «№ N», its
 * topic, the 2 × 2 "how did it go" toggle and "remove from the set". The extra part has a dashed border.
 */
export function LessonItemRow({ item, busy, saving, resultsBlocked, onResult, onRemove }: LessonItemRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict } = useI18n();
  const t = dict.students.lessons;
  const results = dict.students.lessonResult;
  return (
    <View style={[styles.row, item.isExtra ? styles.extra : null]} testID={`lesson-item-${item.id}`}>
      <View style={styles.head}>
        <View style={styles.titles}>
          <Text variant="bodyBold" tabular>
            {format(t.number, { n: item.number })}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {item.topicTitle}
          </Text>
        </View>
        <IconButton
          icon="trash"
          variant="ghost"
          tint={theme.colors.textMuted}
          accessibilityLabel={format(t.removeAria, { n: item.number })}
          disabled={busy}
          onPress={onRemove}
          testID={`lesson-item-remove-${item.id}`}
        />
      </View>
      <StatusOptionGroup
        accessibilityLabel={results.aria}
        options={LESSON_RESULT_ORDER.map((value) => ({ value, label: results[value], tone: lessonResultMeta[value].tone }))}
        value={item.result}
        onChange={onResult}
        disabled={busy || saving || resultsBlocked}
        testID={`lesson-item-result-${item.id}`}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    gap: t.space.sm,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  extra: { borderStyle: 'dashed', borderColor: t.colors.inputBorder },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  titles: { flex: 1, minWidth: 0, gap: 2 },
}));
