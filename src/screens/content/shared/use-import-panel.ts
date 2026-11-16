import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isApiError, isNetworkError, qk, useApi } from '@/api';
import type { ImportApplyResult, ImportPreview, ImportTarget } from '@/api/types';
import { useI18n } from '@/i18n';

import { pickJsonFile } from './pick-json-file';
import { useRateLimit, type RateLimitWait } from './use-rate-limit';

/** How long the load tile shows «Файл добавлен» (the site's `SUCCESS_HOLD_MS`). */
const SUCCESS_HOLD_MS = 900;

export type ImportPanelOptions = {
  /** `{ createTopic: true }` on the topics list, `{ topicId }` on the topic's edit screen. */
  target: ImportTarget;
  /** Create mode: called with the apply result (`topicId` of the new topic) — open its edit screen. */
  onCreated?: (topicId: string) => void;
};

export type ImportPanelState = {
  createMode: boolean;
  text: string;
  fileName: string | null;
  /** The «JSON текстом» field is open. */
  textOpen: boolean;
  /** The tile is flashing «Файл добавлен». */
  justLoaded: boolean;
  picking: boolean;
  preview: ImportPreview | null;
  overwriteFilled: boolean;
  /** Add mode: the banner of the last applied import. */
  result: ImportApplyResult | null;
  error: string | null;
  checking: boolean;
  applying: boolean;
  wait: RateLimitWait;
  pickFile: () => void;
  pasteFromClipboard: () => void;
  changeText: (value: string) => void;
  toggleText: () => void;
  setOverwriteFilled: (value: boolean) => void;
  check: () => void;
  apply: () => void;
  cancelPreview: () => void;
  dismissResult: () => void;
};

/**
 * State machine of the import panel (docs/spec/07-developer-content.md §1.5, §4.9):
 * `empty → textLoaded → previewing → previewShown → applying → (create: open the new topic) | (add: banner,
 * back to empty)`. Any text change discards the preview and the result; an error keeps the text.
 * The state lives in a hook so the panel survives being hidden (the create sheet closes and reopens).
 */
export function useImportPanel({ target, onCreated }: ImportPanelOptions): ImportPanelState {
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.topics.importPanel;
  const createMode = 'createTopic' in target;

  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [justLoaded, setJustLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [overwriteFilled, setOverwriteFilled] = useState(false);
  const [result, setResult] = useState<ImportApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wait = useRateLimit();
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const failureText = useCallback(
    (failure: unknown) => {
      // No answer at all is the site's "server did not respond"; an answered failure carries its own text
      // (the parser's sentences of `importInvalid` are returned verbatim).
      if (isNetworkError(failure)) return t.serverSilent;
      return isApiError(failure) && failure.message ? failure.message : t.importFailed;
    },
    [t],
  );

  const load = (next: string, name: string | null) => {
    setText(next);
    setFileName(name);
    setPreview(null);
    setResult(null);
    setError(null);
    setOverwriteFilled(false);
  };

  const flash = () => {
    setJustLoaded(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustLoaded(false), SUCCESS_HOLD_MS);
  };

  const previewMutation = useMutation({
    mutationFn: () => api.content.previewImport({ text, target }),
    onSuccess: (data) => {
      setPreview(data);
      setError(null);
    },
    onError: (failure) => {
      wait.note(failure);
      setError(failureText(failure));
    },
  });

  const applyMutation = useMutation({
    mutationFn: () => api.content.applyImport(createMode ? { text, target } : { text, target, overwriteFilled }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: qk('content') });
      // Reset to the empty state: the same file must not be applied twice by accident.
      setText('');
      setFileName(null);
      setTextOpen(false);
      setPreview(null);
      setOverwriteFilled(false);
      setError(null);
      if (createMode) {
        setResult(null);
        if (data.topicId) onCreated?.(data.topicId);
      } else {
        setResult(data);
      }
    },
    onError: (failure) => {
      wait.note(failure);
      setError(failureText(failure));
    },
  });

  const busy = previewMutation.isPending || applyMutation.isPending;

  return {
    createMode,
    text,
    fileName,
    textOpen,
    justLoaded,
    picking,
    preview,
    overwriteFilled,
    result,
    error,
    checking: previewMutation.isPending,
    applying: applyMutation.isPending,
    wait,
    pickFile: () => {
      if (busy || picking) return;
      setPicking(true);
      void pickJsonFile()
        .then((picked) => {
          if (picked.status === 'picked') {
            load(picked.text, picked.name);
            flash();
          } else if (picked.status === 'failed') {
            setError(t.readFailed);
          }
        })
        .finally(() => setPicking(false));
    },
    pasteFromClipboard: () => {
      if (busy) return;
      void Clipboard.getStringAsync()
        .then((value) => {
          if (value.trim().length === 0) {
            setError(m.content.importPanel.clipboardEmpty);
            return;
          }
          load(value, null);
          flash();
        })
        .catch(() => setError(m.content.importPanel.clipboardDenied));
    },
    changeText: (value) => load(value, null),
    toggleText: () => setTextOpen((open) => !open),
    setOverwriteFilled,
    check: () => {
      if (busy || wait.waiting || text.trim().length === 0) return;
      setError(null);
      setResult(null);
      previewMutation.mutate();
    },
    apply: () => {
      if (busy || wait.waiting || preview === null) return;
      setError(null);
      applyMutation.mutate();
    },
    cancelPreview: () => {
      if (!applyMutation.isPending) setPreview(null);
    },
    dismissResult: () => setResult(null),
  };
}
