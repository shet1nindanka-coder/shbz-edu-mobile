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
    promptCopied: "Промпт скопирован"
  },
  reorder: {
    hint: "Удерживайте тему, чтобы изменить порядок."
  }
};

const en: typeof ru = {
  fileDrop: {
    helper: "Choose a file on your device: PDF, DOCX, PNG or JPG."
  },
  importPanel: {
    pasteFromClipboard: "Paste JSON from the clipboard",
    chooseJsonFile: "Choose a JSON file",
    promptCopied: "Prompt copied"
  },
  reorder: {
    hint: "Press and hold a topic to change the order."
  }
};

export const content = { ru, en };
