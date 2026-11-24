// Mobile-only strings of the teacher area (overview, students, homework review, assigning, reports).
// Site texts stay in `dict.students.*` and `dict.teacherHome`. Most of what is here is spoken, not shown:
// the screens follow the text diet (docs/design/glass-over-paper.md §1a) and keep the words they cut in
// accessibility labels.
const ru = {
  // Overview (`teacher.home`): the nearest lesson, who needs attention, everybody's progress.
  home: {
    // The lesson card: when the nearest lesson is («Сегодня в 17:00») under / over its title.
    lessonNow: "Идёт сейчас",
    lessonToday: "Сегодня в {time}",
    lessonTomorrow: "Завтра в {time}",
    lessonOn: "{date} в {time}",
    // Spoken: «Сегодня в 17:00 · 11А» — the when-line with the group or the only student of the lesson.
    lessonWith: "{when} · {who}",
    openBoard: "Открыть доску",
    openBoardOf: "Открыть доску: {title}, {when}",
    // Heading of the tablet's panel; a phone shows the list without a caption.
    attention: "Требуют внимания",
    attentionEmpty: "Всё спокойно",
    // Spoken name of the red number on a student's row: how many numbers are marked «нужна помощь».
    needHelpForms: ["{n} номер «нужна помощь»", "{n} номера «нужна помощь»", "{n} номеров «нужна помощь»"],
    // Spoken parts of the «Звонки» row: «Пора позвонить: 2».
    callsLine: "{label}: {n}",
    upcoming: "Ближайшие занятия",
    progress: "Прогресс",
    // Screen-reader name of a progress row: «Илья Смирнов. 31 решил сам · 6 исправил».
    progressA11y: "{name}. {breakdown}",
    progressEmptyA11y: "{name}. Пока нет отмеченных номеров"
  },
  // Students list (`teacher.students`): wording the site does not have, and touch wording for its "click" hints.
  students: {
    // The site shows three buttons per row; a phone row has one "⋯" that opens them in a sheet.
    actionsFor: "Действия: {name}",
    // «Открыть» of the tablet summary: its accessible name says whose card.
    openCardOf: "Открыть карточку: {name}",
    // Spoken fact of a student row without red numbers: how many numbers the student has closed.
    solved: "решено {n}",
    copyHint: "Нажмите, чтобы скопировать",
    empty: "Учеников пока нет",
    // One word under a figure of the tablet summary (the yellow one is `m.common.statuses.YELLOW.label`).
    figureAlone: "сам",
    figureHelp: "помощь",
    // Short banners above the list / on the card: the site's two-sentence notices are cut.
    created: "Ученик добавлен",
    deleted: "Ученик удалён",
    passwordChanged: "Пароль обновлён",
    // The one line of the credentials sheet: after «Готово» the password cannot be shown again.
    passwordOnce: "Пароль виден только сейчас"
  },
  report: {
    // The PDF is generated for seconds; the site shows nothing meanwhile (the browser downloads it).
    preparing: "Готовим отчёт…",
    // Title of the file viewer and of a row of the card's "⋯" menu. The site's period buttons read «Отчёт:
    // 7 дней» · «30 дней» · «Учебный год» (one row, the word «Отчёт» once); a viewer title and a menu row
    // stand alone, so every period names the report.
    title7d: "Отчёт: 7 дней",
    title30d: "Отчёт: 30 дней",
    titleYear: "Отчёт: учебный год",
    // A report finished after the teacher left the card: it is not opened over the screen they went to,
    // it waits on the card until they open it (the same as the group screen's reports).
    ready: "Отчёт готов: {title}",
    // Spoken name of the notice's «Открыть».
    open: "Открыть отчёт"
  },
  review: {
    // «Принять вердикты ИИ» next to the sparkles icon.
    accept: "Принять",
    nothingToCheck: "Проверять нечего",
    // Spoken name of the red counter of a homework: «5 номеров ждут проверки».
    toCheckForms: ["{n} номер ждёт проверки", "{n} номера ждут проверки", "{n} номеров ждут проверки"],
    // A status group has no visible caption on a phone; this is its accessible name.
    statusAria: "Статус номера {n}",
    // The site's review tab hides the statement; on a phone it opens on demand under the number. Spoken
    // in place of the dash shown for a missing statement / answer.
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
    expand: "Развернуть: {title}",
    collapse: "Свернуть: {title}",
    // «Открыть» repeats on every lesson card: its accessible name says which lesson.
    openLessonOf: "Открыть занятие: {title}, {meta}"
  },
  assign: {
    titleSheet: "Название ДЗ",
    // The pencil button is lit once a title is typed: its accessible name carries the title.
    titleSheetOf: "Название ДЗ: {title}",
    // The accessible name of the deadline field starts with what the field shows («Дедлайн, МСК»).
    deadlineSpoken: "{field} — московское время",
    assigned: "ДЗ выдано",
    // Footnote of a number that already sits in a homework with a deadline.
    inHomework: "уже в ДЗ",
    noNumbers: "Нет номеров",
    conditionsFailed: "Условия не загрузились"
  },
  lessons: {
    bankLoading: "Загружаем номера…",
    bankFailed: "Не удалось загрузить номера. Попробуйте ещё раз.",
    noFreeNumbers: "Все уже в наборе",
    pickTopicFirst: "Сначала выберите тему",
    emptySet: "Набор пуст"
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
    attentionEmpty: "All quiet",
    needHelpForms: ["{n} problem marked “needs help”", "{n} problems marked “needs help”"],
    callsLine: "{label}: {n}",
    upcoming: "Upcoming lessons",
    progress: "Progress",
    progressA11y: "{name}. {breakdown}",
    progressEmptyA11y: "{name}. No marked problems yet"
  },
  students: {
    actionsFor: "Actions: {name}",
    openCardOf: "Open the card: {name}",
    solved: "{n} solved",
    copyHint: "Tap to copy",
    empty: "No students yet",
    figureAlone: "alone",
    figureHelp: "help",
    created: "Student added",
    deleted: "Student deleted",
    passwordChanged: "Password updated",
    passwordOnce: "The password is shown only now"
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
    accept: "Accept",
    nothingToCheck: "Nothing to check",
    toCheckForms: ["{n} problem to check", "{n} problems to check"],
    statusAria: "Status of problem {n}",
    noCondition: "No statement has been added for this problem.",
    noAnswer: "No answer has been added for this problem.",
    showConditionOf: "Statement and answer of problem {n}",
    hideConditionOf: "Hide the statement and answer of problem {n}",
    historyOf: "Status history of problem {n}",
    partlyApplied: "{done} of {total} applied.",
    partlyUndone: "{done} of {total} undone."
  },
  card: {
    expand: "Expand: {title}",
    collapse: "Collapse: {title}",
    openLessonOf: "Open lesson: {title}, {meta}"
  },
  assign: {
    titleSheet: "Homework title",
    titleSheetOf: "Homework title: {title}",
    deadlineSpoken: "{field} — Moscow time",
    assigned: "Homework assigned",
    inHomework: "already assigned",
    noNumbers: "No problems",
    conditionsFailed: "The statements did not load"
  },
  lessons: {
    bankLoading: "Loading problems…",
    bankFailed: "Could not load the problems. Please try again.",
    noFreeNumbers: "All are in the set already",
    pickTopicFirst: "Pick a topic first",
    emptySet: "The set is empty"
  }
};

export const teacher = { ru, en };
