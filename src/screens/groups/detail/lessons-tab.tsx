import { View } from 'react-native';

import type { GroupDetailResponse } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { makeStyles } from '@/theme';
import { EmptyState, ListRow, SectionCaption, TextButton } from '@/ui';

import { Rows, useRowInset } from '../shared/rows';

export type LessonsTabProps = {
  lessons: GroupDetailResponse['lessons'];
};

/**
 * «Занятия группы · N» (06 §1.2 item 7): the three most recent lessons (newest first) as rows that open
 * the lesson board, and the way to the full list. The count is the group's total, not the number of rows.
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

  return (
    <View style={styles.tab} testID="group-lessons-tab">
      <SectionCaption>{`${t.lessons} · ${lessons.total}`}</SectionCaption>

      {lessons.recent.length === 0 ? (
        <EmptyState variant="plain" title={t.noLessons} testID="group-lessons-empty" />
      ) : (
        <>
          <Rows>
            {lessons.recent.map((lesson, index) => {
              const caption = `${formatDateTime(lesson.startsAt ?? lesson.createdAt, locale)} · ${format(common.minutesShort, { n: lesson.durationMinutes })}`;
              return (
                <ListRow
                  key={lesson.id}
                  title={lesson.title}
                  titleLines={2}
                  subtitle={caption}
                  inset={inset}
                  divider={index < lessons.recent.length - 1}
                  // A role without a lesson board reads the row; it leads nowhere.
                  onPress={canOpenBoard ? () => navigation.open({ screen: 'planner.lessonBoard', lessonId: lesson.id }) : undefined}
                  accessibilityLabel={`${format(m.groups.lessons.openAria, { title: lesson.title })}. ${caption}`}
                  testID={`group-lesson-${lesson.id}`}
                />
              );
            })}
          </Rows>
          {canOpenList ? (
            <TextButton
              label={t.allLessons}
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
