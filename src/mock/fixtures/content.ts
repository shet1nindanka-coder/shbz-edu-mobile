/**
 * Topics (7), numbers (79) and topic files — docs/spec/09-data-i18n-math.md §2.4. Every number with a
 * special LaTeX shape is an edge-case carrier for the math renderer; the strings are copied from the spec.
 */
import type { MockFileSample } from "../assets";
import type { FixtureBuilder } from "./builder";
import { TOPIC, USER, numberId } from "./ids";

type NumberSpec = [number: string, conditionLatex: string | null, answerLatex: string | null];

type FileSpec = { id: string; name: string; mimeType: string; size: number; sample: MockFileSample };

type TopicSpec = {
  id: string;
  title: string;
  description: string;
  theory?: FileSpec;
  homework?: FileSpec;
  answers?: FileSpec;
  numbers: NumberSpec[];
};

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const LINEAR: NumberSpec[] = [
  ["112", "Решите уравнение $3x - 7 = 11$.", "$x = 6$"],
  ["113", "Решите уравнение:\nа) $2x + 5 = 17$ б) $4 - 3x = 10$ в) $\\dfrac{x}{2} - 1 = 3$", "а) $x=6$ б) $x=-2$ в) $x=8$"],
  ["118", "Решите уравнение $\\dfrac{2x - 1}{3} - \\dfrac{x + 2}{4} = 1$.", "$x = \\dfrac{22}{5}$"],
  // Plain text with soft-wrapped lines: must merge into one paragraph.
  ["120", "Ученик задумал число. Если его умножить на 4, к произведению прибавить 8 и полученную\nсумму разделить на 2, то получится\n10. Какое число задумал ученик?", "$3$"],
  ["121", "Найдите корень уравнения:\n$$5(x - 2) - 3(2x + 1) = 4x - 28$$", "$x = 3$"],
  // No statement and no answer.
  ["124", null, null],
  // Statement without an answer; decimal comma.
  ["127", "Решите уравнение $0{,}5x + 1{,}5 = 4$.", null],
  // Long display formula: wraps on a phone, the operator repeats at the start of the new line.
  ["130", "Упростите выражение:\n$$(a+1)^2+(a+2)^2+(a+3)^2+(a+4)^2+(a+5)^2-5a^2-30a$$", "$55$"],
];

const QUADRATIC: NumberSpec[] = [
  ["204", "Найдите координаты вершины параболы $y = x^2 - 6x + 5$.", "$(3;\\,-4)$"],
  ["207", "Решите уравнение $x^2 - 5x + 6 = 0$.", "$x_1 = 2,\\ x_2 = 3$"],
  ["211", "Сократите дробь:\n$\\dfrac{x^2-4}{x+2}$", "$x-2$"],
  ["215", "При каких значениях $x$ функция $y = -x^2 + 4x - 3$ принимает положительные значения?", "$1 < x < 3$"],
  // `\[ … \]` as a whole block (the blank line before it is required).
  ["218", "Постройте график функции и найдите её нули:\n\n\\[ y = 2x^2 - 8x + 6 \\]", "$x_1 = 1,\\ x_2 = 3$"],
  // Broken LaTeX → inline error chip.
  ["220", "Найдите значение выражения $\\frac{1}{x$ при $x = 2$.", "$\\dfrac12$"],
  ["223", "Площадь прямоугольника $S_{\\text{пр}} = 48\\ \\text{см}^2$, одна сторона на $2$ см больше другой. Найдите стороны.", "$6$ см и $8$ см"],
  ["226", "Решите систему:\n$$\\begin{cases} y = x^2 - 4 \\\\ y = x + 2 \\end{cases}$$", "$(3;\\,5),\\ (-2;\\,0)$"],
];

const DERIVATIVE: NumberSpec[] = [
  ["301", "Найдите производную функции $f(x) = x^3 - 3x^2 + 2$.", "$f'(x) = 3x^2 - 6x$"],
  ["302", "Найдите промежутки возрастания и убывания функции $f(x) = x^3 - 3x$.", "Возрастает на $(-\\infty;\\,-1]$ и $[1;\\,+\\infty)$, убывает на $[-1;\\,1]$."],
  // Multi-line `$$`.
  ["305", "Вычислите.\n$$\\int_0^1\nx^2\\,dx$$", "$\\dfrac13$"],
  // Labelled items inside display math.
  ["308", "Найдите производную:\n$$\\text{А)}\\ f(x)=\\sin x \\quad \\text{Б)}\\ f(x)=e^{2x} \\quad \\text{В)}\\ f(x)=\\ln(x+1)$$", "А) $\\cos x$ Б) $2e^{2x}$ В) $\\dfrac{1}{x+1}$"],
  ["310", "Найдите наибольшее значение функции $f(x) = -x^2 + 4x + 1$ на отрезке $[0;\\,3]$.", "$5$"],
  ["312", "Найдите точку минимума функции $y = x^3 - 12x + 7$.", "$x = 2$"],
];

