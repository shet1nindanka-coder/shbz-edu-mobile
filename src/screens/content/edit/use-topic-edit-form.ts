import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { hasErrorCode, isApiError, isNetworkError, qk, useApi } from '@/api';
import type { NumbersChangePreview, TopicDetail, UpdateTopicRequest } from '@/api/types';
import { useI18n } from '@/i18n';

import { useUploadSlot, type UploadSlot } from '../browse/use-upload-slot';
import { errorText } from '../shared/error-text';
import { useRateLimit, type RateLimitWait } from '../shared/use-rate-limit';

import {
  canConfirmRemoval,
  draftValue,
  isNumbersChangePreview,
  missingRequiredField,
  nextDraft,
  numbersFieldText,
  previewFailureAction,
  removalConfirmation,
  type TopicFormValues,
} from './topic-edit';

export type EditNotice = { tone: 'success' | 'error'; text: string };

type Drafts = { title: string | null; description: string | null; numbers: string | null };
type Confirmation = Pick<UpdateTopicRequest, 'confirmNumbersRemoval' | 'allowAssignedRemoval'>;

const NO_DRAFTS: Drafts = { title: null, description: null, numbers: null };
const NO_VALUES: TopicFormValues = { title: '', description: '', numbers: '' };

export type TopicEditForm = {
  values: TopicFormValues;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setNumbers: (value: string) => void;
  /** Replacement files: uploaded at once, attached to the topic by the next save. */
  theory: UploadSlot;
  homework: UploadSlot;
  /** `api:teacher-uploads` cool-down, shared by both slots. */
  uploadWait: RateLimitWait;
  /** Something differs from the saved topic (a field or a picked replacement file). */
  dirty: boolean;
  /** `checking` — the preview request; `saving` — the update itself. */
  phase: 'idle' | 'checking' | 'saving';
  /** A required field that was blank at the last save attempt. */
  missing: 'title' | 'numbers' | null;
  /** The preview could not be read and the save went ahead without it. */
  previewError: string | null;
  /** Open confirmation of a destructive change of the number set; `null` — no dialog. */
  plan: NumbersChangePreview | null;
  /** The server's refusal of the last confirmation (it carries a fresh plan). */
  planError: string | null;
  allowAssigned: boolean;
  setAllowAssigned: (value: boolean) => void;
  save: () => void;
  confirm: () => void;
  cancelConfirm: () => void;
  /** Back to the saved topic: drops the typed text and the picked files. */
  reset: () => void;
};

/**
 * The form of the edit screen (site: one multipart form + `TopicEditSubmitButton`,
 * docs/spec/07-developer-content.md §1.3, §1.3.1, §3.2):
 * `idle → checking (numbers preview) → [confirm dialog] → saving → saved | error`.
 * Replacement files are pre-uploaded through `POST /uploads` and travel as ids (00 §2.12).
 */
