/**
 * What the console may say during a native render.
 *
 * `console.error` always fails the test unless a pattern of `ALLOWED_ERRORS` matches; every entry there was
 * traced to its source and is not a defect of the app. `console.warn` is recorded (see the run report) and
 * fails only for `FATAL_WARNINGS`.
 */
export const ALLOWED_ERRORS: { pattern: RegExp; why: string }[] = [
  {
    pattern: /^dispatchCommand was called with a ref that isn't a native component/,
    why:
      'React Native logs this when a native command is sent through a ref that is not a real host view. Under the test renderer no ref is; ' +
      'the only sender is WebView.injectJavaScript in src/components/math/math-view.tsx:72, called after the harness reports the math shell as loaded.',
  },
];

export const FATAL_WARNINGS: { pattern: RegExp; why: string }[] = [
  { pattern: /is not a valid icon name for family/, why: '@expo/vector-icons renders "?" for an unknown glyph name' },
];

/** Warnings that are expected in this environment and say nothing about the app; not even recorded. */
export const IGNORED_WARNINGS: { pattern: RegExp; why: string }[] = [];
