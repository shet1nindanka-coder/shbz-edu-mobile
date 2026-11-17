import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { isApiError, isNetworkError, qk, useApi } from '@/api';
import { useRetryWait, type RetryWait } from '@/components/retry-wait';
import { useI18n } from '@/i18n';

import { useUploadSlot, type UploadSlot } from './use-upload-slot';

export type ManualCreateState = {
  title: string;
  description: string;
  numbers: string;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setNumbers: (value: string) => void;
  theory: UploadSlot;
  homework: UploadSlot;
  /** `hintUploading` | `hintReady` | `hintStart` of the form. */
  hint: 'uploading' | 'ready' | 'start';
  canSubmit: boolean;
  submitting: boolean;
  error: string | null;
  /** `api:topics-create` and `api:teacher-uploads` cool-downs. */
  createWait: RetryWait;
  uploadWait: RetryWait;
  submit: () => void;
};

/**
 * Manual create form (site: `TopicCreateForm`, docs/spec/07-developer-content.md §1.4). The state lives
 * in a hook so the typed text and the uploaded files survive switching to the AI panel and closing the
 * sheet. Submit is offered only when both files are uploaded, nothing is uploading and the title and the
 * numbers are non-blank.
 */
export function useManualCreate(onCreated: (topicId: string) => void): ManualCreateState {
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict } = useI18n();
  const t = dict.topics.createForm;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [numbers, setNumbers] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createWait = useRetryWait();
  const uploadWait = useRetryWait();
  const theory = useUploadSlot(uploadWait.note);
  const homework = useUploadSlot(uploadWait.note);

  const create = useMutation({
    mutationFn: (input: { theoryFileId: string; homeworkFileId: string }) =>
      api.content.createTopic({ title, description, numbers, theoryFileId: input.theoryFileId, homeworkFileId: input.homeworkFileId }),
    onSuccess: ({ topicId }) => {
      void queryClient.invalidateQueries({ queryKey: qk('content') });
      setTitle('');
      setDescription('');
      setNumbers('');
      setError(null);
      theory.reset();
      homework.reset();
      onCreated(topicId);
    },
    onError: (failure) => {
      createWait.note(failure);
      setError(isNetworkError(failure) ? t.networkCreate : isApiError(failure) && failure.message ? failure.message : t.createFailed);
    },
  });

  const uploading = theory.uploading || homework.uploading;
  const ready = theory.file !== null && homework.file !== null;
  const canSubmit =
    ready && !uploading && !create.isPending && !createWait.waiting && title.trim().length > 0 && numbers.trim().length > 0;

  return {
    title,
    description,
    numbers,
    setTitle,
    setDescription,
    setNumbers,
    theory,
    homework,
    hint: uploading ? 'uploading' : ready ? 'ready' : 'start',
    canSubmit,
    submitting: create.isPending,
    error,
    createWait,
    uploadWait,
    submit: () => {
      if (!canSubmit || theory.file === null || homework.file === null) return;
      setError(null);
      create.mutate({ theoryFileId: theory.file.id, homeworkFileId: homework.file.id });
    },
  };
}
