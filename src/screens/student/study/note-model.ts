// Pure rules of the personal note (docs/spec/02-student-study.md S3 "Note editing behaviour", §4.7). No React.

/** Client `maxLength`; the server cuts to the same length after trimming. */
export const NOTE_MAX_LENGTH = 240;
/** Typing pause after which the draft is saved. */
export const NOTE_DEBOUNCE_MS = 650;
/** How long «Сохранено» stays after a successful save. */
export const NOTE_SAVED_FLASH_MS = 1600;

/** A save is sent only when the trimmed draft differs from what the server has. Clearing is a valid save. */
export function isNoteDirty(draft: string, saved: string): boolean {
  return draft.trim() !== saved.trim();
}

/**
 * What the server keeps for a draft (trim, cut to 240): used as the "saved" value when a queued write is
 * delivered later and its response is not at hand.
 */
export function normalizeNoteDraft(draft: string): string {
  return draft.trim().slice(0, NOTE_MAX_LENGTH);
}

/**
 * The text the field starts with: a draft still waiting for a connection wins over the server's note —
 * it is newer and would otherwise look lost.
 */
export function initialNoteText(serverNote: string, pendingDraft: string | null | undefined): string {
  return typeof pendingDraft === "string" ? pendingDraft : serverNote;
}

/** The editor's view of one note when news about the server's value arrives. */
export type NoteEditorSnapshot = {
  /** What the editor believes the server has. */
  saved: string;
  /** The text of the field. */
  draft: string;
  /** A write of this editor is in flight or waits in the offline queue: its own result will decide. */
  writing: boolean;
  /** A typing pause is still running: the draft is about to be saved. */
  typing: boolean;
};

/**
 * The server's note changed under an open editor: a refetch after a stale cached render, a save made on
 * another screen, a queued write delivered in the background. Returns the new `saved` baseline and the
 * new field text, or null when nothing changes.
 *
 * - While a write of this editor is on its way the news is ignored.
 * - A value that equals the baseline (trimmed) is not news — in particular the editor's own save coming
 *   back, which must never rewrite the field (02 S3: "the text field itself is not overwritten").
 * - Otherwise the value becomes the baseline; it replaces the text too, unless the student has typed
 *   something that is not saved yet.
 */
export function adoptServerNote(snapshot: NoteEditorSnapshot, serverNote: string): { saved: string; draft: string } | null {
  if (snapshot.writing) return null;
  if (!isNoteDirty(serverNote, snapshot.saved)) return null;
  const untouched = !snapshot.typing && !isNoteDirty(snapshot.draft, snapshot.saved);
  return { saved: serverNote, draft: untouched ? serverNote : snapshot.draft };
}

/** What the line next to the «Заметка» kicker shows. */
export type NoteStatus = "saving" | "queued" | "saved" | null;

export function noteStatus(state: { saving: boolean; queued: boolean; savedFlash: boolean }): NoteStatus {
  if (state.saving) return "saving";
  if (state.queued) return "queued";
  return state.savedFlash ? "saved" : null;
}
