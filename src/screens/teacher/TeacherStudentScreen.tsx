// PLACEHOLDER of the student card — `teacher.student.review`, `.assign` and `.lessons` are ONE screen with
// three segments (docs/spec/00-unified-contract.md §3.1). The teacher area replaces this file's body; the
// export name and the props stay. Each segment has its own route (the site's three URLs), so switching
// uses `navigation.replace(...)`; the three routes are shown without a transition.
import { useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';
import { Segmented } from '@/ui';

export type TeacherStudentSegment = 'review' | 'assign' | 'lessons';

export type TeacherStudentScreenProps = ScreenParams['teacher.student.review'] & {
  /** Which segment the route stands for; default segment of the card is `review`. */
  segment: TeacherStudentSegment;
};

const SCREEN = {
  review: 'teacher.student.review',
  assign: 'teacher.student.assign',
  lessons: 'teacher.student.lessons',
} as const;

export function TeacherStudentScreen({ studentId, segment, assignmentId }: TeacherStudentScreenProps) {
  const { dict } = useI18n();
  const navigation = useAppNavigation();
  const t = dict.students.detail;
  return (
    <ScreenPlaceholder
      screenId={SCREEN[segment]}
      params={{ studentId, assignmentId }}
      links={[
        { screen: 'planner.lessonNew', studentId },
        { screen: 'planner.draftNew', studentId },
      ]}
    >
      <Segmented<TeacherStudentSegment>
        fill
        plain
        role="tab"
        options={[
          { value: 'review', label: t.tabReviewShort },
          { value: 'assign', label: t.tabAssignShort },
          { value: 'lessons', label: t.tabLessons },
        ]}
        value={segment}
        accessibilityLabel={t.tabsAria}
        onChange={(next) => navigation.replace({ screen: SCREEN[next], studentId })}
        testID="student-card-segments"
      />
    </ScreenPlaceholder>
  );
}
