// JSON-ошибки API ученика: app/api/student/**, app/api/realtime.
// Общие тексты — в api-common.ts. Английская версия типизирована русской.
export const apiStudentRu = {
  // Загрузка фото решения — общие тексты для сдач ДЗ и номеров урока.
  upload: {
    multipartExpected: "Ожидается multipart-загрузка фотографий.",
    contentLengthRequired: "Для загрузки фотографий обязателен Content-Length.",
    contentLengthInvalid: "Некорректный Content-Length.",
    bodyTooLarge: "Суммарный размер загрузки не должен превышать 15 МБ.",
    invalidPhotoData: "Некорректные данные для загрузки фото.",
    photosTooLarge: "Суммарный размер фотографий не должен превышать 15 МБ.",
    onlyPngOrJpg: "Можно загружать только фото в формате PNG или JPG.",
    fileRejected: "Файл не прошёл проверку.",
    // Формы для plural(): «не больше {n} фото».
    photoCount: ["{n} фото", "{n} фото", "{n} фото"],
    // {what} для apiCommon.migrationMissing.
    photoTable: "Таблица фото"
  },
  homeworkChecks: {
    queueFull: "Очередь автопроверки переполнена. Попробуйте через несколько минут.",
    disabled: "Автоматическая проверка сейчас отключена. Попросите разработчика включить её.",
    invalidData: "Некорректные данные для проверки.",
    checkTable: "Таблица проверок",
    alreadyRunning: "Проверка уже идёт — дождитесь результата.",
    photosChanged: "Набор фото изменился. Повторите запуск проверки.",
    attachPhotosFirst: "Сначала прикрепите фото решения.",
    noNumbers: "В этом ДЗ нет номеров для проверки."
  },
  homeworkSubmissions: {
    // {count} — результат plural() по upload.photoCount.
    photoLimit: "К одному ДЗ можно прикрепить не больше {count}.",
    invalidDeleteData: "Некорректные данные для удаления фото.",
    concurrentChange: "Другой запрос одновременно изменил фотографии. Повторите загрузку.",
    photoNotFound: "Фото не найдено."
  },
  lessonSubmissions: {
    queueFull: "Очередь проверки переполнена. Попробуйте через несколько минут.",
    disabled: "Проверка классной работы сейчас отключена. Покажите решение учителю.",
    photoLimit: "К одному номеру можно прикрепить не больше {count}.",
    itemNotFound: "Номер урока не найден.",
    lessonNotActive: "Урок сейчас не идёт — сдать решение нельзя.",
    submissionTable: "Таблица сдач",
    alreadyAccepted: "№ {number} уже принят.",
    extraPartLocked: "Дополнительная часть откроется, когда будет закрыта основная.",
    alreadyRunning: "Проверка этого номера уже идёт — дождитесь результата.",
    concurrentChange: "Другой запрос одновременно изменил сдачу. Повторите загрузку."
  },
  lesson: {
    notActive: "Урок сейчас не идёт."
  },
  topicStatus: {
    statusReadOnly: "Статус выставляется автоматической проверкой или учителем.",
    invalidData: "Некорректные данные для сохранения номера.",
    numberNotFound: "Номер задания для этой темы не найден."
  },
  findNumber: {
    invalidNumber: "Введите корректный номер.",
    notFound: "Такой номер не найден."
  },
  realtime: {
    tooManyConnections: "Слишком много одновременных realtime-соединений."
  }
};

export const apiStudentEn: typeof apiStudentRu = {
  upload: {
    multipartExpected: "A multipart photo upload is expected.",
    contentLengthRequired: "Content-Length is required for photo uploads.",
    contentLengthInvalid: "Invalid Content-Length.",
    bodyTooLarge: "The total upload size must not exceed 15 MB.",
    invalidPhotoData: "Invalid photo upload data.",
    photosTooLarge: "The total size of the photos must not exceed 15 MB.",
    onlyPngOrJpg: "Only PNG or JPG photos can be uploaded.",
    fileRejected: "The file failed validation.",
    photoCount: ["{n} photo", "{n} photos"],
    photoTable: "The photo table"
  },
  homeworkChecks: {
    queueFull: "The AI check queue is full. Try again in a few minutes.",
    disabled: "Automatic checking is currently disabled. Ask the developer to enable it.",
    invalidData: "Invalid check data.",
    checkTable: "The check table",
    alreadyRunning: "A check is already running. Wait for the result.",
    photosChanged: "The set of photos has changed. Start the check again.",
    attachPhotosFirst: "Attach a solution photo first.",
    noNumbers: "This homework has no problems to check."
  },
  homeworkSubmissions: {
    photoLimit: "You can attach at most {count} to one homework.",
    invalidDeleteData: "Invalid photo deletion data.",
    concurrentChange: "Another request changed the photos at the same time. Upload again.",
    photoNotFound: "Photo not found."
  },
  lessonSubmissions: {
    queueFull: "The check queue is full. Try again in a few minutes.",
    disabled: "Classwork checking is currently disabled. Show your solution to the teacher.",
    photoLimit: "You can attach at most {count} to one problem.",
    itemNotFound: "Lesson problem not found.",
    lessonNotActive: "The lesson isn't in progress right now, so you can't submit a solution.",
    submissionTable: "The submission table",
    alreadyAccepted: "Problem {number} has already been accepted.",
    extraPartLocked: "The extra part unlocks once the main part is closed.",
    alreadyRunning: "This problem is already being checked. Wait for the result.",
    concurrentChange: "Another request changed the submission at the same time. Upload again."
  },
  lesson: {
    notActive: "The lesson isn't in progress right now."
  },
  topicStatus: {
    statusReadOnly: "The status is set by the automatic check or by the teacher.",
    invalidData: "Invalid data for saving the problem.",
    numberNotFound: "Problem not found for this topic."
  },
  findNumber: {
    invalidNumber: "Enter a valid problem number.",
    notFound: "No such problem found."
  },
  realtime: {
    tooManyConnections: "Too many simultaneous realtime connections."
  }
};
