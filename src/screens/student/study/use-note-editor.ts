import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isApiError, isRateLimited, qk } from '@/api';
import type { StudentNumberDetailResponse } from '@/api/types';
import { saveStudentNote, usePendingStudentNote } from '@/providers';

import {
  NOTE_DEBOUNCE_MS,
  NOTE_SAVED_FLASH_MS,
  adoptServerNote,
  initialNoteText,
  isNoteDirty,
  normalizeNoteDraft,
  noteStatus,
  type NoteStatus,
} from './note-model';

export type NoteSaveError = {
  /** Localised text to show (the server's, or the fallback). */
  message: string;
  /** Epoch ms before which the server will refuse again (`rateLimited`); null otherwise. */
  retryAt: number | null;
};

export type NoteEditor = {
  text: string;
  onChangeText: (value: string) => void;
  /** Save right away (blur). */
  flush: () => void;
  /** Send the current draft again after a refusal. */
  retry: () => void;
  /** «Сохраняем…» / waiting for a connection / «Сохранено» / nothing. */
  status: NoteStatus;
  error: NoteSaveError | null;
  /** The server reported that notes are switched off (`notesEnabled: false` in a save response). */
  disabledByServer: boolean;
};

type Timer = ReturnType<typeof setTimeout>;

/** Mutable state of the save loop: it outlives renders and keeps running after the screen is gone. */
type SaveLoop = {
  mounted: boolean;
  /** What the server has. */
  saved: string;
  /** The newest text of the field. */
  draft: string;
  /** A draft waiting in the queue (typed offline), or null. */
  queued: string | null;
  inFlight: boolean;
  /** A newer draft that arrived while a save was running. */
  next: string | null;
  blockedUntil: number;
  debounce: Timer | null;
  flash: Timer | null;
};

/**
 * The personal note of one problem (02 S3 "Note editing behaviour", §4.7): debounce 650 ms, flush on blur
 * and when the screen goes away, «Сохранено» for 1600 ms, the server's text on a refusal.
 *
 * Differences from the site, all from 02 Q12 (offline) and the app's error contract:
 * - saves go through the pending-writes queue, so a draft typed without a connection is kept and sent later;
 * - saves are sent one at a time, in order (the queue cannot abort a request, and two overlapping saves
 *   could land in the wrong order);
 * - after `429 rateLimited` nothing is sent until `retryAfterSeconds` has passed (never auto-retried).
 *
 * `serverNote` is followed, not only read at mount: the screen may first render a cached detail that is
 * older than a save which finished after the previous visit (the flush on leaving), or the note may have
 * been saved from the homework screen or delivered by the offline queue meanwhile. See `adoptServerNote` in note-model.ts.
 */
