// Web renderer: the same HTML and the same CSS as the native WebView shell, written straight into the
// app's document, with the site's line-break pass applied after layout. This is the variant the web
// export verifies; it mirrors the site's `components/math-line-breaks.tsx` (batched per frame, off-screen
// blocks deferred, re-run on width change and after fonts load).
import { useEffect, useRef, type CSSProperties } from 'react';

import { MATH_LINE_BREAKS_GLOBAL, MATH_LINE_BREAKS_INLINE_SCRIPT } from '@/domain/math-line-breaks';
import { useTheme } from '@/theme';

import { KATEX_CSS } from './generated/katex-css';
import { buildMathCssVars, MATH_CONTENT_CSS, MATH_ROOT_CLASS } from './math-styles';
import type { MathViewProps } from './math-view.types';

const STYLE_ELEMENT_ID = 'shbz-math-css';
const SCRIPT_ELEMENT_ID = 'shbz-math-line-breaks';

/** KaTeX CSS + content CSS + the line-break function, added to the document once. */
function ensureDocumentAssets(): void {
  if (typeof document === 'undefined') return;
  if (!document.getElementById(STYLE_ELEMENT_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = `${KATEX_CSS}\n${MATH_CONTENT_CSS}`;
    document.head.appendChild(style);
  }
  if (!document.getElementById(SCRIPT_ELEMENT_ID)) {
    // An inline <script>, as on the site: the function is plain JS kept as a string, and running it
    // through a script element needs neither `eval` nor `new Function`.
    const script = document.createElement('script');
    script.id = SCRIPT_ELEMENT_ID;
    script.textContent = MATH_LINE_BREAKS_INLINE_SCRIPT;
    document.head.appendChild(script);
  }
}

type RootState = { dirty: boolean; visible: boolean; width: number | null };

const roots = new Map<HTMLElement, RootState>();
const queued = new Set<HTMLElement>();
let frame = 0;
let intersectionObserver: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let windowListenerAttached = false;

function flush(): void {
  frame = 0;
  const apply = (window as unknown as Record<string, unknown>)[MATH_LINE_BREAKS_GLOBAL];
  const batch = Array.from(queued).filter((root) => root.isConnected);
  queued.clear();
  if (typeof apply === 'function' && batch.length > 0) {
    (apply as (nodes: ParentNode[]) => void)(batch);
  }
}

function requestBreaks(root: HTMLElement): void {
  const state = roots.get(root);
  if (!state) return;
  // Measuring is expensive (getBoundingClientRect per segment): a block outside the viewport waits
  // until it scrolls in.
  if (!state.visible) {
    state.dirty = true;
    return;
  }
  state.dirty = false;
  queued.add(root);
  if (!frame) frame = requestAnimationFrame(flush);
}

function requestAllBreaks(): void {
  roots.forEach((_state, root) => requestBreaks(root));
}

function ensureObservers(): void {
  if (!intersectionObserver && typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const root = entry.target as HTMLElement;
          const state = roots.get(root);
          if (!state) continue;
          state.visible = entry.isIntersecting;
          if (state.visible && state.dirty) requestBreaks(root);
        }
      },
      { rootMargin: '200px 0px' },
    );
  }
  if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
    // Breaks depend on the width only; the height also changes because of the inserted operators.
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const root = entry.target as HTMLElement;
        const state = roots.get(root);
        const width = Math.round(entry.contentRect.width);
        if (!state || state.width === width) continue;
        const isFirstMeasure = state.width === null;
        state.width = width;
        if (!isFirstMeasure) requestBreaks(root);
      }
    });
  }
  if (!windowListenerAttached) {
    windowListenerAttached = true;
    window.addEventListener('resize', requestAllBreaks);
    document.fonts?.ready.then(requestAllBreaks).catch(() => undefined);
    // KaTeX fonts are fetched lazily, the first time a formula needs them.
    document.fonts?.addEventListener?.('loadingdone', requestAllBreaks);
  }
}

export function MathView({ html, value, maxHeight, fontScale, accessibilityLabel, testID }: MathViewProps) {
  const theme = useTheme();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    ensureDocumentAssets();
    ensureObservers();
    // Without IntersectionObserver the block counts as visible.
    roots.set(root, { dirty: true, visible: !intersectionObserver, width: null });
    intersectionObserver?.observe(root);
    resizeObserver?.observe(root);
    return () => {
      roots.delete(root);
      queued.delete(root);
      intersectionObserver?.unobserve(root);
      resizeObserver?.unobserve(root);
    };
  }, []);

  // New content is fresh KaTeX HTML without inserted operators; a new font size moves every break.
  useEffect(() => {
    if (ref.current) requestBreaks(ref.current);
  }, [html, value, fontScale]);

  const vars = buildMathCssVars({
    text: theme.colors.label,
    dangerSoft: theme.colors.redSoft,
    dangerText: theme.colors.redText,
    fontFamily: `${theme.fonts.regular},system-ui,sans-serif`,
    fontScale,
  });
  const style: CSSProperties = {
    ...(vars as CSSProperties),
    ...(maxHeight === null ? null : { maxHeight, overflow: 'hidden' }),
  };

  return (
    <div
      ref={ref}
      role="img"
      aria-label={accessibilityLabel}
      data-testid={testID}
      className={MATH_ROOT_CLASS}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
