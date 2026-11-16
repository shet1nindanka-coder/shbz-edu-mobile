// Ported 1:1 from the site (lib/math-line-breaks.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
/*
 * Математическое правило переноса формул: если строка заканчивается на знаке
 * операции («+», «−», «=», «⋅», «≥»…), знак пишется в конце строки И повторяется
 * в начале следующей.
 *
 * KaTeX сам разрешает перенос между верхнеуровневыми сегментами `.base`, причём
 * знак остаётся в конце предыдущего сегмента (как в TeX). Здесь после раскладки
 * находим сегменты, начавшие новую строку, и вставляем в их начало копию знака
 * из конца предыдущего сегмента. Копия помечена data-mw-clone и убирается перед
 * каждым пересчётом (resize, смена шрифта). Принимает корень или массив корней —
 * кабинет пересчитывает все видимые карточки одним вызовом.
 *
 * Исходник хранится строкой на чистом JS: одна и та же функция работает в
 * кабинете (инлайн-скрипт в app/layout.tsx + components/math-line-breaks.tsx)
 * и в печатной раздатке (инлайн-скрипт, lib/lesson-print-html.ts). Через
 * `toString()` транспилированной функции так нельзя — esbuild/tsx подмешивают
 * хелперы вроде `__name`; через `new Function` тоже нельзя — прод-CSP без 'unsafe-eval'.
 */

export const MATH_LINE_BREAKS_SCRIPT = String.raw`
function applyMathLineBreaks(root) {
  // Каждый проход — одно чтение раскладки по всем формулам и затем одна волна
  // вставок. Чередование «вставил знак → замерил следующий сегмент» заставляло
  // браузер раскладывать страницу заново на каждую вставку: на теме из 120
  // карточек это были секунды зависания.
  var MAX_PASSES = 24;
  var roots = Array.isArray(root) ? root : [root];

  function trailingOperator(base) {
    var children = Array.prototype.slice.call(base.children);

    for (var index = children.length - 1; index >= 0; index -= 1) {
      var child = children[index];

      if (child.classList.contains("mspace")) {
        continue;
      }

      if (child.classList.contains("mbin") || child.classList.contains("mrel")) {
        return child;
      }

      return null;
    }

    return null;
  }

  var formulas = [];

  roots.forEach(function (node) {
    if (!node) {
      return;
    }

    Array.prototype.forEach.call(node.querySelectorAll(".katex-html"), function (formula) {
      formulas.push(formula);
    });
  });

  formulas.forEach(function (formula) {
    Array.prototype.forEach.call(formula.querySelectorAll("[data-mw-clone]"), function (clone) {
      clone.parentNode && clone.parentNode.removeChild(clone);
    });
  });

  var active = formulas;

  for (var pass = 0; pass < MAX_PASSES && active.length > 0; pass += 1) {
    var inserts = [];

    // Чтение: первый сегмент каждой формулы, который начал новую строку и ещё
    // не получил копию знака. Дальше по формуле решения после вставки могут
    // устареть, поэтому за проход — одна вставка на формулу.
    active.forEach(function (formula) {
      var bases = Array.prototype.filter.call(formula.children, function (child) {
        return child.classList && child.classList.contains("base");
      });

      for (var index = 1; index < bases.length; index += 1) {
        var previous = bases[index - 1];
        var current = bases[index];

        if (current.querySelector(":scope > [data-mw-clone]")) {
          continue;
        }

        var previousRect = previous.getBoundingClientRect();
        var currentRect = current.getBoundingClientRect();
        // Новая строка: верх текущего сегмента ниже низа предыдущего (с запасом на округление).
        if (currentRect.top < previousRect.bottom - 1) {
          continue;
        }

        var operator = trailingOperator(previous);

        if (!operator) {
          continue;
        }

        inserts.push({ formula: formula, current: current, operator: operator });
        return;
      }
    });

    // Запись: все вставки прохода разом.
    inserts.forEach(function (insert) {
      var operator = insert.operator;
      var current = insert.current;
      var clone = operator.cloneNode(true);
      clone.setAttribute("data-mw-clone", "");
      clone.setAttribute("aria-hidden", "true");
      var strut = current.firstElementChild;
      var anchor = strut && strut.classList.contains("strut") ? strut.nextSibling : current.firstChild;
      current.insertBefore(clone, anchor);

      // Тонкий пробел после знака — как у KaTeX между знаком и операндом.
      var space = document.createElement("span");
      space.className = "mspace";
      space.setAttribute("data-mw-clone", "");
      space.style.marginRight = operator.classList.contains("mrel") ? "0.2778em" : "0.2222em";
      current.insertBefore(space, clone.nextSibling);
    });

    active = inserts.map(function (insert) {
      return insert.formula;
    });
  }
}
`;

/**
 * Имя глобальной функции, под которым скрипт подключён в корневом layout
 * (инлайн-<script>, разрешён CSP 'unsafe-inline'). Клиентский компонент зовёт её
 * через window — никакого eval/new Function: на проде CSP без 'unsafe-eval'.
 */
export const MATH_LINE_BREAKS_GLOBAL = "__applyMathBreaks";

export const MATH_LINE_BREAKS_INLINE_SCRIPT = `${MATH_LINE_BREAKS_SCRIPT}\nwindow.${MATH_LINE_BREAKS_GLOBAL} = applyMathLineBreaks;`;
