import { View } from 'react-native';

import type { HomeworkPlanListItem } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Chip, Icon, Text } from '@/ui';

import { issuedChipTone } from './drafts-logic';

export type DraftCardProps = {
  plan: HomeworkPlanListItem;
  onOpen: (plan: HomeworkPlanListItem) => void;
};

/**
 * One homework draft of the list (docs/spec/05-teacher-lessons-plans.md §1.5): title, the meta line and
 * the chips. The whole card opens the board — the site's «Открыть» button.
 */
export function DraftCard({ plan, onOpen }: DraftCardProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.homeworkPlans.list;

  // Each part only when present.
  const meta = [
    formatDateTime(plan.createdAt, locale),
    plan.topicTitle,
    plan.groupName,
    plan.deadlineAt ? format(t.deadline, { date: formatDateTime(plan.deadlineAt, locale) }) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <Card
      onPress={() => onOpen(plan)}
      accessibilityLabel={format(m.planner.drafts.openDraft, { title: plan.title })}
      accessibilityHint={meta}
      testID={`draft-card-${plan.id}`}
      style={styles.card}
    >
      <View style={styles.top}>
        <View style={styles.texts}>
          {/* One line on the site's wide row; a phone card has the height for two. */}
          <Text variant="cardTitle" numberOfLines={2}>
            {plan.title}
          </Text>
          <Text variant="caption" color="textMuted" tabular>
            {meta}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color="kicker" />
      </View>
      <View style={styles.chips}>
        {plan.failedCount > 0 ? <Chip tone="red" label={format(dict.planner.common.errorsCount, { n: plan.failedCount })} /> : null}
        <Chip tone={issuedChipTone(plan)} label={format(t.issuedOf, { issued: plan.issuedCount, total: plan.participantsCount })} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
