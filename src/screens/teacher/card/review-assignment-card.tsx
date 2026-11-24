import { View } from 'react-native';

import type { TeacherHomeworkAssignment } from '@/api/types';
import { statusBreakdown } from '@/components/numbers';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, CardPressArea, StatusBar, Text } from '@/ui';

import { HomeworkFact } from './homework-fact';
import { ReviewHomework, type ReviewHomeworkProps } from './review-homework';
import { reviewSummary } from './review-summary';

export type ReviewAssignmentCardProps = Omit<ReviewHomeworkProps, 'cancelBelow'> & {
  assignment: TeacherHomeworkAssignment;
  expanded: boolean;
  /** The card a history link led to: ringed for a moment after the list scrolled to it. */
  highlighted: boolean;
  now: number;
  onToggle: () => void;
};

/**
 * One homework in the review list of a phone (docs/spec/04-teacher-students.md S4 "assignment card";
 * layout: the `PT-student` mockup). Folded it is a summary — the title, the deadline, the red counter of
 * what waits for the teacher with «37/50», and the bar by status; a tap unfolds the review itself
 * (`ReviewHomework`).
 */
export function ReviewAssignmentCard({ assignment, expanded, highlighted, now, onToggle, ...review }: ReviewAssignmentCardProps) {
  const styles = useStyles();
  const { m, locale } = useI18n();
  const summary = reviewSummary(assignment, now, locale, m);

  return (
    <Card selected={highlighted} style={styles.card} testID={`review-assignment-${assignment.id}`}>
      {/* One element for screen readers: the caption and the count are spoken with the title — they are
          what tells several homeworks of the same topic apart. */}
      <CardPressArea
        accessibilityLabel={format(expanded ? m.teacher.card.collapse : m.teacher.card.expand, { title: summary.title })}
        accessibilityParts={[summary.caption, summary.waitingLabel, summary.done]}
        expanded={expanded}
        onPress={onToggle}
        testID={`review-assignment-toggle-${assignment.id}`}
        style={styles.head}
      >
        <View style={styles.texts}>
          <Text variant="bodyBold" accessibilityRole="header" numberOfLines={2}>
            {summary.title}
          </Text>
          <Text variant="small" color={summary.attention ? 'redText' : 'textMuted'} numberOfLines={1}>
            {summary.caption}
          </Text>
        </View>
        <HomeworkFact waiting={summary.waiting} done={summary.done} />
      </CardPressArea>
      <StatusBar counts={summary.counts} accessibilityLabel={statusBreakdown(summary.counts, m.common.statuses, true)} />
      {expanded ? <ReviewHomework assignment={assignment} cancelBelow {...review} /> : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, minHeight: t.sizes.minTouch },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
