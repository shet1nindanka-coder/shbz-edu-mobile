import { useCallback, useEffect, useRef, useState } from 'react';

import { saveStudentNote, usePendingStudentNote } from '@/providers';

import { errorText } from './error-text';

/** Typing pause after which the draft is saved (the site's debounce). */
export const NOTE_DEBOUNCE_MS = 650;
/** How long «Сохранено» stays after a successful save. */
export const NOTE_SAVED_FLASH_MS = 1600;

export type NoteAutosave = {
  text: string;
  onChangeText: (value: string) => void;
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
  const [error, setError] = useState<string | null>(null);

  if (serverNote !== syncedNote) {
    // The detail was re-read: adopt the server's note unless the student is in the middle of an edit.
    setSyncedNote(serverNote);
    if (!pending && text.trim() === baseline) {
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
      latest.current = { ...latest.current, baseline: trimmed };
      const mine = (sequence.current += 1);
      if (mounted.current) {
        setBaseline(trimmed);
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

  const onBlur = useCallback(() => {
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
  return { text, onChangeText, onBlur, status, error, dismissError: useCallback(() => setError(null), []) };
}
