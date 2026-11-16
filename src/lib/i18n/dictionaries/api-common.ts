// Общие JSON-ошибки API-роутов: одинаковые тексты из разных роутов живут
// здесь, чтобы не множить копии. Специфичные ошибки — в api-student /
// api-content / api-planner. Английская версия типизирована русской.
export const apiCommonRu = {
  sessionExpired: "Сессия истекла. Войдите заново.",
  unauthorized: "Нет доступа.",
  developerRightsRequired: "Нужны права разработчика.",
  invalidData: "Некорректные данные.",
  rateLimited: "Слишком много запросов. Подождите немного и попробуйте снова.",
  serviceUnavailable: "Сервис временно недоступен. Попробуйте снова позже.",
  reportsBusy: "Сервер занят формированием отчётов. Попробуйте через минуту.",
  // {what} — что именно не создано: «Таблица ДЗ», «Колонка deadlineAt».
  migrationMissing: "{what} ещё не создана в PostgreSQL. Сначала примените миграцию.",
  studentNotFound: "Ученик не найден.",
  topicNotFound: "Тема не найдена.",
  numberNotFound: "Номер не найден.",
  homeworkNotFound: "ДЗ не найдено.",
  lessonNotFound: "Урок не найден.",
  groupNotFound: "Группа не найдена.",
  draftNotFound: "Черновик не найден.",
  studentOrNumberNotFound: "Ученик или номер задания не найден."
};

export const apiCommonEn: typeof apiCommonRu = {
  sessionExpired: "Your session has expired. Please sign in again.",
  unauthorized: "Access denied.",
  developerRightsRequired: "Developer rights are required.",
  invalidData: "Invalid data.",
  rateLimited: "Too many requests. Wait a moment and try again.",
  serviceUnavailable: "The service is temporarily unavailable. Try again later.",
  reportsBusy: "The server is busy generating reports. Try again in a minute.",
  migrationMissing: "{what} hasn't been created in PostgreSQL yet. Apply the migration first.",
  studentNotFound: "Student not found.",
  topicNotFound: "Topic not found.",
  numberNotFound: "Problem not found.",
  homeworkNotFound: "Homework not found.",
  lessonNotFound: "Lesson not found.",
  groupNotFound: "Group not found.",
  draftNotFound: "Draft not found.",
  studentOrNumberNotFound: "Student or problem not found."
};
