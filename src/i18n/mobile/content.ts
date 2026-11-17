// Mobile-only strings of the content area (topics CRUD, numbers, files, LaTeX, JSON import).
// Site texts stay in `dict.topics.*`.
const ru = {
  fileDrop: {
    // replaces `dict.topics.widgets.fileDrop.helper` (no drag & drop on a phone)
    helper: "Выберите файл на устройстве: PDF, DOCX, PNG или JPG."
  },
  importPanel: {
    pasteFromClipboard: "Вставить JSON из буфера",
    chooseJsonFile: "Выбрать JSON-файл",
    promptCopied: "Промпт скопирован",
    // replaces `dict.topics.importPanel.dropTitle` (no drag & drop on a phone)
    loadTitle: "Загрузите ответ ИИ",
    textLoaded: "Текст вставлен — нажмите «Проверить файл»",
    sharePrompt: "Поделиться промптом",
    // replaces `dict.topics.importPrompt.clipboardDenied` ("the browser blocked…")
    clipboardDenied: "Не удалось получить доступ к буферу обмена.",
    clipboardEmpty: "В буфере обмена нет текста.",
    // iOS: the clipboard holds text but the read came back empty — the system paste prompt was refused
    pasteRefused: "Не удалось вставить текст из буфера обмена. Если система спрашивает разрешение — разрешите вставку.",
    hideText: "скрыть поле"
  },
  reorder: {
    action: "Порядок тем",
    title: "Порядок тем",
    // replaces `dict.topics.reorder.hint` ("drag a card")
    sheetHint: "Переставьте темы стрелками и сохраните — этот порядок видят и ученики.",
    moveUp: "Поднять тему «{title}» выше",
    moveDown: "Опустить тему «{title}» ниже",
    save: "Сохранить порядок",
    saved: "Порядок тем сохранён."
  },
  list: {
    createAction: "Новая тема",
    openA11y: "Открыть тему «{title}»",
    deleteA11y: "Удалить тему «{title}»"
  },
  deleteTopic: {
    loadingImpact: "Проверяем, что будет удалено…",
    impactFailed: "Не удалось проверить, что будет удалено."
  },
  upload: {
    cancel: "Отменить загрузку",
    cancelled: "Загрузка отменена.",
    pickFailed: "Не удалось открыть файл. Попробуйте выбрать его ещё раз.",
    pickerUnavailable: "На этом устройстве нельзя выбрать файл.",
    progress: "{percent}%"
  },
  topic: {
    hideAnswer: "Скрыть ответ",
    numbersCount: "Всего: {count}",
    openEdit: "Открыть редактирование темы"
  },
  number: {
    unsaved: "Есть несохранённые изменения",
    conditionSaved: "Условие сохранено.",
    conditionDeleted: "Условие удалено.",
    answerSaved: "Ответ сохранён.",
    answerDeleted: "Ответ удалён.",
    resetDraft: "Вернуть сохранённое"
  },
  edit: {
    sections: { topic: "Тема", answers: "Условия и ответы", import: "Импорт" },
    sectionsAria: "Разделы редактирования темы",
    unsaved: "Есть несохранённые изменения",
    reset: "Вернуть сохранённое",
    titleRequired: "Введите название темы.",
    numbersRequired: "Укажите хотя бы один номер.",
    // the replacement is uploaded at once but attached only by «Сохранить изменения»
    willReplace: "Файл заменит текущий, когда вы сохраните изменения.",
    willAttach: "Файл прикрепится к теме, когда вы сохраните изменения.",
    discardFile: "Убрать выбранный файл",
    waitUploads: "Дождитесь окончания загрузки файлов.",
    openNumber: "Открыть номер {number}",
    importTitle: "Импорт номеров из задачника",
    importHint: "Импорт только добавляет номера и заполняет условия и ответы — ничего не удаляет."
  }
};

const en: typeof ru = {
  fileDrop: {
    helper: "Choose a file on your device: PDF, DOCX, PNG or JPG."
  },
  importPanel: {
    pasteFromClipboard: "Paste JSON from the clipboard",
    chooseJsonFile: "Choose a JSON file",
    promptCopied: "Prompt copied",
    loadTitle: "Load the AI reply",
    textLoaded: "Text pasted — tap “Check file”",
    sharePrompt: "Share the prompt",
    clipboardDenied: "Could not access the clipboard.",
    clipboardEmpty: "The clipboard has no text.",
    pasteRefused: "Could not paste text from the clipboard. If the system asks for permission, allow pasting.",
    hideText: "hide the field"
  },
  reorder: {
    action: "Topic order",
    title: "Topic order",
    sheetHint: "Move topics with the arrows and save — students see this order too.",
    moveUp: "Move topic “{title}” up",
    moveDown: "Move topic “{title}” down",
    save: "Save order",
    saved: "Topic order saved."
  },
  list: {
    createAction: "New topic",
    openA11y: "Open topic “{title}”",
    deleteA11y: "Delete topic “{title}”"
  },
  deleteTopic: {
    loadingImpact: "Checking what will be deleted…",
    impactFailed: "Could not check what will be deleted."
  },
  upload: {
    cancel: "Cancel upload",
    cancelled: "Upload cancelled.",
    pickFailed: "Could not open the file. Try choosing it again.",
    pickerUnavailable: "Files cannot be chosen on this device.",
    progress: "{percent}%"
  },
  topic: {
    hideAnswer: "Hide answer",
    numbersCount: "Total: {count}",
    openEdit: "Open the topic editor"
  },
  number: {
    unsaved: "There are unsaved changes",
    conditionSaved: "Statement saved.",
    conditionDeleted: "Statement deleted.",
    answerSaved: "Answer saved.",
    answerDeleted: "Answer deleted.",
    resetDraft: "Restore the saved text"
  },
  edit: {
    sections: { topic: "Topic", answers: "Statements and answers", import: "Import" },
    sectionsAria: "Topic editing sections",
    unsaved: "There are unsaved changes",
    reset: "Restore the saved topic",
    titleRequired: "Enter the topic title.",
    numbersRequired: "Enter at least one problem.",
    willReplace: "The file will replace the current one when you save the changes.",
    willAttach: "The file will be attached to the topic when you save the changes.",
    discardFile: "Remove the chosen file",
    waitUploads: "Wait for the files to finish uploading.",
    openNumber: "Open problem {number}",
    importTitle: "Import problems from a problem book",
    importHint: "Import only adds problems and fills statements and answers — it never deletes anything."
  }
};

export const content = { ru, en };
