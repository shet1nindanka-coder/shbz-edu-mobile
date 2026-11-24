import { useState } from 'react';
import { View } from 'react-native';

import type { TopicNumber } from '@/api/types';
import { commonPrefixLength, shortNumber } from '@/domain/number-focus';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { EmptyState, NumberTile, Text, TextButton } from '@/ui';

/** Tiles shown before «Показать ещё»: a topic of hundreds of numbers must not grow the screen. */
const GRID_LIMIT = 70;

export type TopicNumbersProps = {
  numbers: readonly TopicNumber[];
  onOpenNumber: (number: TopicNumber) => void;
};

/**
 * «Номера и ответы» of the topic view (docs/spec/07-developer-content.md §1.2 item 4; layout:
 * docs/design/glass-over-paper.md §1 rule 5, §1a): every number as a neutral tile — a topic carries no
 * status — and a tap opens the number with its statement and answer. The tiles need no title; the block's
 * name and the count are spoken. When all numbers share a prefix the tiles show the last three digits and
 * the range above gives them whole. Rendered inside a card.
 */
export function TopicNumbers({ numbers, onOpenNumber }: TopicNumbersProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const prefix = commonPrefixLength(numbers);
  // Tails of three digits and numbers that short by themselves fit a square tile, seven to a phone row.
  const compact = prefix > 0 || numbers.every((entry) => entry.number.length <= 3);
  const shown = expanded ? numbers : numbers.slice(0, GRID_LIMIT);
  const first = numbers[0]?.number;
  const last = numbers[numbers.length - 1]?.number;

  if (numbers.length === 0) return <EmptyState variant="plain" title={dict.topics.viewNumbers.emptyTitle} testID="topic-numbers-empty" />;

  return (
    <View style={styles.root}>
      {prefix > 0 && first && last ? (
        <Text variant="small" color="textMuted" tabular>
          {format(m.common.numbers.range, { first, last })}
        </Text>
      ) : null}
      <View
        style={styles.grid}
        accessibilityLabel={`${dict.topics.view.numbersTitle}. ${plural(locale, numbers.length, dict.topics.widgets.numberForms)}`}
        testID="topic-numbers-list"
      >
        {shown.map((entry) => (
          <NumberTile
            key={entry.id}
            label={shortNumber(entry.number, prefix)}
            status={null}
            icon={false}
            onPress={() => onOpenNumber(entry)}
            accessibilityLabel={format(m.content.edit.openNumber, { number: entry.number })}
            testID={`topic-number-${entry.number}`}
            style={compact ? styles.cellShort : styles.cellWide}
          />
        ))}
      </View>
      {shown.length < numbers.length ? (
        <View style={styles.more}>
          <TextButton label={m.common.actions.showMore} onPress={() => setExpanded(true)} style={styles.touch} testID="topic-numbers-more" />
          {/* «70/200»: how much of the grid is on screen. */}
          <Text variant="small" color="textMuted" tabular>
            {format(m.common.numbers.doneOf, { done: shown.length, total: numbers.length })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  // Up to three digits sit in square cells; a longer number keeps the tile's own padding.
  cellShort: { width: t.sizes.tile, paddingHorizontal: 0 },
  cellWide: { minWidth: t.sizes.control.lg + t.space.lg },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  touch: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
