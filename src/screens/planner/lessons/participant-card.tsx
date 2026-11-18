import { View } from 'react-native';

import type { DerivedLessonStatus, LessonBoardItem, LessonBoardParticipant, LessonItemResult } from '@/api/types';
import { RetryWaitLine } from '@/components/retry-wait';
import { formatClockTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Button, Card, CardPressArea, Chip, Icon, Spinner, Text } from '@/ui';

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
  /** Seconds until result marks may be saved again (`429` / `503` of the result bucket); 0 when free. */
  resultWaitSeconds: number;
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
  resultWaitSeconds,
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
  const resultsBlocked = resultWaitSeconds > 0;
  // What the header shows, also spoken with its name: the header is one element for a screen reader.
  const tasksLabel = !planState.pending ? format(dict.planner.homeworkPlans.board.tasksCount, { n: participant.items.length }) : null;
  const selectingLabel = planState.pending && !expanded ? t.aiSelecting : null;
  const failedLabel = failed ? common.error : null;
  const submittedLabel = isLive ? format(t.submitted, { done: live.submittedCount, total: live.totalCount }) : null;
  const idleLabel = isLive && idle ? format(t.noSubmissions, { n: idle.idleMinutes }) : null;
  const presenceLabel = isLive
    ? participant.joinedAt
      ? format(t.inClassSince, { time: formatClockTime(participant.joinedAt, locale) })
      : t.notOpened
    : null;

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
      <CardPressArea
        accessibilityLabel={format(expanded ? m.planner.lessonBoard.collapse : m.planner.lessonBoard.expand, { name: participant.studentName })}
        accessibilityParts={[tasksLabel, selectingLabel, failedLabel, submittedLabel, idleLabel, presenceLabel]}
        expanded={expanded}
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
          {tasksLabel !== null ? (
            <Chip tone="muted" label={tasksLabel} />
          ) : selectingLabel !== null ? (
            // The open card says the same in its body.
            <View style={styles.selecting}>
              <Spinner size={14} color="accentSolid" />
              <Text variant="caption" color="textMuted">
                {t.aiSelecting}
              </Text>
            </View>
          ) : null}
          {failedLabel !== null ? <Chip tone="red" label={failedLabel} /> : null}
          {submittedLabel !== null ? <Chip tone="muted" label={submittedLabel} /> : null}
          {idleLabel !== null && idle ? <Chip tone={idle.level === 'alert' ? 'red' : 'yellow'} label={idleLabel} /> : null}
        </View>
        {presenceLabel !== null ? (
          <Text variant="caption" color="textSoft" tabular>
            {presenceLabel}
          </Text>
        ) : null}
      </CardPressArea>

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

          {/* The result bucket locks every traffic light of the board: each open card says until when,
              under its own rows, since the board header may be far above. */}
          {participant.items.length > 0 ? (
            <RetryWaitLine seconds={resultWaitSeconds} testID={`lesson-result-wait-${participant.id}`} />
          ) : null}

          <Button
            label={dict.planner.lessonManualAdd.label}
            accessibilityLabel={format(m.planner.lessonBoard.forStudent, { action: dict.planner.lessonManualAdd.label, name: participant.studentName })}
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
