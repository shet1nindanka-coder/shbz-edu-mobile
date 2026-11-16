import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { isNetworkError, isNotFoundError, useApi } from '@/api';
import type { ParentCallOutcome, RecordCallRequest, RecordCallResponse } from '@/api/types';
import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { errorText } from '@/screens/groups/shared/error-text';
import { RetryWaitLine, useRetryWait } from '@/screens/groups/shared/use-retry-wait';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Notice, Segmented, Text, TextArea } from '@/ui';

export type RecordCallTarget = { studentId: string; studentName: string };

export type RecordCallSheetProps = {
  /** The student the call is about; null = the sheet is closed. */
  target: RecordCallTarget | null;
  onClose: () => void;
  onSaved: (response: RecordCallResponse, target: RecordCallTarget) => void;
  /** The student is gone (deleted, or moved to another teacher): the list must drop the row. */
  onMissing: (message: string) => void;
};

/**
 * «Записать звонок» (06 §1.4 "Call form", §3.10) as a bottom sheet: outcome, optional comment, save.
 * The log is append-only and a call cannot be back-dated, so Save is blocked while the request runs
 * (06 §7 Q9). The form is mounted per opening: a cancelled comment never comes back.
 */
export function RecordCallSheet({ target, onClose, onSaved, onMissing }: RecordCallSheetProps) {
  const { m } = useI18n();
  const [pending, setPending] = useState(false);
  // The sheet keeps showing the student while it slides away.
  const [shown, setShown] = useState<RecordCallTarget | null>(target);
  if (target !== null && target !== shown) setShown(target);

  return (
    <BottomSheet
      visible={target !== null}
      onClose={onClose}
      onClosed={() => setShown(null)}
      closeLabel={m.common.actions.close}
      title={m.calls.log.sheetTitle}
      dismissible={!pending}
      testID="call-record-sheet"
    >
      {shown ? (
        <RecordCallForm
          key={shown.studentId}
          target={shown}
          onPendingChange={setPending}
          onCancel={onClose}
          onSaved={onSaved}
          onMissing={onMissing}
        />
      ) : null}
    </BottomSheet>
  );
}

function RecordCallForm({
  target,
  onPendingChange,
  onCancel,
  onSaved,
  onMissing,
}: {
  target: RecordCallTarget;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onSaved: (response: RecordCallResponse, target: RecordCallTarget) => void;
  onMissing: (message: string) => void;
}) {
  const styles = useStyles();
  const api = useApi();
  const { dict } = useI18n();
  const t = dict.planner.calls;
  const wait = useRetryWait();
  const [outcome, setOutcome] = useState<ParentCallOutcome>('REACHED');
  // Personal data: the draft lives in this component only — never logged, never persisted.
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: (input: RecordCallRequest) => api.groups.recordParentCall(input),
    onMutate: () => {
      setError(null);
      onPendingChange(true);
    },
    onSuccess: (response) => onSaved(response, target),
    onError: (failure) => {
      // 404 studentNotFound: nothing to retry here — the list reloads without the student.
      if (isNotFoundError(failure)) {
        onMissing(errorText(failure, t.saveFailed));
        return;
      }
      // 400 studentRequired / outcomeRequired, 403 unauthorized, 429 rateLimited and 500 saveFailed
      // carry the server's own line; without an answer the site's sentence about the connection fits.
      setError(isNetworkError(failure) ? t.saveFailed : errorText(failure, t.saveFailed));
      wait.note(failure);
    },
    onSettled: () => onPendingChange(false),
  });

  const submit = () => {
    if (record.isPending || wait.waiting) return;
    record.mutate({ studentId: target.studentId, outcome, comment });
  };

  return (
    <View style={styles.form}>
      <Text variant="bodyStrong" numberOfLines={2} testID="call-record-student">
        {target.studentName}
      </Text>

      <Segmented
        options={[
          { value: 'REACHED', label: t.reached },
          { value: 'NO_ANSWER', label: t.noAnswer },
        ]}
        value={outcome}
        onChange={setOutcome}
        accessibilityLabel={t.outcomeAria}
        fill
        plain
        disabled={record.isPending}
        testID="call-record-outcome"
      />

      <TextArea
        label={t.comment}
        value={comment}
        onChangeText={setComment}
        placeholder={t.commentPlaceholder}
        numberOfLines={3}
        autoCapitalize="sentences"
        disabled={record.isPending}
        testID="call-record-comment"
      />

      <Hint>
        <Text variant="hint" color="textMuted">
          {t.attemptHint}
        </Text>
      </Hint>

      {error ? (
        <View style={styles.error}>
          <Notice tone="error" text={error} testID="call-record-error" />
          <RetryWaitLine seconds={wait.seconds} testID="call-record-wait" />
        </View>
      ) : null}

      <View style={styles.buttons}>
        <Button
          label={record.isPending ? t.saving : t.save}
          onPress={submit}
          loading={record.isPending}
          disabled={wait.waiting}
          fullWidth
          testID="call-record-save"
        />
        <Button
          label={dict.planner.common.cancel}
          variant="outline"
          onPress={onCancel}
          disabled={record.isPending}
          fullWidth
          testID="call-record-cancel"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.space.field, paddingTop: t.space.xs },
  error: { gap: t.space.xs },
  buttons: { gap: t.space.md },
}));
