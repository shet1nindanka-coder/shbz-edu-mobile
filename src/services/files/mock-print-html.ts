// The HTML stand-in for the site's print version of a lesson handout (/teacher/lessons/[id]/print, built by
// lib/lesson-print-html.ts and served as `text/html; charset=utf-8`). The mock never renders a real lesson,
// so this is one static page; what matters is that a file named `.html` and typed `text/html` really holds
// HTML (a browser / Quick Look / the system print dialog can open it). Printed documents are not
// translated on the site, so the sample is Russian only.
export const MOCK_PRINT_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Раздатка урока</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1b1b1f; margin: 16mm; line-height: 1.45; }
  h1 { font-size: 18pt; margin: 0 0 4mm; }
  .meta { color: #5b5b66; font-size: 10pt; margin-bottom: 8mm; }
  ol { padding-left: 6mm; }
  li { margin-bottom: 6mm; }
  .number { font-weight: 700; }
  .space { border-bottom: 1px dashed #c4c4cc; height: 18mm; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
<h1>Раздатка урока</h1>
<div class="meta">Демонстрационная версия для печати: в демо-режиме условия заданий не подставляются.</div>
<ol>
  <li><span class="number">№ 101.</span> Решите уравнение x² − 5x + 6 = 0.<div class="space"></div></li>
  <li><span class="number">№ 102.</span> Найдите вершину параболы y = x² − 4x + 1.<div class="space"></div></li>
  <li><span class="number">№ 103.</span> При каких a уравнение x² + ax + 4 = 0 имеет два корня?<div class="space"></div></li>
</ol>
</body>
</html>
`;
