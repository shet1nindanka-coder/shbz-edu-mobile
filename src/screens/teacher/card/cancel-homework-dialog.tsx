import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { errorText, hasErrorCode, useApi } from '@/api';
import type { TeacherHomeworkAssignment } from '@/api/types';
import { RetryWaitLine, type RetryWait } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Dialog, Notice, Text } from '@/ui';

import { useLatched } from '../students/use-latched';
import { invalidateStudentData } from './invalidate';

export type CancelHomeworkDialogProps = {
  /** The homework to cancel; `null` keeps the dialog closed. */
  assignment: TeacherHomeworkAssignment | null;
  onClose: () => void;
  onCancelled: (assignment: TeacherHomeworkAssignment) => void;
  /** `404 homeworkNotFound`: it was already cancelled elsewhere; `message` is localised. */
  onMissing: (message: string) => void;
  /**
   * The cool-down of the `api:teacher-homeworks` bucket (`429` names `retryAfterSeconds`). Owned by the
   * screen, so closing and reopening the dialog keeps the lock and its line.
   */
  wait: RetryWait;
};

/**
 * "Cancel this homework?" (docs/spec/04-teacher-students.md S4, §3.5). The text names what goes with it:
 * the deadlines of its numbers and — when the student has sent anything — the solution photos and the AI
 * check results, which cannot be downloaded afterwards. Statuses already set are kept.
 */
export function CancelHomeworkDialog({ assignment, onClose, onCancelled, onMissing, wait }: CancelHomeworkDialogProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict } = useI18n();
  const t = dict.students.review;
  const shown = useLatched(assignment);
  const [error, setError] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: (target: TeacherHomeworkAssignment) => api.teacherStudents.cancelHomework(target.id),
    onSuccess: (_result, target) => {
      setError(null);
      invalidateStudentData(queryClient);
      onCancelled(target);
    },
    onError: (failure) => {
      wait.note(failure);
      const text = errorText(failure, t.errors.cancel);
      if (hasErrorCode(failure, 'homeworkNotFound')) {
        setError(null);
        invalidateStudentData(queryClient);
        onMissing(text);
        return;
      }
      // migrationMissing, rateLimited, serviceUnavailable, no connection: the dialog stays for a manual retry.
      setError(text);
    },
  });

  const close = () => {
    if (cancel.isPending) return;
    setError(null);
    onClose();
  };

  const photos = shown?.photos.length ?? 0;
  const checks = shown?.checks.length ?? 0;

  return (
    <Dialog
      visible={assignment !== null}
      kicker={dict.topics.widgets.confirm.kicker}
      title={t.cancelTitle}
      confirmLabel={t.cancelConfirm}
      pendingLabel={t.cancelPending}
      cancelLabel={dict.topics.widgets.confirm.cancel}
      pending={cancel.isPending}
      // A refusal that named a wait: «Да, отменить» stays locked until it is over (90-addendum-1 A.3 rule 3).
      confirmDisabled={wait.waiting}
      onConfirm={() => {
        if (!assignment || wait.waiting) return;
        setError(null);
        cancel.mutate(assignment);
      }}
      onCancel={close}
      testID="cancel-homework-dialog"
    >
      <Text variant="small" color="label" style={styles.paragraph}>
        {t.cancelLine1}
      </Text>
      {photos > 0 || checks > 0 ? (
        <Text variant="small" color="label" style={styles.paragraph} testID="cancel-homework-files">
          {t.cancelFilesBefore}
          <Text variant="smallStrong" color="textStrong">
            {t.cancelFilesStrong}
          </Text>
          {':'}
          {photos > 0 ? format(t.cancelFilesPhotos, { n: photos }) : ''}
          {photos > 0 && checks > 0 ? ',' : ''}
          {checks > 0 ? format(t.cancelFilesChecks, { n: checks }) : ''}
          {t.cancelFilesAfter}
        </Text>
      ) : null}
      <Text variant="small" color="label" style={styles.paragraph}>
        {t.cancelLine3}
      </Text>
      {error ? <Notice tone="error" text={error} testID="cancel-homework-error" /> : null}
      <RetryWaitLine wait={wait} testID="cancel-homework-wait" />
    </Dialog>
  );
}

const useStyles = makeStyles(() => ({
  paragraph: { lineHeight: 24 },
}));
