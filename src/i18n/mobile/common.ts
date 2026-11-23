// Mobile-only strings shared by every area (docs/spec/09-data-i18n-math.md §3.5 "mobile overlay").
// Site texts stay in `dict.*`; this file holds (a) wording the site does not have at all and (b) native
// replacements for web-only wording ("page", "browser", drag & drop). Keep ru and en keys identical.
const ru = {
  actions: {
    retry: "Повторить",
    ok: "ОК",
    cancel: "Отмена",
    close: "Закрыть",
    done: "Готово",
    share: "Поделиться",
    showMore: "Показать ещё",
    openSettings: "Открыть настройки"
  },
  states: {
    loading: "Загрузка…",
    saving: "Сохраняем…"
  },
  offline: {
    banner: "Нет подключения к интернету",
    bannerHint: "Показываем сохранённые данные. Изменения станут доступны после подключения."
  },
  errors: {
    generic: "Что-то пошло не так. Попробуйте ещё раз.",
    network: "Нет связи с сервером. Проверьте подключение и попробуйте снова.",
    internalError: "Раздел временно недоступен. Попробуйте ещё раз чуть позже.",
    fileNotFound: "Файл не найден или был удалён.",
    exportFailed: "Не удалось сформировать отчёт. Попробуйте ещё раз.",
    retryIn: "Повторить можно через {time}.",
    secondForms: ["{n} секунду", "{n} секунды", "{n} секунд"]
  },
  files: {
    openInAnotherApp: "Открыть в другом приложении",
    share: "Поделиться файлом",
    downloading: "Скачиваем файл…",
    downloadFailed: "Не удалось скачать файл. Попробуйте ещё раз.",
    noAppToOpen: "На устройстве нет приложения, которое открывает такие файлы.",
    sharingUnavailable: "На этом устройстве нельзя поделиться файлом.",
    previewUnavailable: "Предпросмотр недоступен — откройте файл в другом приложении.",
    docxHint: "Файл Word откроется в приложении, установленном на устройстве.",
    fileOf: "{current} из {total}",
    previousFile: "Предыдущий файл",
    nextFile: "Следующий файл",
    openFailed: "Не удалось открыть файл. Попробуйте ещё раз.",
    imageFailed: "Не удалось показать изображение.",
    pdfExternalOnly: "На этом устройстве PDF открывается в отдельном приложении.",
    preparing: "Готовим файл…",
    untitled: "Файл",
    /** A file card button named after its slot: every topic shows two cards with the same buttons. */
    actionOf: "{action}: {slot}"
  },
  photos: {
    add: "Добавить фото",
    takePhoto: "Сделать фото",
    chooseFromGallery: "Выбрать из галереи",
    preparing: "Готовим фото…",
    cameraPermissionTitle: "Нужен доступ к камере",
    cameraPermissionBody: "Камера нужна, чтобы сфотографировать решение и отправить его на проверку.",
    galleryPermissionTitle: "Нужен доступ к фото",
    galleryPermissionBody: "Доступ к фото нужен, чтобы прикрепить снимок решения из галереи.",
    permissionDenied: "Доступ запрещён. Разрешите его в настройках устройства.",
    cameraUnavailable: "Камера на этом устройстве недоступна.",
    pickFailed: "Не удалось подготовить фото. Попробуйте выбрать его ещё раз.",
    openPhoto: "Открыть фото {name}",
    openPhotoOf: "Открыть фото {n} из {total}",
    removePhotoOf: "Удалить фото {n} из {total}",
    photoOf: "Фото {n} из {total}"
  },
  dateTime: {
    pickDate: "Выбрать дату",
    moscowTime: "Время московское (МСК)",
    msk: "МСК",
    notSet: "не выбрано"
  },
  // The link above a screen title when the parent screen has no shorter name.
  back: "Назад",
  // Short names of the number statuses (the owner's wording): `label` — in chips and next to a number,
  // `group` — the heading of a group in «Все номера». The long site names stay for screen readers.
  statuses: {
    GREEN: { label: "решил сам", group: "Решил сам" },
    YELLOW: { label: "исправил", group: "Исправил" },
    RED: { label: "нужна помощь", group: "Нужна помощь" },
    none: { label: "не отмечено", group: "Осталось" },
    // «Нужна помощь · 4», «31 решил сам»
    groupCount: "{label} · {n}",
    barPart: "{n} {label}"
  },
  numbers: {
    all: "Все номера",
    leftOf: "Осталось {left} из {total}",
    allSolved: "Все номера решены",
    doneOf: "{done} из {total}",
    tileA11y: "{number}, {status}",
    range: "{first}–{last}"
  },
  // The one caption of a homework row (`deadlineCaption`). Weekdays are in the genitive («до пятницы»).
  deadline: {
    none: "без срока",
    done: "выполнено",
    today: "сегодня до {time}",
    tomorrow: "до завтра, {time}",
    weekday: "до {weekday}",
    weekdays: ["понедельника", "вторника", "среды", "четверга", "пятницы", "субботы", "воскресенья"],
    date: "до {date}",
    overdueToday: "просрочено сегодня",
    overdue: "просрочено {days}",
    dayForms: ["{n} день", "{n} дня", "{n} дней"] as string[]
  },
  a11y: {
    goBack: "Вернуться назад",
    loading: "Идёт загрузка"
  }
};

