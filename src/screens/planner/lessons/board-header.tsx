import { View } from 'react-native';

import { errorText } from '@/api';
import type { LessonBoardModel } from '@/api/types';
import { HandoutNotice } from '@/components/lessons';
import type { Handout } from '@/components/lessons';
import { RetryWaitLine } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { Button, Notice, Spinner, Text } from '@/ui';

import { needsSchedule } from './board-logic';
import { ScheduleBanner } from './schedule-banner';
import type { LessonBoardController } from './use-lesson-board';

export type BoardHeaderProps = {
  lesson: LessonBoardModel;
  controller: LessonBoardController;
  handout: Handout;
  onFinish: () => void;
};

/**
 * Top of the lesson board (docs/spec/05-teacher-lessons-plans.md §1.3 toolbar and banners): the status
 * pill with the one contextual action (finish, while the lesson runs), the generation counter, then the
 * banners in the site's order — no time, AI unavailable, the transient notice.
 */
export function BoardHeader({ lesson, controller, handout, onFinish }: BoardHeaderProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const t = dict.planner.lessonBoard;
  const isLive = lesson.status === 'ACTIVE';
  const { waits, notice, board } = controller;
  // Result marks have their own line under the rows of every open card (participant-card.tsx).
  const waitSeconds = Math.max(waits.plan.seconds, waits.items.seconds, waits.lesson.seconds);

  return (
    <View style={styles.header}>
      {/* The app bar has one line; the lesson title is shown here in full. */}
      <Text variant="sectionTitle" accessibilityRole="header" testID="lesson-board-title">
        {lesson.title}
      </Text>
      <View style={styles.toolbar}>
        <View
          accessible
          accessibilityLabel={dict.planner.lessonStatus[lesson.status]}
          // The running lesson is the kit's positive pair (green text on the soft green): white on the
          // accent fill is below 3:1 in the light theme and below 2:1 in the dark one.
          style={[styles.pill, { backgroundColor: isLive ? theme.status.GREEN.bg : theme.colors.tabHover }]}
          testID="lesson-status-pill"
        >
          <Text variant="smallBold" style={{ color: isLive ? theme.status.GREEN.text : theme.colors.kicker }}>
            {dict.planner.lessonStatus[lesson.status]}
          </Text>
        </View>
        {isLive ? (
          <Button
            label={controller.finish.isPending ? t.finishing : t.finish}
            variant="outline"
            loading={controller.finish.isPending}
            disabled={waits.lesson.waiting}
            onPress={onFinish}
            testID="lesson-finish"
          />
        ) : null}
        {controller.pendingCount > 0 ? (
          <View accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={styles.progress} testID="lesson-ready-of">
            <Spinner size={14} color="accentSolid" />
            <Text variant="smallStrong" color="textMuted" tabular>
              {format(dict.planner.common.readyOf, { ready: controller.readyCount, total: lesson.participants.length })}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Cached data stays on screen when a refresh fails (offline): say so instead of replacing it. */}
      {board.isError ? <Notice tone="error" text={errorText(board.error, m.common.errors.generic)} testID="lesson-refresh-error" /> : null}

      {needsSchedule(lesson) ? (
        <ScheduleBanner pending={controller.schedule.isPending} disabled={waits.lesson.waiting} onSchedule={(iso) => controller.schedule.mutate(iso)} />
      ) : null}

      {!lesson.aiAvailable ? <Notice tone="warning" text={t.aiUnavailable} testID="lesson-ai-unavailable" /> : null}

      {notice ? (
        <Notice tone={notice.tone} text={notice.text} onDismiss={controller.dismissNotice} dismissLabel={m.common.actions.close} testID="lesson-notice" />
      ) : null}
      {/* Outside the notice: dismissing it does not unlock the buttons, so the reason stays as long as the lock. */}
      <RetryWaitLine seconds={waitSeconds} testID="lesson-wait" />

      <HandoutNotice handout={handout} testID="lesson-handout-error" />

      {lesson.participants.some((participant) => participant.items.length > 0) ? (
        <Hint>
          <Text variant="caption" color="textMuted">
            {m.planner.lessonBoard.resultHint}
          </Text>
        </Hint>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { gap: t.space.md, paddingBottom: t.space.lg },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.md },
  pill: { height: t.sizes.button, paddingHorizontal: 18, borderRadius: t.radii.md, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, minHeight: t.sizes.button },
}));
