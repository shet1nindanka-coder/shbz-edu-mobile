// HTML produced for the WebView / DOM renderers: KaTeX output, the site's error markup, escaping, and
// the static shell every native WebView loads.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { KATEX_CSS, KATEX_VERSION } from "@/components/math/generated/katex-css";
import {
  clearMathHeightCache,
  getCachedMathHeight,
  hashString,
  mathHeightKey,
  setCachedMathHeight
} from "@/components/math/math-height-cache";
import { buildMathDocument, escapeHtml, estimateMathHeight, renderMathHtml, renderTex } from "@/components/math/math-html";
import { buildRenderCall, getMathShellHtml, parseShellMessage } from "@/components/math/math-shell";
import { buildMathCssVars, MATH_CONTENT_CSS } from "@/components/math/math-styles";
import { LruCache } from "@/components/math/lru-cache";
import { parseMathContent } from "@/components/math/parse-math-content";
import katexPackage from "katex/package.json";

test("inline formula renders KaTeX HTML without the MathML half", () => {
  const html = renderTex("x^2", false);

  assert.match(html, /^<span class="katex">/);
  assert.match(html, /class="katex-html"/);
  assert.doesNotMatch(html, /<math/);
  assert.doesNotMatch(html, /katex-display/);
});

test("display formula is wrapped in katex-display", () => {
  assert.match(renderTex("a+b", true), /^<span class="katex-display">/);
});

test("top-level operators stay at the end of their .base segment (the line-break rule relies on it)", () => {
  const html = renderTex("a+b=c", true);
  const bases = html.split('<span class="base">').length - 1;

  assert.equal(bases, 3);
  assert.match(html, /class="mbin">\+<\/span>/);
  assert.match(html, /class="mrel">=<\/span>/);
});

test("invalid inline TeX becomes a chip with only the error name", () => {
  assert.equal(renderTex("\\frac{1}{x", false), '<code class="mc-error">ParseError</code>');
});

test("invalid display TeX becomes a block with the name and the message", () => {
  const html = renderTex("\\frac{1}{x", true);

  assert.match(html, /^<code class="mc-error mc-error-block">ParseError: KaTeX parse error: /);
  assert.match(html, /<\/code>$/);
});

test("an unknown command is an error, not red text (throwOnError)", () => {
  assert.equal(renderTex("\\notacommand", false), '<code class="mc-error">ParseError</code>');
});

test("text nodes are HTML-escaped", () => {
  assert.equal(escapeHtml(`<b onclick="x('1')">&</b>`), "&lt;b onclick=&quot;x(&#39;1&#39;)&quot;&gt;&amp;&lt;/b&gt;");

  const html = renderMathHtml(parseMathContent('Если a < b & c > d, то <script>alert("x")</script> $x$'));

  assert.doesNotMatch(html, /<script/);
  assert.match(html, /Если a &lt; b &amp; c &gt; d, то &lt;script&gt;/);
});

test("trust is off: \\href does not produce a link", () => {
  const html = renderTex("\\href{javascript:alert(1)}{x}", false);

  assert.doesNotMatch(html, /<a /);
  assert.doesNotMatch(html, /javascript:/);
});

test("document structure: blocks, paragraphs, item rows, display boxes", () => {
  const html = renderMathHtml(
    parseMathContent("Решите:\nа) $x=1$ б) $x=2$\n$$a+b$$\n\n\\[ c \\]")
  );

  assert.equal(html.split('<div class="mc-block">').length - 1, 2);
  assert.match(html, /<p class="mc-p">Решите:<\/p>/);
  assert.match(html, /<div class="mc-row mc-row-text"><span class="mc-item">а\) <span class="katex">/);
  assert.equal(html.split('<div class="mc-display">').length - 1, 2);
});

test("labelled display items are rendered inline with \\displaystyle", () => {
  const html = renderMathHtml(parseMathContent("$$\\text{А)}\\ \\frac12 \\quad \\text{Б)}\\ \\frac34$$"));

  assert.match(html, /^<div class="mc-block"><div class="mc-row mc-row-math">/);
  assert.equal(html.split('<span class="mc-item">').length - 1, 2);
  assert.doesNotMatch(html, /katex-display/);
  // \displaystyle keeps the fraction full-size: no script-size reset on the numerator.
  assert.doesNotMatch(html, /reset-size6 size3/);
});

test("buildMathDocument: no math → no HTML, and results are memoised by value", () => {
  const plain = buildMathDocument("Просто текст без формул.");

  assert.equal(plain.hasMath, false);
  assert.equal(plain.html, "");

  const first = buildMathDocument("Решите $x=1$.");

  assert.equal(first.hasMath, true);
  assert.equal(buildMathDocument("Решите $x=1$."), first);
});

