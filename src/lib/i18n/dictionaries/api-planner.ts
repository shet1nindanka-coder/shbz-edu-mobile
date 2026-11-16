// JSON-ошибки API занятий и ДЗ учителя: уроки, участники, планы ДЗ,
// выдача ДЗ, дедлайны, статусы, звонки родителям.
// Общие тексты — в api-common.ts. Английская версия типизирована русской.
export const apiPlannerRu = {
  // POST /api/teacher/lessons
  lessons: {
    selectAtLeastOneStudent: "Выберите хотя бы одного ученика.",
    // {max} — предел участников одного урока.
    tooManyStudents: "Не больше {max} учеников за один урок.",
    // Название урока по умолчанию; {date} — дата создания. Сохраняется в БД.
    defaultTitle: "Занятие от {date}",
    invalidStartsAt: "Некорректные дата и время урока.",
    createFailed: "Не удалось создать урок. Применена ли миграция уроков и групп?",
    // ИИ выключен или модель не настроена; урок/черновик уже создан.
    plannerUnavailable: "ИИ-подбор недоступен: модель не настроена. Урок можно собрать вручную.",
    noHomeworkHandout: "У домашнего задания нет печатной раздатки — только лист ответов.",
    pdfRendererFallback: "PDF-рендерер недоступен на сервере. Нажмите Ctrl+P (⌘P) и выберите «Сохранить как PDF»."
  },
  // PATCH/DELETE /api/teacher/lessons/[lessonId]
  lesson: {
    alreadyFinished: "Урок уже завершён — время не переносится.",
    alreadyClosed: "Урок уже закрылся по расписанию, и в нём есть сдачи — перенести нельзя. Создайте новый урок.",
    scheduleFailed: "Не удалось назначить время урока.",
    deleteFailed: "Не удалось удалить урок."
  },
  // POST /api/teacher/lessons/[lessonId]/finish
  lessonFinish: {
    notActive: "Урок сейчас не идёт — завершать нечего.",
    finishFailed: "Не удалось завершить урок."
  },
  // PATCH .../participants/[participantId]/items и POST .../regenerate
  lessonItems: {
    participantNotFound: "Участник урока не найден.",
    homeworkAlreadyIssued: "ДЗ уже выдано. Сначала отмените его.",
    numbersRequired: "Передайте список номеров.",
    // {numbers} — номера через запятую.
    blockedNumbers: "Нельзя убрать номер, по которому ученик уже сдавал решение: {numbers}.",
    saveFailed: "Не удалось сохранить набор."
  },
  // PATCH .../items/[itemId]/result
  lessonResult: {
    invalidResult: "Некорректный итог.",
    itemNotFound: "Задача урока не найдена.",
    saveFailed: "Не удалось сохранить итог."
  },
  // PATCH .../participants/[participantId]/attendance
  attendance: {
    invalidMark: "Некорректная отметка.",
    participantNotFound: "Участник занятия не найден.",
    saveFailed: "Не удалось сохранить отметку."
  },
  // POST /api/teacher/homework-plans и DELETE /api/teacher/homework-plans/[planId]
  homeworkPlans: {
    topicAndDeadlineRequired: "Укажите тему и дедлайн в будущем (дату следующего занятия).",
    // {max} — предел участников одного черновика.
    tooManyStudents: "Не больше {max} учеников за раз.",
    // Название черновика по умолчанию; {topic} — тема, {date} — дедлайн. Сохраняется в БД.
    defaultTitle: "ДЗ по теме «{topic}» до {date}",
    createFailed: "Не удалось создать черновик ДЗ. Применена ли миграция homework plans?",
    deleteFailed: "Не удалось удалить черновик."
  },
  // POST /api/teacher/homework-plans/[planId]/issue
  homeworkPlanIssue: {
    missingTopicOrDeadline: "У черновика нет темы или дедлайна.",
    deadlinePassed: "Дедлайн уже прошёл — создайте новый черновик с актуальной датой.",
    // message в списке failed — показывается учителю рядом с именем ученика.
    emptySet: "Набор пуст — добавьте номера.",
    internalError: "Внутренняя ошибка — подробности в логах сервера."
  },
  // POST/DELETE /api/teacher/homeworks
  homeworks: {
    invalidCancelData: "Некорректные данные для отмены ДЗ."
  },
  // lib/homework-issue.ts — message в результатах issueHomework, видны учителю в UI.
  homeworkIssue: {
    invalidData: "Некорректные данные для ДЗ.",
    // {what} для apiCommon.migrationMissing.
    homeworkTable: "Таблица ДЗ",
    deadlineColumn: "Колонка deadlineAt",
    // {numbers} — один номер.
    solvedConflictOne:
      "Номер {numbers} ученик уже решил — повторно его не выдаём. Уберите его из набора или сбросьте статус на карточке ученика.",
    // {numbers} — несколько номеров через запятую.
    solvedConflictMany:
      "Номера {numbers} ученик уже решил — повторно их не выдаём. Уберите их из набора или сбросьте статус на карточке ученика.",
    alreadyIssued: "Это ДЗ ученику уже выдано."
  },
  // POST /api/teacher/student-deadlines
  studentDeadlines: {
    invalidData: "Некорректные данные для дедлайна."
  },
  // POST /api/teacher/number-status
  numberStatus: {
    invalidData: "Некорректные данные для статуса."
  },
  // GET/POST /api/teacher/parent-calls
  parentCalls: {
    studentRequired: "Укажите ученика.",
    outcomeRequired: "Укажите исход звонка.",
    saveFailed: "Не удалось сохранить звонок."
  }
};

