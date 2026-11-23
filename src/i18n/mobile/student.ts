// Mobile-only strings of the student area (home, theory, homework, live lesson, deadlines, info).
// Site texts stay in `dict.student.*`; here are native replacements for web-only wording
// (docs/spec/09-data-i18n-math.md §3.5) and strings the site does not have.
const ru = {
  note: {
    // the draft is kept on the device while there is no connection (02 Q12); the one wording of this
    // state for every note field of the student (number screen and homework cards)
    queued: "Сохраним при подключении",
    queuedHint: "Нет связи: заметка останется на устройстве и отправится, как только появится интернет.",
    // online, but the last save got no answer (timeout, server unreachable): the app tries again by itself
    retrying: "Не сохранено, повторим",
    retryingHint: "Сервер не ответил: заметка останется на устройстве, приложение отправит её ещё раз само."
  },
  home: {
    // The overview greets by the first name: «Привет, Илья».
    greeting: "Привет, {name}",
    greetingNoName: "Привет",
    // The lesson card: one line that says when («Урок сегодня в 17:00») over the lesson's title.
    lessonNow: "Урок идёт сейчас",
    lessonToday: "Урок сегодня в {time}",
    lessonTomorrow: "Урок завтра в {time}",
    lessonOn: "Урок {date} в {time}",
    lessonA11y: "{when}. {title}. Открыть урок",
    // the word after the big number of «За неделю»: «23 номера»
    solvedWords: ["номер", "номера", "номеров"],
    todayLine: "Сегодня: {solved}",
    weekA11y: "За неделю закрыто: {solved}",
    streakFailed: "Не удалось загрузить огонёк."
  },
  calendar: {
    // the chevron buttons are named by the site's `dict.topics.widgets.datetime.prevMonth` / `nextMonth`
    swipeHint: "Месяцы можно листать свайпом по календарю. Нажмите на отмеченный день, чтобы увидеть его ДЗ.",
    deadlineForms: ["{n} дедлайн", "{n} дедлайна", "{n} дедлайнов"],
    allDone: "все ДЗ выполнены",
    week: "На неделю",
    month: "На месяц",
    viewA11y: "Что показать: неделю или месяц",
    nothingDue: "Сроков впереди нет: все задания сданы.",
    rowA11y: "{title}. {caption}"
  },
  theory: {
    openAria: "Открыть теорию по теме «{title}»",
    filter: "Найти тему",
    filterEmpty: "Тем с таким названием нет.",
    // caption of a row whose file the app cannot show itself (a Word file)
    external: "откроется в другом приложении",
    downloading: "скачиваем файл…",
    downloadAria: "Скачать файл теории по теме «{title}»"
  }
};

const en: typeof ru = {
  note: {
    queued: "Will save when online",
    queuedHint: "No connection: the note stays on your device and will be sent as soon as you are back online.",
    retrying: "Not saved yet, retrying",
    retryingHint: "The server did not answer: the note stays on your device and the app will send it again by itself."
  },
  home: {
    greeting: "Hi, {name}",
    greetingNoName: "Hi",
    lessonNow: "The lesson is on now",
    lessonToday: "Lesson today at {time}",
    lessonTomorrow: "Lesson tomorrow at {time}",
    lessonOn: "Lesson on {date} at {time}",
    lessonA11y: "{when}. {title}. Open the lesson",
    solvedWords: ["problem", "problems"],
    todayLine: "Today: {solved}",
    weekA11y: "Closed this week: {solved}",
    streakFailed: "Could not load the streak."
  },
  calendar: {
    swipeHint: "Swipe across the calendar to change the month. Tap a marked day to see its homework.",
    deadlineForms: ["{n} deadline", "{n} deadlines"],
    allDone: "all homework done",
    week: "For the week",
    month: "For the month",
    viewA11y: "What to show: the week or the month",
    nothingDue: "Nothing is due: every homework is handed in.",
    rowA11y: "{title}. {caption}"
  },
  theory: {
    openAria: "Open the theory for “{title}”",
    filter: "Find a topic",
    filterEmpty: "No topic with such a name.",
    external: "opens in another app",
    downloading: "downloading the file…",
    downloadAria: "Download the theory file for “{title}”"
  }
};

export const student = { ru, en };
