// Mobile-only strings of the student's homework and live-lesson screens (homework list, homework detail with
// photos and the AI check, the «Урок» tab). Site texts stay in `dict.student.*`; the study screens (overview,
// theory, number, deadlines, info) keep their mobile strings in `./student.ts`.
//
// Two kinds of strings live here (docs/spec/09-data-i18n-math.md §3.5): replacements of web-only wording
// ("page", "reload", drag & drop) and texts the site does not have (countdowns, the photo preview sheet,
// accessible names of native controls).
const ru = {
  list: {
    // The two halves of the list: what is still to do and what is closed.
    active: "Активные",
    done: "Выполненные",
    segmentsA11y: "Какие задания показать",
    doneEmpty: "Выполненных заданий пока нет.",
    rowA11y: "{title}. {caption}. Решено {done}",
    refreshFailed: "Не удалось обновить список. Показываем сохранённые данные."
  },
  homework: {
    refreshFailed: "Не удалось обновить ДЗ. Показываем сохранённые данные.",
    // «Повторить» of a refused note save: every card of the list has its own, so it names the number.
    noteRetryA11y: "Повторить сохранение заметки к № {number}"
  },
  photos: {
    // replaces `dict.student.photos.dropHint` / `dragTitle` (no drag & drop on a phone)
    addHint: "Сфотографируйте решение или выберите снимок из галереи",
    sourceTitle: "Откуда взять фото?",
    // replaces `dict.student.photos.successTitle` («Файлы добавлены»)
    added: "Фото добавлены",
    counterA11y: "Прикреплено фото: {count} из {max}",
    uploadProgressA11y: "Загрузка фото: {percent}%",
    // the picker ignored the selection limit (web, some Android pickers); the site refuses the whole batch
    // with `apiStudent.homeworkSubmissions.photoLimit`, here the photos that fit are kept
    tooMany: "Выбрано {picked} фото, добавить удалось только {added} — больше не помещается."
  },
  check: {
    // replaces `dict.student.check.runningHint` («Страница обновится сама»)
    runningHint: "Решение проверяется — обычно это занимает до минуты. Экран обновится сам.",
    // replaces `dict.student.check.pollBroken` / `dict.student.lessonView.pollBroken` («Обновите страницу»)
    pollBroken:
      "Не получается узнать статус проверки — соединение с сервером прерывается. Попробуйте обновить через минуту.",
    pollRetry: "Обновить статус",
    answerExpandA11y: "Показать ответ полностью: {answer}",
    answerCollapseA11y: "Свернуть ответ: {answer}"
  },
  lesson: {
    // replaces `dict.student.lesson.autoRefresh` (no page to reload)
    autoRefresh: "Обновлять экран не нужно — урок откроется сам.",
    individual: "Индивидуальное занятие",
    startsIn: "Начнётся через {time}",
    startsSoon: "Урок начинается…",
    closedOf: "Закрыто {closed} из {total}",
    remainingMinuteForms: ["Осталась {n} минута", "Осталось {n} минуты", "Осталось {n} минут"],
    remainingLessThanMinute: "Осталось меньше минуты",
    // replaces `dict.student.lessonView.noItems` («обновите страницу»)
    noItems: "Учитель ещё не собрал набор — подождите минуту и потяните экран вниз, чтобы обновить.",
    itemA11y: "{index}. № {number}",
    // Spoken when the check of a photo sent from this screen ends: «№ 010208: Перерешай. Ошибка …»
    outcomeA11y: "№ {number}: {outcome}",
    refreshFailed: "Не удалось обновить урок. Показываем сохранённые данные."
  },
  preview: {
    title: "Решение № {number}",
    hint: "Проверьте, что решение хорошо читается. Можно приложить до {max} фото.",
    send: "Отправить на проверку"
  }
};

const en: typeof ru = {
  list: {
    active: "Active",
    done: "Closed",
    segmentsA11y: "Which homework to show",
    doneEmpty: "No completed homework yet.",
    rowA11y: "{title}. {caption}. Solved {done}",
    refreshFailed: "Could not refresh the list. Showing saved data."
  },
  homework: {
    refreshFailed: "Could not refresh the homework. Showing saved data.",
    noteRetryA11y: "Retry saving the note for No. {number}"
  },
  photos: {
    addHint: "Photograph your solution or choose a picture from the gallery",
    sourceTitle: "Add a photo",
    added: "Photos added",
    counterA11y: "Photos attached: {count} of {max}",
    uploadProgressA11y: "Uploading photos: {percent}%",
    tooMany: "You chose {picked} photos; only {added} could be added — there is no room for more."
  },
  check: {
    runningHint: "Checking your solution — this usually takes up to a minute. The screen refreshes on its own.",
    pollBroken: "Can't get the check status — the connection to the server keeps dropping. Try refreshing in a minute.",
    pollRetry: "Refresh status",
    answerExpandA11y: "Show the full answer: {answer}",
    answerCollapseA11y: "Collapse the answer: {answer}"
  },
  lesson: {
    autoRefresh: "No need to refresh — the lesson will open on its own.",
    individual: "Individual lesson",
    startsIn: "Starts in {time}",
    startsSoon: "The lesson is starting…",
    closedOf: "{closed} of {total} closed",
    remainingMinuteForms: ["{n} minute left", "{n} minutes left"],
    remainingLessThanMinute: "Less than a minute left",
    noItems: "Your teacher hasn't put the set together yet — wait a minute and pull down to refresh.",
    itemA11y: "{index}. No. {number}",
    outcomeA11y: "No. {number}: {outcome}",
    refreshFailed: "Could not refresh the lesson. Showing saved data."
  },
  preview: {
    title: "Solution for No. {number}",
    hint: "Make sure the solution is easy to read. You can attach up to {max} photos.",
    send: "Send for checking"
  }
};

export const studentWork = { ru, en };
