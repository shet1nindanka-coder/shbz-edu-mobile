import type { ManagedTeacher } from '@/api/types';
import { plural, useI18n } from '@/i18n';

import { AccountRow } from './account-row';

export type TeacherRowProps = {
  teacher: ManagedTeacher;
  /** Hairline under the row; off on the last row of the card. */
  divider: boolean;
  /** Tap: copy login / reset password / delete. */
  onPress: (teacher: ManagedTeacher) => void;
};

/** A teacher of the directory: the name and «login · N учеников». */
export function TeacherRow({ teacher, divider, onPress }: TeacherRowProps) {
  const { dict, m, locale } = useI18n();
  const t = dict.students.teachersManager;
  const students = teacher.studentCount > 0 ? plural(locale, teacher.studentCount, t.studentForms) : t.noStudents;

  return (
    <AccountRow
      name={teacher.name}
      caption={`${teacher.email} · ${students}`}
      divider={divider}
      accessibilityLabel={`${teacher.name}. ${t.loginLabel}: ${teacher.email}. ${students}`}
      accessibilityHint={m.accounts.row.teacherActions}
      onPress={() => onPress(teacher)}
      testID={`account-teacher-${teacher.id}`}
    />
  );
}
