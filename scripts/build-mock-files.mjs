// Builds the sample files the mock FileService serves (docs/spec/09-data-i18n-math.md §2.4, §5.2):
//
//   assets/mock-files/theory-12-pages.pdf     12-page theory hand-out (the paging / perf fixture)
//   assets/mock-files/homework-1-page.pdf     one-page problem sheet
//   assets/mock-files/homework-sample.docx    small Word file (the "download only" path)
//   assets/mock-files/cheatsheet.jpg          a typeset formula sheet (image theory files)
//   assets/mock-files/photo-{1..8}.jpg        "solution photos": handwriting on squared paper
//   assets/mock-files/photo-{1..8}-thumb.jpg  their 320 px thumbnails (the `?thumb=1` variant)
//   src/services/files/generated/mock-docx.ts the DOCX again as base64 — Metro does not treat .docx as
//                                             an asset, so the app carries it inside the JS bundle
//
// Usage: node scripts/build-mock-files.mjs
// Needs Playwright with Chromium (the same one scripts/shot.mjs uses). Everything is drawn from a seeded
// generator, so two runs produce the same pictures. Keep the total under ~2 MB: it ships in the app.
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const katex = require('katex');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'mock-files');
const generatedDir = join(root, 'src', 'services', 'files', 'generated');
mkdirSync(outDir, { recursive: true });
mkdirSync(generatedDir, { recursive: true });

const katexDist = join(root, 'node_modules', 'katex', 'dist');
// Pages are loaded with `setContent`, where file:// URLs are blocked — fonts go in as data URLs.
const katexCss = readFileSync(join(katexDist, 'katex.min.css'), 'utf8').replace(
  /src:url\(fonts\/(KaTeX_[\w-]+)\.woff2\) format\("woff2"\)[^;}]*/g,
  (_match, name) =>
    `src:url(data:font/woff2;base64,${readFileSync(join(katexDist, 'fonts', `${name}.woff2`)).toString('base64')}) format("woff2")`,
);
const montserrat = (weight, file) =>
  `@font-face{font-family:"Montserrat";font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(
    join(root, 'node_modules', '@expo-google-fonts', 'montserrat', file),
  ).toString('base64')}) format("truetype")}`;
const fontCss =
  montserrat(400, '400Regular/Montserrat_400Regular.ttf') +
  montserrat(600, '600SemiBold/Montserrat_600SemiBold.ttf') +
  montserrat(800, '800ExtraBold/Montserrat_800ExtraBold.ttf');

const tex = (source, display = false) =>
  katex.renderToString(source, { displayMode: display, throwOnError: true, output: 'html', strict: 'ignore' });

/** mulberry32: a tiny seeded PRNG — the pictures must not change between runs. */
function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────────────────────── solution photos ─────────────────────────────────────────

// Each photo is one solved problem; `x` marks a crossed-out line (a slip the student fixed).
const PHOTOS = [
  { number: '112', ink: '#1d3f9a', lines: ['3x - 7 = 11', '3x = 11 + 7', '3x = 18', 'x = 18 : 3', 'x = 6'], answer: 'x = 6' },
  {
    number: '118',
    ink: '#24347c',
    lines: [
      '\\dfrac{2x-1}{3} - \\dfrac{x+2}{4} = 1 \\quad |\\cdot 12',
      '4(2x-1) - 3(x+2) = 12',
      '8x - 4 - 3x - 6 = 12',
      '5x = 22',
      'x = \\dfrac{22}{5}',
    ],
    answer: 'x = 4{,}4',
  },
  {
    number: '207',
    ink: '#1b1b1f',
    lines: ['x^2 - 5x + 6 = 0', 'D = 25 - 24 = 1', 'x_{1,2} = \\dfrac{5 \\pm 1}{2}', 'x_1 = 2, \\quad x_2 = 3'],
    answer: 'x_1 = 2;\\ x_2 = 3',
  },
  {
    number: '204',
    ink: '#1d3f9a',
    lines: ['y = x^2 - 6x + 5', 'x_0 = -\\dfrac{b}{2a} = \\dfrac{6}{2} = 3', { x: 'y_0 = 9 - 18 - 5 = -14' }, 'y_0 = 9 - 18 + 5 = -4'],
    answer: '(3;\\,-4)',
  },
  {
    number: '301',
    ink: '#263a8f',
    lines: ["f(x) = x^3 - 3x^2 + 2", "f'(x) = (x^3)' - (3x^2)' + (2)'", "f'(x) = 3x^2 - 6x"],
    answer: "f'(x) = 3x^2 - 6x",
  },
  {
    number: '010203',
    ink: '#1b1b1f',
    lines: ['\\log_2 (x+1) = 3', 'x + 1 = 2^3', 'x + 1 = 8', 'x = 7', '\\text{ОДЗ: } x > -1 \\ \\checkmark'],
    answer: 'x = 7',
  },
  {
    number: '401',
    ink: '#1d3f9a',
    lines: ['\\begin{cases} x + y = 7 \\\\ x - y = 1 \\end{cases}', '2x = 8', 'x = 4', 'y = 7 - 4 = 3'],
    answer: '(4;\\,3)',
  },
  {
    number: '130',
    ink: '#24347c',
    lines: [
      '(a+1)^2 + (a+2)^2 + (a+3)^2 +',
      '+ (a+4)^2 + (a+5)^2 - 5a^2 - 30a =',
      '= 5a^2 + 30a + 55 - 5a^2 - 30a',
      { x: '= 60' },
      '= 55',
    ],
    answer: '55',
  },
];

