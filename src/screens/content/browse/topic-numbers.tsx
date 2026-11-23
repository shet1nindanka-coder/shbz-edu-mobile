import { useState } from 'react';
import { View } from 'react-native';

import type { TopicNumber } from '@/api/types';
import { commonPrefixLength, shortNumber } from '@/domain/number-focus';
import { format, plural, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { EmptyState, NumberTile, Text, TextButton } from '@/ui';

/** Tiles shown before «Показать ещё»: a topic of hundreds of numbers must not grow the screen. */
const GRID_LIMIT = 70;

export type TopicNumbersProps = {
  numbers: readonly TopicNumber[];
  /** The empty state points at the editor, which only a developer has. */
  isDeveloper: boolean;
  onOpenNumber: (number: TopicNumber) => void;
};

/**
 * «Номера и ответы» of the topic view (docs/spec/07-developer-content.md §1.2 item 4; layout:
 * docs/design/glass-over-paper.md §1 rule 5): every number as a neutral tile — a topic carries no status —
 * and a tap opens the number with its statement and answer. When all numbers share a prefix the tiles show
 * the last three digits and the range above gives them whole. Rendered inside a card.
 */
export function TopicNumbers({ numbers, isDeveloper, onOpenNumber }: TopicNumbersProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.topics.view;
  const [expanded, setExpanded] = useState(false);
  const prefix = commonPrefixLength(numbers);
  const shown = expanded ? numbers : numbers.slice(0, GRID_LIMIT);
  const first = numbers[0]?.number;
  const last = numbers[numbers.length - 1]?.number;

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text variant="sectionTitle" accessibilityRole="header" style={styles.grow}>
            {t.numbersTitle}
          </Text>
          {numbers.length > 0 ? (
            <Text variant="small" color="textMuted" tabular testID="topic-numbers-count">
              {plural(locale, numbers.length, dict.topics.widgets.numberForms)}
            </Text>
          ) : null}
        </View>
        <Hint>
          <Text variant="hint">{t.numbersDescription}</Text>
        </Hint>
      </View>

      {numbers.length === 0 ? (
        <EmptyState
          title={dict.topics.viewNumbers.emptyTitle}
          hint={isDeveloper ? dict.topics.viewNumbers.emptyHint : undefined}
          testID="topic-numbers-empty"
        />
      ) : (
        <>
          {prefix > 0 && first && last ? (
            <Text variant="small" color="textMuted" tabular>
              {format(m.common.numbers.range, { first, last })}
            </Text>
          ) : null}
          <View style={styles.grid} testID="topic-numbers-list">
            {shown.map((entry) => (
              <NumberTile
                key={entry.id}
                label={shortNumber(entry.number, prefix)}
                status={null}
                icon={false}
                onPress={() => onOpenNumber(entry)}
                accessibilityLabel={format(m.content.edit.openNumber, { number: entry.number })}
                testID={`topic-number-${entry.number}`}
                style={prefix > 0 ? styles.cellShort : styles.cellWide}
              />
            ))}
          </View>
          {shown.length < numbers.length ? (
            <View style={styles.more}>
              <Text variant="small" color="textMuted" tabular style={styles.grow}>
                {format(m.content.topic.shownOf, { shown: shown.length, total: numbers.length })}
              </Text>
              <TextButton label={m.common.actions.showMore} onPress={() => setExpanded(true)} style={styles.touch} testID="topic-numbers-more" />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
  head: { gap: t.space.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: t.space.md },
  grow: { flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  // Three-digit tails sit in square cells; a whole number keeps the tile's own padding.
  cellShort: { width: t.sizes.tile, paddingHorizontal: 0 },
  cellWide: { minWidth: t.sizes.control.lg + t.space.xl },
  more: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  touch: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
