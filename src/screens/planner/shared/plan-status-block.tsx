import { View } from 'react-native';

import { planErrorText } from '@/domain/plan-error';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Notice, Spinner, Text } from '@/ui';

import type { PlanState } from './plan-state';

export type PlanStatusBlockProps = {
  state: PlanState;
  /** Raw `planError` of the participant (`plan-error:<code>`, a legacy sentence or null). */
  planError: string | null;
  /** «ИИ подбирает задания…» (lesson) / «ИИ подбирает задание…» (homework draft). */
  selectingLabel: string;
  /** A failed plan can be retried only while AI selection is available; a lost one always. */
  aiAvailable: boolean;
  /** The retry request of this participant is running. */
  retrying: boolean;
  /** Another request of this participant is running, or the plan limit is cooling down. */
  retryDisabled?: boolean;
  onRetry: () => void;
  testID?: string;
};

/**
 * AI-plan state of one participant on a board (docs/spec/05-teacher-lessons-plans.md §1.3 items 2–4):
 * the spinner while the plan is being built, "the job was lost" after 15 minutes, or the stored plan
 * error — the last two with «Повторить». Renders nothing for a ready participant.
 */
export function PlanStatusBlock({ state, planError, selectingLabel, aiAvailable, retrying, retryDisabled = false, onRetry, testID }: PlanStatusBlockProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const common = dict.planner.common;

  const retry = (
    <Button
      label={common.retry}
      size="sm"
      variant="outline"
      loading={retrying}
      disabled={retryDisabled}
      onPress={onRetry}
      testID={testID ? `${testID}-retry` : undefined}
    />
  );

  if (state.pending) {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel={selectingLabel} accessibilityLiveRegion="polite" style={styles.pending} testID={testID ? `${testID}-pending` : undefined}>
        <Spinner size={14} color="accentSolid" />
        <Text variant="smallMedium" color="textMuted" style={styles.pendingText}>
          {selectingLabel}
        </Text>
      </View>
    );
  }

  if (state.stale) {
    return <Notice tone="error" text={common.planLost} action={retry} testID={testID ? `${testID}-stale` : undefined} />;
  }

  if (planError !== null) {
    return (
      <Notice
        tone="error"
        text={planErrorText(planError, dict.planner.planErrors)}
        action={aiAvailable ? retry : undefined}
        testID={testID ? `${testID}-error` : undefined}
      />
    );
  }

  return null;
}

const useStyles = makeStyles((t) => ({
  pending: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, minHeight: 24 },
  pendingText: { flex: 1 },
}));
