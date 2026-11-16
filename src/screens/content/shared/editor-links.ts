// One-shot hand-overs between the topic editor and the single-number screen. The site passes them in the
// URL (`/edit?number=N#topic-answers`, docs/spec/07-developer-content.md §1.3, §1.4b); the route of
// `content.topicEdit` carries only the topic id, so they travel in memory, like `topics-flash`.
//
// Reads are split into "peek" (during render) and "clear" (in an effect): a render may run twice before
// the screen commits, and both runs must see the same answer.

type NumberRef = { topicId: string; number: string };

/** The number screen about to be pushed FROM the editor's statements-and-answers list. */
let openedFromEditor: NumberRef | null = null;
/** The number an editor about to be opened should show in its statements-and-answers list. */
let editorFocus: NumberRef | null = null;

/** The editor calls it right before pushing `content.number` from its list. */
export function markOpenedFromEditor(topicId: string, number: string): void {
  openedFromEditor = { topicId, number };
}

/** Whether this number screen sits directly above the editor that opened it («← К теме» is then a plain "back"). */
export function peekOpenedFromEditor(topicId: string, number: string): boolean {
  return openedFromEditor !== null && openedFromEditor.topicId === topicId && openedFromEditor.number === number;
}

export function clearOpenedFromEditor(): void {
  openedFromEditor = null;
}

/** The number screen calls it right before opening `content.topicEdit` (it was reached through number search). */
export function requestEditorFocus(topicId: string, number: string): void {
  editorFocus = { topicId, number };
}

/** The number the editor of `topicId` was asked to show, if any. */
export function peekEditorFocus(topicId: string): string | null {
  return editorFocus !== null && editorFocus.topicId === topicId ? editorFocus.number : null;
}

export function clearEditorFocus(): void {
  editorFocus = null;
}