export function useTopicEditForm({
  topicId,
  detail,
  onNotice,
}: {
  topicId: string;
  detail: TopicDetail | undefined;
  onNotice: (notice: EditNotice | null) => void;
}): TopicEditForm {
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict } = useI18n();
  const t = dict.topics.edit;
  const s = dict.topics.submit;

  const saved = useMemo<TopicFormValues>(
    () =>
      detail
        ? { title: detail.topic.title, description: detail.topic.description, numbers: numbersFieldText(detail.topic.homeworkNumbers) }
        : NO_VALUES,
    [detail],
  );
  const [drafts, setDrafts] = useState<Drafts>(NO_DRAFTS);
  const [phase, setPhase] = useState<TopicEditForm['phase']>('idle');
  const [missing, setMissing] = useState<TopicEditForm['missing']>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [plan, setPlan] = useState<NumbersChangePreview | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [allowAssigned, setAllowAssigned] = useState(false);
  const uploadWait = useRateLimit();
  const theory = useUploadSlot(uploadWait.note);
  const homework = useUploadSlot(uploadWait.note);

  const values: TopicFormValues = {
    title: draftValue(drafts.title, saved.title),
    description: draftValue(drafts.description, saved.description),
    numbers: draftValue(drafts.numbers, saved.numbers),
  };
  const dirty =
    values.title !== saved.title ||
    values.description !== saved.description ||
    values.numbers !== saved.numbers ||
    theory.file !== null ||
    homework.file !== null;

  const preview = useMutation({ mutationFn: (numbers: string) => api.content.previewNumbersChange(topicId, numbers) });
  const update = useMutation({ mutationFn: (input: UpdateTopicRequest) => api.content.updateTopic(topicId, input) });

  const refreshContent = () => void queryClient.invalidateQueries({ queryKey: qk('content') });

  const runUpdate = async (confirmation?: Confirmation) => {
    setPhase('saving');
    try {
      const result = await update.mutateAsync({
        title: values.title,
        description: values.description,
        numbers: values.numbers,
        // Omitted ids keep the current files.
        theoryFileId: theory.file?.id,
        homeworkFileId: homework.file?.id,
        ...confirmation,
      });
      // The stored topic is shown at once (normalised title, renumbered order); the lists refetch.
      queryClient.setQueryData(qk('content', 'getTopic', topicId), result);
      refreshContent();
      setDrafts(NO_DRAFTS);
      // The files now belong to the topic: the slots must forget them, not replace them next time.
      theory.reset();
      homework.reset();
      setMissing(null);
      setPlan(null);
      setPlanError(null);
      // "Could not check, saving as is" is over once the save went through.
      setPreviewError(null);
      onNotice({ tone: 'success', text: t.notices.saved });
    } catch (failure) {
      if (hasErrorCode(failure, 'numbersConfirm', 'numbersAssigned') && isNumbersChangePreview(failure.details)) {
        // The set of dangerous numbers changed since the preview: the dialog shows what is true now.
        setPlan(failure.details);
        setAllowAssigned(false);
        setPlanError(failure.message);
        return;
      }
      setPlan(null);
      setPlanError(null);
      // The pre-uploaded file is gone on the server: the slot must not offer it again.
      if (hasErrorCode(failure, 'filesUnavailable')) {
        theory.reset();
        homework.reset();
      }
      if (hasErrorCode(failure, 'topicNotFound')) refreshContent();
      onNotice({ tone: 'error', text: errorText(failure, t.notices.save) });
    } finally {
      setPhase('idle');
    }
  };

  const save = () => {
    if (phase !== 'idle' || plan !== null || theory.uploading || homework.uploading) return;
    const blank = missingRequiredField(values);
    setMissing(blank);
    if (blank) {
      onNotice({ tone: 'error', text: t.notices.invalid });
      return;
    }
    void (async () => {
      setPhase('checking');
      setPreviewError(null);
      onNotice(null);
      let next: NumbersChangePreview;
      try {
        next = await preview.mutateAsync(values.numbers);
      } catch (failure) {
        // A request that never got an answer is the site's "could not check"; an answered one has its own text.
        const message = isNetworkError(failure) ? s.previewFailed : errorText(failure, s.previewFailed);
        // SPEC-GAP: the site submits after ANY failed preview and lets the server refuse. A refusal the
        // save would only repeat stops here, with the preview's more specific sentence (it names the twins).
        if (previewFailureAction(isApiError(failure) ? failure.code : undefined) === 'stop') {
          if (hasErrorCode(failure, 'topicNotFound')) refreshContent();
          setPhase('idle');
          onNotice({ tone: 'error', text: message });
          return;
        }
        setPreviewError(message);
        await runUpdate();
        return;
      }
      if (!next.requiresConfirmation) {
        await runUpdate();
        return;
      }
      setAllowAssigned(false);
      setPlanError(null);
      setPlan(next);
      setPhase('idle');
    })();
  };

  return {
    values,
    setTitle: (value) => {
      setMissing((current) => (current === 'title' ? null : current));
      setDrafts((current) => ({ ...current, title: nextDraft(value, saved.title) }));
    },
    setDescription: (value) => setDrafts((current) => ({ ...current, description: nextDraft(value, saved.description) })),
    setNumbers: (value) => {
      setMissing((current) => (current === 'numbers' ? null : current));
      setDrafts((current) => ({ ...current, numbers: nextDraft(value, saved.numbers) }));
    },
    theory,
    homework,
    uploadWait,
    dirty,
    phase,
    missing,
    previewError,
    plan,
    planError,
    allowAssigned,
    setAllowAssigned,
    save,
    confirm: () => {
      if (plan === null || phase !== 'idle' || !canConfirmRemoval(plan, allowAssigned)) return;
      setPlanError(null);
      void runUpdate(removalConfirmation(plan, allowAssigned));
    },
    cancelConfirm: () => {
      if (phase === 'saving') return;
      setPlan(null);
      setPlanError(null);
    },
    reset: () => {
      if (phase !== 'idle') return;
      setDrafts(NO_DRAFTS);
      theory.reset();
      homework.reset();
      setMissing(null);
      setPreviewError(null);
    },
  };
}
