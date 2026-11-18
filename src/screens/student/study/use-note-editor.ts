import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isApiError, isRateLimited, qk } from '@/api';
import type { StudentNumberDetailResponse } from '@/api/types';
import { advanceWaitClock, startWaitClock, waitClockSeconds, type WaitClock } from '@/components/retry-wait';
import {
  STUDENT_NOTE_WRITE,
  discardStudentNote,
  flushPendingWrites,
  getPendingStudentNote,
  saveStudentNote,
  usePendingStudentNote,
  usePendingWriteSending,
} from '@/providers';
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
  /** The refusal named a wait (`rateLimited`): see `NoteEditor.waitSeconds`. */
  rateLimited: boolean;
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
  /**
   * Seconds until a save may be sent again after `429` (0 when nothing waits). It is the very clock that
   * blocks sending — a duration, so a device clock set back does not lengthen it — so «Повторить» is shown
   * exactly when it can send.
   */
  waitSeconds: number;
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
  /** Texts this editor submitted whose outcome has not come back yet, oldest first. */
  mine: string[];
  /** Number of the latest submit of this editor: only its outcome speaks for the editor. */
  seq: number;
  /** `Date.now()` of the latest submit: a queue entry stamped before it is older than this editor's draft. */
  submittedAt: number;
  /** The waiting (not refused) text of the queue entry when last seen, to recognise a background delivery. */
  lastEntry: string | null;
  /**
   * A queued draft that left the queue in the background (normalised): delivered or refused, the queue does
   * not say which. It counts as saved only once the server's note confirms it.
   */
  delivering: string | null;
  /** The rate-limit wait (a duration, `wait-clock.ts`): nothing is sent while it runs. */
  block: WaitClock | null;
  /** The kept refusal's `retryAt` the wait was last taken from: a stored moment is read once. */
  blockSource: number | null;
  debounce: Timer | null;
  flash: Timer | null;
};

/** A wait stored as a wall-clock moment (`retryAt` of a kept refusal), read once as a duration from `nowMs`. */
function clockUntil(retryAt: number | null | undefined, nowMs: number): WaitClock | null {
  if (!retryAt || !Number.isFinite(retryAt) || retryAt <= nowMs) return null;
  return startWaitClock((retryAt - nowMs) / 1000, nowMs);
}

/**
 * The personal note of one problem (02 S3 "Note editing behaviour", §4.7): debounce 650 ms, flush on blur
 * and when the screen goes away, «Сохранено» for 1600 ms, the server's text on a refusal.
 *
 * Differences from the site, all from 02 Q12 (offline) and the app's error contract:
 * - saves go through the pending-writes queue, so a draft typed without a connection is kept and sent later;
 * - every draft is handed to the queue the moment it is due (typing pause, blur, leaving), never held back
 *   inside the editor: the queue keeps one entry per number, sends one request at a time and always the
 *   NEWEST entry, so the last text typed — in this editor or in the other editor of the same number (the
 *   homework card and the number screen are mounted together) — is the one that lands. A draft parked in one
 *   editor and submitted later would land after a newer text typed in the other one;
 * - outcomes of this editor's older submits are ignored: only the latest submit's outcome speaks;
 * - after `429 rateLimited` nothing is sent until `retryAfterSeconds` has passed (never auto-retried).
 *
 * `serverNote` is followed, not only read at mount: the screen may first render a cached detail that is
 * older than a save which finished after the previous visit (the flush on leaving), or the note may have
 * been saved from the homework screen or delivered by the offline queue meanwhile. See `adoptServerNote` in note-model.ts.
 *
 * The queue entry of the number is the single source of truth of "what waits to be saved" (states in
 * `src/services/query/pending-writes.ts`): the field follows an entry written by the other editor after
 * this editor's last submit (unless the student is typing here), and a draft the server refused in the
 * background stays in the queue with its refusal, which this editor shows like the refusal of its own save.
 */