// Numbers are strings with leading zeros; sorting must be numeric.
const LOG: NumberSpec[] = [
  ["010203", "Решите уравнение $\\log_2(x+1)=3$.", "$x=7$"],
  ["010204", "а) $\\lg x=2$ б) $\\ln x=1$", "а) $x=100$ б) $x=e$"],
  ["010205", "Найдите область определения функции $y=\\log_5(x-2)$.", null],
  ["010206", "Решите уравнение:\n$\\log_3(2x-1)=2$", "$x=5$"],
  ["010207", "Решите уравнение $\\log_2^2 x - 3\\log_2 x + 2 = 0$.", "$x=2;\\ x=4$"],
  ["010208", "Вычислите $\\log_2 8 + \\log_3 \\dfrac19$.", "$1$"],
  // The extraneous root −2 is the DOMAIN / LOST_ROOT diagnostics fixture.
  ["010209", "Решите уравнение $\\lg(x^2-9) = \\lg(4x+3)$.", "$x=6$"],
  ["010210", "Решите уравнение $\\log_5(x+4)+\\log_5 x=1$.", "$x=1$"],
  ["010211", "Решите уравнение $\\log_{\\frac12}(3x-1) = -3$.", "$x=3$"],
  ["010212", "Найдите $x$, если $\\ln x = 2\\ln 3 - \\ln 6$.", "$x=\\dfrac32$"],
  ["010213", "Решите уравнение $\\log_x 81 = 4$.", "$x=3$"],
  ["010214", "Решите систему:\n$$\\begin{cases} \\log_2 x + \\log_2 y = 5 \\\\ x - y = 4 \\end{cases}$$", "$(8;\\,4)$"],
];

function system(first: string, second: string): string {
  return `Решите систему:\n$$\\begin{cases} ${first} \\\\ ${second} \\end{cases}$$`;
}

const SYSTEMS: NumberSpec[] = [
  ["401", system("x + y = 7", "x - y = 1"), "$(4;\\,3)$"],
  ["402", system("2x + y = 5", "x - y = 1"), "$(2;\\,1)$"],
  ["403", system("3x - y = 5", "x + 2y = 4"), "$(2;\\,1)$"],
  ["404", system("x + y = 10", "2x - y = 2"), "$(4;\\,6)$"],
  ["405", system("x - 2y = 0", "x + y = 9"), "$(6;\\,3)$"],
];

/** 501–540: five templates with index-based values; every 8th number has no statement (list-performance fixture). */
function wordProblems(): NumberSpec[] {
  const numbers: NumberSpec[] = [];
  for (let index = 0; index < 40; index += 1) {
    const label = String(501 + index);
    const step = Math.floor(index / 5);
    let condition: string;
    let answer: string;

    switch (index % 5) {
      case 0: {
        const speed = 12 + step;
        const hours = 2 + (step % 4);
        condition = `Из пункта А в пункт Б, расстояние между которыми ${speed * hours} км, выехал велосипедист со скоростью ${speed} км/ч. Через сколько часов он прибудет в пункт Б?`;
        answer = `$${hours}$ ч`;
        break;
      }
      case 1: {
        const price = 400 + step * 100;
        const percent = 10 + (step % 3) * 5;
        condition = `Товар стоил $${price}$ рублей. Его цену снизили на $${percent}\\%$. Сколько рублей стал стоить товар?`;
        answer = `$${(price * (100 - percent)) / 100}$ рублей`;
        break;
      }
      case 2: {
        const pairs = [[3, 6, 2], [4, 12, 3], [6, 12, 4], [10, 15, 6], [12, 24, 8], [6, 30, 5], [20, 30, 12], [9, 18, 6]] as const;
        const [first, second, together] = pairs[step % pairs.length]!;
        condition = `Первый мастер выполняет заказ за $${first}$ ч, второй — за $${second}$ ч. За сколько часов они выполнят заказ вместе? Воспользуйтесь тем, что за час они делают $\\dfrac{1}{${first}}+\\dfrac{1}{${second}}$ заказа.`;
        answer = `$${together}$ ч`;
        break;
      }
      case 3: {
        const first = 10 + step * 2;
        const second = first + 20;
        condition = `Смешали $2$ кг раствора с концентрацией соли $${first}\\%$ и $2$ кг раствора с концентрацией $${second}\\%$. Найдите концентрацию соли в полученном растворе.`;
        answer = `$${(first + second) / 2}\\%$`;
        break;
      }
      default: {
        const rows = 6 + step;
        const seats = 20 + step * 2;
        condition = `В зрительном зале ${rows} рядов, в каждом ряду ${seats} мест. На спектакль продали все билеты, кроме ${step + 3}. Сколько билетов продали?`;
        answer = String(rows * seats - (step + 3));
        break;
      }
    }

    numbers.push([label, index % 8 === 7 ? null : condition, answer]);
  }
  return numbers;
}

