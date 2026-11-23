import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { HomeworkPlanItem, HomeworkPlanParticipant } from '@/api/types';
import { MathContent } from '@/components/math';
import { statusLabel } from '@/components/numbers';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Card, NumberTile, Text, TextButton, accessibilityLabelOf } from '@/ui';

import type { CaptionText } from '../lessons/use-participant-caption';
import type { PlanState } from '../shared/plan-state';
import { PlanStatusBlock } from '../shared/plan-status-block';
import { isIssued } from './drafts-logic';
import type { DraftParticipantBusy } from './use-draft-board';

export type DraftParticipantDetailProps = {
  participant: HomeworkPlanParticipant;
  /** The number whose card is shown (picked in the grid, else the first of the set). */
  current: HomeworkPlanItem | null;
  planState: PlanState;
  /** The same caption the student's row carries: the state line under the title. */
  caption: CaptionText;
  aiAvailable: boolean;
  busy: DraftParticipantBusy | undefined;
  /** «Выдать всем» is running: every set waits for it. */
  issuingAll: boolean;
  /** "Regenerate" / "Retry" is cooling down (`429 rateLimited` of the plan bucket). */
  planBlocked: boolean;
  /** Set saves are cooling down. */
  itemsBlocked: boolean;
  /** Banners of the board repeated here: a sheet covers the board, and its answers must stay visible. */
  top?: ReactNode;
  onSelect: (item: HomeworkPlanItem) => void;
  onRegenerate: () => void;
  onAdd: () => void;
  onRemove: (item: HomeworkPlanItem) => void;
};

/**
 * One student of a homework draft (docs/spec/05-teacher-lessons-plans.md §1.7 "Participant card"; layout:
 * mockup `T-hwplan`, «Что подобрано»): the state line, the AI-plan state, the AI's summary, the set as
 * number tiles coloured by the student's current status of each number, and ONE card — of the picked
 * number: why it was selected, the AI comment, the statement, "remove". A set the homework was issued from
 * is frozen: nothing is removed or added. The buttons (rebuild, assign) are the footer.
 */
export function DraftParticipantDetail({
  participant,
  current,
  planState,
  caption,
  aiAvailable,
  busy,
  issuingAll,
  planBlocked,
  itemsBlocked,
  top,
  onSelect,
  onRegenerate,
  onAdd,
  onRemove,
}: DraftParticipantDetailProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.homeworkPlans.board;
  const common = dict.planner.common;
  const reasons: Record<string, string> = dict.planner.reasons;
  const issued = isIssued(participant);
  const working = busy !== undefined || issuingAll;
  const empty = participant.items.length === 0;

  return (
    <View style={styles.body} testID={`draft-participant-${participant.id}`}>
      {top}

      <Text variant="small" color={caption.attention ? 'redText' : 'textMuted'} tabular>
        {caption.text}
      </Text>

      <PlanStatusBlock
        state={planState}
        // An issued participant is frozen: its old plan error is not shown any more.
        planError={issued ? null : participant.planError}
        selectingLabel={t.aiSelecting}
        aiAvailable={aiAvailable}
        retrying={busy === 'regenerate'}
        retryDisabled={working || planBlocked}
        onRetry={onRegenerate}
        testID={`draft-plan-${participant.id}`}
      />

      {participant.planSummary ? <Text variant="body">{participant.planSummary}</Text> : null}

      {!empty ? (
        <View style={styles.grid}>
          {participant.items.map((item) => (
            <NumberTile
              key={item.id}
              label={item.number}
              // A solved number («решил сам», «исправил») cannot be assigned again: it will fail at issue time.
              status={item.studentStatus}
              current={item.id === current?.id}
              onPress={() => onSelect(item)}
              accessibilityLabel={format(m.common.numbers.tileA11y, { number: item.number, status: statusLabel(item.studentStatus, m.common.statuses) })}
              testID={`draft-item-${item.id}`}
              style={styles.tile}
            />
          ))}
        </View>
      ) : !planState.pending ? (
        <Card dashed testID={`draft-participant-empty-${participant.id}`}>
          <Text variant="small" color="textMuted">
            {common.noTasksYet}
          </Text>
        </Card>
      ) : null}

      {current ? (
        <View style={styles.item}>
          <Text variant="small" color="textMuted">
            {/* Why the number was selected and the student's current status of it: plain facts, one line. */}
            {accessibilityLabelOf(
              [
                format(common.numberSign, { n: current.number }),
                reasons[current.reason] ?? dict.planner.reasons.NEW,
                current.studentStatus ? statusLabel(current.studentStatus, m.common.statuses) : null,
              ],
              ' · ',
            )}
          </Text>
          {current.comment ? <Text variant="small">{current.comment}</Text> : null}
          {current.conditionLatex ? (
            <Card>
              <MathContent value={current.conditionLatex} variant="bare" />
            </Card>
          ) : null}
          {!issued ? (
            <TextButton
              label={format(common.removeNumber, { n: current.number })}
              tone="danger"
              disabled={working || itemsBlocked}
              onPress={() => onRemove(current)}
              testID={`draft-item-remove-${current.id}`}
              style={styles.link}
            />
          ) : null}
        </View>
      ) : null}

      {!issued ? (
        <Button
          label={dict.planner.lessonManualAdd.label}
          variant="outline"
          leftIcon="plus"
          disabled={working || itemsBlocked}
          loading={busy === 'items'}
          onPress={onAdd}
          testID={`draft-participant-add-${participant.id}`}
          style={styles.link}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  // Three tiles in a row: a six-digit number with its mark fits a third of a phone sheet.
  tile: { flexGrow: 1, flexBasis: '30%', maxWidth: '33%' },
  item: { gap: t.space.xs },
  link: { alignSelf: 'flex-start' },
}));
