import { View } from 'react-native';

import type { HomeworkPlanParticipant } from '@/api/types';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button } from '@/ui';

import type { PlanState } from '../shared/plan-state';
import { isIssued } from './drafts-logic';
import type { DraftParticipantBusy } from './use-draft-board';

export type DraftParticipantActionsProps = {
  participant: HomeworkPlanParticipant;
  planState: PlanState;
  aiAvailable: boolean;
  busy: DraftParticipantBusy | undefined;
  /** «Выдать всем» is running: every set waits for it. */
  issuingAll: boolean;
  /** "Regenerate" is cooling down (`429 rateLimited` of the plan bucket). */
  planBlocked: boolean;
  /** Issuing is cooling down. */
  issueBlocked: boolean;
  /** The student's card can be opened by this role. */
  canOpenStudent: boolean;
  /**
   * «Выдать» is the main action of the surface it stands on (a sheet). Next to the board's own «Выдать всем»
   * — a tablet panel, a draft for one student — it is an ordinary button: one gradient per screen.
   */
  primaryIssue: boolean;
  onRegenerate: () => void;
  onIssue: () => void;
  onOpenStudent: () => void;
};

/**
 * What is done with one student's set (docs/spec/05-teacher-lessons-plans.md §1.7): rebuild it and assign
 * it while the homework is not issued; afterwards only the way to the student's homework is left. The
 * footer of the student's sheet / panel.
 */
export function DraftParticipantActions({
  participant,
  planState,
  aiAvailable,
  busy,
  issuingAll,
  planBlocked,
  issueBlocked,
  canOpenStudent,
  primaryIssue,
  onRegenerate,
  onIssue,
  onOpenStudent,
}: DraftParticipantActionsProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.planner.homeworkPlans.board;
  const working = busy !== undefined || issuingAll;

  if (isIssued(participant)) {
    if (!canOpenStudent) return null;
    return (
      <Button
        label={t.studentHomework}
        variant="outline"
        rightIcon="forward"
        fullWidth
        onPress={onOpenStudent}
        testID={`draft-participant-homework-${participant.id}`}
      />
    );
  }

  return (
    <View style={styles.actions}>
      <Button
        label={t.regenerate}
        variant="outline"
        leftIcon="sparkles"
        loading={busy === 'regenerate'}
        disabled={working || planState.pending || !aiAvailable || planBlocked}
        onPress={onRegenerate}
        testID={`draft-participant-regenerate-${participant.id}`}
        style={styles.regenerate}
      />
      <Button
        label={t.issue}
        variant={primaryIssue ? 'primary' : 'outline'}
        loading={busy === 'issue'}
        disabled={working || planState.pending || participant.items.length === 0 || issueBlocked}
        onPress={onIssue}
        testID={`draft-participant-issue-${participant.id}`}
        style={styles.action}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  actions: { flexDirection: 'row', gap: t.space.xs },
  // «Пересобрать» with its icon is the longer label: in the card of a one-student draft on a phone an
  // equal half cut it («Пересобра…»).
  regenerate: { flex: 3 },
  action: { flex: 2 },
}));
