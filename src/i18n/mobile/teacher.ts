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
    // The weekly PDF is downloaded and handed to the system viewer instead of opening in a browser tab.
    preparing: "Готовим отчёт…",
    ready: "Отчёт готов",
    open: "Открыть отчёт",
    share: "Поделиться отчётом"
  },
  review: {
    photoOf: "Фото {index} из {total}",
    // A status group has no visible caption on a phone; this is its accessible name.
    statusAria: "Статус номера {n}",
    // The site's review tab hides the statement; on a phone it opens on demand under the number.
    showCondition: "Условие и ответ",
    hideCondition: "Скрыть условие и ответ",
    condition: "Условие",
    answer: "Ответ",
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
    // The site removes a problem at once; a stray tap on a phone asks first.
    removeConfirmTitle: "Убрать № {n} из набора?",
    removeConfirmDescription: "Итог урока по этому номеру будет удалён вместе с ним. Статус номера в прогрессе ученика не изменится.",
    removeConfirm: "Убрать",
    bankLoading: "Загружаем номера…",
    bankFailed: "Не удалось загрузить номера. Попробуйте ещё раз.",
    noFreeNumbers: "Все номера этой темы уже в наборе.",
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
    ready: "The report is ready",
    open: "Open the report",
    share: "Share the report"
  },
  review: {
    photoOf: "Photo {index} of {total}",
    statusAria: "Status of problem {n}",
    showCondition: "Statement and answer",
    hideCondition: "Hide the statement and answer",
    condition: "Statement",
    answer: "Answer",
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
    removeConfirmTitle: "Remove No. {n} from the set?",
    removeConfirmDescription: "The lesson result for this problem will be deleted with it. The problem's status in the student's progress stays unchanged.",
    removeConfirm: "Remove",
    bankLoading: "Loading problems…",
    bankFailed: "Could not load the problems. Please try again.",
    noFreeNumbers: "Every problem of this topic is already in the set.",
    pickTopicFirst: "Pick a topic first"
  }
};

export const teacher = { ru, en };
