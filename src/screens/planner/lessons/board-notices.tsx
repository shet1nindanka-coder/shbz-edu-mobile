import { View } from 'react-native';

import { errorText } from '@/api';
import type { LessonBoardModel } from '@/api/types';
import { HandoutNotice } from '@/components/lessons';
import type { Handout } from '@/components/lessons';
import { RetryWaitLine } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Notice, Spinner, Text } from '@/ui';

import { needsSchedule } from './board-logic';
import { ScheduleBanner } from './schedule-banner';
import type { LessonBoardController } from './use-lesson-board';

export type BoardNoticesProps = {
  lesson: LessonBoardModel;
  controller: LessonBoardController;
  handout: Handout;
};

/**
 * What the lesson board says above the class (docs/spec/05-teacher-lessons-plans.md §1.3 banners), in the
 * site's order: a failed refresh, "the lesson has no time", AI unavailable, the answer to the last action
 * with the cool-down line, a handout that did not open — then the generation counter («1/3» next to a
 * spinner). Each line appears only while it has something to say, so a quiet board starts with its class.
 */
export function BoardNotices({ lesson, controller, handout }: BoardNoticesProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const { waits, notice, board } = controller;
  // Result marks have their own line next to the result buttons (item-result-bar.tsx).
  const waitSeconds = Math.max(waits.plan.seconds, waits.items.seconds, waits.lesson.seconds);

  return (
    <>
      {/* Cached data stays on screen when a refresh fails (offline): say so instead of replacing it. */}
      {board.isError ? <Notice tone="error" text={errorText(board.error, m.common.errors.generic)} testID="lesson-refresh-error" /> : null}

      {needsSchedule(lesson) ? (
        <ScheduleBanner pending={controller.schedule.isPending} disabled={waits.lesson.waiting} onSchedule={(iso) => controller.schedule.mutate(iso)} />
      ) : null}

      {/* The short site wording; what to do instead («добавляйте номера…») is the board itself. */}
      {!lesson.aiAvailable ? <Notice tone="warning" text={dict.planner.lessonCompose.aiUnavailable} testID="lesson-ai-unavailable" /> : null}

      {notice ? (
        <Notice tone={notice.tone} text={notice.text} onDismiss={controller.dismissNotice} dismissLabel={m.common.actions.close} testID="lesson-notice" />
      ) : null}
      {/* Outside the notice: dismissing it does not unlock the buttons, so the reason stays as long as the lock. */}
      <RetryWaitLine seconds={waitSeconds} testID="lesson-wait" />

      <HandoutNotice handout={handout} testID="lesson-handout-error" />

      {controller.pendingCount > 0 ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={format(dict.planner.common.readyOf, { ready: controller.readyCount, total: lesson.participants.length })}
          accessibilityLiveRegion="polite"
          style={styles.progress}
          testID="lesson-ready-of"
        >
          <Spinner size={theme.sizes.icon.sm} color="accentSolid" />
          <Text variant="small" color="textMuted" tabular>
            {format(m.common.numbers.doneOf, { done: controller.readyCount, total: lesson.participants.length })}
          </Text>
        </View>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((t) => ({
  progress: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs, paddingHorizontal: t.space.xxs },
}));