export const apiPlannerEn: typeof apiPlannerRu = {
  lessons: {
    selectAtLeastOneStudent: "Select at least one student.",
    tooManyStudents: "No more than {max} students per lesson.",
    defaultTitle: "Lesson on {date}",
    invalidStartsAt: "Invalid lesson date and time.",
    createFailed: "Could not create the lesson. Has the lessons and groups migration been applied?",
    plannerUnavailable: "AI selection is unavailable: the model isn't configured. You can build the lesson manually.",
    noHomeworkHandout: "Homework has no printable handout — only the answer sheet.",
    pdfRendererFallback: "The PDF renderer is unavailable on the server. Press Ctrl+P (⌘P) and choose “Save as PDF”."
  },
  lesson: {
    alreadyFinished: "The lesson has already finished — its time can't be rescheduled.",
    alreadyClosed: "The lesson already closed on schedule and has submissions — it can't be rescheduled. Create a new lesson.",
    scheduleFailed: "Could not schedule the lesson.",
    deleteFailed: "Could not delete the lesson."
  },
  lessonFinish: {
    notActive: "The lesson isn't in progress — there's nothing to finish.",
    finishFailed: "Could not finish the lesson."
  },
  lessonItems: {
    participantNotFound: "Lesson participant not found.",
    homeworkAlreadyIssued: "Homework has already been assigned. Cancel it first.",
    numbersRequired: "Provide a list of problems.",
    blockedNumbers: "A problem the student has already submitted a solution for can't be removed: {numbers}.",
    saveFailed: "Could not save the set."
  },
  lessonResult: {
    invalidResult: "Invalid result.",
    itemNotFound: "Lesson problem not found.",
    saveFailed: "Could not save the result."
  },
  attendance: {
    invalidMark: "Invalid attendance mark.",
    participantNotFound: "Lesson participant not found.",
    saveFailed: "Could not save the attendance mark."
  },
  homeworkPlans: {
    topicAndDeadlineRequired: "Specify a topic and a deadline in the future (the date of the next lesson).",
    tooManyStudents: "No more than {max} students at a time.",
    defaultTitle: "Homework on “{topic}” due {date}",
    createFailed: "Could not create the homework draft. Has the homework plans migration been applied?",
    deleteFailed: "Could not delete the draft."
  },
  homeworkPlanIssue: {
    missingTopicOrDeadline: "The draft has no topic or deadline.",
    deadlinePassed: "The deadline has already passed — create a new draft with a current date.",
    emptySet: "The set is empty — add problems.",
    internalError: "Internal error — see the server logs for details."
  },
  homeworks: {
    invalidCancelData: "Invalid data for cancelling homework."
  },
  homeworkIssue: {
    invalidData: "Invalid homework data.",
    homeworkTable: "The homework table",
    deadlineColumn: "The deadlineAt column",
    solvedConflictOne:
      "The student has already solved problem {numbers} — it won't be assigned again. Remove it from the set or reset its status on the student's card.",
    solvedConflictMany:
      "The student has already solved problems {numbers} — they won't be assigned again. Remove them from the set or reset their status on the student's card.",
    alreadyIssued: "This homework has already been assigned to the student."
  },
  studentDeadlines: {
    invalidData: "Invalid deadline data."
  },
  numberStatus: {
    invalidData: "Invalid status data."
  },
  parentCalls: {
    studentRequired: "Specify a student.",
    outcomeRequired: "Specify the call outcome.",
    saveFailed: "Could not save the call."
  }
};
