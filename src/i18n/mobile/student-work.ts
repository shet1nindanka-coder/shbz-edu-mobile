// Mobile-only strings of the student's homework and live-lesson screens (homework list, homework detail with
// photos and the AI check, the «Урок» tab). Site texts stay in `dict.student.*`; the study screens (overview,
// theory, number, deadlines, info) keep their mobile strings in `./student.ts`.
//
// Three kinds of strings live here (docs/spec/09-data-i18n-math.md §3.5; the text diet of
// docs/design/glass-over-paper.md §1a): one-or-two-word replacements of the site's longer labels («Сдать
// фото» for «Сдать фото № 401»), texts the site does not have (countdowns, the photo preview sheet), and
// accessible names that keep for a screen reader what the eye no longer reads.
const ru = {
  list: {
    // The two halves of the list: what is still to do and what is closed.
    active: "Активные",
    done: "Выполненные",
    segmentsA11y: "Какие задания показать",
    doneEmpty: "Выполненных пока нет",
    rowA11y: "{title}. {caption}. Решено {done}",
    refreshFailed: "Не удалось обновить список. Показываем сохранённые данные."
  },
  homework: {
    refreshFailed: "Не удалось обновить ДЗ. Показываем сохранённые данные.",
    // «Повторить» of a refused note save: every card of the list has its own, so it names the number.
    noteRetryA11y: "Повторить сохранение заметки к № {number}"
  },
  photos: {
    // replaces `dict.student.photos.successTitle` («Файлы добавлены»)
    added: "Фото добавлены",
    counterA11y: "Прикреплено фото: {count} из {max}",
    uploadProgressA11y: "Загрузка фото: {percent}%",
    // the picker ignored the selection limit (web, some Android pickers); the site refuses the whole batch
    // with `apiStudent.homeworkSubmissions.photoLimit`, here the photos that fit are kept
    tooMany: "Выбрано {picked} фото, добавить удалось только {added} — больше не помещается."
  },
  check: {
    // replaces `dict.student.check.pollBroken` / `dict.student.lessonView.pollBroken` («Обновите страницу»)
    pollBroken: "Статус проверки не обновляется: нет связи с сервером.",
    pollRetry: "Обновить",
    // replaces `dict.student.check.redo` («Перерешать № 118»): the row is of one number already
    redo: "Перерешать",
    answerExpandA11y: "Показать ответ полностью: {answer}",
    answerCollapseA11y: "Свернуть ответ: {answer}"
  },
  lesson: {
    startsIn: "через {time}",
    startsSoon: "Урок начинается…",
    // spoken name of the strip of tiles; a tablet prints it as «1/3»
    closedOf: "Закрыто {closed} из {total}",
    // title of the tablet panel that lists every number of the lesson
    plan: "План урока",
    // the time left beside the clock glyph is the site's «{n} мин» (`dict.planner.common.minutesShort`);
    // the whole phrase is for a screen reader
    lessThanMinuteShort: "< 1 мин",
    remainingMinuteForms: ["Осталась {n} минута", "Осталось {n} минуты", "Осталось {n} минут"],
    remainingLessThanMinute: "Осталось меньше минуты",
    // replaces `dict.student.lessonView.noItems` («обновите страницу»)
    noItems: "Набор ещё не готов",
    // replace `dict.student.lessonView.submit` / `resubmit` («Сдать фото № 401»): the card is of one number
    submit: "Сдать фото",
    resubmit: "Пересдать",
    itemA11y: "{index}. № {number}",
    // Spoken when the check of a photo sent from this screen ends: «№ 010208: Перерешай. Ошибка …»
    outcomeA11y: "№ {number}: {outcome}",
    refreshFailed: "Не удалось обновить урок. Показываем сохранённые данные."
  },
  preview: {
    title: "Решение № {number}",
    send: "Отправить"
  }
};

const en: typeof ru = {
  list: {
    active: "Active",
    done: "Closed",
    segmentsA11y: "Which homework to show",
    doneEmpty: "Nothing closed yet",
    rowA11y: "{title}. {caption}. Solved {done}",
    refreshFailed: "Could not refresh the list. Showing saved data."
  },
  homework: {
    refreshFailed: "Could not refresh the homework. Showing saved data.",
    noteRetryA11y: "Retry saving the note for No. {number}"
  },
  photos: {
    added: "Photos added",
    counterA11y: "Photos attached: {count} of {max}",
    uploadProgressA11y: "Uploading photos: {percent}%",
    tooMany: "You chose {picked} photos; only {added} could be added — there is no room for more."
  },
  check: {
    pollBroken: "The check status is not updating: no connection to the server.",
    pollRetry: "Refresh",
    redo: "Solve again",
    answerExpandA11y: "Show the full answer: {answer}",
    answerCollapseA11y: "Collapse the answer: {answer}"
  },
  lesson: {
    startsIn: "in {time}",
    startsSoon: "The lesson is starting…",
    closedOf: "{closed} of {total} closed",
    plan: "Lesson plan",
    lessThanMinuteShort: "< 1 min",
    remainingMinuteForms: ["{n} minute left", "{n} minutes left"],
    remainingLessThanMinute: "Less than a minute left",
    noItems: "The set is not ready yet",
    submit: "Submit photo",
    resubmit: "Resubmit",
    itemA11y: "{index}. No. {number}",
    outcomeA11y: "No. {number}: {outcome}",
    refreshFailed: "Could not refresh the lesson. Showing saved data."
  },
  preview: {
    title: "Solution for No. {number}",
    send: "Send"
  }
};

export const studentWork = { ru, en };
