// Mobile-only strings shared by every area (docs/spec/09-data-i18n-math.md §3.5 "mobile overlay").
// Site texts stay in `dict.*`; this file holds (a) wording the site does not have at all and (b) native
// replacements for web-only wording ("page", "browser", drag & drop). Keep ru and en keys identical.
const ru = {
  actions: {
    retry: "Повторить",
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
    preparing: "Готовим файл…"
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
    openPhoto: "Открыть фото {name}"
  },
  dateTime: {
    pickDate: "Выбрать дату",
    moscowTime: "Время московское (МСК)",
    msk: "МСК"
  },
  a11y: {
    goBack: "Вернуться назад",
    loading: "Идёт загрузка"
  }
};

const en: typeof ru = {
  actions: {
    retry: "Retry",
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
    preparing: "Preparing the file…"
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
    openPhoto: "Open photo {name}"
  },
  dateTime: {
    pickDate: "Pick a date",
    moscowTime: "Moscow time (MSK)",
    msk: "MSK"
  },
  a11y: {
    goBack: "Go back",
    loading: "Loading"
  }
};

export const common = { ru, en };
