// `parseMathContent` re-expresses the site's `LatexAnswerPreview` pipeline (docs/spec/09-data-i18n-math.md
// §4.1 steps 1–7) as data. The cases are the fixture statements of §2.4 plus the edge cases the site
// component documents in its comments.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { hasMath, parseInlineLine, parseMathContent } from "@/components/math/parse-math-content";

test("empty and whitespace-only values produce no blocks", () => {
  assert.deepEqual(parseMathContent(""), []);
  assert.deepEqual(parseMathContent("  \n\n \t"), []);
});

test("inline math inside a sentence (112)", () => {
  const blocks = parseMathContent("Решите уравнение $3x - 7 = 11$.");

  assert.deepEqual(blocks, [
    {
      nodes: [
        {
          type: "paragraph",
          inline: [
            { type: "text", text: "Решите уравнение " },
            { type: "math", tex: "3x - 7 = 11" },
            { type: "text", text: "." }
          ]
        }
      ]
    }
  ]);
  assert.equal(hasMath(blocks), true);
});

test("heading line followed by a labelled items row (113)", () => {
  const blocks = parseMathContent("Решите уравнение:\nа) $2x + 5 = 17$ б) $4 - 3x = 10$ в) $\\dfrac{x}{2} - 1 = 3$");

  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].nodes[0], { type: "paragraph", inline: [{ type: "text", text: "Решите уравнение:" }] });
  assert.deepEqual(blocks[0].nodes[1], {
    type: "items",
    items: [
      [
        { type: "text", text: "а) " },
        { type: "math", tex: "2x + 5 = 17" }
      ],
      [
        { type: "text", text: "б) " },
        { type: "math", tex: "4 - 3x = 10" }
      ],
      [
        { type: "text", text: "в) " },
        { type: "math", tex: "\\dfrac{x}{2} - 1 = 3" }
      ]
    ]
  });
});

test("soft-wrapped prose merges into one paragraph without math (120)", () => {
  const blocks = parseMathContent(
    "Ученик задумал число. Если его умножить на 4, к произведению прибавить 8 и полученную\nсумму разделить на 2, то получится\n10. Какое число задумал ученик?"
  );

  assert.deepEqual(blocks, [
    {
      nodes: [
        {
          type: "paragraph",
          inline: [
            {
              type: "text",
              text: "Ученик задумал число. Если его умножить на 4, к произведению прибавить 8 и полученную сумму разделить на 2, то получится 10. Какое число задумал ученик?"
            }
          ]
        }
      ]
    }
  ]);
  assert.equal(hasMath(blocks), false);
});

test("a blank line in the middle of a sentence does not start a new block", () => {
  const blocks = parseMathContent("Найдите сумму всех\n\nкорней уравнения.");

  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].nodes, [
    { type: "paragraph", inline: [{ type: "text", text: "Найдите сумму всех корней уравнения." }] }
  ]);
});

test("a blank line after a finished sentence starts a new block", () => {
  const blocks = parseMathContent("Первое предложение.\n\nВторое предложение.");

  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[1].nodes, [{ type: "paragraph", inline: [{ type: "text", text: "Второе предложение." }] }]);
});

test("$$…$$ glued to a text line is a display formula of the same block (121)", () => {
  const blocks = parseMathContent("Найдите корень уравнения:\n$$5(x - 2) - 3(2x + 1) = 4x - 28$$");

  assert.deepEqual(blocks, [
    {
      nodes: [
        { type: "paragraph", inline: [{ type: "text", text: "Найдите корень уравнения:" }] },
        { type: "displayMath", tex: "5(x - 2) - 3(2x + 1) = 4x - 28" }
      ]
    }
  ]);
});

test("\\[…\\] is a display formula only as a whole block (218)", () => {
  const whole = parseMathContent("Постройте график функции и найдите её нули:\n\n\\[ y = 2x^2 - 8x + 6 \\]");

  assert.equal(whole.length, 2);
  assert.deepEqual(whole[1].nodes, [{ type: "displayMath", tex: "y = 2x^2 - 8x + 6" }]);

  // Glued to text it is not recognised: the delimiters stay literal text, as on the site.
  const glued = parseMathContent("Текст \\[ x \\] хвост");

  assert.deepEqual(glued, [
    { nodes: [{ type: "paragraph", inline: [{ type: "text", text: "Текст \\[ x \\] хвост" }] }] }
  ]);
  assert.equal(hasMath(glued), false);
});

