// The static HTML page every native math WebView loads (docs/spec/09-data-i18n-math.md §4.3 step 4, the
// inline-HTML variant of step 8): KaTeX CSS with its woff2 fonts inlined, the Onest subset for the
// prose, the content CSS, the site's line-break script and a tiny bridge. It never changes at runtime —
// content, colours and font size arrive through `window.__render`, so a recycled row re-renders without
// reloading the page.
import { MATH_LINE_BREAKS_SCRIPT } from '@/domain/math-line-breaks';

import { KATEX_CSS } from './generated/katex-css';
import { MATH_TEXT_FONT_BASE64, MATH_TEXT_FONT_FAMILY } from './generated/text-font';
import { MATH_CONTENT_CSS, MATH_ROOT_CLASS } from './math-styles';

/** The only URL the WebView may ever be at; any other navigation is refused. */
export const MATH_SHELL_BASE_URL = 'about:blank';

/** Prose font stack inside the shell: the bundled Onest subset, then the system face. */
export const MATH_SHELL_FONT_FAMILY = `"${MATH_TEXT_FONT_FAMILY}",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif`;

export type MathShellMessage = { ready: true } | { id: number; h: number };

// Bridge contract:
//   window.__render(id, html, vars, maxHeight) — replace the content, apply CSS variables, re-measure.
//   → postMessage({ ready: true })             — the page can take content.
//   → postMessage({ id, h })                   — height in CSS px of render `id` (after line breaks).
// Heights are re-reported when the width changes and when fonts finish loading: both move line breaks.
const BRIDGE_SCRIPT = String.raw`
(function () {
  var root = document.getElementById("root");
  var currentId = null;
  var lastWidth = -1;

  function post(message) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  }

  function report() {
    if (currentId === null) {
      return;
    }
    post({ id: currentId, h: Math.ceil(root.getBoundingClientRect().height) });
  }

  function relayout() {
    try {
      applyMathLineBreaks(root);
    } catch (error) {
      // A failed pass leaves the formula without repeated operators — still readable.
    }
    report();
  }

  window.__render = function (id, html, vars, maxHeight) {
    currentId = id;
    for (var name in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        root.style.setProperty(name, vars[name]);
      }
    }
    root.style.maxHeight = maxHeight ? maxHeight + "px" : "";
    root.style.overflow = maxHeight ? "hidden" : "";
    root.innerHTML = html;
    relayout();
    // The measurement above starts the font loads this content needs; re-measure once they are in.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (currentId === id) {
          relayout();
        }
      });
    }
  };

  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener("loadingdone", relayout);
  }

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(function (entries) {
      var width = Math.round(entries[0].contentRect.width);
      if (width !== lastWidth) {
        lastWidth = width;
        relayout();
      }
    }).observe(root);
  } else {
    window.addEventListener("resize", relayout);
  }

  post({ ready: true });
})();
`;

let shell: string | null = null;

/** Built once on first use (≈ 0.4 MB of inlined fonts) and shared by every WebView. */
export function getMathShellHtml(): string {
  if (shell === null) {
    shell =
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">' +
      `<style>@font-face{font-family:"${MATH_TEXT_FONT_FAMILY}";font-style:normal;font-weight:400;` +
      `src:url(data:font/woff2;base64,${MATH_TEXT_FONT_BASE64}) format("woff2")}</style>` +
      `<style>${KATEX_CSS}</style>` +
      '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}' +
      'body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}' +
      `${MATH_CONTENT_CSS}</style>` +
      `</head><body><div id="root" class="${MATH_ROOT_CLASS}"></div>` +
      `<script>${MATH_LINE_BREAKS_SCRIPT}${BRIDGE_SCRIPT}</script></body></html>`;
  }
  return shell;
}

/** JS source that pushes one render into a loaded shell. Ends with `true` as `injectJavaScript` requires. */
export function buildRenderCall(id: number, html: string, vars: Record<string, string>, maxHeight: number | null): string {
  return `window.__render&&window.__render(${id},${JSON.stringify(html)},${JSON.stringify(vars)},${
    maxHeight === null ? 'null' : Math.round(maxHeight)
  });true;`;
}

/** Parses a bridge message; anything unexpected is ignored. */
export function parseShellMessage(data: string): MathShellMessage | null {
  try {
    const message: unknown = JSON.parse(data);
    if (typeof message !== 'object' || message === null) return null;
    const record = message as Record<string, unknown>;
    if (record.ready === true) return { ready: true };
    if (typeof record.id === 'number' && typeof record.h === 'number' && Number.isFinite(record.h)) {
      return { id: record.id, h: record.h };
    }
    return null;
  } catch {
    return null;
  }
}
