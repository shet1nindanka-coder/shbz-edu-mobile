import { hasErrorCode, useApi } from '@/api';
import { useI18n } from '@/i18n';
import { PasswordResetSheet } from '@/screens/teacher/students';

export type ResetTeacherTarget = { id: string; name: string };

export type ResetTeacherPasswordSheetProps = {
  /** The teacher whose password is replaced; `null` closes the sheet. */
  teacher: ResetTeacherTarget | null;
  onClose: () => void;
  /** The password was replaced and every session of the teacher ended. */
  onDone: (teacher: ResetTeacherTarget) => void;
  /** `404 teacherNotFound`: the teacher was deleted meanwhile; `message` is localised. */
  onMissing: (message: string) => void;
};

/**
 * "Reset password" for a teacher (docs/spec/04-teacher-students.md D2 with `target = "teacher"`, §3.9):
 * the same sheet as for a student (`PasswordResetSheet`) with the developer's request and texts. The
 * accounts screen refreshes its own directory from `onDone` / `onMissing`.
 */
export function ResetTeacherPasswordSheet({ teacher, onClose, onDone, onMissing }: ResetTeacherPasswordSheetProps) {
  const api = useApi();
  const { dict } = useI18n();

  return (
    <PasswordResetSheet
      target={teacher}
      audience="teacher"
      reset={(id, password) => api.accounts.resetTeacherPassword(id, password)}
      saveFailedText={dict.students.accounts.notices.teacherPasswordSave}
      isGone={(failure) => hasErrorCode(failure, 'teacherNotFound')}
      onClose={onClose}
      onDone={onDone}
      onMissing={onMissing}
      testIDPrefix="reset-teacher-password"
    />
  );
}
