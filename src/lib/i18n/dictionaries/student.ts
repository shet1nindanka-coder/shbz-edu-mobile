// Словарь раздела ученика: /student/** и компоненты student-*, дедлайны, ДЗ.
// Обе языковые версии рядом — так проще держать их синхронными; английская
// типизирована русской, лишний или пропущенный ключ не соберётся.
export const studentRu = {
  // Короткие названия дней недели, Пн…Вс — для графика недели и календаря.
  weekdaysShort: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  deadlines: {
    kicker: "Дедлайны",
    title: "Календарь домашних заданий"
  },
  homeworks: {
    kicker: "Домашние задания",
    title: "Мои ДЗ",
    migrationNotice: "Раздел ДЗ появится после обновления базы данных до актуальной версии.",
    emptyTitle: "ДЗ пока не выдано",
    emptyHint: "Когда учитель выдаст ДЗ, оно появится здесь."
  },
  homework: {
    backToAll: "← Ко всем ДЗ",
    deadlineUntil: "Дедлайн до {date}",
    solvedOf: "Выполнено {solved} из {total}",
    numbers: "Номера"
  },
  info: {
    kicker: "Общая инфа",
    title: "Баллы и разбалловка"
  },
  lesson: {
    kicker: "Классная работа",
    title: "Урок",
    noLessonTitle: "Сейчас урока нет",
    upcoming:
      "Ближайшее занятие «{title}» — {date}{group}. Когда урок начнётся, здесь появится классная работа.",
    noUpcoming: "Когда учитель назначит занятие и оно начнётся, здесь появится классная работа.",
    autoRefresh: "Перезагружать страницу не нужно — урок откроется сам."
  },
  number: {
    backToHomeworks: "← К моим ДЗ",
    title: "Номер {number}"
  },
  theory: {
    kicker: "Теория",
    title: "Теория по темам",
    emptyTitle: "Файлов теории пока нет.",
    emptyHint: "Как только учитель прикрепит теорию к темам, она появится здесь."
  },
  deadlineList: {
    doneBadge: "Выполнено",
    overdueBadge: "Просрочено",
    emptyDefault: "На эту дату дедлайнов нет.",
    progressDone: "ДЗ выполнено полностью",
    progressNotStarted: "ДЗ ещё не начато",
    progress: "Прогресс ДЗ: {percent}%",
    meta: "ДЗ до {date} · Выполнено {solved} из {total}",
    open: "Открыть ДЗ"
  },
  calendar: {
    prev: "← Назад",
    next: "Вперёд →",
    popoverKicker: "Дедлайн по ДЗ",
    emptyDay: "На этот день дедлайн не назначен.",
    legendDeadline: "Дедлайн ДЗ",
    legendIncomplete: "Есть невыполненные номера",
    legendToday: "Сегодня"
  },
  upcoming: {
    title: "Ближайшие ДЗ",
    whatsNext: "Что дальше",
    empty: "Пока нет назначенных ДЗ."
  },
  statusBadge: {
    unmarked: "Не отмечено"
  },
  examInfo: {
    ege: "ЕГЭ",
    oge: "ОГЭ",
    tablistAria: "Экзамен",
    scaleTitle: "Первичные → тестовые",
    tasksTitle: "Сколько даёт каждое задание",
    gradesTitle: "Оценка по первичным",
    grade: "Оценка {grade}",
    points: "баллов",
    egeTasks: [
      "№ 1–12 — по 1 первичному баллу",
      "№ 13, 15, 16 — по 2 первичных балла",
      "№ 14 и 17 — по 3 первичных балла",
      "№ 18 и 19 — по 4 первичных балла"
    ],
    ogeTasks: [
      "№ 1–19 (часть 1) — по 1 первичному баллу",
      "№ 20–25 (часть 2, развёрнутый ответ) — по 2 первичных балла"
    ],
    ogeGrade3Note: "из них не меньше 2 баллов за геометрию (№ 15–19, 23–25)"
  },
  submissions: {
    deadlineUntil: "ДЗ до {date} · ",
    solvedOf: "Выполнено {solved} из {total}",
    photos: " · Фото: {count}",
    open: "Открыть ДЗ",
    numberAria: "№ {number} — {status}",
    numberUnmarked: "номер ещё не отмечен",
    allDone: "Все ДЗ выполнены — новых пока нет.",
    archived: "Выполненные ДЗ ({count})"
  },
  numberCard: {
    title: "Номер {number}",
    noteSaveFailed: "Заметка не сохранилась.",
    statusHint: "Статус выставляется автоматической проверкой решения или учителем.",
    condition: "Условие",
    note: "Заметка",
    saving: "Сохраняем…",
    saved: "Сохранено",
    notePlaceholder: "Заметка для себя: что не понял, что спросить у учителя…",
    noteAria: "Заметка к номеру {number}"
  },
  notifications: {
    justNow: "только что",
    minutesAgo: "{n} мин назад",
    today: "сегодня, {time}",
    dateTime: "{date}, {time}",
    aria: "Уведомления",
    ariaUnread: "Уведомления: {count} непрочитанных",
    title: "Уведомления",
    markAllRead: "Прочитать все",
    empty: "Уведомлений нет"
  },
  check: {
    verdicts: {
      CORRECT: "Верно",
      INCORRECT: "Перерешай",
      UNCERTAIN: "Не распознано — проверит учитель"
    },
    startFailed: "Не удалось запустить проверку.",
    title: "Автоматическая проверка",
    subtitle: "Сверит фото с эталонными ответами",
    needPhotos: "Сначала прикрепите фото решения",
    running: "Проверяется…",
    starting: "Запускаем…",
    start: "Проверить решение",
    statusRunning: "Проверка решения выполняется.",
    statusDone: "Проверка завершена. Верно: {correct}, перерешать: {incorrect}, на проверке учителя: {uncertain}.",
    statusDoneEmpty:
      "На этих фото не нашлось ни одного номера из задания. Фото ушли в историю проверок — прикрепите следующую партию.",
    statusFailed: "Проверка не удалась.",
    runningHint: "Решение проверяется — обычно это занимает до минуты. Страница обновится сама.",
    pollBroken: "Не получается узнать статус проверки — соединение с сервером прерывается. Обновите страницу через минуту.",
    checkedAt: "Проверено: {date}",
    correctCount: "Верно {n}",
    incorrectCount: "Перерешать {n}",
    uncertainCount: "На проверке учителя {n}",
    answer: "Ответ: {answer}",
    redo: "Перерешать № {number}",
    redoHint: "Затем замените фото с решением и запустите проверку ещё раз."
  },
  checkErrors: {
    fallback:
      "Проверка не удалась — что-то сломалось на нашей стороне. Попробуйте ещё раз, а если не получится — напишите преподавателю.",
    interrupted: "Проверка прервалась. Отправьте решение на проверку ещё раз.",
    disabled: "Автоматическая проверка сейчас выключена. Покажите решение преподавателю.",
    timeout: "Проверка шла слишком долго и была остановлена. Подождите пару минут и запустите её ещё раз.",
    quota: "Лимит автоматических проверок пока исчерпан. Попробуйте позже или напишите преподавателю — он проверит вручную.",
    unavailable: "Сервис проверки сейчас недоступен или перегружен. Попробуйте ещё раз через несколько минут.",
    queue: "Сейчас слишком много проверок одновременно. Подождите пару минут и запустите проверку снова.",
    image: "Не получилось разобрать фото решения. Переснимите страницы при хорошем свете, без бликов, и загрузите заново."
  },
  uncertainComment: "Не удалось уверенно разобрать решение по фото. Покажи его учителю — он проверит вручную.",
  photos: {
    title: "Фото решений",
    subtitle: "Учитель увидит их при проверке",
    uploadFailed: "Не удалось загрузить фото.",
    deleteFailed: "Не удалось удалить фото.",
    uploading: "Загружаем…",
    limitReached: "Лимит партии — {max} фото. Отправьте их на проверку, после неё можно прикрепить следующие",
    dropHint: "Перетащите фото сюда или нажмите",
    dragTitle: "Отпустите файлы",
    successTitle: "Файлы добавлены",
    upTo: "До {max} фото на одну проверку · PNG или JPG. После проверки фото уходят в историю, и можно прикрепить следующие",
    inputAria: "Загрузить фото решения",
    deleteAria: "Удалить фото",
    deleteTitle: "Удалить фото?",
    deleteDescription: "Фото решения будет удалено. Это действие нельзя отменить."
  },
  lessonView: {
    results: {
      SOLVED: "Принято",
      PARTIAL: "С ошибками",
      NOT_SOLVED: "Перерешай",
      SKIPPED: "Не успел"
    },
    verdicts: {
      CORRECT: "Верно",
      INCORRECT: "Перерешай",
      UNCERTAIN: "Проверит учитель"
    },
    submitFailed: "Не удалось сдать решение.",
    checking: "Проверяется…",
    submittedAt: "сдано в {time}",
    uploading: "Загружаем…",
    resubmit: "Пересдать № {number}",
    submit: "Сдать фото № {number}",
    submitAria: "Сдать фото решения № {number}",
    upTo: "До {max} фото · PNG или JPG",
    summary:
      "Закрыто {closed} из {total} в основной части. Сдавайте решение фото — проверка подскажет результат, спорные номера посмотрит учитель.",
    pollBroken: "Не получается узнать статус проверки — соединение с сервером прерывается. Обновите страницу через минуту.",
    mainPart: "Основная часть",
    noItems: "Учитель ещё не собрал набор — подождите минуту и обновите страницу.",
    extraPart: "Дополнительная часть",
    extraLocked: "Откроется, когда будет закрыта основная часть",
    extraLockedHint: "Ещё {count} — и дополнительные задачи станут доступны.",
    problemForms: ["{n} номер", "{n} номера", "{n} номеров"]
  },
  weekly: {
    title: "Огонёк и ритм",
    flame: "Огонёк",
    daysShort: "{n} дн.",
    dayForms: ["{n} день", "{n} дня", "{n} дней"],
    solvedForms: ["{n} номер", "{n} номера", "{n} номеров"],
    noSolvedToday: "Без закрытых номеров",
    daysToGo: "Ещё {days}",
    maxColor: "Максимальный цвет",
    goalHint: "до нового цвета огонька ({days})",
    streakHeadline: "{days} подряд",
    igniteFirst: "Зажгите первый день",
    todayDone: "Сегодня сделано",
    nextGoal: "Следующая цель",
    week: "За неделю",
    weekSummary: "{solved} закрыто за последние 7 дней.",
    dayActiveAria: "{day}: закрыто номеров — {count}",
    dayEmptyAria: "{day}: нет закрытых номеров"
  },
  fileCard: {
    openInBrowser: "Открыть в браузере",
    // Та же кнопка в узкой карточке, где длинная подпись не помещается.
    openShort: "Открыть файл",
    download: "Скачать файл",
    notUploaded: "Файл пока не загружен.",
    previewHidden: "Предпросмотр скрыт. Файл можно открыть или скачать.",
    docxHint: "Для DOCX встроенный предпросмотр зависит от браузера."
  },
  pdf: {
    error: "Не удалось показать предпросмотр. Откройте файл кнопкой выше.",
    loading: "Загружаем предпросмотр…",
    aria: "Предпросмотр: {name}"
  },
  fullscreen: {
    open: "Открыть",
    dialogAria: "Предпросмотр файла {name}",
    download: "Скачать файл",
    closeAria: "Закрыть предпросмотр",
    close: "Закрыть",
    iframeTitle: "Предпросмотр: {name}"
  }
};

