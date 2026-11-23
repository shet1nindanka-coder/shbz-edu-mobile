import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { errorText, isNetworkError, isNotFoundError, useApi } from '@/api';
import type { ParentCallOutcome, RecordCallRequest, RecordCallResponse } from '@/api/types';
import { useRetryWait, type RetryWait } from '@/components/retry-wait';
import { useI18n } from '@/i18n';

export type RecordCallTarget = { studentId: string; studentName: string };

export type RecordCallOptions = {
  /** The student the call is about; null = the form is closed (a sheet that is not shown). */
  target: RecordCallTarget | null;
  onSaved: (response: RecordCallResponse, target: RecordCallTarget) => void;
  /** The student is gone (deleted, or moved to another teacher): the list must drop the row. */
  onMissing: (message: string) => void;
  /**
   * Empty the form as soon as a call is saved. A sheet empties itself when it has closed; the tablet panel
   * stays on screen with the same student and must not offer the saved comment again.
   */
  clearOnSaved?: boolean;
};

/** State of the «Записать звонок» form, shared by the phone sheet and the tablet panel. */
export type RecordCallForm = {
  /** The student the form is filled for; kept while a sheet slides away. */
  shown: RecordCallTarget | null;
  outcome: ParentCallOutcome;
  setOutcome: (outcome: ParentCallOutcome) => void;
  /** Personal data: lives in memory only — never logged, never persisted. */
  comment: string;
  setComment: (comment: string) => void;
  error: string | null;
  /** The cool-down of the teacher's limiter bucket: it outlives the student the form was opened for. */
  wait: RetryWait;
  pending: boolean;
  /** A request is on its way, known synchronously (`pending` reaches a render only later). */
  isBusy: () => boolean;
  submit: () => void;
  /** The form has closed: forget the student and everything typed. */
  reset: () => void;
};

/**
 * «Записать звонок» (06 §1.4 "Call form", §3.10): outcome and an optional comment. The log is append-only
 * and a call cannot be back-dated, so a second submit is blocked while the request runs (06 §7 Q9).
 */
export function useRecordCall({ target, onSaved, onMissing, clearOnSaved = false }: RecordCallOptions): RecordCallForm {
  const api = useApi();
  const { dict } = useI18n();
  const t = dict.planner.calls;
  const wait = useRetryWait();
  const [shown, setShown] = useState<RecordCallTarget | null>(target);
  const [outcome, setOutcome] = useState<ParentCallOutcome>('REACHED');
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const clear = () => {
    setOutcome('REACHED');
    setComment('');
    setError(null);
  };

  if (target !== null && target !== shown) {
    // A new opening always starts empty — also when it interrupts the exit animation of the previous
    // one, so a comment typed about one student can never appear under another.
    setShown(target);
    clear();
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
    onSuccess: (response, call) => {
      if (clearOnSaved) clear();
      onSaved(response, call.target);
    },
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

  return {
    shown,
    outcome,
    setOutcome,
    comment,
    setComment,
    error,
    wait,
    pending: record.isPending,
    isBusy: () => inFlight.current,
    submit,
    reset: () => {
      setShown(null);
      clear();
    },
  };
}
