import { View } from 'react-native';

import type { HomeworkPlanListItem } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Text, accessibilityLabelOf } from '@/ui';

export type DraftSummaryProps = {
  plan: HomeworkPlanListItem;
};

/**
 * The selected draft in the panel next to the list (tablet): its title, what it is about and what the list
 * knows of its state — how many sets are ready, failed and issued. Only facts of the list item: the sets
 * themselves live on the draft's board.
 */
export function DraftSummary({ plan }: DraftSummaryProps) {
  const styles = useStyles();
  const { dict, locale } = useI18n();
  const t = dict.planner.homeworkPlans.list;
  const common = dict.planner.common;

  const meta = accessibilityLabelOf([plan.topicTitle, plan.groupName, plural(locale, plan.participantsCount, common.studentForms)], ' · ');

  return (
    <View style={styles.block} testID={`draft-summary-${plan.id}`}>
      <View style={styles.titles}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {plan.title}
        </Text>
        <Text variant="small" color="textMuted" tabular>
          {meta}
        </Text>
      </View>
      <View style={styles.facts}>
        <Text variant="bodyStrong" tabular>
          {format(t.issuedOf, { issued: plan.issuedCount, total: plan.participantsCount })}
        </Text>
        <Text variant="small" color="textMuted" tabular>
          {plan.deadlineAt ? format(t.deadline, { date: formatDateTime(plan.deadlineAt, locale) }) : dict.planner.homeworkPlans.detail.noDeadline}
        </Text>
        {plan.readyCount < plan.participantsCount ? (
          <Text variant="small" color="textMuted" tabular>
            {format(common.readyOf, { ready: plan.readyCount, total: plan.participantsCount })}
          </Text>
        ) : null}
        {plan.failedCount > 0 ? (
          <Text variant="small" color="redText" tabular>
            {format(common.errorsCount, { n: plan.failedCount })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.lg },
  titles: { gap: t.space.xxs },
  facts: { gap: t.space.xxs },
}));
