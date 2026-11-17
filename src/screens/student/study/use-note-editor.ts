import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isApiError, isRateLimited, qk } from '@/api';
import type { StudentNumberDetailResponse } from '@/api/types';
import { discardStudentNote, flushPendingWrites, saveStudentNote, usePendingStudentNote } from '@/providers';
import { isOnline, useIsOnline } from '@/services/network';

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
  /** Save right away (blur); a draft already waiting in the queue is sent again now. */
  flush: () => void;
  /** Send the current draft again after a refusal. */
  retry: () => void;
  /** «Сохраняем…» / waiting for a connection / waiting for a re-try while online / «Сохранено» / nothing. */
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
  /** A draft waiting in the queue (no answer yet), or null. A draft the server refused is not "queued". */
  queued: string | null;
  inFlight: boolean;
  /** A newer draft that arrived while a save was running. */
  next: string | null;
  /**
   * A queued draft that left the queue in the background (normalised): delivered or refused, the queue does
   * not say which. It counts as saved only once the server's note confirms it.
   */
  delivering: string | null;
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
 *
 * The queue entry of the number is followed too (states in `src/services/query/pending-writes.ts`): another
 * editor of the same number (homework card and number screen are mounted together) may replace the waiting
 * draft, and a draft the server refused in the background stays in the queue with its refusal, which this
 * editor shows like the refusal of its own save.
 */
export function useNoteEditor(homeworkNumberId: string, serverNote: string, fallbackError: string): NoteEditor {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const entry = usePendingStudentNote(homeworkNumberId);
  const entryNote = entry?.payload.note ?? null;
  const entryAt = entry?.updatedAt ?? null;
  const refusal = entry?.refusal ?? null;
  /** The draft waiting for an answer (not refused), or null. */
  const pendingNote = entry && !refusal ? entryNote : null;
  const [text, setText] = useState(() => initialNoteText(serverNote, entryNote));
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<NoteSaveError | null>(null);
  const [disabledByServer, setDisabledByServer] = useState(false);
  /** A kept refusal the student has started typing over (its banner goes, like the editor's own error). */
  const [hiddenRefusalAt, setHiddenRefusalAt] = useState<number | null>(null);
  const refusalRef = useRef(refusal);
  useEffect(() => {
    refusalRef.current = refusal;
  }, [refusal]);

  const loopRef = useRef<SaveLoop>({
    mounted: true,
    saved: serverNote,
    draft: initialNoteText(serverNote, entryNote),
    queued: pendingNote,
    inFlight: false,
    next: null,
    delivering: null,
    blockedUntil: refusal?.retryAt ?? 0,
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
    async (value: string, explicit = false): Promise<void> => {
      const loop = loopRef.current;
      if (loop.inFlight) {
        loop.next = value;
        return;
      }
      loop.inFlight = true;
      let draft: string | null = value;
      while (draft !== null) {
        // Nothing to send when the draft equals what the server has — or what already waits in the queue.
        const dirty = isNoteDirty(draft, loop.queued ?? loop.saved);
        if (!dirty && loop.queued !== null && explicit && isOnline()) {
          // Blur / «Повторить» / leaving on a draft that already waits: send it now rather than waiting for
          // the queue's next try (the device may be online and the last failure a passing one).
          flushPendingWrites();
        } else if (!dirty && loop.queued === null && refusalRef.current) {
          // The student put the saved text back over a refused draft: nothing is left to save.
          void discardStudentNote(homeworkNumberId);
        }
        if (dirty && loop.blockedUntil <= Date.now()) {
          if (loop.mounted) {
            setError(null);
            setSaving(true);
          }
          loop.delivering = null;
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
            // The queue keeps the refused draft (with its refusal) until it is replaced or discarded.
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
    if (loop.delivering !== null) {
      // The re-read after a background delivery: only now is the queued draft known to be saved.
      const delivered = !isNoteDirty(note, loop.delivering);
      loop.delivering = null;
      if (delivered && !loop.inFlight) {
        loop.saved = note;
        showSaved();
        return;
      }
    }
    const next = adoptServerNote(
      { saved: loop.saved, draft: loop.draft, writing: loop.inFlight || loop.queued !== null, typing: loop.debounce !== null },
      note,
    );
    if (!next) return;
    loop.saved = next.saved;
    if (next.draft === loop.draft) return;
    loop.draft = next.draft;
    setText(next.draft);
  }, [showSaved]);

  // The queue entry changed without a save of this editor: another editor of the same number wrote a newer
  // draft, or the queue refused the waiting one in the background. The field shows what the entry holds —
  // unless the student is typing here or a save of this editor is on its way (its own result decides).
  useEffect(() => {
    const loop = loopRef.current;
    if (entryNote === null || loop.debounce !== null || loop.inFlight) return;
    loop.queued = refusal ? null : entryNote;
    loop.delivering = null;
    if (refusal?.retryAt) loop.blockedUntil = Math.max(loop.blockedUntil, refusal.retryAt);
    if (entryNote === loop.draft) return;
    loop.draft = entryNote;
    setText(entryNote);
  }, [entryNote, entryAt, refusal]);

  // Each value of the server's note is news once. A value that arrived while a write of this editor was on
  // its way (in flight or queued) is older than that write and is dropped for good: re-reading it once the
  // write has settled would put the editor's previous save back into the field (a re-read that started
  // before the latest save answers after it).
  const seenServerNote = useRef(serverNote);
  useEffect(() => {
    if (serverNote === seenServerNote.current) return;
    seenServerNote.current = serverNote;
    if (pendingNote === null) followServerNote(serverNote);
  }, [serverNote, pendingNote, followServerNote]);

  // A queued draft that disappears without a save of ours left the queue in the background: delivered (a
  // refusal stays in the queue, see above), or dropped because its number is gone. A delivery invalidates the
  // detail, and the re-read that returns the draft confirms it (`delivering`, «Сохранено»). Without that
  // re-read the draft stays unsaved and is sent again on blur or when the screen goes away — it is never
  // reported as saved on the queue's word alone.
  useEffect(() => {
    const loop = loopRef.current;
    if (entryNote !== null || loop.queued === null || loop.inFlight) return;
    loop.delivering = normalizeNoteDraft(loop.queued);
    loop.queued = null;
  }, [entryNote]);

  // The screen is going away: save what the debounce still holds.
  useEffect(() => {
    const loop = loopRef.current;
    loop.mounted = true;
    return () => {
      loop.mounted = false;
      if (loop.debounce) clearTimeout(loop.debounce);
      if (loop.flash) clearTimeout(loop.flash);
      loop.debounce = null;
      void send(loop.draft, true);
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
      const kept = refusalRef.current;
      if (kept && !(kept.retryAt && kept.retryAt > Date.now())) setHiddenRefusalAt(kept.at);
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
    void send(loop.draft, true);
  }, [send]);

  // A refusal kept in the queue (this editor's or one met in the background) is shown like the editor's own;
  // a `retryAt` in the past counts as no wait (`useCountdown`).
  const keptError: NoteSaveError | null =
    refusal && refusal.at !== hiddenRefusalAt && !saving
      ? { message: refusal.message ?? fallbackError, retryAt: refusal.retryAt }
      : null;

  return {
    text,
    onChangeText,
    flush,
    retry: flush,
    status: noteStatus({ saving, queued: pendingNote !== null && !saving, savedFlash, online }),
    error: error ?? keptError,
    disabledByServer,
  };
}
