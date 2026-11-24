// Mobile-only strings of the student area (home, theory, homework, live lesson, deadlines, info).
// Site texts stay in `dict.student.*`; here are native replacements for web-only wording
// (docs/spec/09-data-i18n-math.md §3.5) and strings the site does not have.
//
// The text diet (docs/design/glass-over-paper.md §1a): a string here is one or two words, a figure's
// name, or an accessible name that says what the screen shows without words. No sentences for the eye.
const ru = {
  note: {
    // the draft is kept on the device while there is no connection (02 Q12); the one wording of this
    // state for every note field of the student (number screen and homework cards)
    queued: "Сохраним при подключении",
    // online, but the last save got no answer (timeout, server unreachable): the app tries again by itself
    retrying: "Не сохранено, повторим"
  },
  home: {
    // The overview greets by the first name: «Привет, Илья».
    greeting: "Привет, {name}",
    greetingNoName: "Привет",
    // The lesson card is one line that says when: «Урок · завтра 16:00».
    lessonNow: "Урок идёт",
    lessonToday: "Урок · сегодня {time}",
    lessonTomorrow: "Урок · завтра {time}",
    lessonOn: "Урок · {date}, {time}",
    lessonA11y: "{when}. {title}. Открыть урок",
    // the word after the big number of the week card: «23 номера»
    solvedWords: ["номер", "номера", "номеров"],
    weekA11y: "За неделю закрыто: {solved}",
    streakFailed: "Не удалось загрузить огонёк."
  },
  calendar: {
    // the chevron buttons are named by the site's `dict.topics.widgets.datetime.prevMonth` / `nextMonth`;
    // the marks of a day have no legend — these are what a screen reader hears with the day
    deadlineForms: ["{n} дедлайн", "{n} дедлайна", "{n} дедлайнов"],
    allDone: "все ДЗ выполнены",
    // the title of an unfolded day: «среда, 26 ноября» (Monday first)
    weekdays: ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
  },
  theory: {
    openAria: "Открыть теорию по теме «{title}»",
    filter: "Найти тему",
    downloadAria: "Скачать файл теории по теме «{title}»"
  },
  info: {
    // replaces `dict.student.examInfo.tasksTitle` («Сколько даёт каждое задание»): the rows are figures now
    tasksTitle: "Первичные баллы"
  }
};

const en: typeof ru = {
  note: {
    queued: "Will save when online",
    retrying: "Not saved yet, retrying"
  },
  home: {
    greeting: "Hi, {name}",
    greetingNoName: "Hi",
    lessonNow: "Lesson is on",
    lessonToday: "Lesson · today {time}",
    lessonTomorrow: "Lesson · tomorrow {time}",
    lessonOn: "Lesson · {date}, {time}",
    lessonA11y: "{when}. {title}. Open the lesson",
    solvedWords: ["problem", "problems"],
    weekA11y: "Closed this week: {solved}",
    streakFailed: "Could not load the streak."
  },
  calendar: {
    deadlineForms: ["{n} deadline", "{n} deadlines"],
    allDone: "all homework done",
    weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  },
  theory: {
    openAria: "Open the theory for “{title}”",
    filter: "Find a topic",
    downloadAria: "Download the theory file for “{title}”"
  },
  info: {
    tasksTitle: "Raw points"
  }
};

export const student = { ru, en };
