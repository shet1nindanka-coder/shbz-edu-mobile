// Словарь раздела учеников и аккаунтов: /teacher/students/**, /teacher/accounts,
// проверка и выдача ДЗ, создание аккаунтов, сброс паролей.
// Обе языковые версии рядом — английская типизирована русской, лишний или
// пропущенный ключ не соберётся. Подстановки — {имя}, формы по числу — массивы
// (ru: 1/2/5, en: 1/2), см. format() и plural() в lib/i18n.
export const studentsRu = {
  // /teacher/students — список учеников и форма добавления.
  list: {
    kicker: "Ученики",
    title: "Аккаунты и прогресс",
    addStudent: "Добавить ученика",
    currentStudents: "Текущие ученики",
    empty: "Пока ни одного ученика не добавлено.",
    colStudent: "Ученик",
    colLogin: "Логин",
    colActions: "Действия",
    loginLabel: "Логин",
    viewProgress: "Смотреть прогресс",
    delete: "Удалить",
    deleteTitle: "Удалить ученика?",
    deleteBefore: "Аккаунт ",
    deleteAfter:
      " будет удалён вместе со всеми его ДЗ, фото решений, историей проверок, статусами по номерам и дедлайнами. Это действие нельзя отменить.",
    notices: {
      studentCreated: "Новый ученик успешно добавлен. Ему уже можно входить в систему.",
      studentInvalid: "Укажите имя, логин и пароль: минимум 8 символов, обязательно буквы и цифры.",
      studentExists: "Ученик с таким логином уже существует.",
      studentSave: "Не удалось создать ученика. Проверьте подключение к PostgreSQL и повторите попытку.",
      studentRateLimited: "Слишком много попыток создать учеников за короткое время. Подождите несколько минут.",
      studentDeleted: "Ученик удалён. Список и статистика уже обновлены.",
      studentDelete: "Не удалось удалить ученика. Повторите попытку ещё раз.",
      studentDeleteMissing: "Такого ученика уже нет в системе.",
      passwordReset: "Пароль ученика обновлён, все его сессии завершены. Передайте ученику новый пароль.",
      passwordInvalid: "Новый пароль не подходит: минимум 8 символов, обязательно буквы и цифры.",
      passwordMissing: "Такого ученика уже нет в системе.",
      passwordSave: "Не удалось сменить пароль. Повторите попытку ещё раз.",
      passwordRateLimited: "Слишком много смен пароля за короткое время. Подождите несколько минут."
    }
  },
  // Шапка карточки ученика и вкладки.
  detail: {
    backToAll: "← Ко всем ученикам",
    report7d: "Отчёт: 7 дней",
    report30d: "30 дней",
    reportYear: "Учебный год",
    deleteStudent: "Удалить ученика",
    tabsAria: "Разделы ученика",
    tabReview: "Проверка ДЗ",
    tabReviewWithCount: "Проверка ДЗ · {n}",
    tabAssign: "Выдать ДЗ",
    tabLessons: "Занятия",
    // Узкий телефон (TeacherStudentTabs): полные подписи не помещаются в одну строку сегмента.
    tabReviewShort: "Проверка",
    tabReviewShortWithCount: "Проверка · {n}",
    tabAssignShort: "Выдать"
  },
  // Вкладка «Проверка ДЗ»: страница и список проверки.
  review: {
    title: "Проверка домашних заданий",
    dbOutdated: "Раздел ДЗ появится после обновления базы данных до актуальной версии.",
    emptyTitle: "ДЗ пока не выдано",
    emptyHint: "Выдайте первое ДЗ во вкладке «Выдать ДЗ».",
    verdict: {
      CORRECT: { chip: "ИИ: Верно", short: "верно" },
      INCORRECT: { chip: "ИИ: Ошибка", short: "ошибка" },
      UNCERTAIN: { chip: "ИИ: на проверке", short: "на проверке" }
    },
    runForms: ["{n} запуск", "{n} запуска", "{n} запусков"],
    errors: {
      saveStatus: "Не удалось сохранить статус.",
      applyVerdicts: "Не удалось применить вердикты.",
      undoVerdicts: "Не удалось отменить применение вердиктов.",
      cancel: "Не удалось отменить ДЗ."
    },
    verdictsAccepted: "Вердикты ИИ приняты: {n}",
    injectionTitle: "На фото найдена надпись-инструкция для ИИ",
    injectionUnreliable: "Вердикты этой проверки могут быть недостоверны.",
    completed: "Выполнено",
    overdue: "Просрочено",
    issuedAt: "Выдано {date}",
    deadlineUntil: "дедлайн до {date}",
    cancelLabel: "Отменить ДЗ",
    cancelTitle: "Отменить ДЗ?",
    cancelLine1: "ДЗ будет удалено, дедлайны сняты с его номеров.",
    cancelFilesBefore: "Вместе с ним ",
    cancelFilesStrong: "безвозвратно удалятся присланные учеником файлы",
    cancelFilesPhotos: " фото решений — {n}",
    cancelFilesChecks: " результаты ИИ-проверок — {n}",
    cancelFilesAfter: ". Скачать их потом будет неоткуда.",
    cancelLine3: "Выставленные статусы по номерам сохранятся. Это действие нельзя отменить.",
    cancelConfirm: "Да, отменить",
    cancelPending: "Отменяем…",
    solved: "Решено {solved}/{total}",
    red: "Красные",
    unmarked: "Не отмечено {n}",
    photosTitle: "Фото, ещё не отправленные на проверку ({n})",
    lastAutoCheck: " · посл. автопроверка {date}",
    noPhotos: "Ученик пока не прикрепил фото решения.",
    acceptVerdicts: "Принять вердикты ИИ",
    acceptVerdictsHint: "Верно → Зелёный (после ошибок — Жёлтый), Ошибка → Красный; «на проверке» не трогаем.",
    numbers: "Номера",
    number: "№ {n}",
    recognized: "Распознано: {answer}",
    diagnosticsSummary: "Служебная диагностика · видно только вам",
    copySuspected: "Похоже на списанное",
    injectionNote: "Надпись-инструкция на фото",
    historyTitle: "История проверок",
    current: "Текущая",
    failed: "Сбой",
    running: "Выполняется",
    countCorrect: "Верно {n}",
    countIncorrect: "Ошибка {n}",
    countUncertain: "На проверке {n}",
    showVerdicts: "Показать вердикты по номерам",
    attemptPhotos: "Фото этой попытки",
    showDiagnostics: "Показать служебную диагностику",
    hideDiagnostics: "Скрыть диагностику на время урока",
    completedHomeworks: "Выполненные ДЗ ({n})",
    undo: "Отменить"
  },
  // Вкладка «Выдать ДЗ»: страница и доска выбора номеров.
  assign: {
    title: "Выдать домашнее задание",
    dbOutdated: "Выдача ДЗ появится здесь после обновления базы данных до актуальной версии.",
    noTopics: "Темы пока не добавлены",
    selectNumbersAndDeadline: "Выберите номера и укажите дедлайн.",
    assignFailed: "Не удалось выдать ДЗ.",
    assigned: "ДЗ выдано. Посмотреть его можно во вкладке «Проверка ДЗ».",
    topic: "Тема",
    topicOption: "{title} · {count}",
    numberForms: ["{n} номер", "{n} номера", "{n} номеров"],
    selected: "Выбрано: {n}",
    titlePlaceholder: "Название (необязательно)",
    deadlinePlaceholder: "Дедлайн",
    assigning: "Выдаем…",
    assign: "Выдать ДЗ",
    pickWithAi: "Подобрать ИИ",
    clearSelection: "Снять выбор",
    steps: "1. Кликните по номерам ниже, чтобы выбрать их · 2. Задайте дедлайн · 3. Нажмите «Выдать ДЗ».",
    alreadyAssigned: "Уже в ДЗ с дедлайном"
  },
  // Вкладка «Занятия».
  lessons: {
    title: "Занятия и итоги",
    description:
      "Проведённые и запланированные занятия ученика. Отмечайте итоги светофором, правьте наборы и пересобирайте подбор.",
    status: {
      PLANNED: "Запланирован",
      ACTIVE: "Идёт",
      FINISHED: "Завершён"
    },
    errors: {
      saveResult: "Не удалось сохранить итог.",
      saveItems: "Не удалось сохранить набор.",
      regenerate: "Не удалось запустить пересборку."
    },
    composeHintEmpty: "Занятий пока не было — соберите первое: набор и итоги появятся здесь.",
    composeHint: "Пустое занятие: ИИ-подбор или ручной выбор номеров.",
    number: "№ {n}",
    removeAria: "Убрать № {n} из набора",
    removeTitle: "Убрать из набора",
    minutes: "{n} мин",
    aiPicking: "ИИ подбирает задания…",
    stalePlan: "План не собрался: задача, похоже, потерялась при перезапуске сервера. Нажмите «Повторить» — соберём заново.",
    retry: "Повторить",
    mainPart: "Основная часть",
    howSolved: "Как решил на уроке?",
    extraPart: "Дополнительно — если успел",
    emptySet: "Набор задач пуст — добавьте номера вручную или запустите пересборку.",
    assignFromResults: "Выдать ДЗ по итогам",
    downloadPdf: "Скачать PDF",
    openLesson: "Открыть занятие",
    hideAdd: "Скрыть добавление",
    addNumber: "Добавить номер"
  },
  // Страница «Составить занятие».
  compose: {
    title: "Составить занятие",
    description: "По умолчанию задания подбирает ИИ; кнопкой можно переключиться на ручной выбор номеров.",
    noTopics: "Темы пока не добавлены"
  },
  // Кнопки итога урока «решил / с ошибками / не решил / не успел».
  lessonResult: {
    aria: "Итог урока",
    SOLVED: "решил",
    PARTIAL: "с ошибками",
    NOT_SOLVED: "не решил",
    SKIPPED: "не успел"
  },
  // Форма «Добавить ученика» (учитель).
  createForm: {
    name: "Имя ученика",
    namePlaceholder: "Мария Смирнова",
    login: "Логин ученика",
    loginPlaceholder: "maria@example.com",
    password: "Пароль",
    passwordPlaceholder: "Минимум 8 символов",
    passwordOk: "Пароль подходит.",
    creating: "Создаём…",
    submit: "Добавить ученика",
    createdTitle: "Аккаунт ученика создан"
  },
  // Окно с логином и паролем после создания аккаунта.
  credentials: {
    kicker: "Аккаунт создан",
    intro: "{name} уже может входить на платформу. Пароль показывается только сейчас — восстановить его позже нельзя, можно только задать новый.",
    messageTitle: "Сообщение для передачи",
    site: "Сайт",
    login: "Логин",
    password: "Пароль",
    copyLineTitle: "Скопировать: {label}",
    copiedMessage: "Скопировано — можно вставлять в мессенджер.",
    copiedLine: "{label} скопирован — можно вставлять.",
    copied: "Скопировано",
    copy: "Скопировать",
    done: "Готово"
  },
  // Меню с предложенным паролем.
  passwordSuggest: {
    aria: "Предложенный пароль",
    title: "Предлагаем пароль",
    pickHint: "Нажмите, чтобы подставить",
    another: "Другой вариант",
    custom: "Ввести свой"
  },
  // Модалка «Сменить пароль» для ученика и учителя.
  passwordReset: {
    button: "Сменить пароль",
    kicker: "Смена пароля",
    heading: "Новый пароль для «{name}»",
    student: {
      dialogLabel: "Сменить пароль ученика",
      consequences:
        "Все активные сессии ученика будут завершены — войти можно будет только с новым паролем. Прогресс, ДЗ и история проверок не изменятся."
    },
    teacher: {
      dialogLabel: "Сменить пароль учителя",
      consequences:
        "Все активные сессии учителя будут завершены — войти можно будет только с новым паролем. Его ученики, темы и история проверок не изменятся."
    },
    newPassword: "Новый пароль",
    newPasswordPlaceholder: "От 8 символов, буквы и цифры",
    passwordOk: "Пароль подходит. Запишите его — после сохранения он больше нигде не показывается.",
    cancel: "Отмена",
    saving: "Сохраняем…",
    submit: "Сменить пароль"
  },
  // /teacher/accounts — вкладка разработчика «аккаунты».
  accounts: {
    kicker: "Аккаунты",
    title: "Создание аккаунтов",
    newAccount: "Новый аккаунт",
    directory: "Учителя и ученики",
    notices: {
      studentCreated: "Аккаунт ученика создан. Ему уже можно входить в систему.",
      teacherCreated: "Аккаунт учителя создан. Ему уже можно входить в систему.",
      invalid: "Укажите роль, учителя (для ученика), имя, логин и пароль: минимум 8 символов, обязательно буквы и цифры.",
      exists: "Аккаунт с таким логином уже существует.",
      save: "Не удалось создать аккаунт. Проверьте подключение к PostgreSQL и повторите попытку.",
      rateLimited: "Слишком много попыток создать аккаунты за короткое время. Подождите несколько минут.",
      ownerChanged: "Привязка учеников к учителям сохранена. Ученики уже видны новым учителям.",
      ownerInvalid: "Не удалось сменить учителя: часть учеников или учителей не найдена. Обновите страницу.",
      ownerSave: "Не удалось сменить учителя. Повторите попытку ещё раз.",
      passwordReset: "Пароль ученика обновлён, все его сессии завершены. Передайте ученику новый пароль.",
      passwordInvalid: "Новый пароль не подходит: минимум 8 символов, обязательно буквы и цифры.",
      passwordMissing: "Такого ученика уже нет в системе.",
      passwordSave: "Не удалось сменить пароль. Повторите попытку ещё раз.",
      passwordRateLimited: "Слишком много смен пароля за короткое время. Подождите несколько минут.",
      teacherDeleted: "Учитель удалён. Его ученики переведены на выбранного учителя.",
      studentDeleted: "Ученик удалён вместе со всеми его ДЗ, фото решений и историей проверок.",
      studentDeleteMissing: "Такого ученика уже нет в системе. Обновите страницу.",
      studentDelete: "Не удалось удалить ученика. Повторите попытку ещё раз.",
      teacherMissing: "Такого учителя уже нет в системе. Обновите страницу.",
      teacherTransfer: "Учитель не удалён: сначала выберите, кому передать его учеников.",
      teacherDelete: "Не удалось удалить учителя. Повторите попытку ещё раз.",
      teacherPasswordReset: "Пароль учителя обновлён, все его сессии завершены. Передайте учителю новый пароль.",
      teacherPasswordInvalid: "Новый пароль не подходит: минимум 8 символов, обязательно буквы и цифры.",
      teacherPasswordMissing: "Такого учителя уже нет в системе.",
      teacherPasswordSave: "Не удалось сменить пароль учителя. Повторите попытку ещё раз.",
      teacherPasswordRateLimited: "Слишком много смен пароля за короткое время. Подождите несколько минут."
    }
  },
  // Форма создания аккаунта разработчиком.
  accountForm: {
    roleAria: "Роль нового аккаунта",
    roleStudent: "Ученик",
    roleTeacher: "Учитель",
    ownerTeacher: "Учитель ученика",
    selectTeacher: "Выберите учителя",
    createTeacherFirst: "Сначала создайте учителя",
    nameStudent: "Имя ученика",
    nameTeacher: "Имя учителя",
    loginStudent: "Логин ученика",
    loginTeacher: "Логин учителя",
    creating: "Создаём…",
    createTeacher: "Создать учителя",
    createStudent: "Создать ученика"
  },
  // Блок «Учителя и ученики»: вкладки и поиск.
  directory: {
    tabsAria: "Учителя и ученики",
    teachers: "Учителя",
    students: "Ученики",
    tabWithCount: "{label} · {n}",
    searchSr: "Поиск по аккаунтам",
    searchTeachers: "Имя или логин учителя",
    searchStudents: "Имя или логин ученика",
    searchAria: "Поиск по имени или логину"
  },
  // Список учеников разработчика: смена учителя-владельца.
  studentsManager: {
    loginLabel: "Логин",
    noOwner: "Без учителя — не виден ни одному учителю. Назначьте владельца.",
    selectTeacher: "Выберите учителя",
    createTeacherFirst: "Сначала создайте учителя",
    teacherOfAria: "Учитель ученика {name}",
    dirty: "Изменено — не забудьте сохранить.",
    delete: "Удалить",
    deleteTitle: "Удалить ученика?",
    empty: "Пока ни одного ученика не создано.",
    notFound: "Никого не нашли.",
    notFoundHint: "Проверьте запрос — поиск идёт по имени и логину ученика.",
    changedFor: "Учитель изменён у {students} — изменения ещё не сохранены.",
    changedStudentForms: ["{n} ученика", "{n} учеников", "{n} учеников"],
    pickHint: "Выберите учителя в нужных строках и сохраните изменения.",
    reset: "Отменить",
    saving: "Сохраняем…",
    save: "Сохранить изменения"
  },
  // Список учителей разработчика: удаление с передачей учеников.
  teachersManager: {
    loginLabel: "Логин",
    studentForms: ["{n} ученик", "{n} ученика", "{n} учеников"],
    noStudents: "Без учеников",
    delete: "Удалить",
    dialogAria: "Удалить учителя",
    kicker: "Удаление аккаунта",
    heading: "Удалить учителя «{name}»?",
    description: "Аккаунт и все его сессии будут удалены безвозвратно. Загруженные им файлы и история проверок ДЗ сохранятся.",
    cascadeBefore: "Вместе с учителем удалятся его ",
    lessonForms: ["{n} занятие", "{n} занятия", "{n} занятий"],
    testForms: ["{n} тест", "{n} теста", "{n} тестов"],
    cascadeAnd: " и ",
    cascadeAfter: ". Это действие нельзя отменить.",
    // {lessons} — «12 занятий» по lessonForms.
    lessonsTransfer:
      "Его {lessons} и группы перейдут новому учителю вместе с учениками — посещаемость и итоги сохранятся.",
    transferLabel: "Кому передать учеников ({n})",
    selectTeacher: "Выберите учителя",
    transferAria: "Новый учитель для учеников",
    onlyTeacher:
      "Это единственный учитель, а у него есть ученики. Сначала создайте другого учителя — иначе ученики останутся без владельца и пропадут из всех списков.",
    cancel: "Отмена",
    deleting: "Удаляем…",
    confirm: "Удалить учителя",
    empty: "Пока ни одного учителя не создано.",
    notFound: "Никого не нашли.",
    notFoundHint: "Проверьте запрос — поиск идёт по имени и логину учителя."
  },
  // Фильтр и график динамики на странице статистики.
  timelineFilter: {
    label: "Ученик",
    aria: "Фильтр статистики по ученику",
    all: "Все ученики"
  },
  timelineChart: {
    period7d: "7 дней",
    period4w: "4 недели",
    period8w: "8 недель",
    closed: "Закрыто:",
    red: "Красных:",
    onlyStudent: "Показываем динамику только для ученика {name}.",
    allStudents: "Показываем общий темп по всем ученикам за выбранный период.",
    pointTitle: "{label}: закрыто {n}",
    empty: "Пока нет данных за выбранный период."
  },
  // lib/progress-timeline: заголовки периодов и подписи тренда.
  timeline: {
    periods: {
      "7d": {
        title: "За последнюю неделю",
        description: "Показывает, как менялся прогресс по дням за последние 7 дней.",
        comparison: "к прошлой неделе"
      },
      "4w": {
        title: "За последние 4 недели",
        description: "Помогает увидеть темп прохождения по неделям за последний месяц.",
        comparison: "к прошлым 4 неделям"
      },
      "8w": {
        title: "По неделям за 8 недель",
        description: "Показывает общий темп и просадки по неделям за последние 8 недель.",
        comparison: "к предыдущим 8 неделям"
      }
    },
    trend: {
      noChange: "без изменений {comparison}",
      newActivity: "новая активность {comparison}",
      same: "на уровне {comparison}",
      delta: "{sign}{delta} закрыто ({sign}{percent}%) {comparison}"
    }
  },
  // Ответы server actions, которые форма показывает напрямую.
  actions: {
    createStudent: {
      invalid: "Укажите имя, логин и пароль: минимум 8 символов, обязательно буквы и цифры.",
      rateLimited: "Слишком много попыток создать учеников за короткое время. Подождите несколько минут.",
      save: "Не удалось создать ученика. Проверьте подключение к PostgreSQL и повторите попытку.",
      exists: "Ученик с таким логином уже существует.",
      created: "Ученик создан. Ему уже можно входить в систему."
    },
    createAccount: {
      invalid: "Укажите роль, учителя (для ученика), имя, логин и пароль: минимум 8 символов, буквы и цифры.",
      rateLimited: "Слишком много попыток создать аккаунты. Подождите несколько минут.",
      save: "Не удалось создать аккаунт. Проверьте подключение к PostgreSQL и повторите попытку.",
      teacherMissing: "Выбранный учитель не найден — обновите страницу и попробуйте снова.",
      exists: "Аккаунт с таким логином уже существует.",
      teacherCreated: "Аккаунт учителя создан.",
      studentCreated: "Аккаунт ученика создан."
    }
  }
};

