// Mobile-only strings of the developer area (accounts, dev panel, journal).
// Site texts stay in `dict.planner.devPanel`, `dict.planner.journal`, `dict.students.accounts`.
const ru = {
  panel: {
    openJournal: "Открыть журнал",
    refreshFailed: "Не удалось обновить данные панели. Показаны прежние значения."
  },
  // One short word for a quiet button; the full wording stays in its accessible name.
  short: {
    reset: "Сбросить"
  },
  status: {
    // Captions of the stat boxes: one or two words. The site's full names are read by a screen reader.
    tiles: {
      queue: "Очередь проверок",
      // The strip above the actions gives a figure a third of the row.
      queueShort: "Очередь",
      runs24h: "ИИ за сутки",
      lessonQueue: "Очередь подбора",
      lastRetention: "Автоудаление фото",
      storage: "Хранилище"
    },
    budgetsTitle: "Бюджеты ИИ",
    budgetsHint: "Отказ решают эти счётчики; они обнуляются в {time} МСК.",
    budgetScopes: {
      homework: "Проверки ДЗ",
      lesson: "Сдачи на уроке",
      plans: "ИИ-подборы"
    },
    budgetA11y: "{name}: использовано {used} из {limit}",
    // The warning above the panel tabs: a budget at 80 % or more of its daily limit.
    budgetSpent: "{name}: {percent} % бюджета"
  },
  actions: {
    run: "Выполнить",
    resetBudgetTitle: "Сбросить дневной бюджет ИИ?",
    resetBudgetBody: "Обнулится только счётчик проверок ДЗ за сегодня.",
    unfreezeTitle: "Снять зависшие проверки?",
    unfreezeBody: "Проверки, которые ждут дольше 15 минут, станут неудавшимися — ученики запустят их заново."
  },
  broadcast: {
    pickStudents: "Выбрать учеников",
    confirmTitle: "Отправить всем ученикам?",
    confirmBody: "Получателей: {n}. Отменить отправку нельзя.",
    confirmSend: "Отправить",
    // The send button carries the number of recipients instead of a sentence about them.
    sendCount: "Отправить · {n}"
  },
  settings: {
    rangeError: "Введите число от {min} до {max}",
    range: "от {min} до {max}",
    fixErrors: "Исправьте отмеченные поля",
    resetA11y: "Сбросить изменения",
    decrease: "Уменьшить: {label}",
    increase: "Увеличить: {label}",
    /** Spoken after a ± step: the focus stays on the button, so the new value is said. */
    stepped: "{label}: {value}"
  },
  journal: {
    filters: "Фильтры",
    filtersCount: "Фильтры: {n}",
    resetFilters: "Сбросить фильтры",
    retentionHint: "Записи хранятся {period}.",
    entryForms: ["{n} запись", "{n} записи", "{n} записей"],
    openEntry: "Открыть запись: {action}",
    systemName: "Системное имя",
    periodForms: ["{n} день", "{n} дня", "{n} дней"],
    loadMoreFailed: "Не удалось загрузить следующую страницу.",
    refreshFailed: "Не удалось обновить журнал. Показаны прежние записи."
  }
};

const en: typeof ru = {
  panel: {
    openJournal: "Open the log",
    refreshFailed: "Could not refresh the panel data. Showing the previous values."
  },
  short: {
    reset: "Reset"
  },
  status: {
    tiles: {
      queue: "Check queue",
      queueShort: "Queue",
      runs24h: "AI in 24 h",
      lessonQueue: "Selection queue",
      lastRetention: "Photo cleanup",
      storage: "Storage"
    },
    budgetsTitle: "AI budgets",
    budgetsHint: "These counters decide a refusal; they reset at {time} Moscow time.",
    budgetScopes: {
      homework: "Homework checks",
      lesson: "In-lesson submissions",
      plans: "AI selections"
    },
    budgetA11y: "{name}: {used} of {limit} used",
    budgetSpent: "{name}: {percent}% of the budget"
  },
  actions: {
    run: "Run",
    resetBudgetTitle: "Reset the daily AI budget?",
    resetBudgetBody: "Only today's homework check counter is reset.",
    unfreezeTitle: "Clear the stale checks?",
    unfreezeBody: "Checks that have waited for more than 15 minutes will be marked as failed — students start them again."
  },
  broadcast: {
    pickStudents: "Choose students",
    confirmTitle: "Send to all students?",
    confirmBody: "Recipients: {n}. It cannot be unsent.",
    confirmSend: "Send",
    sendCount: "Send · {n}"
  },
  settings: {
    rangeError: "Enter a number from {min} to {max}",
    range: "from {min} to {max}",
    fixErrors: "Correct the marked fields",
    resetA11y: "Discard changes",
    decrease: "Decrease: {label}",
    increase: "Increase: {label}",
    stepped: "{label}: {value}"
  },
  journal: {
    filters: "Filters",
    filtersCount: "Filters: {n}",
    resetFilters: "Reset filters",
    retentionHint: "Entries are kept for {period}.",
    entryForms: ["{n} entry", "{n} entries"],
    openEntry: "Open entry: {action}",
    systemName: "System name",
    periodForms: ["{n} day", "{n} days"],
    loadMoreFailed: "Could not load the next page.",
    refreshFailed: "Could not refresh the log. Showing the previous entries."
  }
};

export const developer = { ru, en };
