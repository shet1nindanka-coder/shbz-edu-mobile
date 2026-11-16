import { View } from 'react-native';

import type { DerivedLessonStatus, LessonBoardItem, LessonBoardParticipant, LessonItemResult } from '@/api/types';
import { formatClockTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Button, Card, Chip, Icon, PressableScale, Spinner, Text } from '@/ui';

import type { PlanState } from '../shared/plan-state';
import { PlanStatusBlock } from '../shared/plan-status-block';
import { itemOrdinal, splitParts, type ParticipantLive } from './board-logic';
import { ItemRow } from './item-row';
import type { ParticipantBusy } from './use-lesson-board';

export type ParticipantCardProps = {
  participant: LessonBoardParticipant;
  lessonStatus: DerivedLessonStatus;
  planState: PlanState;
  live: ParticipantLive;
  aiAvailable: boolean;
  expanded: boolean;
  busy: ParticipantBusy | undefined;
  /** "Retry" is cooling down (`429 rateLimited` of the plan bucket). */
  planBlocked: boolean;
  /** Set saves are cooling down. */
  itemsBlocked: boolean;
  /** Result marks are cooling down. */
  resultsBlocked: boolean;
  savingItemIds: readonly string[];
  itemErrors: Record<string, string>;
  now: number;
  onToggle: () => void;
  onRetry: () => void;
  onAdd: () => void;
  onResult: (item: LessonBoardItem, result: LessonItemResult | null) => void;
  onRemove: (item: LessonBoardItem) => void;
  onHistory: (item: LessonBoardItem) => void;
  onOpenPhoto: (item: LessonBoardItem, index: number) => void;
};

/**
 * One student of the lesson (docs/spec/05-teacher-lessons-plans.md §1.3 "Participant cards"). The header
 * carries the live chips, so idle students are visible while the card is collapsed; the body is the plan
 * state, the AI summary, the main and extra parts and "add a problem".
 */
export function ParticipantCard({
  participant,
  lessonStatus,
  planState,
  live,
  aiAvailable,
  expanded,
  busy,
  planBlocked,
  itemsBlocked,
  resultsBlocked,
  savingItemIds,
  itemErrors,
  now,
  onToggle,
  onRetry,
  onAdd,
  onResult,
  onRemove,
  onHistory,
  onOpenPhoto,
}: ParticipantCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.lessonBoard;
  const common = dict.planner.common;
  const isLive = lessonStatus === 'ACTIVE';
  const { main, extra } = splitParts(participant.items);
  const idle = live.idle && live.idle.level !== 'ok' ? live.idle : null;
  const failed = planState.failed || planState.stale;

  const renderItem = (item: LessonBoardItem, index: number) => (
    <ItemRow
      key={item.id}
      item={item}
      ordinal={itemOrdinal(index, item.isExtra, main.length)}
      busy={busy !== undefined || itemsBlocked}
      saving={savingItemIds.includes(item.id)}
      resultsBlocked={resultsBlocked}
      error={itemErrors[item.id]}
      spentMinutes={live.spentByItemId[item.id]}
      now={now}
      live={isLive}
      onResult={(result) => onResult(item, result)}
      onRemove={() => onRemove(item)}
      onHistory={() => onHistory(item)}
      onOpenPhoto={(photoIndex) => onOpenPhoto(item, photoIndex)}
    />
  );

  return (
    <Card
      // An idle alert is not a traffic-light status: the danger border tells the teacher whom to walk up to.
      style={[styles.card, idle?.level === 'alert' ? { borderColor: theme.colors.dangerBorder } : null]}
      testID={`lesson-participant-${participant.id}`}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={format(expanded ? m.planner.lessonBoard.collapse : m.planner.lessonBoard.expand, { name: participant.studentName })}
        accessibilityState={{ expanded }}
        scaleTo={1}
        onPress={onToggle}
        testID={`lesson-participant-toggle-${participant.id}`}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <Text variant="cardTitle" accessibilityRole="header" numberOfLines={2} style={styles.name}>
            {participant.studentName}
          </Text>
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={18} color="kicker" />
        </View>
        <View style={styles.headerMeta}>
          {!planState.pending ? (
            <Chip tone="muted" label={format(dict.planner.homeworkPlans.board.tasksCount, { n: participant.items.length })} />
          ) : !expanded ? (
            // The open card says the same in its body.
            <View style={styles.selecting}>
              <Spinner size={14} color="accentSolid" />
              <Text variant="caption" color="textMuted">
                {t.aiSelecting}
              </Text>
            </View>
          ) : null}
          {failed ? <Chip tone="red" label={common.error} /> : null}
          {isLive ? (
            <>
              <Chip tone="muted" label={format(t.submitted, { done: live.submittedCount, total: live.totalCount })} />
              {idle ? <Chip tone={idle.level === 'alert' ? 'red' : 'yellow'} label={format(t.noSubmissions, { n: idle.idleMinutes })} /> : null}
            </>
          ) : null}
        </View>
        {isLive ? (
          <Text variant="caption" color="textSoft" tabular>
            {participant.joinedAt ? format(t.inClassSince, { time: formatClockTime(participant.joinedAt, locale) }) : t.notOpened}
          </Text>
        ) : null}
      </PressableScale>

      {expanded ? (
        <View style={styles.body}>
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

          {participant.planSummary ? (
            <View style={styles.summary}>
              <Text variant="small" color="textMuted">
                {participant.planSummary}
              </Text>
            </View>
          ) : null}

          {main.length > 0 ? (
            <View style={styles.part}>
              <Text variant="kickerSm">{t.mainPart}</Text>
              {main.map(renderItem)}
            </View>
          ) : !planState.pending ? (
            <Text variant="small" color="textMuted">
              {common.noTasksYet}
            </Text>
          ) : null}

          {extra.length > 0 ? (
            <View style={styles.part}>
              <Text variant="kickerSm">{t.extraPart}</Text>
              {extra.map(renderItem)}
            </View>
          ) : null}

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
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  header: { gap: t.space.xs, minHeight: t.sizes.minTouch, justifyContent: 'center' },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  name: { flex: 1, minWidth: 0 },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.xs },
  selecting: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs, minHeight: 28 },
  body: { gap: t.space.md },
  summary: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: t.radii.md, backgroundColor: t.colors.softBg },
  part: { gap: t.space.sm },
  add: { alignSelf: 'flex-start' },
}));
