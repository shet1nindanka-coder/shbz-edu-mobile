import { useQueryClient } from '@tanstack/react-query';

import { qk, useApi } from '@/api';
import { useI18n } from '@/i18n';

import { isStudentGone } from './error-text';
import { PasswordResetSheet, type ResetPasswordTarget } from './password-reset-sheet';

export type { ResetPasswordTarget } from './password-reset-sheet';

export type ResetPasswordSheetProps = {
  /** The student whose password is replaced; `null` closes the sheet. */
  student: ResetPasswordTarget | null;
  onClose: () => void;
  /** The password was replaced and every session of the student ended. */
  onDone: (student: ResetPasswordTarget) => void;
  /** `404`: the student no longer exists (or is not this teacher's any more); `message` is localised. */
  onMissing: (message: string) => void;
};

/** "Reset password" for a student (docs/spec/04-teacher-students.md D2, §3.3) — see `PasswordResetSheet`. */
export function ResetPasswordSheet({ student, onClose, onDone, onMissing }: ResetPasswordSheetProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict } = useI18n();

  return (
    <PasswordResetSheet
      target={student}
      audience="student"
      reset={(id, password) => api.teacherStudents.resetStudentPassword(id, password)}
      saveFailedText={dict.students.list.notices.passwordSave}
      isGone={isStudentGone}
      // 90-addendum-5 B.2.1: the teacher's list is re-read after a reset (the accounts screen adds its own read).
      onReplaced={() => void queryClient.invalidateQueries({ queryKey: qk('teacherStudents', 'listStudents') })}
      onGone={() => void queryClient.invalidateQueries({ queryKey: qk('teacherStudents') })}
      onClose={onClose}
      onDone={onDone}
      onMissing={onMissing}
      testIDPrefix="reset-password"
    />
  );
}
