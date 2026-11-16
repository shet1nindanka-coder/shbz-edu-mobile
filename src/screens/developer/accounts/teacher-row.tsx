import type { ManagedTeacher } from '@/api/types';
import { plural, useI18n } from '@/i18n';
import { Text } from '@/ui';

import { AccountRow } from './account-row';

export type TeacherRowProps = {
  teacher: ManagedTeacher;
  /** Tap: copy login / reset password / delete. */
  onPress: (teacher: ManagedTeacher) => void;
};

/** A teacher of the directory: name, login and how many students they own. */
export function TeacherRow({ teacher, onPress }: TeacherRowProps) {
  const { dict, m, locale } = useI18n();
  const t = dict.students.teachersManager;
  const students = teacher.studentCount > 0 ? plural(locale, teacher.studentCount, t.studentForms) : t.noStudents;

  return (
    <AccountRow
      name={teacher.name}
      email={teacher.email}
      accessibilityLabel={`${teacher.name}. ${t.loginLabel}: ${teacher.email}. ${students}`}
      accessibilityHint={m.accounts.row.teacherActions}
      onPress={() => onPress(teacher)}
      testID={`account-teacher-${teacher.id}`}
    >
      <Text variant="captionMedium" color="textMuted" numberOfLines={1} testID={`account-teacher-students-${teacher.id}`}>
        {students}
      </Text>
    </AccountRow>
  );
}
