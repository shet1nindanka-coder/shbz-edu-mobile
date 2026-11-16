// Mobile-only strings of the parent-calls area. Site texts stay in `dict.planner.calls`.
// Call comments are personal data: never put them into a notification, a log line or a share sheet.
const ru = {
  summary: {
    // The site prints one line («Просрочено: 2 · Пора позвонить: 1 · Всего учеников: 7»); the phone
    // shows three counters, and the third one needs a label of its own.
    total: "Всего учеников"
  },
  row: {
    recordAria: "Записать звонок: {name}",
    historyAria: "История звонков: {name}",
    historyEmptyAria: "Звонков ещё не было: {name}"
  },
  log: {
    sheetTitle: "Записать звонок",
    saved: "Звонок записан"
  },
  history: {
    sheetTitle: "История звонков",
    shownOf: "Показано {shown} из {total}",
    showEarlier: "Показать более ранние",
    loadFailed: "Не удалось загрузить более ранние звонки. Попробуйте ещё раз.",
    by: "— {name}"
  },
  empty: {
    // Button under the empty state: opens the section the site's sentence links to.
    openSection: "Открыть раздел «{section}»"
  }
};

const en: typeof ru = {
  summary: {
    total: "Total students"
  },
  row: {
    recordAria: "Log a call: {name}",
    historyAria: "Call history: {name}",
    historyEmptyAria: "No calls yet: {name}"
  },
  log: {
    sheetTitle: "Log a call",
    saved: "Call logged"
  },
  history: {
    sheetTitle: "Call history",
    shownOf: "Showing {shown} of {total}",
    showEarlier: "Show earlier calls",
    loadFailed: "Could not load earlier calls. Try again.",
    by: "— {name}"
  },
  empty: {
    openSection: "Open the “{section}” section"
  }
};

export const calls = { ru, en };