const en: typeof ru = {
  actions: {
    retry: "Retry",
    ok: "OK",
    cancel: "Cancel",
    close: "Close",
    done: "Done",
    share: "Share",
    showMore: "Show more",
    openSettings: "Open settings"
  },
  states: {
    loading: "Loading…",
    saving: "Saving…"
  },
  offline: {
    banner: "No internet connection",
    bannerHint: "Showing saved data. Changes will be available once you are back online."
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    network: "Cannot reach the server. Check your connection and try again.",
    internalError: "This section is temporarily unavailable. Please try again a little later.",
    fileNotFound: "The file was not found or has been deleted.",
    exportFailed: "Could not build the report. Please try again.",
    retryIn: "You can retry in {time}.",
    secondForms: ["{n} second", "{n} seconds"]
  },
  files: {
    openInAnotherApp: "Open in another app",
    share: "Share file",
    downloading: "Downloading the file…",
    downloadFailed: "Could not download the file. Please try again.",
    noAppToOpen: "No app on this device can open this kind of file.",
    sharingUnavailable: "Sharing files is not available on this device.",
    previewUnavailable: "No preview available — open the file in another app.",
    docxHint: "The Word file will open in an app installed on your device.",
    fileOf: "{current} of {total}",
    previousFile: "Previous file",
    nextFile: "Next file",
    openFailed: "Could not open the file. Please try again.",
    imageFailed: "Could not show the image.",
    pdfExternalOnly: "On this device a PDF opens in a separate app.",
    preparing: "Preparing the file…",
    untitled: "File",
    actionOf: "{action}: {slot}"
  },
  photos: {
    add: "Add a photo",
    takePhoto: "Take photo",
    chooseFromGallery: "Choose from gallery",
    preparing: "Preparing the photo…",
    cameraPermissionTitle: "Camera access needed",
    cameraPermissionBody: "The camera is used to photograph your solution and send it for checking.",
    galleryPermissionTitle: "Photo access needed",
    galleryPermissionBody: "Photo access is used to attach a picture of your solution from the gallery.",
    permissionDenied: "Access denied. Allow it in the device settings.",
    cameraUnavailable: "The camera is not available on this device.",
    pickFailed: "Could not prepare the photo. Please pick it again.",
    openPhoto: "Open photo {name}",
    openPhotoOf: "Open photo {n} of {total}",
    removePhotoOf: "Remove photo {n} of {total}",
    photoOf: "Photo {n} of {total}"
  },
  dateTime: {
    pickDate: "Pick a date",
    moscowTime: "Moscow time (MSK)",
    msk: "MSK",
    notSet: "not set"
  },
  back: "Back",
  statuses: {
    GREEN: { label: "solved alone", group: "Solved alone" },
    YELLOW: { label: "corrected", group: "Corrected" },
    RED: { label: "needs help", group: "Needs help" },
    none: { label: "not marked", group: "Left" },
    groupCount: "{label} · {n}",
    barPart: "{n} {label}"
  },
  numbers: {
    all: "All problems",
    leftOf: "{left} of {total} left",
    allSolved: "All problems are solved",
    doneOf: "{done} of {total}",
    tileA11y: "{number}, {status}",
    range: "{first}–{last}"
  },
  deadline: {
    none: "no deadline",
    done: "done",
    today: "due today, {time}",
    tomorrow: "due tomorrow, {time}",
    weekday: "due {weekday}",
    weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    date: "due {date}",
    overdueToday: "overdue since today",
    overdue: "overdue by {days}",
    dayForms: ["{n} day", "{n} days"]
  },
  a11y: {
    goBack: "Go back",
    loading: "Loading"
  }
};

export const common = { ru, en };