export const studentEn: typeof studentRu = {
  weekdaysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  deadlines: {
    kicker: "Deadlines",
    title: "Homework calendar"
  },
  homeworks: {
    kicker: "Homework",
    title: "My homework",
    migrationNotice: "The homework section will appear once the database is updated to the latest version.",
    emptyTitle: "No homework yet",
    emptyHint: "Homework your teacher assigns will show up here."
  },
  homework: {
    backToAll: "← All homework",
    deadlineUntil: "Due {date}",
    solvedOf: "{solved} of {total} done",
    numbers: "Problems"
  },
  info: {
    kicker: "General info",
    title: "Scores and grading"
  },
  lesson: {
    kicker: "Classwork",
    title: "Lesson",
    noLessonTitle: "No lesson right now",
    upcoming: "Next lesson: “{title}” — {date}{group}. Classwork will appear here once the lesson starts.",
    noUpcoming: "Once your teacher schedules a lesson and it starts, classwork will appear here.",
    autoRefresh: "No need to reload — the lesson will open on its own."
  },
  number: {
    backToHomeworks: "← My homework",
    title: "Problem {number}"
  },
  theory: {
    kicker: "Theory",
    title: "Theory by topic",
    emptyTitle: "No theory files yet.",
    emptyHint: "As soon as your teacher attaches theory to a topic, it will appear here."
  },
  deadlineList: {
    doneBadge: "Done",
    overdueBadge: "Overdue",
    emptyDefault: "No deadlines on this date.",
    progressDone: "Homework fully done",
    progressNotStarted: "Homework not started",
    progress: "Progress: {percent}%",
    meta: "Due {date} · {solved} of {total} done",
    open: "Open homework"
  },
  calendar: {
    prev: "← Back",
    next: "Next →",
    popoverKicker: "Homework deadline",
    emptyDay: "No deadline on this day.",
    legendDeadline: "Homework deadline",
    legendIncomplete: "Has unfinished problems",
    legendToday: "Today"
  },
  upcoming: {
    title: "Upcoming homework",
    whatsNext: "What's next",
    empty: "No homework assigned yet."
  },
  statusBadge: {
    unmarked: "Not marked"
  },
  examInfo: {
    ege: "EGE",
    oge: "OGE",
    tablistAria: "Exam",
    scaleTitle: "Raw → scaled score",
    tasksTitle: "Points per task",
    gradesTitle: "Grade by raw score",
    grade: "Grade {grade}",
    points: "points",
    egeTasks: [
      "Tasks 1–12 — 1 raw point each",
      "Tasks 13, 15, 16 — 2 raw points each",
      "Tasks 14 and 17 — 3 raw points each",
      "Tasks 18 and 19 — 4 raw points each"
    ],
    ogeTasks: [
      "Tasks 1–19 (part 1) — 1 raw point each",
      "Tasks 20–25 (part 2, full solution) — 2 raw points each"
    ],
    ogeGrade3Note: "with at least 2 points from geometry (tasks 15–19, 23–25)"
  },
  submissions: {
    deadlineUntil: "Due {date} · ",
    solvedOf: "{solved} of {total} done",
    photos: " · Photos: {count}",
    open: "Open homework",
    numberAria: "No. {number} — {status}",
    numberUnmarked: "not marked yet",
    allDone: "All homework is done — nothing new yet.",
    archived: "Completed homework ({count})"
  },
  numberCard: {
    title: "Problem {number}",
    noteSaveFailed: "Could not save the note.",
    statusHint: "The status is set by the AI check or by your teacher.",
    condition: "Problem statement",
    note: "Note",
    saving: "Saving…",
    saved: "Saved",
    notePlaceholder: "A note to yourself: what's unclear, what to ask the teacher…",
    noteAria: "Note for problem {number}"
  },
  notifications: {
    justNow: "just now",
    minutesAgo: "{n} min ago",
    today: "today, {time}",
    dateTime: "{date}, {time}",
    aria: "Notifications",
    ariaUnread: "Notifications: {count} unread",
    title: "Notifications",
    markAllRead: "Mark all as read",
    empty: "No notifications"
  },
  check: {
    verdicts: {
      CORRECT: "Correct",
      INCORRECT: "Redo",
      UNCERTAIN: "Not recognised — teacher will check"
    },
    startFailed: "Could not start the check.",
    title: "AI check",
    subtitle: "Compares your photos with the answer key",
    needPhotos: "Attach solution photos first",
    running: "Checking…",
    starting: "Starting…",
    start: "Check solution",
    statusRunning: "Solution check in progress.",
    statusDone: "Check finished. Correct: {correct}, redo: {incorrect}, under teacher review: {uncertain}.",
    statusDoneEmpty:
      "None of the assigned problems were found in these photos. They went to the check history — attach the next batch.",
    statusFailed: "Check failed.",
    runningHint: "Checking your solution — this usually takes up to a minute. The page refreshes on its own.",
    pollBroken: "Can't get the check status — the connection to the server keeps dropping. Reload the page in a minute.",
    checkedAt: "Checked: {date}",
    correctCount: "Correct {n}",
    incorrectCount: "Redo {n}",
    uncertainCount: "Under teacher review {n}",
    answer: "Answer: {answer}",
    redo: "Redo No. {number}",
    redoHint: "Then replace the solution photo and run the check again."
  },
  checkErrors: {
    fallback: "The check failed — something broke on our side. Try again, and if it still fails, message your teacher.",
    interrupted: "The check was interrupted. Send your solution for checking again.",
    disabled: "Automatic checking is turned off right now. Show your solution to your teacher.",
    timeout: "The check took too long and was stopped. Wait a couple of minutes and run it again.",
    quota: "The AI check limit has been reached for now. Try later or message your teacher — they'll check it by hand.",
    unavailable: "The check service is unavailable or overloaded right now. Try again in a few minutes.",
    queue: "Too many checks are running at once. Wait a couple of minutes and start the check again.",
    image: "Could not read the solution photos. Retake the pages in good light, without glare, and upload them again."
  },
  uncertainComment: "Could not confidently read the solution from the photo. Show it to your teacher — they'll check it by hand.",
  photos: {
    title: "Solution photos",
    subtitle: "Your teacher will see them when reviewing",
    uploadFailed: "Could not upload the photos.",
    deleteFailed: "Could not delete the photo.",
    uploading: "Uploading…",
    limitReached: "Batch limit — {max} photos. Send them for a check; after it you can attach the next ones",
    dropHint: "Drop photos here or click",
    dragTitle: "Release to upload",
    successTitle: "Files added",
    upTo: "Up to {max} photos per check · PNG or JPG. After the check the photos move to history and you can attach the next ones",
    inputAria: "Upload solution photos",
    deleteAria: "Delete photo",
    deleteTitle: "Delete photo?",
    deleteDescription: "The solution photo will be deleted. This can't be undone."
  },
  lessonView: {
    results: {
      SOLVED: "Accepted",
      PARTIAL: "With mistakes",
      NOT_SOLVED: "Redo",
      SKIPPED: "Not reached"
    },
    verdicts: {
      CORRECT: "Correct",
      INCORRECT: "Redo",
      UNCERTAIN: "Teacher will check"
    },
    submitFailed: "Could not submit the solution.",
    checking: "Checking…",
    submittedAt: "submitted at {time}",
    uploading: "Uploading…",
    resubmit: "Resubmit No. {number}",
    submit: "Submit photo for No. {number}",
    submitAria: "Submit solution photo for No. {number}",
    upTo: "Up to {max} photos · PNG or JPG",
    summary:
      "{closed} of {total} closed in the main part. Submit solutions as photos — the check shows the result, and your teacher reviews anything unclear.",
    pollBroken: "Can't get the check status — the connection to the server keeps dropping. Reload the page in a minute.",
    mainPart: "Main part",
    noItems: "Your teacher hasn't put the set together yet — wait a minute and reload the page.",
    extraPart: "Extra part",
    extraLocked: "Unlocks once the main part is closed",
    extraLockedHint: "{count} more — and the extra problems unlock.",
    problemForms: ["{n} problem", "{n} problems"]
  },
  weekly: {
    title: "Streak and rhythm",
    flame: "Streak",
    daysShort: "{n} d",
    dayForms: ["{n} day", "{n} days"],
    solvedForms: ["{n} problem", "{n} problems"],
    noSolvedToday: "No problems closed",
    daysToGo: "{days} to go",
    maxColor: "Top colour reached",
    goalHint: "until the next flame colour ({days})",
    streakHeadline: "{days} in a row",
    igniteFirst: "Light up your first day",
    todayDone: "Done today",
    nextGoal: "Next goal",
    week: "This week",
    weekSummary: "{solved} closed in the last 7 days.",
    dayActiveAria: "{day}: problems closed — {count}",
    dayEmptyAria: "{day}: no problems closed"
  },
  fileCard: {
    openInBrowser: "Open in browser",
    openShort: "Open file",
    download: "Download file",
    notUploaded: "No file uploaded yet.",
    previewHidden: "Preview hidden. You can open or download the file.",
    docxHint: "Built-in DOCX preview depends on your browser."
  },
  pdf: {
    error: "Could not show the preview. Open the file with the button above.",
    loading: "Loading preview…",
    aria: "Preview: {name}"
  },
  fullscreen: {
    open: "Open",
    dialogAria: "File preview: {name}",
    download: "Download file",
    closeAria: "Close preview",
    close: "Close",
    iframeTitle: "Preview: {name}"
  }
};
