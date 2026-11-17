import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { errorText, useApi } from '@/api';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Dialog, Notice, Text } from '@/ui';

import { isStudentGone } from './error-text';
import { invalidateStudents } from './invalidate-students';
import { useLatched } from './use-latched';

export type DeleteStudentTarget = { id: string; name: string };

export type DeleteStudentDialogProps = {
  /** The student to delete; `null` keeps the dialog closed. */
  student: DeleteStudentTarget | null;
  onClose: () => void;
  /** The account and everything attached to it are gone. */
  onDeleted: (student: DeleteStudentTarget) => void;
  /** `404`: somebody else already removed (or re-assigned) the student; `message` is localised. */
  onMissing: (message: string) => void;
};

/**
 * "Delete this student?" (docs/spec/04-teacher-students.md D3, §3.2). The text names everything that goes
 * with the account — homework, solution photos, check history, statuses, deadlines — because nothing of
 * it can be restored.
 */
export function DeleteStudentDialog({ student, onClose, onDeleted, onMissing }: DeleteStudentDialogProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict } = useI18n();
  const t = dict.students.list;
  const confirm = dict.topics.widgets.confirm;
  const shown = useLatched(student);
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (target: DeleteStudentTarget) => api.teacherStudents.deleteStudent(target.id),
    onSuccess: (_result, target) => {
      setError(null);
      invalidateStudents(queryClient);
      onDeleted(target);
    },
    onError: (failure) => {
      const text = errorText(failure, t.notices.studentDelete);
      if (isStudentGone(failure)) {
        setError(null);
        invalidateStudents(queryClient);
        onMissing(text);
        return;
      }
      // deleteFailed, serviceUnavailable, no connection: the dialog stays for a manual retry.
      setError(text);
    },
  });

  const cancel = () => {
    if (remove.isPending) return;
    setError(null);
    onClose();
  };

  return (
    <Dialog
      visible={student !== null}
      kicker={confirm.kicker}
      title={t.deleteTitle}
      confirmLabel={confirm.confirm}
      pendingLabel={confirm.pending}
      cancelLabel={confirm.cancel}
      pending={remove.isPending}
      onConfirm={() => {
        if (!student) return;
        setError(null);
        remove.mutate(student);
      }}
      onCancel={cancel}
      testID="delete-student-dialog"
    >
      <Text variant="small" color="label" style={styles.paragraph}>
        {t.deleteBefore}
        <Text variant="smallStrong" color="textStrong">
          {`«${shown?.name ?? ''}»`}
        </Text>
        {t.deleteAfter}
      </Text>
      {error ? <Notice tone="error" text={error} testID="delete-student-error" /> : null}
    </Dialog>
  );
}

const useStyles = makeStyles(() => ({
  paragraph: { lineHeight: 24 },
}));
