// Mobile-only strings of the developer area (accounts, dev panel, journal).
// Site texts stay in `dict.planner.devPanel`, `dict.planner.journal`, `dict.students.accounts`.
const ru = {
  panel: {
    openJournal: "Открыть журнал",
    refreshFailed: "Не удалось обновить данные панели. Показаны прежние значения."
  },
  status: {
    budgetsTitle: "Бюджеты ИИ на сегодня",
    budgetsHint:
      "Отказ решают эти счётчики, а не «запуски за 24 часа» выше. Окно фиксированное: счётчики обнуляются в {time} по Москве.",
    budgetScopes: {
      homework: "Проверки ДЗ",
      lesson: "Сдачи на уроке",
      plans: "ИИ-подбор уроков и ДЗ"
    },
    budgetUsed: "{used} из {limit}",
    budgetOut: "исчерпан",
    budgetA11y: "{name}: использовано {used} из {limit}"
  },
  actions: {
    run: "Выполнить",
    resetBudgetTitle: "Сбросить дневной бюджет ИИ?",
    resetBudgetBody:
      "Счётчик проверок ДЗ за сегодня обнулится, и ученики снова смогут запускать автопроверку. Бюджеты сдач на уроке и ИИ-подбора не изменятся.",
    unfreezeTitle: "Снять зависшие проверки?",
    unfreezeBody:
      "Все проверки ДЗ, которые ждут или идут дольше 15 минут, будут отмечены как неудавшиеся. Ученикам придётся запустить их заново."
  },
  broadcast: {
    pickStudents: "Выбрать учеников",
    confirmTitle: "Отправить всем ученикам?",
    confirmBody: "Уведомление получат все ученики: {n}. Отменить отправку нельзя.",
    confirmSend: "Отправить",
    counter: "{n} / {max}"
  },
  settings: {
    rangeError: "Введите число от {min} до {max}",
    range: "от {min} до {max}",
    fixErrors: "Исправьте отмеченные поля — сохранить пока нельзя.",
    unsaved: "Есть несохранённые изменения",
    reset: "Сбросить изменения",
    decrease: "Уменьшить: {label}",
    increase: "Увеличить: {label}"
  },
  journal: {
    filters: "Фильтры",
    filtersCount: "Фильтры · {n}",
    resetFilters: "Сбросить фильтры",
    entryForms: ["{n} запись", "{n} записи", "{n} записей"],
    openEntry: "Открыть запись: {action}",
    systemName: "Системное имя",
    collapse: "свернуть",
    periodForms: ["{n} день", "{n} дня", "{n} дней"],
    actionQuoted: "«{text}»",
    loadMoreFailed: "Не удалось загрузить следующую страницу.",
    refreshFailed: "Не удалось обновить журнал. Показаны прежние записи."
  }
};

const en: typeof ru = {
  panel: {
    openJournal: "Open the log",
    refreshFailed: "Could not refresh the panel data. Showing the previous values."
  },
  status: {
    budgetsTitle: "Today's AI budgets",
    budgetsHint:
      "These counters decide a refusal, not the “runs in 24 hours” above. The window is fixed: the counters reset at {time} Moscow time.",
    budgetScopes: {
      homework: "Homework checks",
      lesson: "In-lesson submissions",
      plans: "AI lesson and homework selection"
    },
    budgetUsed: "{used} of {limit}",
    budgetOut: "used up",
    budgetA11y: "{name}: {used} of {limit} used"
  },
  actions: {
    run: "Run",
    resetBudgetTitle: "Reset the daily AI budget?",
    resetBudgetBody:
      "Today's homework check counter will be reset, so students can start AI checks again. The in-lesson submission and AI selection budgets stay as they are.",
    unfreezeTitle: "Clear the stale checks?",
    unfreezeBody:
      "Every homework check that has been waiting or running for more than 15 minutes will be marked as failed. Students will have to start them again."
  },
  broadcast: {
    pickStudents: "Choose students",
    confirmTitle: "Send to all students?",
    confirmBody: "All students will get the notification: {n}. It cannot be unsent.",
    confirmSend: "Send",
    counter: "{n} / {max}"
  },
  settings: {
    rangeError: "Enter a number from {min} to {max}",
    range: "from {min} to {max}",
    fixErrors: "Correct the marked fields — the settings cannot be saved yet.",
    unsaved: "There are unsaved changes",
    reset: "Discard changes",
    decrease: "Decrease: {label}",
    increase: "Increase: {label}"
  },
  journal: {
    filters: "Filters",
    filtersCount: "Filters · {n}",
    resetFilters: "Reset filters",
    entryForms: ["{n} entry", "{n} entries"],
    openEntry: "Open entry: {action}",
    systemName: "System name",
    collapse: "show less",
    periodForms: ["{n} day", "{n} days"],
    actionQuoted: "“{text}”",
    loadMoreFailed: "Could not load the next page.",
    refreshFailed: "Could not refresh the log. Showing the previous entries."
  }
};

export const developer = { ru, en };
