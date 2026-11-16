import { View } from 'react-native';

import type { GroupDetailResponse } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { makeStyles } from '@/theme';
import { Button, Card, EmptyState, Text, TextButton } from '@/ui';

export type LessonsTabProps = {
  lessons: GroupDetailResponse['lessons'];
};

/**
 * «Занятия группы · N» (06 §1.2 item 7): the three most recent lessons (newest first) and the way to
 * the full list. The count is the group's total, not the number of rows shown.
 */
export function LessonsTab({ lessons }: LessonsTabProps) {
  const styles = useStyles();
  const navigation = useAppNavigation();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.groups.detail;
  const common = dict.planner.common;
  const canOpenBoard = navigation.canOpen({ screen: 'planner.lessonBoard', lessonId: '' });
  const canOpenList = navigation.canOpen({ screen: 'planner.lessons' });

  return (
    <View style={styles.tab} testID="group-lessons-tab">
      <Text variant="sectionTitle" accessibilityRole="header">
        {`${t.lessons} · ${lessons.total}`}
      </Text>

      {lessons.recent.length === 0 ? (
        <EmptyState variant="plain" title={t.noLessons} testID="group-lessons-empty" />
      ) : (
        <>
          <Card padded={false}>
            {/* Paddings sit on an inner view: on web a card's own `padding: 0` wins over longhand paddings. */}
            <View style={styles.card}>
              {lessons.recent.map((lesson, index) => (
                <View key={lesson.id} style={[styles.row, index > 0 ? styles.rowBorder : null]} testID={`group-lesson-${lesson.id}`}>
                  <View style={styles.rowText}>
                    <Text variant="smallBold" numberOfLines={2}>
                      {lesson.title}
                    </Text>
                    <Text variant="caption" color="textMuted">
                      {`${formatDateTime(lesson.startsAt ?? lesson.createdAt, locale)} · ${format(common.minutesShort, { n: lesson.durationMinutes })}`}
                    </Text>
                  </View>
                  {canOpenBoard ? (
                    <Button
                      label={common.open}
                      accessibilityLabel={format(m.groups.lessons.openAria, { title: lesson.title })}
                      variant="outline"
                      size="sm"
                      onPress={() => navigation.open({ screen: 'planner.lessonBoard', lessonId: lesson.id })}
                      testID={`group-lesson-open-${lesson.id}`}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          </Card>
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
  tab: { gap: t.space.md },
  card: { paddingHorizontal: t.space.gutter },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.gutter },
  rowBorder: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  all: { alignSelf: 'flex-start' },
}));
