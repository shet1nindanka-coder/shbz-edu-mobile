import type { ManagedStudent } from '@/api/types';
import { useI18n } from '@/i18n';
import { Chip } from '@/ui';

import { AccountRow } from './account-row';

export type StudentRowProps = {
  student: ManagedStudent;
  /** Name of the teacher the row shows: the unsaved pick when there is one, else the stored owner. */
  ownerName: string | null;
  /** The pick differs from the stored owner and is not saved yet. */
  dirty: boolean;
  /** Hairline under the row; off on the last row of the card. */
  divider: boolean;
  /** Tap: owner picker, reset password, delete. */
  onPress: (student: ManagedStudent) => void;
};

/**
 * A student of the directory: the name and «login · teacher». A student without an owner is invisible to
 * every teacher — the caption says so in red until a teacher is picked; an unsaved pick is marked on the
 * right until the save bar sends it.
 */
export function StudentRow({ student, ownerName, dirty, divider, onPress }: StudentRowProps) {
  const { dict, m } = useI18n();
  const t = dict.students.studentsManager;
  // A picked (still unsaved) teacher replaces the warning: the row then names where the student goes.
  const orphan = student.teacherId === null && ownerName === null;
  const caption = orphan ? t.noOwner : ownerName !== null ? `${student.email} · ${ownerName}` : student.email;
  const spoken = [student.name, `${t.loginLabel}: ${student.email}`, orphan ? t.noOwner : ownerName, dirty ? t.dirty : null];

  return (
    <AccountRow
      name={student.name}
      caption={caption}
      attention={orphan}
      right={dirty ? <Chip label={m.accounts.row.changed} tone="accent" testID={`account-student-dirty-${student.id}`} /> : undefined}
      divider={divider}
      accessibilityLabel={spoken.filter(Boolean).join('. ')}
      accessibilityHint={m.accounts.row.studentActions}
      onPress={() => onPress(student)}
      testID={`account-student-${student.id}`}
    />
  );
}
