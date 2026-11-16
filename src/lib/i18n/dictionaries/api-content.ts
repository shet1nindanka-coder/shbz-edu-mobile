// JSON-ошибки API контента учителя/разработчика: темы, номера, условия,
// ответы, импорт, загрузки, история прогресса, статистика.
// Общие тексты — в api-common.ts. Английская версия типизирована русской.
export const apiContentRu = {
  // app/api/teacher/topics
  topics: {
    formInvalid: "Проверьте форму: название, оба файла и список номеров обязательны.",
    filesUnavailable: "Файлы не найдены или уже недоступны. Загрузите их заново.",
    saveFailed: "Не удалось сохранить тему в базе данных. Проверьте подключение к PostgreSQL."
  },
  // app/api/teacher/topics/order
  topicsOrder: {
    invalidRequest: "Некорректный запрос на изменение порядка тем.",
    listChanged: "Список тем изменился. Обновите страницу и повторите перетаскивание.",
    saveFailed: "Не удалось сохранить новый порядок тем."
  },
  // app/api/teacher/topics/find-number
  findNumber: {
    invalidNumber: "Укажите корректный номер.",
    searchFailed: "Не удалось найти тему по номеру."
  },
  // app/api/teacher/number-conditions
  numberConditions: {
    latexRequired: "Введите LaTeX-условие для номера.",
    saveFailed: "Не удалось сохранить условие к номеру.",
    deleteFailed: "Не удалось удалить условие к номеру."
  },
  // app/api/teacher/number-answers
  numberAnswers: {
    latexRequired: "Введите LaTeX-ответ для номера.",
    saveFailed: "Не удалось сохранить ответ к номеру.",
    deleteFailed: "Не удалось удалить ответ к номеру."
  },
  // app/api/teacher/topic-import
  topicImport: {
    fileTooBig: "Файл слишком большой. Разбейте задачник на части по 200–300 задач.",
    topicMissing: "Не указана тема для импорта.",
    createFailed: "Не удалось создать тему. Проверьте подключение к PostgreSQL.",
    topicDeleted: "Тема не найдена — возможно, её удалили.",
    writeFailed: "Не удалось записать номера в базу данных. Проверьте подключение к PostgreSQL."
  },
  // app/api/teacher/topic-numbers-preview
  topicNumbersPreview: {
    topicMissing: "Не указана тема.",
    emptyNumbers: "Список номеров пуст — тема не может остаться без номеров.",
    // {typed} — как набрали, {existing} — как записано в теме.
    twins: "Номера {typed} и {existing} — это один и тот же номер, оставьте один вариант записи."
  },
  // app/api/teacher/uploads
  uploads: {
    blobNotConfigured: "Хранилище Blob не настроено.",
    blobTokenFailed: "Не удалось выдать токен для загрузки в Blob.",
    blobMetadataIncomplete: "Метаданные загруженного Blob неполные.",
    invalidPath: "Некорректный путь загруженного файла.",
    alreadyRegistered: "Этот файл уже зарегистрирован.",
    blobNotFound: "Загруженный Blob не найден.",
    blobValidationFailed: "Не удалось проверить загруженный Blob.",
    blobRegisterFailed: "Не удалось зарегистрировать загруженный Blob.",
    unsupportedRequest: "Неподдерживаемый запрос на загрузку.",
    fileRequired: "Выберите файл для загрузки.",
    uploadFailed: "Не удалось загрузить файл."
  },
  // app/api/teacher/progress-history
  progressHistory: {
    forbidden: "Нет доступа к истории прогресса.",
    paramsRequired: "Укажите ученика и номер.",
    notFound: "История не найдена."
  },
  // app/api/teacher/statistics/drilldown
  statistics: {
    paramsRequired: "Укажите тему и ученика.",
    loadFailed: "Не удалось загрузить срез."
  },
  // lib/storage — UploadValidationError при чтении файла из хранилища.
  storage: {
    sizeExceeded: "Фактический размер файла превышает допустимый.",
    emptyOrTooBig: "Файл пуст или превышает допустимый размер.",
    sizeMetadataMismatch: "Фактический размер файла не совпадает с метаданными хранилища."
  }
};

export const apiContentEn: typeof apiContentRu = {
  topics: {
    formInvalid: "Check the form: the title, both files and the problem list are required.",
    filesUnavailable: "The files were not found or are no longer available. Upload them again.",
    saveFailed: "Could not save the topic to the database. Check the PostgreSQL connection."
  },
  topicsOrder: {
    invalidRequest: "Invalid topic order request.",
    listChanged: "The topic list has changed. Refresh the page and drag again.",
    saveFailed: "Could not save the new topic order."
  },
  findNumber: {
    invalidNumber: "Enter a valid problem number.",
    searchFailed: "Could not find a topic by this problem number."
  },
  numberConditions: {
    latexRequired: "Enter the LaTeX statement for the problem.",
    saveFailed: "Could not save the problem statement.",
    deleteFailed: "Could not delete the problem statement."
  },
  numberAnswers: {
    latexRequired: "Enter the LaTeX answer for the problem.",
    saveFailed: "Could not save the problem answer.",
    deleteFailed: "Could not delete the problem answer."
  },
  topicImport: {
    fileTooBig: "The file is too big. Split the problem book into parts of 200–300 problems.",
    topicMissing: "No topic was specified for the import.",
    createFailed: "Could not create the topic. Check the PostgreSQL connection.",
    topicDeleted: "Topic not found — it may have been deleted.",
    writeFailed: "Could not write the problems to the database. Check the PostgreSQL connection."
  },
  topicNumbersPreview: {
    topicMissing: "No topic was specified.",
    emptyNumbers: "The problem list is empty — a topic can't be left without problems.",
    twins: "Problems {typed} and {existing} are the same problem. Keep only one of them."
  },
  uploads: {
    blobNotConfigured: "Blob storage is not configured.",
    blobTokenFailed: "Could not issue a blob upload token.",
    blobMetadataIncomplete: "The uploaded blob metadata is incomplete.",
    invalidPath: "Invalid uploaded file path.",
    alreadyRegistered: "This file is already registered.",
    blobNotFound: "The uploaded blob was not found.",
    blobValidationFailed: "Could not verify the uploaded blob.",
    blobRegisterFailed: "Could not register the uploaded blob.",
    unsupportedRequest: "Unsupported upload request.",
    fileRequired: "Choose a file to upload.",
    uploadFailed: "Could not upload the file."
  },
  progressHistory: {
    forbidden: "You don't have access to the progress history.",
    paramsRequired: "Specify the student and the problem.",
    notFound: "History not found."
  },
  statistics: {
    paramsRequired: "Specify the topic and the student.",
    loadFailed: "Could not load the breakdown."
  },
  storage: {
    sizeExceeded: "The actual file size exceeds the allowed limit.",
    emptyOrTooBig: "The file is empty or exceeds the allowed size.",
    sizeMetadataMismatch: "The actual file size doesn't match the storage metadata."
  }
};
