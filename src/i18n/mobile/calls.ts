// Mobile-only strings of the parent-calls area. Site texts stay in `dict.planner.calls`.
// Call comments are personal data: never put them into a notification, a log line or a share sheet.
const ru = {
  // A row of the list is one pressable element: `…Aria` is the start of its spoken name — what a press opens.
  row: {
    recordAria: "Записать звонок: {name}",
    historyAria: "История ({n}) — звонки родителям: {name}",
    historyEmptyAria: "Звонков ещё не было: {name}",
    // The chip of a row in one word; the site's «Пора позвонить» / «Просрочено» stay in the spoken name.
    due: "пора",
    overdue: "просрочено",
    // The caption of a row whose call is due before the parents were reached a single time.
    never: "не звонили"
  },
  form: {
    // The privacy promise next to the lock of the comment field (the site's label is just «Комментарий»).
    onlyYou: "виден только вам",
    attemptHint: "Неудачная попытка не сбрасывает напоминание."
  },
  log: {
    saved: "Звонок записан"
  },
  history: {
    // Spoken name of «Показать ещё»: what it loads and the position in the log.
    shownOf: "Показано {shown} из {total}",
    showEarlier: "Показать более ранние",
    loadFailed: "Не удалось загрузить более ранние звонки. Попробуйте ещё раз.",
    // The mark of an unanswered call; a call that reached the parents needs no word.
    noAnswer: "не дозвонились",
    by: "{day} — {name}"
  },
  // The developer's tablet panel: the latest calls of every student.
  journal: {
    title: "Журнал звонков",
    empty: "Звонков пока нет"
  },
  empty: {
    // Spoken name of the button under the empty state: it opens the section the site's sentence links to.
    openSection: "Открыть раздел «{section}»"
  }
};

const en: typeof ru = {
  row: {
    recordAria: "Log a call: {name}",
    historyAria: "History ({n}) — parent calls: {name}",
    historyEmptyAria: "No calls yet: {name}",
    due: "call",
    overdue: "overdue",
    never: "never called"
  },
  form: {
    onlyYou: "only you see it",
    attemptHint: "A failed attempt does not reset the reminder."
  },
  log: {
    saved: "Call logged"
  },
  history: {
    shownOf: "Showing {shown} of {total}",
    showEarlier: "Show earlier calls",
    loadFailed: "Could not load earlier calls. Try again.",
    noAnswer: "no answer",
    by: "{day} — {name}"
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
