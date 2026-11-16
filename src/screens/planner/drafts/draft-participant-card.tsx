import { View } from 'react-native';

import type { HomeworkPlanItem, HomeworkPlanParticipant } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Card, Chip, Icon, PressableScale, Spinner, Text } from '@/ui';

import type { PlanState } from '../shared/plan-state';
import { PlanStatusBlock } from '../shared/plan-status-block';
import { DraftItemRow } from './draft-item-row';
import { isIssued } from './drafts-logic';
import type { DraftParticipantBusy } from './use-draft-board';

export type DraftParticipantCardProps = {
  participant: HomeworkPlanParticipant;
  planState: PlanState;
  aiAvailable: boolean;
  expanded: boolean;
  busy: DraftParticipantBusy | undefined;
  /** «Выдать всем» is running: every card waits for it. */
  issuingAll: boolean;
  /** "Regenerate" / "Retry" is cooling down (`429 rateLimited` of the plan bucket). */
  planBlocked: boolean;
  /** Set saves are cooling down. */
  itemsBlocked: boolean;
  /** Issuing is cooling down. */
  issueBlocked: boolean;
  /** The student's card can be opened by this role. */
  canOpenStudent: boolean;
  onToggle: () => void;
  onRegenerate: () => void;
  onIssue: () => void;
  onAdd: () => void;
  onRemove: (item: HomeworkPlanItem) => void;
  onOpenStudent: () => void;
};

/**
 * One student of a homework draft (docs/spec/05-teacher-lessons-plans.md §1.7 "Participant card"): the
 * set the AI selected, "regenerate" and "assign" while the homework is not issued, and a frozen card with
 * a link to the student's homework once it is.
 */
export function DraftParticipantCard({
  participant,
  planState,
  aiAvailable,
  expanded,
  busy,
  issuingAll,
  planBlocked,
  itemsBlocked,
  issueBlocked,
  canOpenStudent,
  onToggle,
  onRegenerate,
  onIssue,
  onAdd,
  onRemove,
  onOpenStudent,
}: DraftParticipantCardProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.homeworkPlans.board;
  const common = dict.planner.common;
  const issued = isIssued(participant);
  const working = busy !== undefined || issuingAll;
  // An issued participant is frozen: its old plan error is not shown any more.
  const failed = !issued && (planState.failed || planState.stale);
  const empty = participant.items.length === 0;

  return (
    <Card style={styles.card} testID={`draft-participant-${participant.id}`}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={format(expanded ? m.planner.lessonBoard.collapse : m.planner.lessonBoard.expand, { name: participant.studentName })}
        accessibilityState={{ expanded }}
        scaleTo={1}
        onPress={onToggle}
        testID={`draft-participant-toggle-${participant.id}`}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <Text variant="cardTitle" accessibilityRole="header" numberOfLines={2} style={styles.name}>
            {participant.studentName}
          </Text>
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={18} color="kicker" />
        </View>
        {/* While the plan is being built the open card says so in its body: no second line here. */}
        {!planState.pending || !expanded ? (
          <View style={styles.headerMeta}>
            {!planState.pending ? (
              <Chip tone="muted" label={format(t.tasksCount, { n: participant.items.length })} />
            ) : (
              <View style={styles.selecting}>
                <Spinner size={14} color="accentSolid" />
                <Text variant="caption" color="textMuted">
                  {t.aiSelecting}
                </Text>
              </View>
            )}
            {issued ? <Chip tone="green" icon="check" label={t.issued} /> : null}
            {failed ? <Chip tone="red" label={common.error} /> : null}
          </View>
        ) : null}
      </PressableScale>

      {expanded ? (
        <View style={styles.body}>
          {issued ? (
            canOpenStudent ? (
              <Button
                label={t.studentHomework}
                variant="outline"
                rightIcon="forward"
                onPress={onOpenStudent}
                testID={`draft-participant-homework-${participant.id}`}
                style={styles.single}
              />
            ) : null
          ) : (
            <View style={styles.actions}>
              <Button
                label={t.regenerate}
                variant="outline"
                loading={busy === 'regenerate'}
                disabled={working || planState.pending || !aiAvailable || planBlocked}
                onPress={onRegenerate}
                testID={`draft-participant-regenerate-${participant.id}`}
                style={styles.action}
              />
              <Button
                label={t.issue}
                loading={busy === 'issue'}
                disabled={working || planState.pending || empty || issueBlocked}
                onPress={onIssue}
                testID={`draft-participant-issue-${participant.id}`}
                style={styles.action}
              />
            </View>
          )}

          <PlanStatusBlock
            state={planState}
            planError={issued ? null : participant.planError}
            selectingLabel={t.aiSelecting}
            aiAvailable={aiAvailable}
            retrying={busy === 'regenerate'}
            retryDisabled={working || planBlocked}
            onRetry={onRegenerate}
            testID={`draft-plan-${participant.id}`}
          />

          {participant.planSummary ? (
            <View style={styles.summary}>
              <Text variant="small" color="textMuted">
                {participant.planSummary}
              </Text>
            </View>
          ) : null}

          {!empty ? (
            <View style={styles.items}>
              {participant.items.map((item, index) => (
                <DraftItemRow key={item.id} item={item} ordinal={index + 1} issued={issued} busy={working || itemsBlocked} onRemove={() => onRemove(item)} />
              ))}
            </View>
          ) : !planState.pending ? (
            <Text variant="small" color="textMuted" testID={`draft-participant-empty-${participant.id}`}>
              {common.noTasksYet}
            </Text>
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
              style={styles.single}
            />
          ) : null}
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
  actions: { flexDirection: 'row', gap: t.space.md },
  action: { flex: 1 },
  single: { alignSelf: 'flex-start' },
  summary: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: t.radii.md, backgroundColor: t.colors.softBg },
  items: { gap: t.space.sm },
}));
