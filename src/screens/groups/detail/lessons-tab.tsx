import { View } from 'react-native';

import type { GroupDetailResponse } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { useNowTick } from '@/services/clock';
import { makeStyles } from '@/theme';
import { EmptyState, ListCard, ListRow, TextButton, useRowInset } from '@/ui';

import { shortDateTime } from '../logic';

export type LessonsTabProps = {
  lessons: GroupDetailResponse['lessons'];
};

/**
 * «Занятия группы» (06 §1.2 item 7; docs/design/glass-over-paper.md §1a): the three most recent lessons
 * (newest first) as rows that open the lesson board — the title and when it starts — and the way to the
 * full list. The tab names the list, so it has no caption; the group's total and a lesson's length are
 * spoken, not shown.
 */
export function LessonsTab({ lessons }: LessonsTabProps) {
  const styles = useStyles();
  const inset = useRowInset();
  const navigation = useAppNavigation();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.detail;
  const common = dict.planner.common;
  const canOpenBoard = navigation.canOpen({ screen: 'planner.lessonBoard', lessonId: '' });
  const canOpenList = navigation.canOpen({ screen: 'planner.lessons' });
  // Only the year of «now» matters to a row's date: a coarse tick.
  const now = useNowTick(3_600_000);

  return (
    <View style={styles.tab} testID="group-lessons-tab">
      {lessons.recent.length === 0 ? (
        <EmptyState variant="plain" title={m.groups.lessons.empty} testID="group-lessons-empty" />
      ) : (
        <>
          <ListCard>
            {lessons.recent.map((lesson, index) => {
              const startsAt = lesson.startsAt ?? lesson.createdAt;
              const spoken = `${formatDateTime(startsAt, locale)} · ${format(common.minutesShort, { n: lesson.durationMinutes })}`;
              return (
                <ListRow
                  key={lesson.id}
                  title={lesson.title}
                  titleLines={2}
                  subtitle={shortDateTime(startsAt, now, locale)}
                  inset={inset}
                  divider={index < lessons.recent.length - 1}
                  // A role without a lesson board reads the row; it leads nowhere.
                  onPress={canOpenBoard ? () => navigation.open({ screen: 'planner.lessonBoard', lessonId: lesson.id }) : undefined}
                  accessibilityLabel={`${format(m.groups.lessons.openAria, { title: lesson.title })}. ${spoken}`}
                  testID={`group-lesson-${lesson.id}`}
                />
              );
            })}
          </ListCard>
          {canOpenList ? (
            <TextButton
              label={t.allLessons}
              accessibilityLabel={format(m.groups.lessons.allAria, { n: lessons.total })}
              onPress={() => navigation.open({ screen: 'planner.lessons' })}
              style={styles.all}
              testID="group-lessons-all"
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  tab: { gap: t.space.sm },
  all: { alignSelf: 'flex-start', marginHorizontal: t.space.xxs },
}));
