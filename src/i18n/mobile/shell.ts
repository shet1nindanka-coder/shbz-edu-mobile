// Mobile-only strings of the shell: tab bar, app-bar titles, login extras, the settings blocks that exist
// only in the app (biometric lock, reminders, cached data, demo data), the lock screen and local reminders.
// Site texts stay in `dict.nav`, `dict.login`, `dict.settings`, `dict.interface`, `dict.shells`,
// `dict.numberSearch`, `dict.student.notifications`.
const ru = {
  // `dict.nav.*` is lowercase by design («обзор», «дз») and labels the tab bar; app bars use these titles.
  tabs: {
    overview: "Обзор",
    lesson: "Урок",
    homeworks: "ДЗ",
    deadlines: "Дедлайны",
    theory: "Теория",
    info: "Общая инфа",
    topics: "Темы",
    students: "Ученики",
    groups: "Группы",
    lessons: "Занятия",
    calls: "Звонки",
    accounts: "Аккаунты",
    statistics: "Статистика",
    panel: "Дев-панель",
    settings: "Настройки",
    more: "Ещё"
  },
  nav: {
    // Label of the teacher's fifth tab, lower-case like the site's section names.
    more: "ещё",
    moreTopicsHint: "Темы, теория и номера",
    moreGroupsHint: "Состав групп, статистика и посещаемость"
  },
  launch: {
    loading: "Открываем кабинет…",
    failedTitle: "Не удалось открыть кабинет",
    failedBody: "Нет связи с сервером. Проверьте подключение и попробуйте снова.",
    signInAgain: "Войти заново"
  },
  login: {
    languageAria: "Язык интерфейса",
    loginPlaceholder: "teacher@example.com",
    sessionNoticeDismiss: "Скрыть сообщение",
    demoTitle: "Демо-аккаунты",
    demoHint: "Нажмите на аккаунт — логин и пароль подставятся в форму.",
    demoShow: "Показать",
    demoHide: "Скрыть",
    demoNoAccount: "Без аккаунта",
    demoData: "Демо-данные и переключатели"
  },
  settings: {
    app: "Приложение",
    lockKicker: "Блокировка",
    remindersKicker: "Напоминания",
    reminderHomework: "Дедлайны домашних заданий",
    reminderHomeworkHint: "За сутки и за два часа до срока сдачи.",
    reminderLesson: "Начало урока",
    reminderLessonHint: "За 10 минут до урока и в момент начала.",
    reminderCallsHint: "В 10:00 по Москве в день, когда пора позвонить.",
    remindersNone: "Для вашей роли напоминаний на устройстве нет.",
    remindersDenied: "Уведомления запрещены в настройках устройства. Разрешите их, чтобы получать напоминания.",
    remindersUnavailable: "На этом устройстве напоминания недоступны.",
    dataKicker: "Данные на устройстве",
    dataHint: "Открытые разделы сохраняются и остаются доступны без интернета.",
    connectionOnline: "Подключение есть",
    connectionOffline: "Нет подключения — показываем сохранённые данные",
    pendingForms: ["{n} изменение ждёт отправки", "{n} изменения ждут отправки", "{n} изменений ждут отправки"],
    clearCache: "Очистить кэш",
    cacheCleared: "Сохранённые данные удалены.",
    clearCacheOfflineTitle: "Очистить кэш без подключения?",
    clearCacheOfflineBody:
      "Сейчас нет подключения, и сохранённые данные — всё, что может показать приложение. После очистки разделы останутся пустыми, пока связь не вернётся.",
    signOutPendingTitle: "Выйти без отправки изменений?",
    signOutPendingBodyForms: [
      "{n} изменение ещё не отправлено. При выходе оно будет удалено с устройства и не сохранится.",
      "{n} изменения ещё не отправлены. При выходе они будут удалены с устройства и не сохранятся.",
      "{n} изменений ещё не отправлено. При выходе они будут удалены с устройства и не сохранятся."
    ],
    version: "Версия {version}",
    signingOut: "Выходим…"
  },
  biometrics: {
    title: "Вход по биометрии",
    hint: "Спрашивать отпечаток пальца или лицо при открытии приложения.",
    prompt: "Подтвердите вход в ШБЗ Школу",
    confirmEnable: "Подтвердите, чтобы включить блокировку",
    notEnrolled: "Сначала добавьте отпечаток пальца или лицо в настройках устройства.",
    unavailable: "На этом устройстве биометрия недоступна.",
    failed: "Не удалось подтвердить личность. Попробуйте ещё раз.",
    lockout: "Слишком много попыток. Попробуйте позже или войдите по паролю.",
    lockedTitle: "Приложение заблокировано",
    lockedBody: "Подтвердите личность, чтобы продолжить.",
    unlock: "Разблокировать",
    usePassword: "Войти по паролю"
  },
  numberSearch: {
    title: "Поиск номера",
    hint: "Введите номер задачи — откроем её карточку."
  },
  reminders: {
    channelName: "Напоминания",
    homeworkTitle: "Скоро дедлайн",
    homeworkBody: "{homework} · {topic} — сдать до {deadline}",
    lessonSoonTitle: "Урок через 10 минут",
    lessonStartTitle: "Урок начался",
    lessonBody: "{title}",
    lessonBodyWithGroup: "{title} · {group}"
  },
  demo: {
    title: "Демо-данные",
    entryHint: "Сброс данных, персонажи и переключатели демо-режима.",
    resetData: "Сбросить демо-данные",
    resetConfirmTitle: "Сбросить демо-данные?",
    resetConfirmBody: "Все изменения, сделанные в приложении, будут удалены, а данные вернутся к исходным.",
    resetDone: "Демо-данные восстановлены."
  }
};

