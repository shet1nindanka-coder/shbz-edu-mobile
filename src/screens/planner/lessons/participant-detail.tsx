import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { DerivedLessonStatus, LessonBoardItem, LessonBoardParticipant } from '@/api/types';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, EmptyState, Notice, NumberTile, Text, TextButton, accessibilityLabelOf } from '@/ui';

import { CollapsedText } from '../shared/collapsed-text';
import type { PlanState } from '../shared/plan-state';
import { PlanStatusBlock } from '../shared/plan-status-block';
import { BoardItemCard } from './board-item-card';
import { boardTileStatus, splitParts, type ParticipantLive } from './board-logic';
import type { ParticipantBusy } from './use-lesson-board';
import type { CaptionText } from './use-participant-caption';

export type ParticipantDetailProps = {
  participant: LessonBoardParticipant;
  /** The number whose card is shown (picked in the grid, or chosen by the board). */
  current: LessonBoardItem | null;
  lessonStatus: DerivedLessonStatus;
  planState: PlanState;
  live: ParticipantLive;
  /** The student's state: its `detail` is the line under the title (a live fact the sheet shows nowhere else). */
  caption: CaptionText;
  aiAvailable: boolean;
  busy: ParticipantBusy | undefined;
  /** "Retry" is cooling down (`429 rateLimited` of the plan bucket). */
  planBlocked: boolean;
  /** Set saves are cooling down. */
  itemsBlocked: boolean;
  itemErrors: Record<string, string>;
  now: number;
  /** «№ 12 убран из набора» of this student, while it can still be undone. */
  undoText: string | null;
  /** Banners of the board repeated here: a sheet covers the board, and its answers must stay visible. */
  top?: ReactNode;
  /** The result buttons, where they are not a pinned footer (a lesson for one student, right on the page). */
  results?: ReactNode;
  onUndo: () => void;
  onSelect: (item: LessonBoardItem) => void;
  onRetry: () => void;
  onAdd: () => void;
  onRemove: (item: LessonBoardItem) => void;
  onHistory: (item: LessonBoardItem) => void;
  onOpenPhoto: (item: LessonBoardItem, index: number) => void;
};

/**
 * One student of the lesson (docs/spec/05-teacher-lessons-plans.md §1.3 "Participant cards"; layout:
 * mockups `PT-board` — a sheet, `T-board` — the panel next to the class): a state line while the lesson
 * runs («в классе с 17:02», «не вошёл»), the AI-plan state, the AI's summary folded to a line, the grid of
 * the student's number tiles coloured by the lesson result — the main part, then the extra one — and ONE
 * card, of the picked number. "Add a problem" closes the body; the result buttons are the footer of the
 * sheet / panel (`ItemResultBar`).
 */
export function ParticipantDetail({
  participant,
  current,
  lessonStatus,
  planState,
  live,
  caption,
  aiAvailable,
  busy,
  planBlocked,
  itemsBlocked,
  itemErrors,
  now,
  undoText,
  top,
  results,
  onUndo,
  onSelect,
  onRetry,
  onAdd,
  onRemove,
  onHistory,
  onOpenPhoto,
}: ParticipantDetailProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.lessonBoard;
  const common = dict.planner.common;
  const { main, extra } = splitParts(participant.items);
  const resultNames = dict.students.lessonResult;

  const tile = (item: LessonBoardItem) => (
    <NumberTile
      key={item.id}
      label={item.number}
      status={boardTileStatus(item)}
      current={item.id === current?.id}
      onPress={() => onSelect(item)}
      // The full number and what the lesson says about it: «051004, решил».
      accessibilityLabel={accessibilityLabelOf([item.number, item.result ? resultNames[item.result] : m.common.statuses.none.label])}
      testID={`lesson-tile-${item.id}`}
      style={styles.tile}
    />
  );

  return (
    <View style={styles.body} testID={`lesson-participant-${participant.id}`}>
      {top}

      {caption.detail ? (
        <Text variant="small" color={caption.attention ? 'redText' : 'textMuted'} tabular>
          {caption.detail}
        </Text>
      ) : null}

      <PlanStatusBlock
        state={planState}
        planError={participant.planError}
        selectingLabel={t.aiSelecting}
        aiAvailable={aiAvailable}
        retrying={busy === 'regenerate'}
        retryDisabled={busy !== undefined || planBlocked}
        onRetry={onRetry}
        testID={`lesson-plan-${participant.id}`}
      />

      {participant.planSummary ? <CollapsedText text={participant.planSummary} testID={`lesson-plan-summary-${participant.id}`} /> : null}

      {undoText ? (
        // The board's "undo" toast would sit under a sheet: the removed number is undone right here.
        <Notice
          tone="success"
          text={undoText}
          action={<TextButton label={common.undo} onPress={onUndo} testID="lesson-undo-toast-undo" />}
          testID="lesson-undo-toast"
        />
      ) : null}

      {participant.items.length > 0 ? (
        <View style={styles.parts}>
          {/* The parts are named only when there are two of them. */}
          {extra.length > 0 && main.length > 0 ? (
            <Text variant="label" color="textMuted">
              {t.mainPart}
            </Text>
          ) : null}
          {main.length > 0 ? <View style={styles.grid}>{main.map(tile)}</View> : null}
          {extra.length > 0 ? (
            <>
              <Text variant="label" color="textMuted">
                {t.extraPart}
              </Text>
              <View style={styles.grid}>{extra.map(tile)}</View>
            </>
          ) : null}
        </View>
      ) : !planState.pending ? (
        <EmptyState variant="plain" title={m.planner.lessonBoard.noTasks} />
      ) : null}

      {current ? (
        <BoardItemCard
          // Another number must not carry this one's announcements.
          key={current.id}
          item={current}
          busy={busy !== undefined || itemsBlocked}
          error={itemErrors[current.id]}
          spentMinutes={live.spentByItemId[current.id]}
          now={now}
          live={lessonStatus === 'ACTIVE'}
          onRemove={() => onRemove(current)}
          onHistory={() => onHistory(current)}
          onOpenPhoto={(index) => onOpenPhoto(current, index)}
        />
      ) : null}

      {results}

      <Button
        label={dict.planner.lessonManualAdd.label}
        variant="outline"
        leftIcon="plus"
        disabled={busy !== undefined || itemsBlocked}
        loading={busy === 'items'}
        onPress={onAdd}
        testID={`lesson-participant-add-${participant.id}`}
        style={styles.add}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.md },
  parts: { gap: t.space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  // Three tiles in a row, as in the mockup: a six-digit number with its mark fits a third of a phone sheet.
  tile: { flexGrow: 1, flexBasis: '30%', maxWidth: '31.5%' },
  add: { alignSelf: 'flex-start' },
}));
