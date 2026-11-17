// Reading the import JSON from the clipboard, with the outcomes the panel tells apart. Pure: the clipboard
// and the platform are passed in, so tests/content-clipboard-paste.test.ts runs without React Native.

/** The two `expo-clipboard` calls this needs. */
export type ClipboardReader = {
  getStringAsync: () => Promise<string>;
  hasStringAsync: () => Promise<boolean>;
};

export type ClipboardPaste =
  | { kind: 'text'; text: string }
  /** Nothing to paste. */
  | { kind: 'empty' }
  /** iOS: the clipboard holds text, yet the read came back empty — the system paste prompt was refused. */
  | { kind: 'refused' }
  /** The read itself failed (Android / web: access denied). */
  | { kind: 'failed' };

/**
 * WHY the second call: on iOS 16+ a refused paste prompt makes `UIPasteboard.general.string` nil, and
 * expo-clipboard's `getStringAsync` turns nil into "" and resolves (ios/ClipboardModule.swift) — a refusal
 * looks exactly like an empty clipboard. `hasStringAsync` (`hasStrings || hasHTML`) does not show the prompt,
 * so "has text but read nothing" means the paste was refused. A clipboard with HTML only lands there too,
 * which is why the message for `refused` is worded so that it fits both.
 */
export async function readClipboardText(platform: string, clipboard: ClipboardReader): Promise<ClipboardPaste> {
  let value: string;
  try {
    value = await clipboard.getStringAsync();
  } catch {
    return { kind: 'failed' };
  }
  if (value.trim().length > 0) return { kind: 'text', text: value };
  // Only an exactly empty read can be a refusal (nil turned into ""): whitespace came from the clipboard,
  // so the read worked and there is simply no text to import.
  if (platform === 'ios' && value.length === 0) {
    let hasText = false;
    try {
      hasText = await clipboard.hasStringAsync();
    } catch {
      // Unknown: say what the read said.
    }
    if (hasText) return { kind: 'refused' };
  }
  return { kind: 'empty' };
}
