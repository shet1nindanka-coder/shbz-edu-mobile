import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { qk, useApi } from '@/api';
import type { TeacherStudentListItem } from '@/api/types';
import { statusLabel } from '@/components/numbers';
import { formatMsk } from '@/domain/dates';
import { deadlineCaption } from '@/domain/deadline-caption';
import { homeworkAssignmentLabel } from '@/domain/homework-label';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { useNowTick } from '@/services/clock';
import { makeStyles, useTheme } from '@/theme';
import { Avatar, Button, Card, IconButton, ListRow, LoadingState, Text } from '@/ui';

export type StudentSummaryProps = {
  student: TeacherStudentListItem;
  /** "⋯": the login to copy, reset password, delete. */
  onActions: (student: TeacherStudentListItem) => void;
};

/** How many rows each block of the summary shows; the rest is on the student's card. */
const SUMMARY_ROWS = 4;

/**
 * The selected student next to the list (tablet; docs/design/glass-over-paper.md §7 "Tablet"): who it is,
 * the counters by status, the homeworks that are still open and the lessons ahead. Everything here is a
 * way into the student's card — the review, a homework, a lesson board.
 *
 * The homeworks and the lessons are the reads of the card's «Проверка» and «Занятия» segments (the same
 * cache entries), so opening the card afterwards shows them at once.
 */
export function StudentSummary({ student, onActions }: StudentSummaryProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const navigation = useAppNavigation();
  const { dict, m, locale } = useI18n();
  const now = useNowTick(60_000);

  const homeworks = useQuery({
    queryKey: qk('teacherStudents', 'getStudentHomeworks', student.id),
    queryFn: () => api.teacherStudents.getStudentHomeworks(student.id),
  });
  const lessons = useQuery({
    queryKey: qk('teacherStudents', 'listStudentLessons', student.id),
    queryFn: () => api.teacherStudents.listStudentLessons(student.id),
  });

  // Open homework only, in the server's attention order; the completed ones are on the card.
  const open = homeworks.data?.assignments.filter((assignment) => assignment.solvedCount < assignment.totalNumbers).slice(0, SUMMARY_ROWS);
  const ahead = lessons.data?.lessons.filter((lesson) => lesson.status !== 'FINISHED').slice(0, SUMMARY_ROWS);

  const boxes = [
    { key: 'green', value: student.greenCount, label: statusLabel('GREEN', m.common.statuses), attention: false },
    { key: 'yellow', value: student.yellowCount, label: statusLabel('YELLOW', m.common.statuses), attention: false },
    { key: 'red', value: student.redCount, label: statusLabel('RED', m.common.statuses), attention: student.redCount > 0 },
  ];

  return (
    <View style={styles.summary} testID={`student-summary-${student.id}`}>
      <View style={styles.head}>
        <Avatar name={student.name} size={theme.sizes.avatarLg} />
        <View style={styles.titles}>
          <Text variant="sectionTitle" accessibilityRole="header" numberOfLines={2}>
            {student.name}
          </Text>
          <Text variant="small" color="textMuted" numberOfLines={1} selectable>
            {student.email}
          </Text>
        </View>
        <IconButton
          icon="more"
          accessibilityLabel={format(m.teacher.students.actionsFor, { name: student.name })}
          onPress={() => onActions(student)}
          testID={`student-actions-${student.id}`}
        />
        <Button
          label={dict.students.list.viewProgress}
          rightIcon="forward"
          onPress={() => navigation.open({ screen: 'teacher.student.review', studentId: student.id })}
          testID={`student-summary-open-${student.id}`}
        />
      </View>

      <View style={styles.boxes}>
        {boxes.map((box) => (
          <Card key={box.key} accessibilityLabel={`${box.label}: ${box.value}`} style={styles.box}>
            <Text variant="sectionTitle" tabular color={box.attention ? 'redText' : 'textStrong'}>
              {box.value}
            </Text>
            <Text variant="small" color="textMuted" numberOfLines={1}>
              {box.label}
            </Text>
          </Card>
        ))}
      </View>

      <View>
        <Text variant="kicker" color="textMuted" accessibilityRole="header" style={styles.caption}>
          {dict.student.homeworks.kicker}
        </Text>
        {open ? (
          open.length > 0 ? (
            open.map((assignment, index) => {
              const deadline = deadlineCaption(assignment.deadlineAt, false, now, locale, m.common.deadline);
              return (
                <ListRow
                  key={assignment.id}
                  title={`${homeworkAssignmentLabel(assignment, locale)} · ${assignment.topicTitle}`}
                  subtitle={deadline.text}
                  subtitleTone={deadline.attention ? 'attention' : 'muted'}
                  meta={format(m.common.numbers.doneOf, { done: assignment.solvedCount, total: assignment.totalNumbers })}
                  inset={0}
                  divider={index < open.length - 1}
                  onPress={() => navigation.open({ screen: 'teacher.student.review', studentId: student.id, assignmentId: assignment.id })}
                  testID={`student-summary-homework-${assignment.id}`}
                />
              );
            })
          ) : (
            <ListRow title={homeworks.data?.assignments.length ? dict.student.submissions.allDone : dict.students.review.emptyTitle} inset={0} divider={false} />
          )
        ) : homeworks.isError ? null : (
          <LoadingState variant="list" count={2} accessibilityLabel={m.common.a11y.loading} />
        )}
      </View>

      {ahead && ahead.length > 0 ? (
        <View>
          <Text variant="kicker" color="textMuted" accessibilityRole="header" style={styles.caption}>
            {dict.students.detail.tabLessons}
          </Text>
          {ahead.map((lesson, index) => (
            <ListRow
              key={lesson.id}
              title={lesson.title}
              subtitle={[formatMsk(lesson.startsAt ?? lesson.createdAt, 'dayMonthTime', locale), lesson.groupName].filter(Boolean).join(' · ')}
              inset={0}
              divider={index < ahead.length - 1}
              onPress={() => navigation.open({ screen: 'planner.lessonBoard', lessonId: lesson.id })}
              testID={`student-summary-lesson-${lesson.id}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  summary: { gap: t.space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  titles: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  boxes: { flexDirection: 'row', gap: t.space.sm },
  box: { flex: 1, minWidth: 0, alignItems: 'center', gap: t.space.xxxs },
  caption: { paddingBottom: t.space.xxs },
}));
