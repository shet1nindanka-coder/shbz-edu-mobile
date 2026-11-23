import { View } from 'react-native';

import type { HomeworkNumberStatus, TeacherHomeworkAssignment } from '@/api/types';
import { statusGroupTitle, statusLabel } from '@/components/numbers';
import { commonPrefixLength, groupByStatus, shortNumber, type StatusKey } from '@/domain/number-focus';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Icon, NumberTile, PressableScale, STATUS_ICONS, Text } from '@/ui';

import { latestDoneCheck, verdictsByNumber } from './review-logic';
import { ReviewNumberCard } from './review-number-card';

export type ReviewNumbersSheetProps = {
  visible: boolean;
  /** The homework whose numbers are shown, with the in-flight colours applied; kept while the sheet closes. */
  assignment: TeacherHomeworkAssignment | null;
  /** The number whose details are shown; `null` — the grid of all numbers. */
  numberId: string | null;
  /** The details were opened from the grid: they offer the way back to it. */
  viaAll: boolean;
  lessonMode: boolean;
  savingIds: readonly string[];
  numberErrors: Record<string, string>;
  /** Status writes are cooling down after a refusal that named a wait. */
  blocked: boolean;
  onClose: () => void;
  /** After the exit animation: the screen opens the status history only now (two modals never overlap). */
  onClosed?: () => void;
  /** A tile of the grid was pressed, or «Все номера» of the details (`null`). */
  onShow: (numberId: string | null) => void;
  onStatus: (homeworkNumberId: string, status: HomeworkNumberStatus | null) => void;
  onHistory: (homeworkNumberId: string) => void;
};

/**
 * The numbers of a homework in the review, in one sheet (docs/design/glass-over-paper.md §1 rule 5): «Все
 * номера» — every number grouped by status, the ones that need help first — and, after a tap on a tile or
 * on a row of the review, the details of one number with its status marks (`ReviewNumberCard`). The grid
 * and the details share the sheet, so going from one to the other never stacks two modals.
 */
export function ReviewNumbersSheet({
  visible,
  assignment,
  numberId,
  viaAll,
  lessonMode,
  savingIds,
  numberErrors,
  blocked,
  onClose,
  onClosed,
  onShow,
  onStatus,
  onHistory,
}: ReviewNumbersSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const statuses = m.common.statuses;
  const numbers = assignment?.numbers ?? [];
  const number = numberId ? numbers.find((entry) => entry.homeworkNumberId === numberId) : undefined;
  const toneColor = (status: StatusKey) => (status === 'none' ? theme.colors.label : theme.status[status].text);

  let body = null;
  if (assignment && number) {
    body = (
      <View style={styles.body}>
        {viaAll ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={m.common.numbers.all}
            onPress={() => onShow(null)}
            scaleTo={1}
            hitSlop={{ top: theme.space.md, bottom: theme.space.md, left: theme.space.sm, right: theme.space.sm }}
            pressedStyle={styles.pressed}
            testID="review-numbers-sheet-back"
            style={styles.back}
          >
            <Icon name="chevronLeft" size={theme.sizes.icon.sm} color="textMuted" />
            <Text variant="link" color="textMuted">
              {m.common.numbers.all}
            </Text>
          </PressableScale>
        ) : null}
        <ReviewNumberCard
          // Another number must not carry this one's open disclosures.
          key={number.homeworkNumberId}
          number={number}
          result={verdictsByNumber(latestDoneCheck(assignment.checks)).get(number.number)}
          lessonMode={lessonMode}
          saving={savingIds.includes(number.homeworkNumberId)}
          blocked={blocked}
          error={numberErrors[number.homeworkNumberId]}
          onStatus={(status) => onStatus(number.homeworkNumberId, status)}
          onHistory={() => onHistory(number.homeworkNumberId)}
        />
      </View>
    );
  } else if (assignment) {
    const prefix = commonPrefixLength(numbers.map((entry) => ({ number: entry.number })));
    const groups = groupByStatus(numbers.map((entry) => ({ id: entry.homeworkNumberId, number: entry.number, status: entry.status })));
    const first = numbers[0]?.number;
    const last = numbers[numbers.length - 1]?.number;
    body = (
      <View style={styles.grid}>
        {first && last && numbers.length > 1 ? (
          <Text variant="small" color="textMuted" tabular>
            {format(m.common.numbers.range, { first, last })}
          </Text>
        ) : null}
        {groups.map((group) => (
          <View key={group.status} style={styles.group}>
            <View style={styles.groupHead}>
              {group.status === 'none' ? null : <Icon name={STATUS_ICONS[group.status]} size={theme.sizes.icon.sm} tint={toneColor(group.status)} />}
              <Text variant="smallBold" accessibilityRole="header" style={{ color: toneColor(group.status) }}>
                {statusGroupTitle(group.status, group.numbers.length, statuses)}
              </Text>
            </View>
            <View style={styles.tiles}>
              {group.numbers.map((entry) => (
                <NumberTile
                  key={entry.id}
                  label={shortNumber(entry.number, prefix)}
                  status={entry.status}
                  icon={false}
                  onPress={() => onShow(entry.id)}
                  accessibilityLabel={format(m.common.numbers.tileA11y, { number: entry.number, status: statusLabel(entry.status, statuses) })}
                  testID={`review-numbers-sheet-${entry.number}`}
                  style={prefix > 0 ? styles.cellShort : null}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={number ? format(dict.students.review.number, { n: number.number }) : m.common.numbers.all}
      testID="review-numbers-sheet"
    >
      {body}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.sm },
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: t.space.xxs },
  pressed: { opacity: 0.6 },
  grid: { gap: t.space.lg, paddingBottom: t.space.sm },
  group: { gap: t.space.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: t.space.xxs },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  // Three-digit tails: 44-wide cells, seven to a phone row.
  cellShort: { width: t.sizes.tile, paddingHorizontal: 0 },
}));