export const studentsEn: typeof studentsRu = {
  list: {
    kicker: "Students",
    title: "Accounts and progress",
    addStudent: "Add a student",
    currentStudents: "Current students",
    empty: "No students added yet.",
    colStudent: "Student",
    colLogin: "Login",
    colActions: "Actions",
    loginLabel: "Login",
    viewProgress: "View progress",
    delete: "Delete",
    deleteTitle: "Delete this student?",
    deleteBefore: "The account ",
    deleteAfter:
      " will be deleted along with all of their homework, solution photos, check history, problem statuses and deadlines. This cannot be undone.",
    notices: {
      studentCreated: "New student added. They can sign in now.",
      studentInvalid: "Enter a name, a login and a password: at least 8 characters with both letters and digits.",
      studentExists: "A student with this login already exists.",
      studentSave: "Could not create the student. Check the PostgreSQL connection and try again.",
      studentRateLimited: "Too many students created in a short time. Wait a few minutes.",
      studentDeleted: "Student deleted. The list and statistics are already up to date.",
      studentDelete: "Could not delete the student. Please try again.",
      studentDeleteMissing: "This student no longer exists.",
      passwordReset: "The student's password has been updated and all their sessions ended. Pass the new password to the student.",
      passwordInvalid: "The new password is not valid: at least 8 characters with both letters and digits.",
      passwordMissing: "This student no longer exists.",
      passwordSave: "Could not change the password. Please try again.",
      passwordRateLimited: "Too many password changes in a short time. Wait a few minutes."
    }
  },
  detail: {
    backToAll: "← All students",
    report7d: "Report: 7 days",
    report30d: "30 days",
    reportYear: "School year",
    deleteStudent: "Delete student",
    tabsAria: "Student sections",
    tabReview: "Homework review",
    tabReviewWithCount: "Homework review · {n}",
    tabAssign: "Assign homework",
    tabLessons: "Lessons",
    tabReviewShort: "Review",
    tabReviewShortWithCount: "Review · {n}",
    tabAssignShort: "Assign"
  },
  review: {
    title: "Homework review",
    dbOutdated: "The homework section will appear once the database is updated to the latest version.",
    emptyTitle: "No homework assigned yet",
    emptyHint: "Assign the first homework in the “Assign homework” tab.",
    verdict: {
      CORRECT: { chip: "AI: correct", short: "correct" },
      INCORRECT: { chip: "AI: incorrect", short: "incorrect" },
      UNCERTAIN: { chip: "AI: under review", short: "under review" }
    },
    runForms: ["{n} run", "{n} runs"],
    errors: {
      saveStatus: "Could not save the status.",
      applyVerdicts: "Could not apply the verdicts.",
      undoVerdicts: "Could not undo the verdicts.",
      cancel: "Could not cancel the homework."
    },
    verdictsAccepted: "AI verdicts accepted: {n}",
    injectionTitle: "The photo contains an instruction aimed at the AI",
    injectionUnreliable: "The verdicts of this check may be unreliable.",
    completed: "Completed",
    overdue: "Overdue",
    issuedAt: "Assigned {date}",
    deadlineUntil: "due {date}",
    cancelLabel: "Cancel homework",
    cancelTitle: "Cancel this homework?",
    cancelLine1: "The homework will be deleted and the deadlines removed from its problems.",
    cancelFilesBefore: "Along with it, ",
    cancelFilesStrong: "the files sent by the student will be permanently deleted",
    cancelFilesPhotos: " solution photos — {n}",
    cancelFilesChecks: " AI check results — {n}",
    cancelFilesAfter: ". There will be no way to download them later.",
    cancelLine3: "Problem statuses already set will be kept. This cannot be undone.",
    cancelConfirm: "Yes, cancel",
    cancelPending: "Cancelling…",
    solved: "Solved {solved}/{total}",
    red: "Red",
    unmarked: "Unmarked {n}",
    photosTitle: "Photos not yet sent for a check ({n})",
    lastAutoCheck: " · last AI check {date}",
    noPhotos: "The student has not attached a solution photo yet.",
    acceptVerdicts: "Accept AI verdicts",
    acceptVerdictsHint: "Correct → green (yellow after mistakes), incorrect → red; “under review” is left as is.",
    numbers: "Problems",
    number: "No. {n}",
    recognized: "Recognised: {answer}",
    diagnosticsSummary: "Internal diagnostics · visible only to you",
    copySuspected: "Copying suspected",
    injectionNote: "Instruction found in the photo",
    historyTitle: "Check history",
    current: "Current",
    failed: "Failed",
    running: "Running",
    countCorrect: "Correct {n}",
    countIncorrect: "Incorrect {n}",
    countUncertain: "Under review {n}",
    showVerdicts: "Show verdicts by problem",
    attemptPhotos: "Photos from this attempt",
    showDiagnostics: "Show internal diagnostics",
    hideDiagnostics: "Hide diagnostics during the lesson",
    completedHomeworks: "Completed homework ({n})",
    undo: "Undo"
  },
  assign: {
    title: "Assign homework",
    dbOutdated: "Homework assignment will appear here once the database is updated to the latest version.",
    noTopics: "No topics added yet",
    selectNumbersAndDeadline: "Select problems and set a deadline.",
    assignFailed: "Could not assign the homework.",
    assigned: "Homework assigned. You can see it in the “Homework review” tab.",
    topic: "Topic",
    topicOption: "{title} · {count}",
    numberForms: ["{n} problem", "{n} problems"],
    selected: "Selected: {n}",
    titlePlaceholder: "Title (optional)",
    deadlinePlaceholder: "Deadline",
    assigning: "Assigning…",
    assign: "Assign homework",
    pickWithAi: "Pick with AI",
    clearSelection: "Clear selection",
    steps: "1. Click the problems below to select them · 2. Set a deadline · 3. Press “Assign homework”.",
    alreadyAssigned: "Already assigned with a deadline"
  },
  lessons: {
    title: "Lessons and results",
    description:
      "The student's past and upcoming lessons. Mark results with the traffic light, edit the problem sets and regenerate the selection.",
    status: {
      PLANNED: "Planned",
      ACTIVE: "In progress",
      FINISHED: "Finished"
    },
    errors: {
      saveResult: "Could not save the result.",
      saveItems: "Could not save the problem set.",
      regenerate: "Could not start regeneration."
    },
    composeHintEmpty: "No lessons yet — build the first one: the problem set and results will appear here.",
    composeHint: "Empty lesson: AI selection or manual problem choice.",
    number: "No. {n}",
    removeAria: "Remove No. {n} from the set",
    removeTitle: "Remove from the set",
    minutes: "{n} min",
    aiPicking: "AI is picking problems…",
    stalePlan: "The plan was not built: the job seems to have been lost on a server restart. Press “Retry” to build it again.",
    retry: "Retry",
    mainPart: "Main part",
    howSolved: "How did it go in the lesson?",
    extraPart: "Extra — if there is time",
    emptySet: "The problem set is empty — add problems manually or regenerate it.",
    assignFromResults: "Assign homework from results",
    downloadPdf: "Download PDF",
    openLesson: "Open lesson",
    hideAdd: "Hide adding",
    addNumber: "Add a problem"
  },
  compose: {
    title: "Compose a lesson",
    description: "By default the AI picks the problems; use the button to switch to manual selection.",
    noTopics: "No topics added yet"
  },
  lessonResult: {
    aria: "Lesson result",
    SOLVED: "solved",
    PARTIAL: "with mistakes",
    NOT_SOLVED: "not solved",
    SKIPPED: "not reached"
  },
  createForm: {
    name: "Student's name",
    namePlaceholder: "Maria Smirnova",
    login: "Student's login",
    loginPlaceholder: "maria@example.com",
    password: "Password",
    passwordPlaceholder: "At least 8 characters",
    passwordOk: "Password looks good.",
    creating: "Creating…",
    submit: "Add student",
    createdTitle: "Student account created"
  },
  credentials: {
    kicker: "Account created",
    intro: "{name} can sign in now. The password is shown only once — it cannot be recovered later, only replaced with a new one.",
    messageTitle: "Message to pass on",
    site: "Site",
    login: "Login",
    password: "Password",
    copyLineTitle: "Copy: {label}",
    copiedMessage: "Copied — paste it into a messenger.",
    copiedLine: "{label} copied — ready to paste.",
    copied: "Copied",
    copy: "Copy",
    done: "Done"
  },
  passwordSuggest: {
    aria: "Suggested password",
    title: "Suggested password",
    pickHint: "Click to use it",
    another: "Another one",
    custom: "Type my own"
  },
  passwordReset: {
    button: "Reset password",
    kicker: "Password reset",
    heading: "New password for “{name}”",
    student: {
      dialogLabel: "Reset the student's password",
      consequences:
        "All of the student's active sessions will end — they will only be able to sign in with the new password. Progress, homework and check history stay unchanged."
    },
    teacher: {
      dialogLabel: "Reset the teacher's password",
      consequences:
        "All of the teacher's active sessions will end — they will only be able to sign in with the new password. Their students, topics and check history stay unchanged."
    },
    newPassword: "New password",
    newPasswordPlaceholder: "8+ characters, letters and digits",
    passwordOk: "Password looks good. Write it down — it will not be shown anywhere after saving.",
    cancel: "Cancel",
    saving: "Saving…",
    submit: "Reset password"
  },
  accounts: {
    kicker: "Accounts",
    title: "Create accounts",
    newAccount: "New account",
    directory: "Teachers and students",
    notices: {
      studentCreated: "Student account created. They can sign in now.",
      teacherCreated: "Teacher account created. They can sign in now.",
      invalid: "Enter a role, a teacher (for a student), a name, a login and a password: at least 8 characters with both letters and digits.",
      exists: "An account with this login already exists.",
      save: "Could not create the account. Check the PostgreSQL connection and try again.",
      rateLimited: "Too many accounts created in a short time. Wait a few minutes.",
      ownerChanged: "Student-to-teacher assignments saved. The students are already visible to their new teachers.",
      ownerInvalid: "Could not change the teacher: some students or teachers were not found. Refresh the page.",
      ownerSave: "Could not change the teacher. Please try again.",
      passwordReset: "The student's password has been updated and all their sessions ended. Pass the new password to the student.",
      passwordInvalid: "The new password is not valid: at least 8 characters with both letters and digits.",
      passwordMissing: "This student no longer exists.",
      passwordSave: "Could not change the password. Please try again.",
      passwordRateLimited: "Too many password changes in a short time. Wait a few minutes.",
      teacherDeleted: "Teacher deleted. Their students were moved to the selected teacher.",
      studentDeleted: "Student deleted along with all of their homework, solution photos and check history.",
      studentDeleteMissing: "This student no longer exists. Refresh the page.",
      studentDelete: "Could not delete the student. Please try again.",
      teacherMissing: "This teacher no longer exists. Refresh the page.",
      teacherTransfer: "Teacher not deleted: first choose who takes over their students.",
      teacherDelete: "Could not delete the teacher. Please try again.",
      teacherPasswordReset: "The teacher's password has been updated and all their sessions ended. Pass the new password to the teacher.",
      teacherPasswordInvalid: "The new password is not valid: at least 8 characters with both letters and digits.",
      teacherPasswordMissing: "This teacher no longer exists.",
      teacherPasswordSave: "Could not change the teacher's password. Please try again.",
      teacherPasswordRateLimited: "Too many password changes in a short time. Wait a few minutes."
    }
  },
  accountForm: {
    roleAria: "Role of the new account",
    roleStudent: "Student",
    roleTeacher: "Teacher",
    ownerTeacher: "Student's teacher",
    selectTeacher: "Select a teacher",
    createTeacherFirst: "Create a teacher first",
    nameStudent: "Student's name",
    nameTeacher: "Teacher's name",
    loginStudent: "Student's login",
    loginTeacher: "Teacher's login",
    creating: "Creating…",
    createTeacher: "Create teacher",
    createStudent: "Create student"
  },
  directory: {
    tabsAria: "Teachers and students",
    teachers: "Teachers",
    students: "Students",
    tabWithCount: "{label} · {n}",
    searchSr: "Search accounts",
    searchTeachers: "Teacher's name or login",
    searchStudents: "Student's name or login",
    searchAria: "Search by name or login"
  },
  studentsManager: {
    loginLabel: "Login",
    noOwner: "No teacher — not visible to any teacher. Assign an owner.",
    selectTeacher: "Select a teacher",
    createTeacherFirst: "Create a teacher first",
    teacherOfAria: "Teacher of {name}",
    dirty: "Changed — remember to save.",
    delete: "Delete",
    deleteTitle: "Delete this student?",
    empty: "No students created yet.",
    notFound: "No one found.",
    notFoundHint: "Check the query — the search covers the student's name and login.",
    changedFor: "Teacher changed for {students} — the changes are not saved yet.",
    changedStudentForms: ["{n} student", "{n} students"],
    pickHint: "Pick a teacher in the rows you need and save the changes.",
    reset: "Discard",
    saving: "Saving…",
    save: "Save changes"
  },
  teachersManager: {
    loginLabel: "Login",
    studentForms: ["{n} student", "{n} students"],
    noStudents: "No students",
    delete: "Delete",
    dialogAria: "Delete teacher",
    kicker: "Account deletion",
    heading: "Delete teacher “{name}”?",
    description: "The account and all its sessions will be deleted permanently. Files they uploaded and the homework check history will be kept.",
    cascadeBefore: "Deleting the teacher also deletes their ",
    lessonForms: ["{n} lesson", "{n} lessons"],
    testForms: ["{n} test", "{n} tests"],
    cascadeAnd: " and ",
    cascadeAfter: ". This cannot be undone.",
    lessonsTransfer:
      "Their {lessons} and groups move to the new teacher together with the students — attendance and results are kept.",
    transferLabel: "Who takes over the students ({n})",
    selectTeacher: "Select a teacher",
    transferAria: "New teacher for the students",
    onlyTeacher:
      "This is the only teacher and they have students. Create another teacher first — otherwise the students will be left without an owner and disappear from every list.",
    cancel: "Cancel",
    deleting: "Deleting…",
    confirm: "Delete teacher",
    empty: "No teachers created yet.",
    notFound: "No one found.",
    notFoundHint: "Check the query — the search covers the teacher's name and login."
  },
  timelineFilter: {
    label: "Student",
    aria: "Filter statistics by student",
    all: "All students"
  },
  timelineChart: {
    period7d: "7 days",
    period4w: "4 weeks",
    period8w: "8 weeks",
    closed: "Closed:",
    red: "Red:",
    onlyStudent: "Showing progress for {name} only.",
    allStudents: "Showing the overall pace across all students for the selected period.",
    pointTitle: "{label}: closed {n}",
    empty: "No data for the selected period yet."
  },
  timeline: {
    periods: {
      "7d": {
        title: "Last week",
        description: "Shows how progress changed day by day over the last 7 days.",
        comparison: "last week"
      },
      "4w": {
        title: "Last 4 weeks",
        description: "Helps to see the weekly pace over the last month.",
        comparison: "the previous 4 weeks"
      },
      "8w": {
        title: "By week over 8 weeks",
        description: "Shows the overall pace and dips by week over the last 8 weeks.",
        comparison: "the previous 8 weeks"
      }
    },
    trend: {
      noChange: "no change vs {comparison}",
      newActivity: "new activity vs {comparison}",
      same: "same as {comparison}",
      delta: "{sign}{delta} closed ({sign}{percent}%) vs {comparison}"
    }
  },
  actions: {
    createStudent: {
      invalid: "Enter a name, a login and a password: at least 8 characters with both letters and digits.",
      rateLimited: "Too many students created in a short time. Wait a few minutes.",
      save: "Could not create the student. Check the PostgreSQL connection and try again.",
      exists: "A student with this login already exists.",
      created: "Student created. They can sign in now."
    },
    createAccount: {
      invalid: "Enter a role, a teacher (for a student), a name, a login and a password: at least 8 characters, letters and digits.",
      rateLimited: "Too many accounts created. Wait a few minutes.",
      save: "Could not create the account. Check the PostgreSQL connection and try again.",
      teacherMissing: "The selected teacher was not found — refresh the page and try again.",
      exists: "An account with this login already exists.",
      teacherCreated: "Teacher account created.",
      studentCreated: "Student account created."
    }
  }
};
