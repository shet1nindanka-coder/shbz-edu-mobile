// Mobile-only strings of the parent-calls area. Site texts stay in `dict.planner.calls`.
// Call comments are personal data: never put them into a notification, a log line or a share sheet.
const ru = {
  // A row of the list is one pressable element: this is the start of its spoken name — what a press opens.
  row: {
    recordAria: "Записать звонок: {name}",
    historyAria: "История ({n}) — звонки родителям: {name}",
    historyEmptyAria: "Звонков ещё не было: {name}"
  },
  form: {
    // The site's label is «Комментарий»; the app says who reads it, next to a lock.
    commentLabel: "Комментарий, виден только вам"
  },
  log: {
    saved: "Звонок записан"
  },
  history: {
    title: "История звонков",
    shownOf: "Показано {shown} из {total}",
    showEarlier: "Показать более ранние",
    loadFailed: "Не удалось загрузить более ранние звонки. Попробуйте ещё раз.",
    by: "— {name}"
  },
  // The developer's tablet panel: the latest calls of every student.
  journal: {
    title: "Журнал звонков",
    empty: "Звонков пока нет"
  },
  empty: {
    // Button under the empty state: opens the section the site's sentence links to.
    openSection: "Открыть раздел «{section}»"
  }
};

const en: typeof ru = {
  row: {
    recordAria: "Log a call: {name}",
    historyAria: "History ({n}) — parent calls: {name}",
    historyEmptyAria: "No calls yet: {name}"
  },
  form: {
    commentLabel: "Comment, visible only to you"
  },
  log: {
    saved: "Call logged"
  },
  history: {
    title: "Call history",
    shownOf: "Showing {shown} of {total}",
    showEarlier: "Show earlier calls",
    loadFailed: "Could not load earlier calls. Try again.",
    by: "— {name}"
  },
  journal: {
    title: "Call journal",
    empty: "No calls yet"
  },
  empty: {
    openSection: "Open the “{section}” section"
  }
};

export const calls = { ru, en };