test("a multi-line $$ formula keeps its inner line breaks (305)", () => {
  const blocks = parseMathContent("Вычислите.\n$$\\int_0^1\nx^2\\,dx$$");

  assert.deepEqual(blocks[0].nodes, [
    { type: "paragraph", inline: [{ type: "text", text: "Вычислите." }] },
    { type: "displayMath", tex: "\\int_0^1\nx^2\\,dx" }
  ]);
});

test("labelled items inside display math become separate items (308)", () => {
  const blocks = parseMathContent(
    "Найдите производную:\n$$\\text{А)}\\ f(x)=\\sin x \\quad \\text{Б)}\\ f(x)=e^{2x} \\quad \\text{В)}\\ f(x)=\\ln(x+1)$$"
  );
  const node = blocks[0].nodes[1];

  assert.equal(node.type, "displayItems");
  assert.equal(node.type === "displayItems" ? node.items.length : 0, 3);
  assert.match(node.type === "displayItems" ? node.items[0] : "", /^\\text\{А\)\}/);
  assert.match(node.type === "displayItems" ? node.items[2] : "", /\\ln\(x\+1\)$/);
});

test("an environment with rows is one display formula, not items (226)", () => {
  const blocks = parseMathContent("Решите систему:\n$$\\begin{cases} y = x^2 - 4 \\\\ y = x + 2 \\end{cases}$$");

  assert.deepEqual(blocks[0].nodes[1], {
    type: "displayMath",
    tex: "\\begin{cases} y = x^2 - 4 \\\\ y = x + 2 \\end{cases}"
  });
});

test("broken TeX is still a math node: the error is a render-time concern (220)", () => {
  const blocks = parseMathContent("Найдите значение выражения $\\frac{1}{x$ при $x = 2$.");

  assert.deepEqual(blocks[0].nodes[0], {
    type: "paragraph",
    inline: [
      { type: "text", text: "Найдите значение выражения " },
      { type: "math", tex: "\\frac{1}{x" },
      { type: "text", text: " при " },
      { type: "math", tex: "x = 2" },
      { type: "text", text: "." }
    ]
  });
});

test("an answer made of labelled inline formulas is one items row", () => {
  const blocks = parseMathContent("а) $x=6$ б) $x=-2$ в) $x=8$");

  assert.equal(blocks[0].nodes.length, 1);
  assert.equal(blocks[0].nodes[0].type, "items");
});

test("\\( … \\) is not a delimiter and stays text", () => {
  const blocks = parseMathContent("Найдите \\(x\\).");

  assert.equal(hasMath(blocks), false);
  assert.deepEqual(blocks[0].nodes, [{ type: "paragraph", inline: [{ type: "text", text: "Найдите \\(x\\)." }] }]);
});

test("parseInlineLine: an unpaired dollar and an empty pair are text", () => {
  assert.deepEqual(parseInlineLine("Цена 5$ за штуку"), [{ type: "text", text: "Цена 5$ за штуку" }]);
  assert.deepEqual(parseInlineLine("$$"), [{ type: "text", text: "$$" }]);
  // No escaping of `\$`: the backslash does not protect the dollar (site behaviour).
  assert.deepEqual(parseInlineLine("a \\$ b $ c"), [
    { type: "text", text: "a \\" },
    { type: "math", tex: " b " },
    { type: "text", text: " c" }
  ]);
});

test("several display formulas and text lines keep their order inside one block", () => {
  const blocks = parseMathContent("Упростите:\n$$a+b$$\nи вычислите:\n$$c-d$$");

  assert.deepEqual(
    blocks[0].nodes.map((node) => node.type),
    ["paragraph", "displayMath", "paragraph", "displayMath"]
  );
});

test("lines inside a text segment are trimmed and whitespace-only lines dropped", () => {
  const blocks = parseMathContent("Первая строка.\n   \n  Вторая строка.  ");

  // "\n   \n" is not a blank-line separator for the block splitter (it needs consecutive newlines), so
  // both lines stay in one block — the whitespace-only line simply disappears.
  assert.deepEqual(blocks, [
    {
      nodes: [
        { type: "paragraph", inline: [{ type: "text", text: "Первая строка." }] },
        { type: "paragraph", inline: [{ type: "text", text: "Вторая строка." }] }
      ]
    }
  ]);
});
