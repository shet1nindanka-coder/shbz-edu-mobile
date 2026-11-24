import { View } from 'react-native';

import type { HomeworkPlanListItem } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { MetricPill, Text, accessibilityLabelOf } from '@/ui';

import { draftDeadlineCaption } from './drafts-logic';

export type DraftSummaryProps = {
  plan: HomeworkPlanListItem;
  /** The list's clock: the deadline is worded from it. */
  now: number;
};

/**
 * The selected draft in the panel next to the list (tablet): its title, what it is about (topic, group),
 * the deadline, and what the list knows of its state as figures with a one-word name — issued, the AI
 * selection, failed plans (red). Only facts of the list item: the sets themselves live on the draft's board.
 */
export function DraftSummary({ plan, now }: DraftSummaryProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const names = m.planner.lessonsList;
  const doneOf = m.common.numbers.doneOf;

  // An auto title («ДЗ по теме «…» до …») already names the topic.
  const about = accessibilityLabelOf([plan.topicTitle && !plan.title.includes(plan.topicTitle) ? plan.topicTitle : null, plan.groupName], ' · ');
  const deadline = draftDeadlineCaption(plan, now, locale, m.common.deadline);

  return (
    <View style={styles.block} testID={`draft-summary-${plan.id}`}>
      <View style={styles.titles}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {plan.title}
        </Text>
        {about ? (
          <Text variant="small" color="textMuted">
            {about}
          </Text>
        ) : null}
        <Text variant="small" color={deadline.attention ? 'redText' : 'textMuted'} tabular>
          {deadline.text}
        </Text>
      </View>
      <View style={styles.figures}>
        <MetricPill label={dict.planner.homeworkPlans.board.issued} value={format(doneOf, { done: plan.issuedCount, total: plan.participantsCount })} />
        {plan.readyCount < plan.participantsCount ? (
          <MetricPill label={names.selecting} value={format(doneOf, { done: plan.readyCount, total: plan.participantsCount })} />
        ) : null}
        {plan.failedCount > 0 ? <MetricPill label={names.errors} value={plan.failedCount} tone="danger" /> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.lg },
  titles: { gap: t.space.xxs },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
