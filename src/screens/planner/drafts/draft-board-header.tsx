import { View } from 'react-native';

import type { HomeworkPlanBoardModel } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Chip, Icon, Notice, Spinner, Text } from '@/ui';

import { errorText } from '../shared/error-text';
import { HandoutNotice } from '../shared/handout-notice';
import type { Handout } from '../shared/use-handout';
import { RetryWaitLine } from '../shared/use-retry-wait';
import type { DraftBoardController } from './use-draft-board';

export type DraftBoardHeaderProps = {
  plan: HomeworkPlanBoardModel;
  controller: DraftBoardController;
  handout: Handout;
  /** Opens the lesson the homework reinforces; absent when this role cannot open it. */
  onOpenSourceLesson?: () => void;
};

/**
 * Top of the homework-draft board (docs/spec/05-teacher-lessons-plans.md §1.7 header, toolbar and
 * banners): the deadline line, the lesson the draft was made from, the "assigned" chip and the
 * generation counter, then the banners in the site's order — AI unavailable, the transient notice, the
 * list of students the homework could not be assigned to.
 */
export function DraftBoardHeader({ plan, controller, handout, onOpenSourceLesson }: DraftBoardHeaderProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.homeworkPlans.board;
  const detail = dict.planner.homeworkPlans.detail;
  const { waits, notice, board, issueFailures } = controller;
  const waitSeconds = Math.max(waits.plan.seconds, waits.items.seconds, waits.draft.seconds);

  const deadlineLabel =
    plan.deadlineAt && plan.daysUntilDeadline !== null
      ? format(plural(locale, plan.daysUntilDeadline, detail.deadlineForms), { date: formatDateTime(plan.deadlineAt, locale) })
      : detail.noDeadline;

  return (
    <View style={styles.header}>
      <View style={styles.titles}>
        {/* The app bar has one line; a draft's auto title («ДЗ по теме «…» до …») rarely fits there. */}
        <Text variant="sectionTitle" accessibilityRole="header" testID="draft-board-title">
          {plan.title}
        </Text>
        <View style={styles.deadline}>
          <Icon name="calendar" size={14} color="kicker" />
          <Text variant="caption" color="textMuted" tabular style={styles.deadlineText} testID="draft-board-deadline">
            {deadlineLabel}
          </Text>
        </View>
      </View>

      {plan.sourceLesson && onOpenSourceLesson ? (
        // Not a `Button`: its label is one line, and «По итогам занятия «Занятие группы · …»» is cut there.
        <Card
          variant="outline"
          padded={false}
          onPress={onOpenSourceLesson}
          accessibilityLabel={format(detail.afterLesson, { title: plan.sourceLesson.title })}
          testID="draft-source-lesson"
          style={styles.source}
        >
          <Text variant="smallStrong" style={styles.sourceText}>
            {format(detail.afterLesson, { title: plan.sourceLesson.title })}
          </Text>
          <Icon name="forward" size={18} color="kicker" />
        </Card>
      ) : null}

      {controller.issuedCount > 0 || controller.pendingCount > 0 ? (
        <View style={styles.toolbar}>
          {controller.issuedCount > 0 ? (
            <Chip tone="green" label={format(t.issuedOf, { issued: controller.issuedCount, total: plan.participants.length })} />
          ) : null}
          {controller.pendingCount > 0 ? (
            <View accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={styles.progress} testID="draft-ready-of">
              <Spinner size={14} color="accentSolid" />
              <Text variant="smallStrong" color="textMuted" tabular>
                {format(dict.planner.common.readyOf, { ready: controller.readyCount, total: plan.participants.length })}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Cached data stays on screen when a refresh fails (offline): say so instead of replacing it. */}
      {board.isError ? <Notice tone="error" text={errorText(board.error, m.common.errors.generic)} testID="draft-refresh-error" /> : null}

      {!plan.aiAvailable ? <Notice tone="warning" text={t.aiUnavailable} testID="draft-ai-unavailable" /> : null}

      {notice ? (
        <View style={styles.noticeBlock}>
          <Notice tone={notice.tone} text={notice.text} onDismiss={controller.dismissNotice} dismissLabel={m.common.actions.close} testID="draft-notice" />
          <RetryWaitLine seconds={waitSeconds} testID="draft-wait" />
        </View>
      ) : null}

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
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  header: { gap: t.space.md, paddingBottom: t.space.lg },
  titles: { gap: t.space.xs },
  deadline: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.xs },
  deadlineText: { flex: 1 },
  source: {
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: 10,
    paddingHorizontal: t.space.lg,
  },
  sourceText: { flex: 1, minWidth: 0 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.md },
  progress: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, minHeight: t.sizes.minTouch },
  noticeBlock: { gap: t.space.xs },
  failures: { gap: t.space.xs },
}));
