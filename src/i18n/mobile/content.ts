// Mobile-only strings of the content area (topics CRUD, numbers, files, LaTeX, JSON import).
// Site texts stay in `dict.topics.*`.
const ru = {
  importPanel: {
    // Spoken names of the two marks next to the slot and of the slot itself.
    pasteFromClipboard: "Вставить JSON из буфера",
    chooseJsonFile: "Выбрать JSON-файл",
    // The accessible name of the copy button starts with what it shows («Скопировано»).
    promptCopied: "Скопировано: промпт для ИИ",
    // The copy button: one word next to the copy glyph (the site's «Скопировать промпт для ИИ» is spoken).
    prompt: "Промпт",
    // The empty slot (replaces `dict.topics.importPanel.dropTitle`: no drag & drop on a phone) and a pasted text in it.
    slot: "JSON-файл",
    textLoaded: "Текст вставлен",
    // The panel's one hint (replaces the two sentences of `dict.topics.importPanel.hintCreate` / `hintAdd`).
    hint: "Промпт и задачник — в чат с ИИ, его ответ — сюда.",
    // The switch; `dict.topics.importPanel.overwriteLabel` is its spoken name.
    overwrite: "Перезаписать заполненные",
    sharePrompt: "Поделиться промптом",
    // replaces `dict.topics.importPrompt.clipboardDenied` ("the browser blocked…")
    clipboardDenied: "Не удалось получить доступ к буферу обмена.",
    clipboardEmpty: "В буфере обмена нет текста.",
    // iOS: the clipboard holds text but the read came back empty — the system paste prompt was refused
    pasteRefused: "Не удалось вставить текст из буфера обмена. Если система спрашивает разрешение — разрешите вставку.",
    hideText: "Скрыть поле"
  },
  reorder: {
    // The sheet's title and the spoken name of the header mark that opens it.
    title: "Порядок тем",
    moveUp: "Поднять тему «{title}» выше",
    moveDown: "Опустить тему «{title}» ниже",
    saved: "Порядок тем сохранён."
  },
  list: {
    createAction: "Новая тема",
    openA11y: "Открыть тему «{title}»"
  },
  deleteTopic: {
    // Spoken while the spinner turns.
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
    // Accessible name of the «⋯» button of a topic (the editor and «Удалить тему» are behind it).
    actions: "Действия с темой",
    openEdit: "Открыть редактирование темы",
    // The caption of an empty file slot (the site's sentence «Файл пока не загружен.» is spoken).
    noFile: "Нет файла"
  },
  number: {
    conditionSaved: "Условие сохранено.",
    conditionDeleted: "Условие удалено.",
    answerSaved: "Ответ сохранён.",
    answerDeleted: "Ответ удалён.",
    // Spoken name of the mark next to «Сохранить».
    resetDraft: "Вернуть сохранённое",
    // The screen's one hint (replaces `dict.topics.answerManager.latexHint*`).
    latexHint: "Формулы: $...$ в строке, $$...$$ отдельным блоком."
  },
  edit: {
    // `answersShort` is on the switch, `answers` is its spoken name.
    sections: { topic: "Тема", answers: "Условия и ответы", answersShort: "Задачи", import: "Импорт" },
    sectionsAria: "Разделы редактирования темы",
    // Spoken name of the mark next to «Сохранить».
    reset: "Вернуть сохранённое",
    titleRequired: "Введите название темы.",
    numbersRequired: "Укажите хотя бы один номер.",
    // the replacement is uploaded at once but attached only by «Сохранить»: `filePending` is the caption of
    // its box, the two sentences are spoken
    filePending: "Не сохранён",
    willReplace: "Файл заменит текущий, когда вы сохраните изменения.",
    willAttach: "Файл прикрепится к теме, когда вы сохраните изменения.",
    discardFile: "Убрать выбранный файл",
    waitUploads: "Дождитесь окончания загрузки файлов.",
    openNumber: "Открыть номер {number}"
  }
};

const en: typeof ru = {
  importPanel: {
    pasteFromClipboard: "Paste JSON from the clipboard",
    chooseJsonFile: "Choose a JSON file",
    promptCopied: "Copied: the AI prompt",
    prompt: "Prompt",
    slot: "JSON file",
    textLoaded: "Text pasted",
    hint: "Give the prompt and the problem book to an AI chat, then load its reply here.",
    overwrite: "Overwrite filled",
    sharePrompt: "Share the prompt",
    clipboardDenied: "Could not access the clipboard.",
    clipboardEmpty: "The clipboard has no text.",
    pasteRefused: "Could not paste text from the clipboard. If the system asks for permission, allow pasting.",
    hideText: "Hide the field"
  },
  reorder: {
    title: "Topic order",
    moveUp: "Move topic “{title}” up",
    moveDown: "Move topic “{title}” down",
    saved: "Topic order saved."
  },
  list: {
    createAction: "New topic",
    openA11y: "Open topic “{title}”"
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
    actions: "Topic actions",
    openEdit: "Edit: open the topic editor",
    noFile: "No file"
  },
  number: {
    conditionSaved: "Statement saved.",
    conditionDeleted: "Statement deleted.",
    answerSaved: "Answer saved.",
    answerDeleted: "Answer deleted.",
    resetDraft: "Restore the saved text",
    latexHint: "Formulas: $...$ inline, $$...$$ as a block."
  },
  edit: {
    sections: { topic: "Topic", answers: "Statements and answers", answersShort: "Problems", import: "Import" },
    sectionsAria: "Topic editing sections",
    reset: "Restore the saved topic",
    titleRequired: "Enter the topic title.",
    numbersRequired: "Enter at least one problem.",
    filePending: "Not saved",
    willReplace: "The file will replace the current one when you save the changes.",
    willAttach: "The file will be attached to the topic when you save the changes.",
    discardFile: "Remove the chosen file",
    waitUploads: "Wait for the files to finish uploading.",
    openNumber: "Open problem {number}"
  }
};

export const content = { ru, en };