const TOPICS: TopicSpec[] = [
  {
    id: TOPIC.linear,
    title: "Линейные уравнения",
    description: "Базовые свойства линейных уравнений, перенос слагаемых и проверка решения.",
    theory: { id: "file_linear_theory", name: "linear-equations-theory.pdf", mimeType: PDF, size: 49_152, sample: "pdfShort" },
    homework: { id: "file_linear_homework", name: "linear-equations-homework.pdf", mimeType: PDF, size: 31_744, sample: "pdfShort" },
    numbers: LINEAR,
  },
  {
    id: TOPIC.quadratic,
    title: "Квадратные функции",
    description: "Парабола, вершина, ветви, ось симметрии и чтение графика.",
    // 12 pages → paging / performance fixture; DOCX → the "download only" path.
    theory: { id: "file_quadratic_theory", name: "quadratic-functions-theory.pdf", mimeType: PDF, size: 1_468_006, sample: "pdfLong" },
    homework: { id: "file_quadratic_homework", name: "quadratic-functions-homework.docx", mimeType: DOCX, size: 24_576, sample: "docx" },
    numbers: QUADRATIC,
  },
  {
    id: TOPIC.derivative,
    title: "Производная и исследование функций",
    description: "Производная, интервалы возрастания и убывания, критические точки и анализ графика.",
    // PNG image → the image viewer path; no homework file → «Файл пока не загружен.»
    theory: { id: "file_derivative_theory", name: "derivative-cheatsheet.png", mimeType: "image/png", size: 612_352, sample: "cheatsheet" },
    numbers: DERIVATIVE,
  },
  {
    id: TOPIC.log,
    title: "Логарифмические уравнения",
    description: "Простейшие логарифмические уравнения и уравнения, сводящиеся к ним.",
    theory: { id: "file_log_theory", name: "log-equations-theory.pdf", mimeType: PDF, size: 88_064, sample: "pdfShort" },
    homework: { id: "file_log_homework", name: "log-equations-homework.pdf", mimeType: PDF, size: 40_960, sample: "pdfShort" },
    // Teacher / developer only.
    answers: { id: "file_log_answers", name: "log-equations-answers.pdf", mimeType: PDF, size: 36_864, sample: "pdfShort" },
    numbers: LOG,
  },
  { id: TOPIC.systems, title: "Системы уравнений", description: "Подстановка, сложение и графический способ.", numbers: SYSTEMS },
  // Empty description and no numbers → `dict.topics.viewNumbers.emptyTitle`.
  { id: TOPIC.empty, title: "Тригонометрия (в разработке)", description: "", numbers: [] },
  {
    id: TOPIC.word,
    title: "Текстовые задачи",
    description: "Задачи на движение, проценты и совместную работу.",
    theory: { id: "file_word_theory", name: "word-problems-photo.jpg", mimeType: "image/jpeg", size: 734_003, sample: "photo5" },
    numbers: wordProblems(),
  },
];

export function addContent(b: FixtureBuilder): void {
  TOPICS.forEach((topic, topicIndex) => {
    const createdAt = b.at(-150 + topicIndex, 9, 0);
    for (const file of [topic.theory, topic.homework, topic.answers]) {
      if (!file) continue;
      b.add("files", {
        id: file.id,
        originalName: file.name,
        mimeType: file.mimeType,
        size: file.size,
        uploadedAt: createdAt,
        uploadedById: USER.dev,
        sample: file.sample,
        localUri: null,
      });
    }
    b.add("topics", {
      id: topic.id,
      title: topic.title,
      description: topic.description,
      displayOrder: topicIndex + 1,
      subject: "MATH",
      grade: null,
      theoryFileId: topic.theory?.id ?? null,
      homeworkFileId: topic.homework?.id ?? null,
      answersFileId: topic.answers?.id ?? null,
      createdAt,
      updatedAt: createdAt,
    });
    topic.numbers.forEach(([number, conditionLatex, answerLatex], order) => {
      b.add("numbers", {
        id: numberId(number),
        topicId: topic.id,
        number,
        displayOrder: order,
        conditionLatex,
        answerLatex,
        answerFileId: null,
        // The column exists but nobody fills it today (the planner reads it as `bankMinutes`).
        estimatedMinutes: null,
        usableInDiagnostic: true,
      });
    });
  });
}
