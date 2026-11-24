import { View } from 'react-native';

import { errorText } from '@/api';
import type { HomeworkPlanBoardModel } from '@/api/types';
import { HandoutNotice } from '@/components/lessons';
import type { Handout } from '@/components/lessons';
import { RetryWaitLine } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Notice, Spinner, Text } from '@/ui';

import type { DraftBoardController } from './use-draft-board';

export type DraftBoardNoticesProps = {
  plan: HomeworkPlanBoardModel;
  controller: DraftBoardController;
  handout: Handout;
};

/**
 * What the homework-draft board says above its students (docs/spec/05-teacher-lessons-plans.md §1.7
 * banners), in the site's order: a failed refresh, AI unavailable, the answer to the last action with the
 * cool-down line, the students the homework could not be assigned to, a handout that did not open — then
 * the generation counter («1/3» next to a spinner). Each line appears only while it has something to say.
 */
export function DraftBoardNotices({ plan, controller, handout }: DraftBoardNoticesProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.planner.homeworkPlans.board;
  const { waits, notice, board, issueFailures } = controller;
  const waitSeconds = Math.max(waits.plan.seconds, waits.items.seconds, waits.draft.seconds);

  return (
    <>
      {/* Cached data stays on screen when a refresh fails (offline): say so instead of replacing it. */}
      {board.isError ? <Notice tone="error" text={errorText(board.error, m.common.errors.generic)} testID="draft-refresh-error" /> : null}

      {/* The short site wording; what to do instead («добавляйте номера…») is the board itself. */}
      {!plan.aiAvailable ? <Notice tone="warning" text={dict.planner.lessonCompose.aiUnavailable} testID="draft-ai-unavailable" /> : null}

      {notice ? (
        <Notice tone={notice.tone} text={notice.text} onDismiss={controller.dismissNotice} dismissLabel={m.common.actions.close} testID="draft-notice" />
      ) : null}
      {/* Outside the notice: dismissing it does not unlock the buttons, so the reason stays as long as the lock. */}
      <RetryWaitLine seconds={waitSeconds} testID="draft-wait" />

      {issueFailures.length > 0 ? (
        <Notice tone="error" title={t.issueFailures} onDismiss={controller.dismissIssueFailures} dismissLabel={m.common.actions.close} testID="draft-issue-failures">
          <View style={styles.failures}>
            {issueFailures.map((failure) => (
              <Text key={failure.participantId} variant="small" color="dangerText" testID={`draft-issue-failure-${failure.participantId}`}>
                <Text variant="smallBold" color="dangerText">
                  {failure.name}
                </Text>
                {`: ${failure.message}`}
              </Text>
            ))}
          </View>
        </Notice>
      ) : null}

      <HandoutNotice handout={handout} testID="draft-handout-error" />

      {controller.pendingCount > 0 ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={format(dict.planner.common.readyOf, { ready: controller.readyCount, total: plan.participants.length })}
          accessibilityLiveRegion="polite"
          style={styles.progress}
          testID="draft-ready-of"
        >
          <Spinner size={theme.sizes.icon.sm} color="accentSolid" />
          <Text variant="small" color="textMuted" tabular>
            {format(m.common.numbers.doneOf, { done: controller.readyCount, total: plan.participants.length })}
          </Text>
        </View>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((t) => ({
  failures: { gap: t.space.xs },
  progress: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs, paddingHorizontal: t.space.xxs },
}));