test("estimateMathHeight grows with the content and is never zero for content", () => {
  const short = estimateMathHeight(parseMathContent("Короткий текст."), 320, 28);
  const long = estimateMathHeight(parseMathContent("Слово ".repeat(80)), 320, 28);

  assert.equal(short, 28);
  assert.ok(long > short * 5);
  assert.equal(estimateMathHeight([], 320, 28), 0);
});

test("generated KaTeX CSS matches the installed katex and has no external URLs", () => {
  assert.equal(KATEX_VERSION, katexPackage.version);
  assert.doesNotMatch(KATEX_CSS, /url\((?!data:font\/woff2;base64,)/);
  assert.equal(KATEX_CSS.split("@font-face").length - 1, 20);
});

test("content CSS carries the site's three wrap overrides", () => {
  assert.match(MATH_CONTENT_CSS, /\.shbz-math \.katex\{white-space:normal\}/);
  assert.match(MATH_CONTENT_CSS, /\.shbz-math \.katex \.base\{white-space:nowrap\}/);
  assert.match(MATH_CONTENT_CSS, /\.shbz-math \.katex-display>\.katex\{white-space:normal;text-align:left\}/);
});

test("css variables follow the font scale", () => {
  const vars = buildMathCssVars({ text: "#111", dangerSoft: "#fee", dangerText: "#900", fontFamily: "X", fontScale: 1.3 });

  assert.equal(vars["--mc-font-size"], "19.5px");
  assert.equal(vars["--mc-scale"], "1.3");
  assert.equal(vars["--mc-text"], "#111");
});

test("shell: self-contained page with the bridge and the line-break function", () => {
  const shell = getMathShellHtml();

  assert.equal(getMathShellHtml(), shell);
  assert.match(shell, /^<!doctype html>/);
  assert.match(shell, /user-scalable=no/);
  assert.match(shell, /function applyMathLineBreaks\(root\)/);
  assert.match(shell, /window\.__render = function/);
  assert.match(shell, /<div id="root" class="shbz-math"><\/div>/);
  // Nothing is fetched: no link/script/img with a src, no http(s) URL outside the KaTeX licence comment.
  assert.doesNotMatch(shell, /<link|<img|<script src|<iframe/);
  assert.equal(shell.split("<script>").length - 1, 1);
});

test("render call is one JS statement with JSON-encoded arguments", () => {
  const call = buildRenderCall(7, '<p class="mc-p">a</p>\n</script>', { "--mc-text": "#111" }, 56.4);

  assert.equal(
    call,
    'window.__render&&window.__render(7,"<p class=\\"mc-p\\">a</p>\\n</script>",{"--mc-text":"#111"},56);true;'
  );
  assert.match(buildRenderCall(1, "", {}, null), /,null\);true;$/);
});

test("shell messages: ready, height, and garbage", () => {
  assert.deepEqual(parseShellMessage('{"ready":true}'), { ready: true });
  assert.deepEqual(parseShellMessage('{"id":3,"h":120}'), { id: 3, h: 120 });
  assert.equal(parseShellMessage('{"id":"3","h":120}'), null);
  assert.equal(parseShellMessage("not json"), null);
  assert.equal(parseShellMessage("null"), null);
});

test("height cache key: value | width | fontScale | theme (+ clamp)", () => {
  const base = { value: "Решите $x=1$.", width: 326.4, fontScale: 1, theme: "light" };
  const key = mathHeightKey(base);

  assert.equal(key, `${hashString(base.value)}.${base.value.length}|326|100|light`);
  assert.notEqual(mathHeightKey({ ...base, width: 300 }), key);
  assert.notEqual(mathHeightKey({ ...base, fontScale: 1.3 }), key);
  assert.notEqual(mathHeightKey({ ...base, theme: "dark" }), key);
  assert.notEqual(mathHeightKey({ ...base, value: "Решите $x=2$." }), key);
  assert.equal(mathHeightKey({ ...base, maxHeight: 56 }), `${key}|56`);
});

test("height cache stores positive finite heights only", () => {
  clearMathHeightCache();
  setCachedMathHeight("a", 120);
  setCachedMathHeight("b", 0);
  setCachedMathHeight("c", Number.NaN);

  assert.equal(getCachedMathHeight("a"), 120);
  assert.equal(getCachedMathHeight("b"), undefined);
  assert.equal(getCachedMathHeight("c"), undefined);
});

test("LruCache evicts the least recently used entry", () => {
  const cache = new LruCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a");
  cache.set("c", 3);

  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.size, 2);
});