export function useNoteEditor(homeworkNumberId: string, serverNote: string, fallbackError: string): NoteEditor {
  const queryClient = useQueryClient();
  const pending = usePendingStudentNote(homeworkNumberId);
  const pendingNote = pending?.payload.note ?? null;
  const [text, setText] = useState(() => initialNoteText(serverNote, pendingNote));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<NoteSaveError | null>(null);
  const [disabledByServer, setDisabledByServer] = useState(false);

  const loopRef = useRef<SaveLoop>({
    mounted: true,
    saved: serverNote,
    draft: initialNoteText(serverNote, pendingNote),
    queued: pendingNote,
    inFlight: false,
    next: null,
    blockedUntil: 0,
    debounce: null,
    flash: null,
  });

  const showSaved = useCallback(() => {
    const loop = loopRef.current;
    if (!loop.mounted) return;
    setSavedFlash(true);
    if (loop.flash) clearTimeout(loop.flash);
    loop.flash = setTimeout(() => setSavedFlash(false), NOTE_SAVED_FLASH_MS);
  }, []);

  // The cached detail of this problem gets the saved note at once: a save that ends after the screen has
  // gone (the flush on leaving) would otherwise leave the pre-save note in the cache, and the next visit
  // would start from it. The entries stay marked stale, so the next mount still asks the server.
  const rememberSavedNote = useCallback(
    (note: string) => {
      const queryKey = qk('studentStudy', 'getNumberDetail');
      queryClient.setQueriesData<StudentNumberDetailResponse>({ queryKey }, (cached) =>
        cached && cached.number.id === homeworkNumberId && cached.number.note !== note
          ? { ...cached, number: { ...cached.number, note } }
          : cached,
      );
      void queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
    },
    [queryClient, homeworkNumberId],
  );

  const send = useCallback(
    async (value: string): Promise<void> => {
      const loop = loopRef.current;
      if (loop.inFlight) {
        loop.next = value;
        return;
      }
      loop.inFlight = true;
      let draft: string | null = value;
      while (draft !== null) {
        // Nothing to send when the draft equals what the server has — or what already waits in the queue.
        if (isNoteDirty(draft, loop.queued ?? loop.saved) && loop.blockedUntil <= Date.now()) {
          if (loop.mounted) {
            setError(null);
            setSaving(true);
          }
          const outcome = await saveStudentNote(homeworkNumberId, draft);
          if (outcome.status === 'sent') {
            loop.saved = outcome.result.note;
            loop.queued = null;
            rememberSavedNote(outcome.result.note);
            if (loop.mounted && !outcome.result.notesEnabled) setDisabledByServer(true);
            showSaved();
          } else if (outcome.status === 'queued') {
            loop.queued = draft;
          } else {
            loop.queued = null;
            const failure = outcome.error;
            const retryAfter = isRateLimited(failure) && isApiError(failure) ? failure.retryAfterSeconds : undefined;
            const retryAt = retryAfter ? Date.now() + retryAfter * 1000 : null;
            if (retryAt) loop.blockedUntil = retryAt;
            if (loop.mounted) {
              setError({ message: isApiError(failure) && failure.message ? failure.message : fallbackError, retryAt });
            }
          }
          if (loop.mounted) setSaving(false);
        }
        draft = loop.next;
        loop.next = null;
      }
      loop.inFlight = false;
    },
    [homeworkNumberId, fallbackError, showSaved, rememberSavedNote],
  );

  // The server's note changed under the editor (rules in `adoptServerNote`). A draft still waiting in the
  // queue is newer than anything the server can say.
  const followServerNote = useCallback((note: string) => {
    const loop = loopRef.current;
    const next = adoptServerNote(
      { saved: loop.saved, draft: loop.draft, writing: loop.inFlight || loop.queued !== null, typing: loop.debounce !== null },
      note,
    );
    if (!next) return;
    loop.saved = next.saved;
    if (next.draft === loop.draft) return;
    loop.draft = next.draft;
    setText(next.draft);
  }, []);

  useEffect(() => {
    if (pendingNote === null) followServerNote(serverNote);
  }, [serverNote, pendingNote, followServerNote]);

  // A queued draft that disappears without a save of ours was delivered by the queue (the connection
  // came back). SPEC-GAP: the queue does not tell a background delivery from a background refusal; the
  // number detail is refetched after a delivery, and a refusal leaves the server's note as it was.
  useEffect(() => {
    const loop = loopRef.current;
    if (pendingNote !== null || loop.queued === null || loop.inFlight) return;
    loop.saved = normalizeNoteDraft(loop.queued);
    loop.queued = null;
    showSaved();
  }, [pendingNote, showSaved]);

  // The screen is going away: save what the debounce still holds.
  useEffect(() => {
    const loop = loopRef.current;
    loop.mounted = true;
    return () => {
      loop.mounted = false;
      if (loop.debounce) clearTimeout(loop.debounce);
      if (loop.flash) clearTimeout(loop.flash);
      loop.debounce = null;
      void send(loop.draft);
    };
  }, [send]);

  const onChangeText = useCallback(
    (value: string) => {
      const loop = loopRef.current;
      loop.draft = value;
      setText(value);
      setSavedFlash(false);
      // The banner goes on the next keystroke — unless it is a rate-limit wait, which still holds.
      setError((current) => (current?.retryAt && current.retryAt > Date.now() ? current : null));
      if (loop.debounce) clearTimeout(loop.debounce);
      loop.debounce = setTimeout(() => {
        loop.debounce = null;
        void send(loop.draft);
      }, NOTE_DEBOUNCE_MS);
    },
    [send],
  );

  const flush = useCallback(() => {
    const loop = loopRef.current;
    if (loop.debounce) clearTimeout(loop.debounce);
    loop.debounce = null;
    void send(loop.draft);
  }, [send]);

  return {
    text,
    onChangeText,
    flush,
    retry: flush,
    status: noteStatus({ saving, queued: pending !== null && !saving, savedFlash }),
    error,
    disabledByServer,
  };
}
