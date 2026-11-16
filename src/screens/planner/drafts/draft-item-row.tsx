import { View } from 'react-native';

import type { HomeworkPlanItem } from '@/api/types';
import { MathContent } from '@/components/math';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Chip, IconButton, Text, type ChipTone } from '@/ui';

import { reasonTone } from './drafts-logic';

export type DraftItemRowProps = {
  item: HomeworkPlanItem;
  /** 1-based position in the set. */
  ordinal: number;
  /** The homework was issued from this set: it is frozen, nothing can be removed. */
  issued: boolean;
  /** A request of this participant is running, or set saves are cooling down. */
  busy: boolean;
  onRemove: () => void;
};

const STATUS_CHIP: Record<'GREEN' | 'YELLOW' | 'RED', ChipTone> = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' };

/**
 * One problem of a draft set (docs/spec/05-teacher-lessons-plans.md §1.7 "Item list"): ordinal, number,
 * why it was selected, the student's current status of it, the AI comment, "remove" and the statement.
 * Homework has no lesson results, so there is no result toggle here.
 */
export function DraftItemRow({ item, ordinal, issued, busy, onRemove }: DraftItemRowProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const common = dict.planner.common;
  const reasons: Record<string, string> = dict.planner.reasons;

  return (
    <View style={styles.row} testID={`draft-item-${item.id}`}>
      <View style={styles.head}>
        <View style={styles.titles}>
          <Text variant="captionBold" color="kicker" tabular>
            {`${ordinal}.`}
          </Text>
          <Text variant="smallBold" tabular>
            {format(common.numberSign, { n: item.number })}
          </Text>
          {/* On this board the reason is coloured: a gap is a warning, a new problem is the normal case. */}
          <Chip tone={reasonTone(item.reason)} label={reasons[item.reason] ?? dict.planner.reasons.NEW} />
          {/* A solved number («решено», «с ошибками») cannot be assigned again: it will fail at issue time. */}
          {item.studentStatus ? <Chip tone={STATUS_CHIP[item.studentStatus]} label={dict.planner.itemStatus[item.studentStatus]} /> : null}
        </View>
        {!issued ? (
          <IconButton
            icon="close"
            variant="danger"
            accessibilityLabel={format(common.removeNumber, { n: item.number })}
            disabled={busy}
            onPress={onRemove}
            testID={`draft-item-remove-${item.id}`}
          />
        ) : null}
      </View>

      {item.comment ? (
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {item.comment}
        </Text>
      ) : null}

      {item.conditionLatex ? <MathContent value={item.conditionLatex} variant="bare" /> : null}
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
}));
