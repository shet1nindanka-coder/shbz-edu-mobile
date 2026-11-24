import type { StatisticsTeachersResponse } from '@/api/types';
import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { useTheme } from '@/theme';
import { EmptyState, Text } from '@/ui';

import { unattributedLine } from '../logic';

/**
 * What the view «По учителям» (06 §1.6.b) shows besides its cards: the one-line empty state when there is
 * no teacher, otherwise the footnote under the last card — an explanation, so it is a `<Hint>`. The cards themselves are rows of the screen's
 * list (`TeacherCard`): their number has no upper bound, so they are virtualised.
 */
export function TeachersView({ data }: { data: StatisticsTeachersResponse }) {
  const theme = useTheme();
  const { dict } = useI18n();
  const t = dict.planner.teacherStats;

  if (data.teachers.length === 0) {
    return <EmptyState title={t.emptyTitle} testID="stats-teachers-empty" />;
  }

  const unattributed = unattributedLine(data.unattributed, t);
  // So that the totals do not silently disagree: students without an owner, calls of deleted teachers,
  // lessons created by a developer.
  return unattributed ? (
    <Hint>
      <Text variant="small" color="textMuted" style={{ paddingHorizontal: theme.space.xxs }} testID="stats-teachers-unattributed">
        {unattributed}
      </Text>
    </Hint>
  ) : null;
}
