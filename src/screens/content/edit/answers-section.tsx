import { View } from 'react-native';

import type { TopicNumber } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Badge, Card, EmptyState, Icon, IconButton, Select, Text, type BadgeTone } from '@/ui';

import { hasLatex, numberFillStatus, type NumberFillStatus } from '../shared/number-fill-status';

import { ANSWERS_PAGE_SIZE, clampPage, countFilled, pageCountOf, pageRange, pageSlice } from './topic-edit';

// SPEC-GAP: the site paints «Частично заполнено» with the accent badge; the kit has no accent badge, so
// the neutral outline stands in (same choice as the single-number screen).
const FILL_TONE: Record<NumberFillStatus, BadgeTone> = { full: 'GREEN', partial: 'neutral', empty: 'none' };

export type AnswersSectionProps = {
  numbers: readonly TopicNumber[];
  /** 1-based page of the list; the screen keeps it while other sections are shown. */
  page: number;
  onPageChange: (page: number) => void;
  /** Opens the single-number editor. */
  onOpenNumber: (number: TopicNumber) => void;
};

/**
 * «Условия и ответы к заданиям» (site: `TopicAnswerManager`, docs/spec/07-developer-content.md §1.3.2 and
 * its phone mapping): the topic's numbers ten per page with their fill badges. A row opens the
 * single-number editor (`content.number`) instead of editing ten LaTeX cards inline.
 */
export function AnswersSection({ numbers, page, onPageChange, onOpenNumber }: AnswersSectionProps) {
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
        <Text variant="smallStrong" align="center" tabular style={styles.grow} testID="answers-page-of">
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
      <View style={styles.head}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {t.answersTitle}
        </Text>
        <Hint>
          <Text variant="hint">{t.answersDescription}</Text>
        </Hint>
      </View>

      {total === 0 ? (
        // SPEC-GAP: the site's manager has no empty state (a saved topic always has numbers); a topic
        // without numbers shows the view screen's empty title.
        <EmptyState title={dict.topics.viewNumbers.emptyTitle} testID="answers-empty" />
      ) : (
        <>
          <Card variant="soft" padded={14} style={styles.toolbar} accessibilityLabel={a.navTitle}>
            <Text variant="smallStrong" tabular testID="answers-range">
              {format(a.shownRange, { start: range.start, end: range.end, total })}
            </Text>
            <Text variant="caption" color="textMuted" testID="answers-summary">
              {format(a.savedSummary, { conditions: filled.conditions, answers: filled.answers, total, pageSize: ANSWERS_PAGE_SIZE })}
            </Text>
            {pageCount > 1 ? pager('top') : null}
          </Card>

          {visible.map((entry) => {
            const hasCondition = hasLatex(entry.conditionLatex);
            const hasAnswer = hasLatex(entry.answerLatex);
            const fill = numberFillStatus(entry.conditionLatex, entry.answerLatex);
            return (
              <Card
                key={entry.id}
                variant="outline"
                padded={14}
                onPress={() => onOpenNumber(entry)}
                accessibilityLabel={`${a.cardKicker}: ${format(m.content.edit.openNumber, { number: entry.number })}. ${a.status[fill]}`}
                style={styles.row}
                testID={`answers-number-${entry.number}`}
              >
                <View style={styles.rowHead}>
                  {/* The site's card kicker («Материалы к номеру») stays in the accessible name only: on a
                      phone row it pushed the status badge onto a second line. */}
                  <Text variant="numberTitle" style={styles.grow}>
                    {format(dict.topics.widgets.numberLabel, { number: entry.number })}
                  </Text>
                  <Badge tone={FILL_TONE[fill]} label={a.status[fill]} />
                  <Icon name="chevronRight" size={18} color="textMuted" />
                </View>
                <View style={styles.badges}>
                  <Badge tone={hasCondition ? 'GREEN' : 'none'} label={hasCondition ? a.hasCondition : a.noCondition} />
                  <Badge tone={hasAnswer ? 'GREEN' : 'none'} label={hasAnswer ? a.hasAnswer : a.noAnswer} />
                </View>
              </Card>
            );
          })}

          {pageCount > 1 ? pager('bottom') : null}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
  head: { gap: t.space.xxs, marginBottom: t.space.xxs },
  toolbar: { gap: t.space.sm },
  pager: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  grow: { flex: 1, minWidth: 0 },
  row: { gap: t.space.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
