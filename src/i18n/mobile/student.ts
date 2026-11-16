// Mobile-only strings of the student area (home, theory, homework, live lesson, deadlines, info).
// Site texts stay in `dict.student.*`; here are native replacements for web-only wording
// (docs/spec/09-data-i18n-math.md §3.5) and strings the site does not have.
const ru = {
  fileCard: {
    // replaces `dict.student.fileCard.openInBrowser` («Открыть в браузере»)
    open: "Открыть файл",
    // replaces `dict.student.fileCard.docxHint` (the preview no longer depends on a browser)
    docxHint: "Файл Word откроется в другом приложении на устройстве."
  },
  photos: {
    // replaces `dict.student.photos.dropHint` / `dragTitle` (no drag & drop on a phone)
    addHint: "Сфотографируйте решение или выберите снимок из галереи",
    sourceTitle: "Откуда взять фото?"
  },
  lesson: {
    // replaces `dict.student.lesson.autoRefresh` (no page to reload)
    autoRefresh: "Обновлять экран не нужно — урок откроется сам."
  },
  note: {
    saved: "Заметка сохранена"
  }
};

const en: typeof ru = {
  fileCard: {
    open: "Open file",
    docxHint: "The Word file will open in another app on your device."
  },
  photos: {
    addHint: "Photograph your solution or choose a picture from the gallery",
    sourceTitle: "Where is the photo?"
  },
  lesson: {
    autoRefresh: "No need to refresh — the lesson will open on its own."
  },
  note: {
    saved: "Note saved"
  }
};

export const student = { ru, en };
