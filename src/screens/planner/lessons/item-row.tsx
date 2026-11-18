import { View } from 'react-native';

import type { LessonBoardItem, LessonItemResult } from '@/api/types';
import { MathContent } from '@/components/math';
import { LESSON_RESULT_ORDER, lessonResultMeta } from '@/domain/statuses';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Chip, IconButton, StatusOptionGroup, Text, TextButton, useStatusAnnouncement, type ChipTone } from '@/ui';

import { SubmissionInfo } from './submission-info';

export type ItemRowProps = {
  item: LessonBoardItem;
  /** Ordinal in the set; the extra part continues the numbering of the main part. */
  ordinal: number;
  /** Another request of this participant is running: set editing is paused. */
  busy: boolean;
  /** The result of this item is being saved. */
  saving: boolean;
  /** Result marks are cooling down after `429 rateLimited`. */
  resultsBlocked: boolean;
  /** Why the last result save failed; shown inside the row. */
  error?: string;
  spentMinutes?: number;
  now: number;
  /** The lesson is running. */
  live: boolean;
  onResult: (result: LessonItemResult | null) => void;
  onRemove: () => void;
  onHistory: () => void;
  onOpenPhoto: (index: number) => void;
};

const STATUS_CHIP: Record<'GREEN' | 'YELLOW' | 'RED', ChipTone> = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' };

/**
 * One problem of a participant's set (docs/spec/05-teacher-lessons-plans.md §1.3 "Item row"): number and
 * chips, the 2 × 2 result toggle, the statement, the latest submission and the status history.
 */
export function ItemRow({ item, ordinal, busy, saving, resultsBlocked, error, spentMinutes, now, live, onResult, onRemove, onHistory, onOpenPhoto }: ItemRowProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const common = dict.planner.common;
  const numberSign = format(common.numberSign, { n: item.number });
  const reasons: Record<string, string> = dict.planner.reasons;
  const results = dict.students.lessonResult;
  // The row's error appears without moving focus: spoken on both platforms (an Android `alert` role alone
  // is silent), the web reads the alert.
  useStatusAnnouncement(error);

  return (
    <View style={styles.row} testID={`lesson-item-${item.id}`}>
      <View style={styles.head}>
        <View style={styles.titles}>
          <Text variant="captionBold" color="kicker" tabular>
            {`${ordinal}.`}
          </Text>
          <Text variant="smallBold" tabular>
            {numberSign}
          </Text>
          {/* The reason of selection is not a status: neutral chip next to the traffic-light one. */}
          <Chip tone="muted" label={reasons[item.reason] ?? dict.planner.reasons.NEW} />
          {/* Main part only: the student's current status of the number, until the lesson gives a result. */}
          {!item.isExtra && item.result === null && item.studentStatus ? (
            <Chip tone={STATUS_CHIP[item.studentStatus]} label={dict.planner.itemStatus[item.studentStatus]} />
          ) : null}
        </View>
        <IconButton
          icon="close"
          variant="danger"
          accessibilityLabel={format(common.removeNumber, { n: item.number })}
          disabled={busy}
          onPress={onRemove}
          testID={`lesson-item-remove-${item.id}`}
        />
      </View>

      <StatusOptionGroup
        // Every row has the same group and options: the number tells them apart out of context.
        accessibilityLabel={format(m.planner.lessonBoard.resultGroupAria, { number: numberSign })}
        options={LESSON_RESULT_ORDER.map((value) => ({
          value,
          label: results[value],
          accessibilityLabel: format(m.planner.lessonBoard.resultOptionAria, { number: numberSign, result: results[value] }),
          tone: lessonResultMeta[value].tone,
        }))}
        value={item.result}
        onChange={onResult}
        disabled={busy || saving || resultsBlocked}
        testID={`lesson-item-result-${item.id}`}
      />

      {item.conditionLatex ? <MathContent value={item.conditionLatex} variant="bare" /> : null}

      {item.submission ? (
        <SubmissionInfo
          submission={item.submission}
          spentMinutes={spentMinutes}
          now={now}
          live={live}
          onOpenPhoto={onOpenPhoto}
          numberLabel={numberSign}
          testID={`lesson-item-submission-${item.id}`}
        />
      ) : null}

      <TextButton
        label={dict.topics.history.show}
        accessibilityLabel={format(m.planner.lessonBoard.historyAria, { number: numberSign })}
        tone="muted"
        onPress={onHistory}
        testID={`lesson-item-history-${item.id}`}
        style={styles.history}
      />

      {error ? (
        <Text variant="captionStrong" color="dangerText" accessibilityRole="alert" testID={`lesson-item-error-${item.id}`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    gap: t.space.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
  titles: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.space.sm, rowGap: t.space.xs },
  history: { alignSelf: 'flex-start' },
}));