function photoHtml(photo, index) {
  const random = prng(1000 + index * 97);
  const jitter = (range) => (random() * 2 - 1) * range;
  const cell = 40;
  const paperTilt = jitter(2.2);
  const left = 104 + Math.round(jitter(10));
  let top = 138 + Math.round(jitter(12));
  const rows = [];
  const row = (html, size, extraStyle = '') => {
    rows.push(
      `<div class="hw" style="left:${left + Math.round(jitter(9))}px;top:${top}px;font-size:${size}px;` +
        `transform:rotate(${jitter(1.4).toFixed(2)}deg);${extraStyle}">${html}</div>`,
    );
  };

  row(`<span class="ru">№ ${photo.number}</span>`, 50);
  top += cell * 2.7;
  for (const line of photo.lines) {
    const crossed = typeof line === 'object';
    const source = crossed ? line.x : line;
    const tall = /dfrac|cases/.test(source);
    row(`<span class="${crossed ? 'crossed' : ''}">${tex(source)}</span>`, 46);
    top += cell * (tall ? 3.7 : 2.3) + jitter(6);
  }
  top += cell * 0.5;
  row(`<span class="ru">Ответ:</span>&nbsp; ${tex(photo.answer)}`, 48, 'text-decoration:underline;text-underline-offset:11px;');

  // Light falls from one side: a soft shadow over the page sells "photographed with a phone".
  const shadeX = 20 + Math.round(random() * 60);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${katexCss}
html,body{margin:0;width:900px;height:1200px;overflow:hidden;background:#cfc8b8}
.paper{position:absolute;left:-60px;top:-60px;width:1020px;height:1320px;transform:rotate(${paperTilt.toFixed(2)}deg);
  background-color:#fbfaf4;
  background-image:linear-gradient(#a9c3e2 1.6px,transparent 1.6px),linear-gradient(90deg,#a9c3e2 1.6px,transparent 1.6px);
  background-size:${cell}px ${cell}px}
.margin{position:absolute;top:0;bottom:0;left:${cell * 22}px;width:2.5px;background:#e98b8b;opacity:.75}
.ink{position:absolute;inset:0;filter:url(#pen);color:${photo.ink}}
.hw{position:absolute;white-space:nowrap;transform-origin:left center}
.hw .katex{font-size:1em}
.ru{font-family:"Liberation Serif","DejaVu Serif",serif;font-style:italic}
.crossed{position:relative;opacity:.9}
.crossed::after{content:"";position:absolute;left:-8px;right:-8px;top:52%;height:3px;background:currentColor;transform:rotate(-3deg)}
.light{position:absolute;inset:0;background:
  radial-gradient(ellipse at ${shadeX}% 12%,rgba(255,250,235,.28),transparent 55%),
  linear-gradient(${100 + Math.round(jitter(30))}deg,rgba(60,50,35,.22),transparent 45%,rgba(40,35,25,.16))}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><filter id="pen" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="${index + 3}" result="noise"/>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="8" xChannelSelector="R" yChannelSelector="G" result="wobble"/>
  <feMorphology in="wobble" operator="dilate" radius="0.55" result="thick"/>
  <feGaussianBlur in="thick" stdDeviation="0.5"/>
</filter></svg>
<div class="paper"><div class="margin"></div><div class="ink">${rows.join('')}</div></div>
<div class="light"></div>
</body></html>`;
}

// ───────────────────────────────────────── documents ─────────────────────────────────────────

const DOC_CSS = `
${fontCss}
${katexCss}
@page{size:A4;margin:20mm 18mm 22mm}
html{font-family:"Montserrat",sans-serif;color:#14161a;font-size:11.5pt;line-height:1.65}
body{margin:0}
h1{font-size:22pt;font-weight:800;letter-spacing:-.5pt;margin:0 0 4mm;line-height:1.2}
h2{font-size:14pt;font-weight:800;margin:0 0 3mm}
h3{font-size:11.5pt;font-weight:600;margin:6mm 0 2mm}
p{margin:0 0 3mm}
.kicker{font-size:8.5pt;font-weight:600;letter-spacing:1.4pt;text-transform:uppercase;color:#63676d;margin-bottom:3mm}
.page{break-after:page}
.page:last-child{break-after:auto}
.box{border:1pt solid #e4e5e7;border-radius:10pt;padding:4mm 5mm;margin:4mm 0;background:#f8f9fa}
.box .katex-display{margin:.4em 0}
.accent{height:3pt;width:32mm;border-radius:3pt;background:linear-gradient(90deg,#36e0a4,#16b07e);margin-bottom:6mm}
ol{margin:0;padding-left:6mm}
li{margin-bottom:3.2mm;padding-left:1mm}
table{border-collapse:collapse;width:100%;margin:4mm 0}
td,th{border:1pt solid #e4e5e7;padding:2mm 3mm;text-align:left;font-size:10.5pt}
th{background:#f8f9fa;font-weight:600}
`;

const THEORY_PAGES = [
  {
    title: 'Квадратичная функция',
    text: [
      'Функция вида, записанного ниже, где коэффициент при старшей степени отличен от нуля, называется квадратичной. Её график — парабола.',
      'Число $a$ отвечает за направление ветвей и «ширину» параболы, $b$ — за положение оси симметрии, $c$ — за точку пересечения с осью ординат.',
    ],
    formulas: ['y = ax^2 + bx + c, \\qquad a \\neq 0'],
    example: 'Для $y = x^2 - 6x + 5$ имеем $a = 1$, $b = -6$, $c = 5$.',
  },
  {
    title: 'Направление ветвей',
    text: [
      'Если $a > 0$, ветви параболы направлены вверх и функция имеет наименьшее значение. Если $a < 0$, ветви направлены вниз и функция имеет наибольшее значение.',
      'Чем больше $|a|$, тем «уже» парабола; при $|a| < 1$ она становится более пологой.',
    ],
    formulas: ['a > 0 \\Rightarrow y_{\\min} = y_0, \\qquad a < 0 \\Rightarrow y_{\\max} = y_0'],
    example: 'У функции $y = -x^2 + 4x - 3$ ветви направлены вниз, так как $a = -1 < 0$.',
  },
  {
    title: 'Вершина параболы',
    text: [
      'Вершина — точка, в которой функция принимает наименьшее (или наибольшее) значение. Абсцисса вершины находится по формуле, ордината — подстановкой.',
    ],
    formulas: ['x_0 = -\\dfrac{b}{2a}, \\qquad y_0 = y(x_0) = c - \\dfrac{b^2}{4a}'],
    example: 'Для $y = x^2 - 6x + 5$: $x_0 = 3$, $y_0 = 9 - 18 + 5 = -4$. Вершина — точка $(3;\\,-4)$.',
  },
  {
    title: 'Ось симметрии',
    text: [
      'Парабола симметрична относительно вертикальной прямой, проходящей через вершину. Точки графика с одинаковыми ординатами расположены на равных расстояниях от этой прямой.',
    ],
    formulas: ['x = x_0 = -\\dfrac{b}{2a}'],
    example: 'Если $y(1) = y(5)$, то ось симметрии — прямая $x = \\dfrac{1 + 5}{2} = 3$.',
  },
  {
    title: 'Нули функции',
    text: [
      'Нули квадратичной функции — корни уравнения $ax^2 + bx + c = 0$. Их количество определяется знаком дискриминанта.',
    ],
    formulas: ['D = b^2 - 4ac, \\qquad x_{1,2} = \\dfrac{-b \\pm \\sqrt{D}}{2a}'],
    example: 'Для $x^2 - 5x + 6 = 0$: $D = 25 - 24 = 1$, $x_1 = 2$, $x_2 = 3$.',
  },
  {
    title: 'Дискриминант и число корней',
    text: [
      'При $D > 0$ парабола пересекает ось абсцисс в двух точках, при $D = 0$ касается её в вершине, при $D < 0$ не имеет с ней общих точек.',
    ],
    table: [
      ['Условие', 'Число нулей', 'Расположение графика'],
      ['$D > 0$', 'два', 'пересекает ось $Ox$'],
      ['$D = 0$', 'один', 'касается оси $Ox$'],
      ['$D < 0$', 'нет', 'лежит по одну сторону от оси'],
    ],
    example: 'У $y = x^2 + 2x + 5$ дискриминант $D = 4 - 20 = -16 < 0$: нулей нет.',
  },
  {
    title: 'Теорема Виета',
    text: ['Для приведённого квадратного уравнения сумма корней равна второму коэффициенту с противоположным знаком, а произведение — свободному члену.'],
    formulas: ['x^2 + px + q = 0: \\qquad x_1 + x_2 = -p, \\quad x_1 x_2 = q'],
    example: 'В уравнении $x^2 - 5x + 6 = 0$ сумма корней равна $5$, произведение — $6$, значит, корни $2$ и $3$.',
  },
  {
    title: 'Разложение на множители',
    text: ['Если известны корни квадратного трёхчлена, его можно записать в виде произведения линейных множителей.'],
    formulas: ['ax^2 + bx + c = a(x - x_1)(x - x_2)'],
    example: '$x^2 - 5x + 6 = (x - 2)(x - 3)$; $\\ 2x^2 - 8x + 6 = 2(x - 1)(x - 3)$.',
  },
  {
    title: 'Выделение полного квадрата',
    text: [
      'Любую квадратичную функцию можно привести к виду, из которого сразу видны координаты вершины. Для этого выделяют полный квадрат.',
    ],
    formulas: ['y = a(x - x_0)^2 + y_0', 'x^2 - 6x + 5 = (x^2 - 6x + 9) - 4 = (x - 3)^2 - 4'],
    example: 'Отсюда вершина параболы $y = x^2 - 6x + 5$ — точка $(3;\\,-4)$.',
  },
  {
    title: 'Промежутки знакопостоянства',
    text: [
      'Чтобы решить квадратное неравенство, находят нули функции и определяют знак на каждом промежутке, учитывая направление ветвей.',
    ],
    formulas: ['-x^2 + 4x - 3 > 0 \\iff x^2 - 4x + 3 < 0 \\iff 1 < x < 3'],
    example: 'Функция $y = -x^2 + 4x - 3$ положительна при $1 < x < 3$.',
  },
  {
    title: 'Наибольшее и наименьшее значения на отрезке',
    text: [
      'На отрезке квадратичная функция достигает наибольшего и наименьшего значений либо в вершине (если она принадлежит отрезку), либо на концах отрезка.',
    ],
    formulas: ['f(x) = -x^2 + 4x + 1, \\quad x \\in [0;\\,3]: \\qquad f(2) = 5, \\ f(0) = 1, \\ f(3) = 4'],
    example: 'Наибольшее значение равно $5$ (в вершине), наименьшее — $1$ (при $x = 0$).',
  },
  {
    title: 'Алгоритм построения графика',
    text: ['При построении параболы удобно действовать по одному и тому же плану.'],
    list: [
      'Определить направление ветвей по знаку $a$.',
      'Найти координаты вершины $(x_0;\\,y_0)$ и провести ось симметрии.',
      'Найти нули функции, если они есть.',
      'Отметить точку пересечения с осью ординат $(0;\\,c)$ и симметричную ей.',
      'Соединить точки плавной линией.',
    ],
    example: 'Проверьте себя на функции $y = 2x^2 - 8x + 6$: вершина $(2;\\,-2)$, нули $1$ и $3$.',
  },
];

/** `$…$` inside prose → KaTeX. The sample texts are written here, so no escaping is needed. */
const prose = (text) => text.replace(/\$([^$]+)\$/g, (_match, source) => tex(source));

function theoryHtml() {
  const pages = THEORY_PAGES.map(
    (page, index) => `<section class="page">
<div class="kicker">Квадратные функции · ${index + 1} / ${THEORY_PAGES.length}</div>
${index === 0 ? '<h1>Квадратные функции</h1><div class="accent"></div>' : ''}
<h2>${index + 1}. ${page.title}</h2>
${page.text.map((paragraph) => `<p>${prose(paragraph)}</p>`).join('')}
${(page.formulas ?? []).map((formula) => `<div class="box">${tex(formula, true)}</div>`).join('')}
${
  page.table
    ? `<table>${page.table
        .map((cells, rowIndex) => `<tr>${cells.map((cell) => `<${rowIndex ? 'td' : 'th'}>${prose(cell)}</${rowIndex ? 'td' : 'th'}>`).join('')}</tr>`)
        .join('')}</table>`
    : ''
}
${page.list ? `<ol>${page.list.map((item) => `<li>${prose(item)}</li>`).join('')}</ol>` : ''}
<h3>Пример</h3>
<p>${prose(page.example)}</p>
</section>`,
  );
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${DOC_CSS}</style></head><body>${pages.join('')}</body></html>`;
}

const HOMEWORK_PROBLEMS = [
  'Решите уравнение $3x - 7 = 11$.',
  'Решите уравнение: а) $2x + 5 = 17$; б) $4 - 3x = 10$; в) $\\dfrac{x}{2} - 1 = 3$.',
  'Решите уравнение $\\dfrac{2x - 1}{3} - \\dfrac{x + 2}{4} = 1$.',
  'Ученик задумал число. Если его умножить на 4, к произведению прибавить 8 и полученную сумму разделить на 2, то получится 10. Какое число задумал ученик?',
  'Найдите корень уравнения $5(x - 2) - 3(2x + 1) = 4x - 28$.',
  'Решите уравнение $0{,}5x + 1{,}5 = 4$.',
  'Упростите выражение $(a+1)^2+(a+2)^2+(a+3)^2+(a+4)^2+(a+5)^2-5a^2-30a$.',
  'При каком значении $a$ уравнение $ax - 3 = 2x + 5$ не имеет корней?',
];

function homeworkHtml() {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${DOC_CSS}</style></head><body>
<div class="kicker">Домашнее задание</div>
<h1>Линейные уравнения</h1><div class="accent"></div>
<p>Решите задачи в тетради. Записывайте каждое преобразование с новой строки и обязательно выполняйте проверку.</p>
<ol>${HOMEWORK_PROBLEMS.map((problem) => `<li>${prose(problem)}</li>`).join('')}</ol>
</body></html>`;
}

const CHEATSHEET_ROWS = [
  ['(C)\'', '0'],
  ['(x^n)\'', 'n x^{n-1}'],
  ['(\\sqrt{x})\'', '\\dfrac{1}{2\\sqrt{x}}'],
  ['(e^x)\'', 'e^x'],
  ['(\\ln x)\'', '\\dfrac{1}{x}'],
  ['(\\sin x)\'', '\\cos x'],
  ['(\\cos x)\'', '-\\sin x'],
  ['(u \\cdot v)\'', "u'v + uv'"],
  ['\\left(\\dfrac{u}{v}\\right)\'', "\\dfrac{u'v - uv'}{v^2}"],
  ['(f(g(x)))\'', "f'(g(x)) \\cdot g'(x)"],
];

function cheatsheetHtml() {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
${fontCss}${katexCss}
html,body{margin:0;width:900px;height:1240px;background:#fff;font-family:"Montserrat",sans-serif;color:#14161a}
.sheet{padding:56px 60px}
.kicker{font-size:15px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;color:#63676d}
h1{font-size:44px;font-weight:800;letter-spacing:-1.5px;margin:10px 0 14px}
.accent{height:6px;width:150px;border-radius:6px;background:linear-gradient(90deg,#36e0a4,#16b07e);margin-bottom:34px}
.row{display:flex;align-items:center;min-height:86px;border-bottom:2px solid #f0f0f1;font-size:27px}
.row>div{flex:1}
.row>div:first-child{flex:0 0 330px}
.arrow{flex:0 0 60px!important;color:#16b07e;font-size:30px}
.note{margin-top:30px;padding:22px 26px;border-radius:16px;background:#f8f9fa;font-size:19px;line-height:1.6;color:#2c2e33}
</style></head><body><div class="sheet">
<div class="kicker">Шпаргалка</div><h1>Таблица производных</h1><div class="accent"></div>
${CHEATSHEET_ROWS.map(([left, right]) => `<div class="row"><div>${tex(left)}</div><div class="arrow">→</div><div>${tex(right)}</div></div>`).join('')}
<div class="note">Возрастание: ${tex("f'(x) > 0")}. Убывание: ${tex("f'(x) < 0")}. В точке экстремума ${tex("f'(x_0) = 0")}.</div>
</div></body></html>`;
}

// ───────────────────────────────────────── DOCX (a minimal ZIP) ─────────────────────────────────────────

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const packed = deflateRawSync(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(0, 10); // time
    header.writeUInt16LE(0x5a21, 12); // date: fixed, so the archive is reproducible
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, nameBytes, packed);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    header.copy(record, 8, 6, 30); // flags … name length
    record.writeUInt32LE(offset, 42);
    central.push(record, nameBytes);
    offset += header.length + nameBytes.length + packed.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

const xmlEscape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const paragraph = (text, { bold = false, size = 24 } = {}) =>
  `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr>` +
  `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

function docx() {
  const body = [
    paragraph('Квадратные функции — домашнее задание', { bold: true, size: 36 }),
    paragraph('Решите задачи в тетради и прикрепите фото решения в кабинете.'),
    paragraph('1. Найдите координаты вершины параболы y = x² − 6x + 5.'),
    paragraph('2. Решите уравнение x² − 5x + 6 = 0.'),
    paragraph('3. При каких значениях x функция y = −x² + 4x − 3 принимает положительные значения?'),
    paragraph('4. Постройте график функции y = 2x² − 8x + 6 и найдите её нули.'),
    paragraph('5. Найдите наибольшее значение функции y = −x² + 4x + 1 на отрезке [0; 3].'),
  ].join('');
  return zip([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      'word/document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
    ],
  ]);
}

// ───────────────────────────────────────── run ─────────────────────────────────────────

const written = [];
const save = (name, bytes) => {
  writeFileSync(join(outDir, name), bytes);
  written.push(name);
};

const browser = await chromium.launch();
try {
  const photoPage = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
  for (let index = 0; index < PHOTOS.length; index += 1) {
    await photoPage.setContent(photoHtml(PHOTOS[index], index), { waitUntil: 'load' });
    await photoPage.evaluate(() => document.fonts.ready);
    save(`photo-${index + 1}.jpg`, await photoPage.screenshot({ type: 'jpeg', quality: 62 }));
  }
  await photoPage.close();

  // Thumbnails: the same picture at 320 px wide, like the site's `?thumb=1`.
  const thumbPage = await browser.newPage({ viewport: { width: 320, height: 427 }, deviceScaleFactor: 1 });
  for (let index = 0; index < PHOTOS.length; index += 1) {
    const data = readFileSync(join(outDir, `photo-${index + 1}.jpg`)).toString('base64');
    await thumbPage.setContent(
      `<body style="margin:0"><img src="data:image/jpeg;base64,${data}" style="display:block;width:320px;height:427px"></body>`,
      { waitUntil: 'load' },
    );
    save(`photo-${index + 1}-thumb.jpg`, await thumbPage.screenshot({ type: 'jpeg', quality: 60 }));
  }
  await thumbPage.close();

  const sheetPage = await browser.newPage({ viewport: { width: 900, height: 1240 }, deviceScaleFactor: 1 });
  await sheetPage.setContent(cheatsheetHtml(), { waitUntil: 'load' });
  await sheetPage.evaluate(() => document.fonts.ready);
  save('cheatsheet.jpg', await sheetPage.screenshot({ type: 'jpeg', quality: 72 }));
  await sheetPage.close();

  const pdfPage = await browser.newPage();
  for (const [name, html] of [
    ['theory-12-pages.pdf', theoryHtml()],
    ['homework-1-page.pdf', homeworkHtml()],
  ]) {
    await pdfPage.setContent(html, { waitUntil: 'load' });
    await pdfPage.evaluate(() => document.fonts.ready);
    save(name, await pdfPage.pdf({ preferCSSPageSize: true, printBackground: true }));
  }
  await pdfPage.close();
} finally {
  await browser.close();
}

const docxBytes = docx();
save('homework-sample.docx', docxBytes);
writeFileSync(
  join(generatedDir, 'mock-docx.ts'),
  '// GENERATED by scripts/build-mock-files.mjs — do not edit.\n' +
    '// assets/mock-files/homework-sample.docx as base64: Metro has no asset loader for .docx.\n' +
    `export const MOCK_DOCX_BASE64 =\n  ${JSON.stringify(docxBytes.toString('base64'))};\n\n` +
    `export const MOCK_DOCX_SIZE = ${docxBytes.length};\n`,
);

let total = 0;
for (const name of written) {
  const { size } = statSync(join(outDir, name));
  total += size;
  console.log(`${String(Math.round(size / 1024)).padStart(5)} KB  ${name}`);
}
console.log(`${String(Math.round(total / 1024)).padStart(5)} KB  total`);
if (total > 2 * 1024 * 1024) {
  console.error('mock files exceed the 2 MB budget');
  process.exit(1);
}
