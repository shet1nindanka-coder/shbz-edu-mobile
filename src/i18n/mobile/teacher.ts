// Mobile-only strings of the teacher area (overview, students, homework review, assigning, reports).
// Site texts stay in `dict.students.*` and `dict.teacherHome`.
const ru = {
  // Overview (`teacher.home`): the nearest lesson, who needs attention, everybody's progress.
  home: {
    // The lesson card: when the nearest lesson is («Сегодня в 17:00 · 11А») over its title.
    lessonNow: "Идёт сейчас",
    lessonToday: "Сегодня в {time}",
    lessonTomorrow: "Завтра в {time}",
    lessonOn: "{date} в {time}",
    // «Сегодня в 17:00 · 11А»: the when-line with the group or the only student of the lesson.
    lessonWith: "{when} · {who}",
    openBoard: "Открыть доску",
    openBoardOf: "Открыть доску: {title}, {when}",
    attention: "Требуют внимания",
    attentionEmpty: "Сейчас никто не требует внимания",
    // One caption per student: how many numbers are marked «нужна помощь».
    needHelpForms: ["{n} номер «нужна помощь»", "{n} номера «нужна помощь»", "{n} номеров «нужна помощь»"],
    callsLine: "{label}: {n}",
    upcoming: "Ближайшие занятия",
    progress: "Прогресс",
    allStudents: "Все ученики",
    // Screen-reader name of a progress row: «Илья Смирнов. 31 решил сам · 6 исправил».
    progressA11y: "{name}. {breakdown}",
    progressEmptyA11y: "{name}. Пока нет отмеченных номеров"
  },
  // Students list (`teacher.students`): wording the site does not have, and touch wording for its "click" hints.
  students: {
    // The site shows three buttons per row; a phone row has one "⋯" that opens them in a sheet.
    actionsFor: "Действия: {name}",
    // The one fact on the right of a student row: how many numbers the student has closed.
    solved: "решено {n}",
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
    titleYear: "Отчёт: учебный год",
    // A report finished after the teacher left the card: it is not opened over the screen they went to,
    // it waits on the card until they open it (the same as the group screen's reports).
    ready: "Отчёт готов: {title}",
    open: "Открыть отчёт"
  },
  review: {
    // Heading of the rows of a homework that wait for the teacher: «Нужно проверить · 5».
    toCheck: "Нужно проверить",
    nothingToCheck: "Проверять пока нечего",
    // Part of a homework's caption: «до завтра, 23:59 · 5 номеров ждут проверки».
    toCheckForms: ["{n} номер ждёт проверки", "{n} номера ждут проверки", "{n} номеров ждут проверки"],
    // A status group has no visible caption on a phone; this is its accessible name.
    statusAria: "Статус номера {n}",
    // The site's review tab hides the statement; on a phone it opens on demand under the number.
    hideCondition: "Скрыть условие и ответ",
    noCondition: "Условие для этого номера не добавлено.",
    noAnswer: "Ответ для этого номера не добавлен.",
    // Accessible names of the per-number buttons: in a list of numbers each one names its number.
    showConditionOf: "Условие и ответ № {n}",
    hideConditionOf: "Скрыть условие и ответ № {n}",
    historyOf: "История статуса № {n}",
    // "Accept AI verdicts" / its undo of more than 100 changes goes out in several requests; when a later
    // one fails, the earlier ones are applied (the site sends one request per number and has no such case).
    partlyApplied: "Применено {done} из {total}.",
    partlyUndone: "Отменено {done} из {total}."
  },
  // Student card (`teacher.student.*`): chrome the site does not have.
  card: {
    reports: "Отчёты в PDF",
    reportsHint: "Отчёт формируется на сервере и открывается в просмотре файлов — оттуда им можно поделиться.",
    expand: "Развернуть: {title}",
    collapse: "Свернуть: {title}",
    // «Открыть занятие» repeats on every lesson card: its accessible name says which lesson.
    openLessonOf: "Открыть занятие: {title}, {meta}"
  },
  assign: {
    // Touch wording of the site's "click the problems below" hint.
    steps: "1. Нажмите на номера ниже, чтобы выбрать их · 2. Задайте дедлайн · 3. Нажмите «Выдать ДЗ».",
    titleAction: "Название",
    titleSheet: "Название ДЗ",
    // The title button shows the typed title instead of «Название»: its accessible name carries it too.
    titleSheetOf: "Название ДЗ: {title}",
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
  home: {
    lessonNow: "On now",
    lessonToday: "Today at {time}",
    lessonTomorrow: "Tomorrow at {time}",
    lessonOn: "{date} at {time}",
    lessonWith: "{when} · {who}",
    openBoard: "Open the board",
    openBoardOf: "Open the board: {title}, {when}",
    attention: "Needs attention",
    attentionEmpty: "Nobody needs attention right now",
    needHelpForms: ["{n} problem marked “needs help”", "{n} problems marked “needs help”"],
    callsLine: "{label}: {n}",
    upcoming: "Upcoming lessons",
    progress: "Progress",
    allStudents: "All students",
    progressA11y: "{name}. {breakdown}",
    progressEmptyA11y: "{name}. No marked problems yet"
  },
  students: {
    actionsFor: "Actions: {name}",
    solved: "{n} solved",
    copyHint: "Tap to copy",
    suggestPickHint: "Tap to use it"
  },
  report: {
    preparing: "Preparing the report…",
    title7d: "Report: 7 days",
    title30d: "Report: 30 days",
    titleYear: "Report: school year",
    ready: "The report is ready: {title}",
    open: "Open the report"
  },
  review: {
    toCheck: "To check",
    nothingToCheck: "Nothing to check yet",
    toCheckForms: ["{n} problem to check", "{n} problems to check"],
    statusAria: "Status of problem {n}",
    hideCondition: "Hide the statement and answer",
    noCondition: "No statement has been added for this problem.",
    noAnswer: "No answer has been added for this problem.",
    showConditionOf: "Statement and answer of problem {n}",
    hideConditionOf: "Hide the statement and answer of problem {n}",
    historyOf: "Status history of problem {n}",
    partlyApplied: "{done} of {total} applied.",
    partlyUndone: "{done} of {total} undone."
  },
  card: {
    reports: "PDF reports",
    reportsHint: "The report is built on the server and opens in the file viewer — you can share it from there.",
    expand: "Expand: {title}",
    collapse: "Collapse: {title}",
    openLessonOf: "Open lesson: {title}, {meta}"
  },
  assign: {
    steps: "1. Tap the problems below to select them · 2. Set a deadline · 3. Press “Assign homework”.",
    titleAction: "Title",
    titleSheet: "Homework title",
    titleSheetOf: "Homework title: {title}",
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
