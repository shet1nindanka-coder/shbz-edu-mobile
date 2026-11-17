// Mobile-only strings of the planner area (lessons, lesson board, homework drafts).
// Site texts stay in `dict.planner.*`.
const ru = {
  lessonBoard: {
    // replaces `dict.planner.lessonBoard.downloadPdf` («Скачать PDF»): the PDF opens in the file viewer
    handout: "Раздатка (PDF)",
    // replaces `dict.planner.lessonBoard.print` («Для печати» opens a browser tab): the HTML handout is
    // handed to the system, which prints it or saves it as a PDF
    print: "Версия для печати",
    // replaces `dict.planner.lessonBoard.hotkeysHint` (no keyboard on a phone)
    resultHint: "Отметьте итог по каждому номеру касанием.",
    actions: "Действия с уроком",
    // the site finishes without asking; on a touch screen an accidental tap is likelier (05 §7 item 9)
    finishTitle: "Завершить урок?",
    finishDescription:
      "Урок закончится для всех учеников. Номерам без отметки итог проставится сам: «не решил» — если ученик сдавал решение, «не успел» — если не сдавал. Отменить завершение нельзя.",
    finishConfirm: "Да, завершить",
    expand: "Показать набор: {name}",
    collapse: "Свернуть набор: {name}",
    noFreeNumbers: "В этой теме все номера уже в наборе.",
    bankLoading: "Загружаем банк номеров…",
    bankFailed: "Не удалось загрузить банк номеров.",
    numberPlaceholder: "Сначала выберите тему"
  },
  lessonsList: {
    openLesson: "Открыть урок «{title}»",
    moreActions: "Действия с уроком «{title}»"
  },
  lessonNew: {
    searchPlaceholder: "Найти группу или ученика",
    searchAria: "Поиск группы или ученика",
    durationDecrease: "Уменьшить на 5 минут",
    durationIncrease: "Увеличить на 5 минут",
    pickTopics: "Выбрать темы",
    // replaces `dict.planner.lessonCompose.steps` («Кликните по номерам ниже…»)
    composeSteps:
      "1. Отметьте номера касанием · 2. Укажите длительность · 3. Нажмите «Составить занятие». Итоги по каждому номеру отметите на доске занятия.",
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
    // the site only names the rule («бюджет = минуты × дни до дедлайна»); the form shows the result
    budgetForms: [
      "Бюджет: {minutes} мин × {n} день = {total} мин",
      "Бюджет: {minutes} мин × {n} дня = {total} мин",
      "Бюджет: {minutes} мин × {n} дней = {total} мин"
    ]
  },
  draftBoard: {
    actions: "Действия с черновиком",
    issueHint: "ДЗ получат ученики, у которых в наборе есть номера. Тем, кому оно уже выдано, повторно не выдаём.",
    numbersAria: "Номера темы, которых ещё нет в наборе"
  }
};

const en: typeof ru = {
  lessonBoard: {
    handout: "Handout (PDF)",
    print: "Print version",
    resultHint: "Tap to mark the result of each problem.",
    actions: "Lesson actions",
    finishTitle: "Finish the lesson?",
    finishDescription:
      "The lesson will end for every student. Problems without a mark get a result automatically: “not solved” if the student submitted a solution, “not reached” if not. This cannot be undone.",
    finishConfirm: "Yes, finish",
    expand: "Show the set: {name}",
    collapse: "Collapse the set: {name}",
    noFreeNumbers: "Every problem of this topic is already in the set.",
    bankLoading: "Loading the problem bank…",
    bankFailed: "Could not load the problem bank.",
    numberPlaceholder: "Pick a topic first"
  },
  lessonsList: {
    openLesson: "Open lesson “{title}”",
    moreActions: "Actions for lesson “{title}”"
  },
  lessonNew: {
    searchPlaceholder: "Find a group or a student",
    searchAria: "Search for a group or a student",
    durationDecrease: "Decrease by 5 minutes",
    durationIncrease: "Increase by 5 minutes",
    pickTopics: "Choose topics",
    composeSteps:
      "1. Tap the problems below · 2. Set the duration · 3. Press “Compose lesson”. You will mark the result of each problem on the lesson board.",
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
    budgetForms: ["Budget: {minutes} min × {n} day = {total} min", "Budget: {minutes} min × {n} days = {total} min"]
  },
  draftBoard: {
    actions: "Draft actions",
    issueHint: "Homework goes to the students whose set has problems. Students who already have it are skipped.",
    numbersAria: "Problems of the topic that are not in the set yet"
  }
};

export const planner = { ru, en };
