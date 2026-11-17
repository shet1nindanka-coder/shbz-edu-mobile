// Mobile-only strings of the teacher area (overview, students, homework review, assigning, reports).
// Site texts stay in `dict.students.*` and `dict.teacherHome`.
const ru = {
  // Students list (`teacher.students`): wording the site does not have, and touch wording for its "click" hints.
  students: {
    // The site shows three buttons per row; a phone row has one "⋯" that opens them in a sheet.
    actionsFor: "Действия: {name}",
    copyHint: "Нажмите, чтобы скопировать",
    suggestPickHint: "Нажмите, чтобы подставить"
  },
  report: {
    // The PDF is generated for seconds; the site shows nothing meanwhile (the browser downloads it).
    preparing: "Готовим отчёт…",
    // Title of the file viewer. The site's period buttons read «Отчёт: 7 дней» · «30 дней» · «Учебный год»
    // (one row, the word «Отчёт» once); a viewer title stands alone, so every period names the report.
    title7d: "Отчёт: 7 дней",
    title30d: "Отчёт: 30 дней",
    titleYear: "Отчёт: учебный год"
  },
  review: {
    // A status group has no visible caption on a phone; this is its accessible name.
    statusAria: "Статус номера {n}",
    // The site's review tab hides the statement; on a phone it opens on demand under the number.
    hideCondition: "Скрыть условие и ответ",
    noCondition: "Условие для этого номера не добавлено.",
    noAnswer: "Ответ для этого номера не добавлен."
  },
  // Student card (`teacher.student.*`): chrome the site does not have.
  card: {
    reports: "Отчёты в PDF",
    reportsHint: "Отчёт формируется на сервере и открывается в просмотре файлов — оттуда им можно поделиться.",
    expand: "Развернуть: {title}",
    collapse: "Свернуть: {title}"
  },
  assign: {
    // Touch wording of the site's "click the problems below" hint.
    steps: "1. Нажмите на номера ниже, чтобы выбрать их · 2. Задайте дедлайн · 3. Нажмите «Выдать ДЗ».",
    titleAction: "Название",
    titleSheet: "Название ДЗ",
    titleHint: "Если оставить поле пустым, ДЗ получит номер по порядку в теме, например «ДЗ 3».",
    noNumbers: "В этой теме пока нет номеров.",
    conditionsFailed: "Условия номеров не загрузились — выбирать номера можно и без них."
  },
  lessons: {
    bankLoading: "Загружаем номера…",
    bankFailed: "Не удалось загрузить номера. Попробуйте ещё раз.",
    noFreeNumbers: "Все номера этой темы уже в наборе.",
    noTopicNumbers: "В этой теме пока нет номеров.",
    pickTopicFirst: "Сначала выберите тему"
  }
};

const en: typeof ru = {
  students: {
    actionsFor: "Actions: {name}",
    copyHint: "Tap to copy",
    suggestPickHint: "Tap to use it"
  },
  report: {
    preparing: "Preparing the report…",
    title7d: "Report: 7 days",
    title30d: "Report: 30 days",
    titleYear: "Report: school year"
  },
  review: {
    statusAria: "Status of problem {n}",
    hideCondition: "Hide the statement and answer",
    noCondition: "No statement has been added for this problem.",
    noAnswer: "No answer has been added for this problem."
  },
  card: {
    reports: "PDF reports",
    reportsHint: "The report is built on the server and opens in the file viewer — you can share it from there.",
    expand: "Expand: {title}",
    collapse: "Collapse: {title}"
  },
  assign: {
    steps: "1. Tap the problems below to select them · 2. Set a deadline · 3. Press “Assign homework”.",
    titleAction: "Title",
    titleSheet: "Homework title",
    titleHint: "If you leave it empty, the homework gets its number within the topic, for example “Homework 3”.",
    noNumbers: "This topic has no problems yet.",
    conditionsFailed: "The statements did not load — you can still select problems without them."
  },
  lessons: {
    bankLoading: "Loading problems…",
    bankFailed: "Could not load the problems. Please try again.",
    noFreeNumbers: "Every problem of this topic is already in the set.",
    noTopicNumbers: "This topic has no problems yet.",
    pickTopicFirst: "Pick a topic first"
  }
};

export const teacher = { ru, en };
