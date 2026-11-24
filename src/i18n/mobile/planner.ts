// Mobile-only strings of the planner area (lessons, lesson board, homework drafts).
// Site texts stay in `dict.planner.*`.
const ru = {
  lessonBoard: {
    // replaces `dict.planner.lessonBoard.print` («Для печати» opens a browser tab): the HTML handout is
    // handed to the system, which prints it or saves it as a PDF
    print: "Версия для печати",
    // the one caption of a running lesson: how long it still lasts
    timeLeft: "осталось {n} мин",
    actions: "Действия с уроком",
    // the site finishes without asking; on a touch screen an accidental tap is likelier (05 §7 item 9)
    finishTitle: "Завершить урок?",
    finishDescription: "Номерам без отметки итог проставится сам. Отменить нельзя.",
    // the one hint of an unscheduled lesson's board (`dict.planner.lessonBoard.noTime`, cut to a line)
    noTime: "Без времени урок не начнётся",
    // the caption of a student who has not opened the running lesson (the site: «ещё не открыл урок»)
    notJoined: "не вошёл",
    // «2/7» on the right of a student's row, in words for a screen reader (a bare «2/7» is read as a fraction)
    solvedAria: "решено {done} из {total}",
    noTasks: "Задач пока нет",
    noFreeNumbers: "Все номера уже в наборе",
    // the topic itself is empty (`m.teacher.assign.noNumbers` on the assign tab says the same)
    noNumbers: "В теме нет номеров",
    bankLoading: "Загружаем банк номеров…",
    bankFailed: "Не удалось загрузить банк номеров.",
    // names of a row's controls out of context (explore by touch, the rotor): every row has the same ones
    resultGroupAria: "Итог урока, {number}",
    resultOptionAria: "{result}, {number}",
    historyAria: "История статуса, {number}"
  },
  lessonsList: {
    // the header button; its full name («Составить занятие») is the site's and stays the spoken one
    compose: "Составить",
    empty: "Уроков пока нет",
    openLesson: "Открыть урок «{title}»",
    // names of the figures in the tablet panel of the selected lesson
    results: "Итоги",
    selecting: "Подбор",
    errors: "Ошибки"
  },
  lessonNew: {
    searchPlaceholder: "Поиск",
    searchAria: "Поиск группы или ученика",
    noGroups: "Групп пока нет",
    noStudents: "Учеников пока нет",
    durationDecrease: "Уменьшить на 5 минут",
    durationIncrease: "Увеличить на 5 минут",
    // the compact start picker of the manual composer: «Начало, МСК» fits next to the duration stepper
    start: "Начало",
    // the main button of the manual composer once numbers are ticked: «Составить · 3»
    composeCount: "Составить · {n}",
    statementsLoading: "Загружаем условия…"
  },
  handout: {
    title: "Раздатка",
    answersTitle: "Ответы",
    failed: "Не удалось подготовить раздатку. Попробуйте ещё раз.",
    // replaces `dict.apiPlanner.lessons.pdfRendererFallback` (Ctrl+P is an instruction for a browser)
    rendererUnavailable:
      "PDF сейчас не собрать: рендерер на сервере недоступен. Откройте версию для печати и сохраните её как PDF."
  },
  drafts: {
    openDraft: "Открыть черновик «{title}»"
  },
  draftNew: {
    // the site only names the rule («бюджет = минуты × дни до дедлайна»); the form shows the result next
    // to the minutes: «× 5 дней = 300 мин»
    budgetForms: ["× {n} день = {total} мин", "× {n} дня = {total} мин", "× {n} дней = {total} мин"]
  },
  draftBoard: {
    actions: "Действия с черновиком",
    numbersAria: "Номера темы, которых ещё нет в наборе"
  }
};

const en: typeof ru = {
  lessonBoard: {
    print: "Print version",
    timeLeft: "{n} min left",
    actions: "Lesson actions",
    finishTitle: "Finish the lesson?",
    finishDescription: "Problems without a mark get a result automatically. This cannot be undone.",
    noTime: "A lesson without a time never starts",
    notJoined: "not joined",
    solvedAria: "{done} of {total} solved",
    noTasks: "No problems yet",
    noFreeNumbers: "Every problem is already in the set",
    noNumbers: "The topic has no problems",
    bankLoading: "Loading the problem bank…",
    bankFailed: "Could not load the problem bank.",
    resultGroupAria: "Lesson result, {number}",
    resultOptionAria: "{result}, {number}",
    historyAria: "Status history, {number}"
  },
  lessonsList: {
    compose: "Compose",
    empty: "No lessons yet",
    openLesson: "Open lesson “{title}”",
    results: "Results",
    selecting: "Selection",
    errors: "Errors"
  },
  lessonNew: {
    searchPlaceholder: "Search",
    searchAria: "Search for a group or a student",
    noGroups: "No groups yet",
    noStudents: "No students yet",
    durationDecrease: "Decrease by 5 minutes",
    durationIncrease: "Increase by 5 minutes",
    start: "Start",
    composeCount: "Compose · {n}",
    statementsLoading: "Loading statements…"
  },
  handout: {
    title: "Handout",
    answersTitle: "Answers",
    failed: "Could not prepare the handout. Please try again.",
    rendererUnavailable:
      "The PDF cannot be built right now: the server renderer is unavailable. Open the print version and save it as a PDF."
  },
  drafts: {
    openDraft: "Open draft “{title}”"
  },
  draftNew: {
    budgetForms: ["× {n} day = {total} min", "× {n} days = {total} min"]
  },
  draftBoard: {
    actions: "Draft actions",
    numbersAria: "Problems of the topic that are not in the set yet"
  }
};

export const planner = { ru, en };
