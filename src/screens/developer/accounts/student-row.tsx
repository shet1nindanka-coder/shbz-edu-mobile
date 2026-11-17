import type { ManagedStudent } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Text } from '@/ui';

import { AccountRow } from './account-row';

export type StudentRowProps = {
  student: ManagedStudent;
  /** Name of the teacher the row shows: the unsaved pick when there is one, else the stored owner. */
  ownerName: string | null;
  /** The pick differs from the stored owner and is not saved yet. */
  dirty: boolean;
  /** Tap: owner picker, reset password, delete. */
  onPress: (student: ManagedStudent) => void;
};

/**
 * A student of the directory: name, login and the owner teacher. A student without an owner is invisible
 * to every teacher — the row says so in red until a teacher is picked.
 */
export function StudentRow({ student, ownerName, dirty, onPress }: StudentRowProps) {
  const { dict, m } = useI18n();
  const t = dict.students.studentsManager;
  // The site shows an owner picker in every row; the phone row names the teacher («Учитель: {name}»).
  const owner = ownerName !== null ? format(dict.planner.calls.teacher, { name: ownerName }) : null;
  const orphan = student.teacherId === null;
  const spoken = [student.name, `${t.loginLabel}: ${student.email}`, orphan ? t.noOwner : null, owner, dirty ? t.dirty : null];

  return (
    <AccountRow
      name={student.name}
      email={student.email}
      accessibilityLabel={spoken.filter(Boolean).join('. ')}
      accessibilityHint={m.accounts.row.studentActions}
      onPress={() => onPress(student)}
      testID={`account-student-${student.id}`}
    >
      {orphan ? (
        <Text variant="captionMedium" color="dangerSolid" testID={`account-student-orphan-${student.id}`}>
          {t.noOwner}
        </Text>
      ) : null}
      {owner ? (
        <Text variant="captionMedium" color="textMuted" numberOfLines={1} testID={`account-student-owner-${student.id}`}>
          {owner}
        </Text>
      ) : null}
      {dirty ? (
        <Text variant="captionMedium" color="accentSolid" testID={`account-student-dirty-${student.id}`}>
          {t.dirty}
        </Text>
      ) : null}
    </AccountRow>
  );
}
