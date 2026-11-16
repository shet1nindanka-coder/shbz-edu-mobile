import { apiCommonRu } from "@/lib/i18n/dictionaries/api-common";
import { apiContentRu } from "@/lib/i18n/dictionaries/api-content";
import { apiPlannerRu } from "@/lib/i18n/dictionaries/api-planner";
import { apiStudentRu } from "@/lib/i18n/dictionaries/api-student";
import { plannerRu } from "@/lib/i18n/dictionaries/planner";
import { auditRu, notificationsRu } from "@/lib/i18n/dictionaries/records";
import { studentRu } from "@/lib/i18n/dictionaries/student";
import { studentsRu } from "@/lib/i18n/dictionaries/students";
import { topicsRu } from "@/lib/i18n/dictionaries/topics";

// Русский словарь — эталон структуры: тип Dictionary выводится из него,
// поэтому в английском словаре нельзя ни пропустить ключ, ни добавить лишний.
// Строки с подстановкой используют {имя}, см. format() в lib/i18n.
// Общая оболочка (вход, навигация, настройки) лежит здесь; разделы кабинета —
// в своих файлах рядом (student / topics / students / planner).
export const ru = {
  apiCommon: apiCommonRu,
  apiStudent: apiStudentRu,
  apiContent: apiContentRu,
  apiPlanner: apiPlannerRu,
  audit: auditRu,
  notifications: notificationsRu,
  student: studentRu,
  topics: topicsRu,
  students: studentsRu,
  planner: plannerRu,
  meta: {
    description: "Платформа ШБЗ Школы: общие темы и материалы, индивидуальный прогресс и домашние задания учеников.",
    ogLocale: "ru_RU"
  },
  common: {
    save: "Сохранить",
    go: "Перейти",
    retry: "Попробовать снова",
    home: "На главную",
    noDate: "Без даты",
    homeworkN: "ДЗ {n}"
  },
  roles: {
    STUDENT: "Ученик",
    TEACHER: "Преподаватель",
    DEVELOPER: "Разработчик"
  },
  status: {
    GREEN: { label: "Решен с первого раза", shortLabel: "Зеленый" },
    YELLOW: { label: "Исправлен после самопроверки", shortLabel: "Желтый" },
    RED: { label: "Нужна помощь преподавателя", shortLabel: "Красный" }
  },
  fileSize: { bytes: "Б", kilobytes: "КБ", megabytes: "МБ" },
  passwordPolicy: {
    tooShort: "Пароль должен быть не короче 8 символов.",
    tooLong: "Пароль не должен быть длиннее {max} символов.",
    noLetter: "Пароль должен содержать хотя бы одну букву.",
    noDigit: "Пароль должен содержать хотя бы одну цифру.",
    common: "Этот пароль слишком распространён, выберите другой."
  },
  progress: {
    statuses: { GREEN: "Решил", YELLOW: "Решил с ошибками", RED: "Не решил", none: "Без отметки" },
    sources: {
      teacher: "Отметка учителя",
      homework_check: "Проверка ДЗ",
      lesson_teacher: "Итог урока от учителя",
      lesson_check: "Проверка на уроке",
      lesson_end: "Завершение урока"
    },
    decisions: {
      changed: "Статус изменён",
      reaffirmed: "Отметка подтверждена повторно",
      unchanged: "Статус уже совпадает",
      uncertain: "Проверка не дала определённого результата",
      downgrade_blocked: "Проверка ДЗ не понижает достигнутый статус",
      newer_status: "Сохранена отметка, сделанная после запуска проверки",
      no_status: "Этот итог не меняет общий прогресс",
      lesson_result_preserved: "Сохранён ранее выставленный итог урока"
    }
  },
  nav: {
    sections: "Разделы",
    menu: "Меню",
    settings: "Настройки",
    logout: "Выйти",
    student: {
      overview: "обзор",
      lesson: "урок",
      homeworks: "дз",
      deadlines: "дедлайны",
      theory: "теория",
      info: "общая инфа",
      settings: "настройки"
    },
    teacher: {
      overview: "обзор",
      topics: "темы",
      students: "ученики",
      groups: "группы",
      lessons: "занятия",
      calls: "звонки",
      settings: "настройки"
    },
    developer: {
      topics: "темы",
      accounts: "аккаунты",
      calls: "звонки",
      statistics: "статистика",
      panel: "дев-панель",
      settings: "настройки"
    }
  },
  login: {
    title: "Вход",
    subtitle: "Войдите в личный кабинет платформы",
    loginLabel: "Логин",
    passwordLabel: "Пароль",
    passwordPlaceholder: "Введите пароль",
    showPassword: "Показать",
    hidePassword: "Скрыть",
    showPasswordAria: "Показать пароль",
    hidePasswordAria: "Скрыть пароль",
    submit: "Войти",
    submitting: "Входим…",
    help: "Не получается войти? Напишите преподавателю:",
    rateLimitedFor: "Слишком много попыток входа. Попробуйте снова через {minutes}.",
    minuteForms: ["{n} минуту", "{n} минуты", "{n} минут"],
    errors: {
      empty: "Введите логин и пароль.",
      invalid: "Неверный логин или пароль.",
      database:
        "Не удалось войти — что-то сломалось на нашей стороне. Попробуйте через минуту, а если не пройдёт — напишите преподавателю.",
      rateLimited: "Слишком много попыток входа. Подождите несколько минут и попробуйте снова."
    }
  },
  numberSearch: {
    placeholder: "Найти номер",
    searching: "Ищем номер…",
    invalid: "Введите корректный номер.",
    notFound: "Не удалось найти тему по этому номеру.",
    aria: "Найти номер и открыть тему",
    submit: "Найти"
  },
  shells: {
    errorTitle: "Раздел временно недоступен",
    errorDescription:
      "Во время загрузки кабинета что-то пошло не так. Попробуйте повторить запрос или вернуться на главную страницу.",
    loginErrorTitle: "Не удалось открыть вход",
    loginErrorDescription:
      "Страница входа временно недоступна. Попробуйте повторить загрузку или вернуться на главную.",
    notFoundTitle: "Страница не найдена",
    notFoundDescription: "Возможно, эта страница была удалена или вы перешли по неверной ссылке."
  },
  settings: {
    kicker: "Профиль и интерфейс",
    title: "Настройки",
    notices: {
      infoUpdated: "Личная информация успешно обновлена.",
      infoInvalid: "Укажите имя для профиля.",
      infoSave: "Не удалось сохранить личную информацию. Повторите попытку.",
      passwordUpdated: "Пароль успешно обновлен.",
      passwordInvalid:
        "Новый пароль: минимум 8 символов, обязательно буквы и цифры, без слишком простых комбинаций.",
      passwordMismatch: "Новый пароль и подтверждение не совпадают.",
      passwordCurrent: "Текущий пароль указан неверно.",
      passwordRateLimited: "Слишком много попыток сменить пароль. Подождите 15 минут и попробуйте снова.",
      passwordSave: "Не удалось обновить пароль. Повторите попытку."
    },
    personalInfo: "Личная информация",
    name: "Имя",
    namePlaceholder: "Ваше имя",
    loginLabel: "Логин для входа",
    loginCopyLabel: "Логин",
    nameHint: "Имя в шапке обновится сразу.",
    changePassword: "Сменить пароль",
    currentPassword: "Текущий пароль",
    currentPasswordPlaceholder: "Введите текущий пароль",
    newPassword: "Новый пароль",
    newPasswordPlaceholder: "От 8 символов, буквы и цифры",
    repeatPassword: "Повторите новый пароль",
    repeatPasswordPlaceholder: "Повторите новый пароль",
    updatePassword: "Обновить пароль",
    passwordHint: "Сессии на других устройствах завершатся, текущая будет безопасно обновлена.",
    profileStatus: "Статус профиля",
    role: "Роль",
    onPlatform: "На платформе"
  },
  interface: {
    title: "Интерфейс",
    theme: {
      label: "Тема",
      hint: "Светлое, тёмное или системное оформление интерфейса.",
      system: "Системная",
      // Уже 360 px «Системная» не влезает в строку сегмента — там короткая подпись.
      systemShort: "Авто",
      light: "Светлая",
      dark: "Тёмная"
    },
    hints: {
      label: "Подсказки",
      hint: "Пояснения к настройкам под каждым блоком.",
      on: "Включены",
      off: "Скрыты"
    },
    language: {
      label: "Язык",
      hint: "Язык интерфейса кабинета. Применяется сразу на всех страницах.",
      ru: "Русский",
      en: "English"
    }
  },
  studentHome: {
    kicker: "Обзор",
    title: "Ваш кабинет"
  },
  teacherHome: {
    kicker: "Обзор",
    title: "Кабинет преподавателя",
    topics: { kicker: "Темы", title: "Материалы и ответы", topics: "Темы", numbers: "Номера" },
    students: { kicker: "Ученики", title: "Аккаунты и прогресс", students: "Ученики", files: "Файлы" },
    calls: { kicker: "Звонки", title: "Связь с родителями", due: "Пора позвонить", overdue: "Просрочено" }
  }
};
