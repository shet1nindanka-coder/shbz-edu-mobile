import { View } from 'react-native';

import type { TeacherStudentLesson } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, CardPressArea, Icon, Text } from '@/ui';

import { LessonDetail, type LessonDetailProps } from './lesson-detail';

export type LessonCardProps = Omit<LessonDetailProps, 'meta'> & {
  lesson: TeacherStudentLesson;
  /** The one caption: «12 ноя, 17:00», or «Идёт». */
  when: string;
  /** Spoken with the title: «12.11.2026, 17:00 · 11А · 60 мин · Запланирован». */
  meta: string;
  expanded: boolean;
  onToggle: () => void;
};

/**
 * One lesson of the student in the list of a phone (docs/spec/04-teacher-students.md S6 "lesson card").
 * Folded it is a row — the title and ONE caption: when it is; a tap unfolds the set with its marks and
 * the actions (`LessonDetail`).
 */
export function LessonCard({ lesson, when, meta, expanded, onToggle, ...detail }: LessonCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();

  return (
    <Card style={styles.card} testID={`student-lesson-${lesson.id}`}>
      {/* One element for screen readers: the date, duration and status are spoken with the title — lessons of
          the same group and topic share it. */}
      <CardPressArea
        accessibilityLabel={format(expanded ? m.teacher.card.collapse : m.teacher.card.expand, { title: lesson.title })}
        accessibilityParts={[meta]}
        expanded={expanded}
        onPress={onToggle}
        testID={`student-lesson-toggle-${lesson.id}`}
        style={styles.head}
      >
        <View style={styles.texts}>
          <Text variant="bodyBold" accessibilityRole="header" numberOfLines={2}>
            {lesson.title}
          </Text>
          <Text variant="small" color="textMuted" tabular numberOfLines={1}>
            {when}
          </Text>
        </View>
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={theme.sizes.icon.md} color="textMuted" />
      </CardPressArea>
      {expanded ? <LessonDetail lesson={lesson} meta={meta} {...detail} /> : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, minHeight: t.sizes.minTouch },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