export function useNoteEditor(homeworkNumberId: string, serverNote: string, fallbackError: string): NoteEditor {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const entry = usePendingStudentNote(homeworkNumberId);
  const entrySending = usePendingWriteSending(STUDENT_NOTE_WRITE, homeworkNumberId);
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
  // The rate-limit wait at mount (a refusal kept in the queue), and its seconds as shown.
  const [initialBlock] = useState(() => clockUntil(refusal?.retryAt, Date.now()));
  const [waitSeconds, setWaitSeconds] = useState(() => waitClockSeconds(initialBlock));
  const refusalRef = useRef(refusal);
  useEffect(() => {
    refusalRef.current = refusal;
  }, [refusal]);

  const loopRef = useRef<SaveLoop>({
    mounted: true,
    saved: serverNote,
    draft: initialNoteText(serverNote, entryNote),
    mine: [],
    seq: 0,
    submittedAt: 0,
    lastEntry: pendingNote,
    delivering: null,
    block: initialBlock,
    blockSource: refusal?.retryAt ?? null,
    debounce: null,
    flash: null,
  });

  /** Seconds left of the rate-limit wait, measured now (the one gate of sending and of «Повторить»). */
  const readBlock = useCallback((): number => {
    const loop = loopRef.current;
    if (!loop.block) return 0;
    loop.block = advanceWaitClock(loop.block, Date.now());
    const seconds = waitClockSeconds(loop.block);
    if (seconds === 0) loop.block = null;
    return seconds;
  }, []);

  /** A refusal named a wait: it runs from now, unless the wait already running is longer. */
  const startBlock = useCallback(
    (clock: WaitClock | null) => {
      const loop = loopRef.current;
      if (!clock || waitClockSeconds(clock) <= readBlock()) return;
      loop.block = clock;
      if (loop.mounted) setWaitSeconds(waitClockSeconds(clock));
    },
    [readBlock],
  );

  // The shown seconds follow the same clock once a second while it runs (timers stop in the background;
  // the first tick after the return subtracts the whole time away, a clock set back adds nothing).
  const blocked = waitSeconds > 0;
  useEffect(() => {
    if (!blocked) return;
    const timer = setInterval(() => setWaitSeconds(readBlock()), 1000);
    return () => clearInterval(timer);
  }, [blocked, readBlock]);

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

  /** The text waiting in the queue now (not refused), read outside render: the other editor may have changed it. */
  const waitingNow = useCallback((): string | null => {
    const current = getPendingStudentNote(homeworkNumberId);
    return current && !current.refusal ? current.payload.note : null;
  }, [homeworkNumberId]);

  const send = useCallback(
    async (value: string, explicit = false): Promise<void> => {
      const loop = loopRef.current;
      const current = getPendingStudentNote(homeworkNumberId);
      const waiting = current && !current.refusal ? current.payload.note : null;
      // Nothing to send when the draft equals what already waits in the queue — or, if nothing waits, what
      // the server has.
      if (!isNoteDirty(value, waiting ?? loop.saved)) {
        if (waiting !== null && explicit && isOnline() && loop.mine.length === 0) {
          // Blur / «Повторить» / leaving on a draft that already waits (and is not being sent by this editor):
          // send it now rather than waiting for the queue's next try (the last failure may be a passing one).
          flushPendingWrites();
        } else if (waiting === null && current?.refusal) {
          // The student put the saved text back over a refused draft: nothing is left to save.
          void discardStudentNote(homeworkNumberId);
        }
        return;
      }
      // After `429` nothing is sent until the wait is over; the draft stays in the field for blur / retry.
      if (readBlock() > 0) return;

      loop.seq += 1;
      const token = loop.seq;
      loop.submittedAt = Date.now();
      loop.mine.push(value);
      loop.delivering = null;
      if (loop.mounted) {
        setError(null);
        setSaving(true);
      }
      const outcome = await saveStudentNote(homeworkNumberId, value);
      const index = loop.mine.indexOf(value);
      if (index >= 0) loop.mine.splice(index, 1);
      // A newer submit of this editor is on its way: its outcome (which comes later) decides.
      if (token !== loop.seq) return;
      if (loop.mounted) setSaving(false);

      // The other editor has written a newer text meanwhile: the queue sends it; this outcome is not news
      // for the field (the entry is followed below).
      const after = waitingNow();
      const superseded = after !== null && isNoteDirty(after, value);

      if (outcome.status === 'sent') {
        loop.saved = outcome.result.note;
        rememberSavedNote(outcome.result.note);
        if (loop.mounted && !outcome.result.notesEnabled) setDisabledByServer(true);
        if (!superseded && !isNoteDirty(loop.draft, outcome.result.note)) showSaved();
      } else if (outcome.status === 'rejected' && !superseded) {
        // The queue keeps the refused draft (with its refusal) until it is replaced or discarded.
        const failure = outcome.error;
        const retryAfter = isRateLimited(failure) && isApiError(failure) ? failure.retryAfterSeconds : undefined;
        if (retryAfter) startBlock(startWaitClock(retryAfter, Date.now()));
        if (loop.mounted) {
          setError({ message: isApiError(failure) && failure.message ? failure.message : fallbackError, rateLimited: Boolean(retryAfter) });
        }
      }
      // `queued`: the entry holds the draft; its status comes from the entry.
    },
    [homeworkNumberId, fallbackError, showSaved, rememberSavedNote, waitingNow, readBlock, startBlock],
  );

  // The server's note changed under the editor (rules in `adoptServerNote`). A draft still waiting in the
  // queue is newer than anything the server can say.
  const followServerNote = useCallback(
    (note: string) => {
      const loop = loopRef.current;
      if (loop.delivering !== null) {
        // The re-read after a background delivery: only now is the queued draft known to be saved.
        const delivered = !isNoteDirty(note, loop.delivering);
        loop.delivering = null;
        if (delivered && loop.mine.length === 0) {
          loop.saved = note;
          showSaved();
          return;
        }
      }
      const next = adoptServerNote(
        { saved: loop.saved, draft: loop.draft, writing: loop.mine.length > 0 || waitingNow() !== null, typing: loop.debounce !== null },
        note,
      );
      if (!next) return;
      loop.saved = next.saved;
      if (next.draft === loop.draft) return;
      loop.draft = next.draft;
      setText(next.draft);
    },
    [showSaved, waitingNow],
  );

  // The queue entry changed. The field shows what the entry holds when it was written after this editor's
  // last submit (the other editor of the same number), or when the queue refused it in the background —
  // unless the student is typing here (that text is newer and is submitted on the pause / blur), or the
  // entry is one of this editor's own submits (their outcome decides).
  useEffect(() => {
    const loop = loopRef.current;
    if (entryNote === null) {
      // The entry left the queue without a save of ours: delivered in the background (a refusal stays in
      // the queue), or dropped because its number is gone. A delivery invalidates the detail, and the
      // re-read that returns the draft confirms it (`delivering`, «Сохранено»). Without that re-read the
      // draft stays unsaved and is sent again on blur or when the screen goes away — it is never reported
      // as saved on the queue's word alone.
      const left = loop.lastEntry;
      loop.lastEntry = null;
      if (left !== null && loop.mine.length === 0 && isNoteDirty(left, loop.saved)) loop.delivering = normalizeNoteDraft(left);
      return;
    }
    loop.lastEntry = refusal ? null : entryNote;
    loop.delivering = null;
    if (refusal?.retryAt && refusal.retryAt !== loop.blockSource) {
      // The queue stores the wait as a moment; it is taken as a duration once, when it is first seen.
      loop.blockSource = refusal.retryAt;
      startBlock(clockUntil(refusal.retryAt, Date.now()));
    }
    if (loop.debounce !== null) return;
    if (loop.mine.includes(entryNote)) return;
    // Stamped before this editor's latest submit: older than what this editor sent (a late notification).
    if (entryAt !== null && entryAt < loop.submittedAt) return;
    if (entryNote === loop.draft) return;
    loop.draft = entryNote;
    setText(entryNote);
  }, [entryNote, entryAt, refusal, startBlock]);

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
      const waiting = readBlock() > 0;
      setError((current) => (current?.rateLimited && waiting ? current : null));
      const kept = refusalRef.current;
      if (kept && !(kept.retryAt !== null && waiting)) setHiddenRefusalAt(kept.at);
      if (loop.debounce) clearTimeout(loop.debounce);
      loop.debounce = setTimeout(() => {
        loop.debounce = null;
        void send(loop.draft);
      }, NOTE_DEBOUNCE_MS);
    },
    [send, readBlock],
  );

  const flush = useCallback(() => {
    const loop = loopRef.current;
    if (loop.debounce) clearTimeout(loop.debounce);
    loop.debounce = null;
    void send(loop.draft, true);
  }, [send]);

  // A refusal kept in the queue (this editor's or one met in the background) is shown like the editor's own;
  // its wait is the editor's own clock (`waitSeconds`).
  const keptError: NoteSaveError | null =
    refusal && refusal.at !== hiddenRefusalAt && !saving
      ? { message: refusal.message ?? fallbackError, rateLimited: refusal.retryAt !== null }
      : null;

  return {
    text,
    onChangeText,
    flush,
    retry: flush,
    // An entry whose request is in flight (here, in the other editor or in a flush) is «Сохраняем…».
    status: noteStatus({ saving, queued: pendingNote !== null && !saving, savedFlash, online, sending: entrySending }),
    error: error ?? keptError,
    waitSeconds,
    disabledByServer,
  };
}