const en: typeof ru = {
  tabs: {
    overview: "Overview",
    lesson: "Lesson",
    homeworks: "Homework",
    deadlines: "Deadlines",
    theory: "Theory",
    info: "General info",
    topics: "Topics",
    students: "Students",
    groups: "Groups",
    lessons: "Lessons",
    calls: "Calls",
    accounts: "Accounts",
    statistics: "Statistics",
    panel: "Dev panel",
    settings: "Settings",
    more: "More"
  },
  nav: {
    more: "more",
    moreTopicsHint: "Topics, theory and problems",
    moreGroupsHint: "Group members, statistics and attendance"
  },
  launch: {
    loading: "Opening your account…",
    failedTitle: "Could not open your account",
    failedBody: "Cannot reach the server. Check your connection and try again.",
    signInAgain: "Sign in again"
  },
  login: {
    languageAria: "Interface language",
    loginPlaceholder: "teacher@example.com",
    sessionNoticeDismiss: "Hide the message",
    demoTitle: "Demo accounts",
    demoHint: "Tap an account to fill in its login and password.",
    demoShow: "Show",
    demoHide: "Hide",
    demoNoAccount: "No account",
    demoData: "Demo data and switches"
  },
  settings: {
    app: "App",
    lockKicker: "Lock",
    remindersKicker: "Reminders",
    reminderHomework: "Homework deadlines",
    reminderHomeworkHint: "A day and two hours before the deadline.",
    reminderLesson: "Lesson start",
    reminderLessonHint: "10 minutes before the lesson and when it starts.",
    reminderCallsHint: "At 10:00 Moscow time on the day a call becomes due.",
    remindersNone: "There are no on-device reminders for your role.",
    remindersDenied: "Notifications are turned off in the device settings. Allow them to get reminders.",
    remindersUnavailable: "Reminders are not available on this device.",
    dataKicker: "Data on this device",
    dataHint: "Sections you have opened are saved and stay available offline.",
    connectionOnline: "Connected",
    connectionOffline: "No connection — showing saved data",
    pendingForms: ["{n} change is waiting to be sent", "{n} changes are waiting to be sent"],
    clearCache: "Clear cache",
    cacheCleared: "Saved data has been removed.",
    clearCacheOfflineTitle: "Clear the cache while offline?",
    clearCacheOfflineBody:
      "There is no connection right now, and saved data is all the app can show. After clearing, sections stay empty until the connection returns.",
    signOutPendingTitle: "Log out without sending your changes?",
    signOutPendingBodyForms: [
      "{n} change has not been sent yet. Logging out deletes it from this device, and it will not be saved.",
      "{n} changes have not been sent yet. Logging out deletes them from this device, and they will not be saved."
    ],
    version: "Version {version}",
    signingOut: "Signing out…"
  },
  biometrics: {
    title: "Biometric sign-in",
    hint: "Ask for your fingerprint or face when the app opens.",
    prompt: "Confirm sign-in",
    confirmEnable: "Confirm to turn the lock on",
    notEnrolled: "Add a fingerprint or face in the device settings first.",
    unavailable: "Biometrics are not available on this device.",
    failed: "Could not confirm your identity. Please try again.",
    lockout: "Too many attempts. Try again later or sign in with your password.",
    lockedTitle: "The app is locked",
    lockedBody: "Confirm your identity to continue.",
    unlock: "Unlock",
    usePassword: "Sign in with password"
  },
  numberSearch: {
    title: "Find a problem",
    hint: "Enter a problem number and we will open its card."
  },
  reminders: {
    channelName: "Reminders",
    homeworkTitle: "Deadline coming up",
    homeworkBody: "{homework} · {topic} — due {deadline}",
    lessonSoonTitle: "Lesson in 10 minutes",
    lessonStartTitle: "The lesson has started",
    lessonBody: "{title}",
    lessonBodyWithGroup: "{title} · {group}"
  },
  demo: {
    title: "Demo data",
    entryHint: "Data reset, personas and demo-mode switches.",
    resetData: "Reset demo data",
    resetConfirmTitle: "Reset demo data?",
    resetConfirmBody: "Every change made in the app will be removed and the data will return to its initial state.",
    resetDone: "Demo data restored."
  }
};

export const shell = { ru, en };
