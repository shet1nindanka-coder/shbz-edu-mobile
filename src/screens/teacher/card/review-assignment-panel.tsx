import { View } from 'react-native';

import type { TeacherHomeworkAssignment } from '@/api/types';
import { statusBreakdown } from '@/components/numbers';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { StatusBar, Text, TextButton } from '@/ui';

import { ReviewHomework, type ReviewHomeworkProps } from './review-homework';
import { reviewSummary } from './review-summary';

export type ReviewAssignmentPanelProps = Omit<ReviewHomeworkProps, 'cancelBelow'> & {
  assignment: TeacherHomeworkAssignment;
  now: number;
};

/**
 * The selected homework in the second panel of a tablet (the `T-student` mockup): the title with the
 * deadline and «Отменить ДЗ» next to it, the bar by status and the review itself (`ReviewHomework`).
 */
export function ReviewAssignmentPanel({ assignment, now, ...review }: ReviewAssignmentPanelProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const summary = reviewSummary(assignment, now, locale, m);

  return (
    <View style={styles.panel} testID={`review-assignment-${assignment.id}`}>
      <View style={styles.head}>
        <View style={styles.texts}>
          <Text variant="sectionTitle" accessibilityRole="header" numberOfLines={2}>
            {summary.title}
          </Text>
          <Text variant="small" color={summary.attention ? 'redText' : 'textMuted'}>
            {`${summary.caption} · ${summary.done}`}
          </Text>
        </View>
        <TextButton label={dict.students.review.cancelLabel} tone="danger" onPress={review.onCancel} testID={`review-cancel-${assignment.id}`} />
      </View>
      <StatusBar counts={summary.counts} accessibilityLabel={statusBreakdown(summary.counts, m.common.statuses, true)} />
      <ReviewHomework assignment={assignment} cancelBelow={false} {...review} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  panel: { gap: t.space.lg },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.md },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
