import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText, isNetworkError, isNotFoundError, useApi } from '@/api';
import type { ParentCallOutcome, RecordCallRequest, RecordCallResponse } from '@/api/types';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
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
 * «Записать звонок» (06 §1.4 "Call form", §3.10) as a bottom sheet: outcome, optional comment, and Save in
 * the sheet's footer (the one ending of every form sheet; the close cross cancels). The log is append-only
 * and a call cannot be back-dated, so Save is blocked while the request runs (06 §7 Q9). The form is
 * emptied when the sheet has closed: a cancelled comment never comes back.
 */
export function RecordCallSheet({ target, onClose, onSaved, onMissing }: RecordCallSheetProps) {
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.planner.calls;
  const wait = useRetryWait();
  // The sheet keeps showing the student while it slides away.
  const [shown, setShown] = useState<RecordCallTarget | null>(target);
  const [outcome, setOutcome] = useState<ParentCallOutcome>('REACHED');
  // Personal data: the draft lives in this component only — never logged, never persisted.
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (target !== null && target !== shown) {
    // A new opening always starts empty — also when it interrupts the exit animation of the previous
    // one, so a comment typed about one student can never appear under another.
    setShown(target);
    setOutcome('REACHED');
    setComment('');
    setError(null);
  }

  // The log is append-only: a second record cannot be undone. `record.isPending` reaches this render only
  // later, so a synchronous flag keeps a submit handled twice in a row from saving the call twice.
  const inFlight = useRef(false);
  const record = useMutation({
    mutationFn: (call: { input: RecordCallRequest; target: RecordCallTarget }) => api.groups.recordParentCall(call.input),
    onMutate: () => setError(null),
    onSettled: () => {
      inFlight.current = false;
    },
    onSuccess: (response, call) => onSaved(response, call.target),
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
  });

  const submit = () => {
    if (!shown || inFlight.current || wait.waiting) return;
    inFlight.current = true;
    record.mutate({ input: { studentId: shown.studentId, outcome, comment }, target: shown });
  };

  const reset = () => {
    setShown(null);
    setOutcome('REACHED');
    setComment('');
    setError(null);
  };

  return (
    <BottomSheet
      visible={target !== null}
      onClose={onClose}
      onClosed={reset}
      closeLabel={m.common.actions.close}
      title={t.record}
      dismissible={!record.isPending}
      footer={
        <Button
          label={record.isPending ? t.saving : t.save}
          size="lg"
          fullWidth
          onPress={submit}
          loading={record.isPending}
          disabled={wait.waiting}
          testID="call-record-save"
        />
      }
      testID="call-record-sheet"
    >
      {shown ? (
        <View style={styles.form}>
          <Text variant="bodyStrong" numberOfLines={2} testID="call-record-student">
            {shown.studentName}
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
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.space.field, paddingTop: t.space.xs },
  error: { gap: t.space.xs },
}));
