import { useCallback, useEffect, useRef, useState } from 'react';

import { errorText } from '@/api';
import { saveStudentNote, usePendingStudentNote } from '@/providers';

import { decideServerNote } from './logic';

/** Typing pause after which the draft is saved (the site's debounce). */
export const NOTE_DEBOUNCE_MS = 650;
/** How long «Сохранено» stays after a successful save. */
export const NOTE_SAVED_FLASH_MS = 1600;

/** How many of the card's own earlier saves are remembered to recognise a late re-read. */
const SUPERSEDED_KEPT = 12;

export type NoteAutosave = {
  text: string;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  /** `saving` while a request is in flight, `queued` while the draft waits for a connection, `saved` for 1.6 s. */
  status: 'saving' | 'queued' | 'saved' | null;
  error: string | null;
  dismissError: () => void;
};

/**
 * Autosave of a number's personal note (docs/spec/03-student-homework-lesson.md §1 H2.c): 650 ms after
 * the last keystroke and at once on blur, only when the trimmed text differs from the last one handed
 * over; a newer save supersedes an older one. The write goes through the pending-writes queue, so a
 * draft typed without a connection is kept and sent later (02 Q12).
 */
export function useNoteAutosave(homeworkNumberId: string, serverNote: string, saveFailedText: string): NoteAutosave {
  const pending = usePendingStudentNote(homeworkNumberId);
  // A draft still waiting for a connection is newer than the server's note.
  const [text, setText] = useState(() => pending?.payload.note ?? serverNote);
  // The last value known to be saved or handed to the queue (trimmed).
  const [baseline, setBaseline] = useState(() => (pending?.payload.note ?? serverNote).trim());
  const [syncedNote, setSyncedNote] = useState(serverNote);
  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [focused, setFocused] = useState(false);
  // Notes this card has saved before the current one: a re-read that started before the latest save
  // brings one of them back, and that echo must not replace the newer text.
  const [superseded, setSuperseded] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (serverNote !== syncedNote && !focused && phase !== 'saving') {
    // The detail was re-read. The field is never rewritten under the student's hands (the site's textarea
    // is not either): every save is followed by a re-read that returns the TRIMMED note, and a re-read
    // that started before the latest save returns an older one — adopting either while the student types
    // would eat a trailing space or the last words. So the server's note is taken over only when the
    // field is at rest, holds nothing unsaved, and the note really is another text (another device, the
    // number screen) rather than an echo of this card's own earlier save.
    setSyncedNote(serverNote);
    const decision = decideServerNote({ serverNote, text, baseline, hasPendingWrite: pending !== null, superseded });
    if (decision === 'confirmed') {
      // The server has caught up with this card: whatever arrives from now on is newer than its saves.
      if (superseded.length > 0) setSuperseded([]);
    } else if (decision === 'adopt') {
      setText(serverNote);
      setBaseline(serverNote.trim());
    }
  }

  const latest = useRef({ text, baseline });
  useEffect(() => {
    latest.current = { text, baseline };
  });

  const sequence = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const save = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed === latest.current.baseline) return;
      const previous = latest.current.baseline;
      latest.current = { ...latest.current, baseline: trimmed };
      const mine = (sequence.current += 1);
      if (mounted.current) {
        setBaseline(trimmed);
        setSuperseded((current) => [...current.filter((note) => note !== trimmed), previous].slice(-SUPERSEDED_KEPT));
        setError(null);
        setPhase('saving');
      }
      void saveStudentNote(homeworkNumberId, trimmed).then((outcome) => {
        // A newer save superseded this one, or the card is gone: its answer no longer matters here.
        if (!mounted.current || mine !== sequence.current) return;
        if (outcome.status === 'sent') {
          setPhase('saved');
          if (flash.current) clearTimeout(flash.current);
          flash.current = setTimeout(() => setPhase('idle'), NOTE_SAVED_FLASH_MS);
        } else if (outcome.status === 'queued') {
          setPhase('idle');
        } else {
          setPhase('idle');
          setError(errorText(outcome.error, saveFailedText));
        }
      });
    },
    [homeworkNumberId, saveFailedText],
  );

  const onChangeText = useCallback(
    (value: string) => {
      setText(value);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        debounce.current = null;
        save(value);
      }, NOTE_DEBOUNCE_MS);
    },
    [save],
  );

  const onFocus = useCallback(() => setFocused(true), []);

  const onBlur = useCallback(() => {
    setFocused(false);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
    save(latest.current.text);
  }, [save]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (flash.current) clearTimeout(flash.current);
      // The card is leaving (back, a recycled list row) with an unsent draft: send it now.
      if (debounce.current) {
        clearTimeout(debounce.current);
        debounce.current = null;
        save(latest.current.text);
      }
    };
  }, [save]);

  const status = phase === 'saving' ? 'saving' : pending ? 'queued' : phase === 'saved' ? 'saved' : null;
  return { text, onChangeText, onFocus, onBlur, status, error, dismissError: useCallback(() => setError(null), []) };
}
