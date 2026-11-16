// Mobile-only strings of the student area (home, theory, homework, live lesson, deadlines, info).
// Site texts stay in `dict.student.*`; here are native replacements for web-only wording
// (docs/spec/09-data-i18n-math.md §3.5) and strings the site does not have.
const ru = {
  fileCard: {
    // replaces `dict.student.fileCard.openInBrowser` («Открыть в браузере»)
    open: "Открыть файл",
    // replaces `dict.student.fileCard.docxHint` (the preview no longer depends on a browser)
    docxHint: "Файл Word откроется в другом приложении на устройстве."
  },
  photos: {
    // replaces `dict.student.photos.dropHint` / `dragTitle` (no drag & drop on a phone)
    addHint: "Сфотографируйте решение или выберите снимок из галереи",
    sourceTitle: "Откуда взять фото?"
  },
  lesson: {
    // replaces `dict.student.lesson.autoRefresh` (no page to reload)
    autoRefresh: "Обновлять экран не нужно — урок откроется сам."
  },
  note: {
    saved: "Заметка сохранена",
    // the draft is kept on the device while there is no connection (02 Q12)
    queued: "Сохраним при подключении",
    queuedHint: "Нет связи: заметка останется на устройстве и отправится, как только появится интернет."
  },
  home: {
    // accessible name of the whole «Общая инфа» row on the overview
    infoRowAria: "Общая инфа: баллы и разбалловка ЕГЭ и ОГЭ",
    streakFailed: "Не удалось загрузить огонёк."
  },
  calendar: {
    // chevron buttons replace the site's «← Назад» / «Вперёд →» text buttons
    prevMonth: "Предыдущий месяц",
    nextMonth: "Следующий месяц",
    swipeHint: "Месяцы можно листать свайпом по календарю. Нажмите на отмеченный день, чтобы увидеть его ДЗ.",
    deadlineForms: ["{n} дедлайн", "{n} дедлайна", "{n} дедлайнов"],
    allDone: "все ДЗ выполнены"
  },
  theory: {
    openAria: "Открыть теорию по теме «{title}»",
    downloadAria: "Скачать файл теории по теме «{title}»"
  }
};

const en: typeof ru = {
  fileCard: {
    open: "Open file",
    docxHint: "The Word file will open in another app on your device."
  },
  photos: {
    addHint: "Photograph your solution or choose a picture from the gallery",
    sourceTitle: "Where is the photo?"
  },
  lesson: {
    autoRefresh: "No need to refresh — the lesson will open on its own."
  },
  note: {
    saved: "Note saved",
    queued: "Will save when online",
    queuedHint: "No connection: the note stays on your device and will be sent as soon as you are back online."
  },
  home: {
    infoRowAria: "General info: EGE and OGE scores and grading",
    streakFailed: "Could not load the streak."
  },
  calendar: {
    prevMonth: "Previous month",
    nextMonth: "Next month",
    swipeHint: "Swipe across the calendar to change the month. Tap a marked day to see its homework.",
    deadlineForms: ["{n} deadline", "{n} deadlines"],
    allDone: "all homework done"
  },
  theory: {
    openAria: "Open the theory for “{title}”",
    downloadAria: "Download the theory file for “{title}”"
  }
};

export const student = { ru, en };
