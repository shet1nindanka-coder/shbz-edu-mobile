import { useRef } from 'react';
import { View } from 'react-native';

import type { TopicNumber } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { EmptyState, IconButton, ListRow, Select, Text } from '@/ui';

import { hasLatex, numberFillStatus } from '../shared/number-fill-status';

import { ANSWERS_PAGE_SIZE, clampPage, countFilled, pageCountOf, pageRange, pageSlice } from './topic-edit';

export type AnswersSectionProps = {
  numbers: readonly TopicNumber[];
  /** 1-based page of the list; the screen keeps it while other sections are shown. */
  page: number;
  onPageChange: (page: number) => void;
  /** The number the screen was opened for (the site's `?number=N`): its row is filled. */
  highlightedId?: string;
  /** Vertical offset of the highlighted row inside this section, once it is laid out (the screen scrolls to it). */
  onHighlightLayout?: (y: number) => void;
  /** Opens the single-number editor. */
  onOpenNumber: (number: TopicNumber) => void;
};

/**
 * «Условия и ответы к заданиям» (site: `TopicAnswerManager`, docs/spec/07-developer-content.md §1.3.2 and
 * its phone mapping): the topic's numbers ten per page, each a row with one caption — what is filled. A row
 * opens the single-number editor (`content.number`) instead of editing ten LaTeX cards inline. Rendered
 * inside a card: the rows bring no padding of their own.
 */
export function AnswersSection({ numbers, page, highlightedId, onHighlightLayout, onPageChange, onOpenNumber }: AnswersSectionProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.topics.edit;
  const a = dict.topics.answerManager;
  const total = numbers.length;
  const pageCount = pageCountOf(total);
  const current = clampPage(page, pageCount);
  const range = pageRange(total, current);
  const filled = countFilled(numbers);
  const visible = pageSlice(numbers, current);
  // The highlighted row sits inside the list, the list inside the section: its offset in the section is
  // known once both have been laid out, in whichever order that happens.
  const offsets = useRef<{ list: number | null; row: number | null }>({ list: null, row: null });
  const reportHighlight = (part: 'list' | 'row', y: number) => {
    offsets.current[part] = y;
    const { list, row } = offsets.current;
    if (list !== null && row !== null) onHighlightLayout?.(list + row);
  };

  const pager = (placement: 'top' | 'bottom') => (
    <View style={styles.pager}>
      <IconButton
        icon="chevronLeft"
        accessibilityLabel={a.prevPage}
        disabled={current <= 1}
        onPress={() => onPageChange(current - 1)}
        testID={`answers-prev-${placement}`}
      />
      {placement === 'top' ? (
        <Select<number>
          options={Array.from({ length: pageCount }, (_, index) => ({ value: index + 1, label: format(a.pageOf, { page: index + 1, total: pageCount }) }))}
          value={current}
          onChange={onPageChange}
          placeholder={dict.topics.widgets.selectPlaceholder}
          closeLabel={m.common.actions.close}
          sheetTitle={a.page}
          accessibilityLabel={a.page}
          size="sm"
          style={styles.grow}
          testID="answers-page-select"
        />
      ) : (
        <Text variant="small" color="textMuted" align="center" tabular style={styles.grow} testID="answers-page-of">
          {format(a.pageOf, { page: current, total: pageCount })}
        </Text>
      )}
      <IconButton
        icon="chevronRight"
        accessibilityLabel={a.nextPage}
        disabled={current >= pageCount}
        onPress={() => onPageChange(current + 1)}
        testID={`answers-next-${placement}`}
      />
    </View>
  );

  return (
    <View style={styles.root} testID="edit-answers">
      {/* No title of its own: the section switch above already names it. */}
      <Hint>
        <Text variant="hint">{t.answersDescription}</Text>
      </Hint>

      {total === 0 ? (
        // SPEC-GAP: the site's manager has no empty state (a saved topic always has numbers); a topic
        // without numbers shows the view screen's empty title.
        <EmptyState title={dict.topics.viewNumbers.emptyTitle} testID="answers-empty" />
      ) : (
        <>
          <View style={styles.toolbar} accessibilityLabel={a.navTitle}>
            <Text variant="small" color="textMuted" tabular testID="answers-range">
              {format(a.shownRange, { start: range.start, end: range.end, total })}
            </Text>
            <Hint>
              <Text variant="hint" testID="answers-summary">
                {format(a.savedSummary, { conditions: filled.conditions, answers: filled.answers, total, pageSize: ANSWERS_PAGE_SIZE })}
              </Text>
            </Hint>
            {pageCount > 1 ? pager('top') : null}
          </View>

          <View onLayout={highlightedId ? (event) => reportHighlight('list', event.nativeEvent.layout.y) : undefined}>
            {visible.map((entry, index) => {
              const hasCondition = hasLatex(entry.conditionLatex);
              const fill = numberFillStatus(entry.conditionLatex, entry.answerLatex);
              // One caption: what the number has; a half-filled one names what is missing.
              const caption = fill === 'partial' ? (hasCondition ? a.noAnswer : a.noCondition) : a.status[fill];
              const row = (
                <ListRow
                  key={entry.id}
                  inset={0}
                  title={format(dict.topics.widgets.numberLabel, { number: entry.number })}
                  subtitle={caption}
                  selected={entry.id === highlightedId}
                  divider={index < visible.length - 1}
                  style={entry.id === highlightedId ? styles.highlighted : undefined}
                  onPress={() => onOpenNumber(entry)}
                  accessibilityLabel={`${a.cardKicker}: ${format(m.content.edit.openNumber, { number: entry.number })}. ${caption}`}
                  testID={`answers-number-${entry.number}`}
                />
              );
              // Only the highlighted row reports where it is.
              return entry.id === highlightedId && onHighlightLayout ? (
                <View key={entry.id} onLayout={(event) => reportHighlight('row', event.nativeEvent.layout.y)}>
                  {row}
                </View>
              ) : (
                row
              );
            })}
          </View>

          {pageCount > 1 ? pager('bottom') : null}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
  toolbar: { gap: t.space.sm },
  pager: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  grow: { flex: 1, minWidth: 0 },
  // The rows have no side padding inside the card: the fill of the highlighted one gets its own.
  highlighted: { marginHorizontal: -t.space.sm, paddingHorizontal: t.space.sm, borderRadius: t.radii.md },
}));
