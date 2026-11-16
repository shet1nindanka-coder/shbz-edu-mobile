// Словарь раздела тем: /teacher/topics/**, редактор номеров, ответы, импорт,
// общие виджеты (селект, дата-пикер, диалоги подтверждения, загрузка файлов).
// Группы — по компоненту/странице; `widgets` и `errors` общие; `lib` — строки
// чистых функций из lib/ (topic-import, topic-numbers-change, upload-validation,
// progress-history), которые получают locale параметром.
export const topicsRu = {
  widgets: {
    numberLabel: "№ {number}",
    numberForms: ["{n} номер", "{n} номера", "{n} номеров"],
    selectPlaceholder: "Выбрать",
    confirm: { kicker: "Подтверждение", confirm: "Да, удалить", pending: "Удаляем…", cancel: "Отмена" },
    delete: "Удалить",
    fileDrop: {
      helper: "Перетащите файл сюда или нажмите, чтобы выбрать его вручную.",
      none: "Файл пока не выбран",
      replace: "Заменить файл",
      choose: "Выбрать файл"
    },
    dropzoneUploadAria: "Отправка файлов",
    copy: { title: "Нажмите, чтобы скопировать", copied: "Скопировано", copiedAria: "{label} скопирован" },
    numberSelectAria: "Выбрать № {number}",
    datetime: {
      placeholder: "Выбрать дату и время",
      weekDays: ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"],
      months: [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
      ],
      prevMonth: "Предыдущий месяц",
      nextMonth: "Следующий месяц",
      time: "Время",
      hours: "Часы",
      minutes: "Минуты",
      clear: "Очистить",
      today: "Сегодня",
      done: "Готово"
    }
  },
  errors: {
    sessionExpired: "Сессия истекла. Обновите страницу и войдите заново.",
    numberGone: "Номер больше не найден. Обновите страницу.",
    fileInvalid: "Файл не прошёл валидацию. Проверьте формат и размер.",
    uploadFailed: "Не удалось загрузить файл. Попробуйте ещё раз.",
    blobRegisterFailed: "Не удалось завершить загрузку файла. Попробуйте ещё раз.",
    blobUploadFailed:
      "Не удалось загрузить файл в storage. Проверьте настройки файлового хранилища и повторите попытку.",
    networkUpload: "Сеть прервалась во время загрузки файла.",
    conditionSave: "Сохранение условия не удалось.",
    conditionSaveFallback: "Не удалось сохранить условие.",
    conditionDelete: "Не удалось удалить условие.",
    answerBind: "Не удалось привязать ответ к номеру.",
    answerSave: "Сохранение ответа не удалось.",
    answerSaveFallback: "Не удалось сохранить ответ.",
    answerDelete: "Не удалось удалить ответ."
  },
  list: {
    kicker: "Темы",
    title: "Материалы и номера",
    createSection: "Создать новую тему",
    allTopics: "Все темы",
    empty: "Пока нет ни одной темы",
    cardKicker: "Тема",
    activeMeta: "{count} активных",
    open: "Открыть",
    notices: {
      created: "Новая тема успешно создана.",
      deleted: "Тема успешно удалена.",
      invalid: "Проверьте форму: название, описание, файлы и список номеров обязательны.",
      upload: "Не удалось загрузить файлы. Проверьте настройки storage и повторите попытку.",
      save: "Не удалось сохранить тему в базе данных. Проверьте подключение к PostgreSQL и логи сервера.",
      delete: "Не удалось удалить тему. Проверьте логи сервера и повторите попытку."
    }
  },
  deleteTopic: {
    label: "Удалить тему",
    title: "Удалить тему?",
    before: "Тема ",
    quoted: "«{title}»",
    after: " будет удалена вместе с прикреплёнными файлами и статусами по номерам. Это действие нельзя отменить.",
    afterWithTotal:
      " будет удалена вместе с прикреплёнными файлами и всеми номерами ({total}). Это действие нельзя отменить.",
    workBefore: "Вместе с темой безвозвратно исчезнет работа по ",
    workAfterForms: [" номеру:", " номерам:", " номерам:"],
    noWork: "По номерам этой темы пока нет ни прогресса учеников, ни условий и ответов."
  },
  view: {
    back: "← Ко всем темам",
    eyebrow: "Тема",
    materialsTitle: "Материалы",
    materialsDescription: "Файлы теории и заданий — так их видит ученик.",
    theory: "Теория",
    homework: "Задания",
    numbersTitle: "Номера и ответы",
    numbersDescription: "Условия и ответы к номерам темы."
  },
  viewNumbers: {
    emptyTitle: "Номера пока не добавлены",
    emptyHint: "Добавьте номера во вкладке «Редактирование».",
    condition: "Условие",
    noCondition: "Условие не добавлено.",
    answer: "Ответ",
    showAnswer: "Показать ответ",
    noAnswer: "Ответ не добавлен."
  },
  tabs: { view: "Просмотр", edit: "Редактирование", aria: "Режимы темы" },
  edit: {
    notices: {
      saved: "Изменения по теме сохранены.",
      theoryDeleted: "Файл теории удалён.",
      homeworkDeleted: "Файл заданий удалён.",
      invalid: "Проверьте форму: название, описание и список номеров обязательны.",
      upload: "Не удалось обработать файл. Попробуйте ещё раз или обновите страницу.",
      fileDelete: "Не удалось удалить файл. Повторите попытку.",
      save: "Не удалось сохранить изменения. Проверьте подключение к базе данных и повторите попытку.",
      numbersTwin:
        "Изменения не сохранены: среди новых номеров есть совпадающие с существующими с точностью до ведущих нулей (например, 01 и 1). Это один и тот же номер — оставьте один вариант записи.",
      numbersConfirm:
        "Изменения не сохранены: удаление номеров с работой учеников нужно подтвердить. Обновите страницу и сохраните ещё раз — список последствий покажется перед сохранением.",
      numbersAssigned:
        "Изменения не сохранены: среди удаляемых есть номера из активных ДЗ. Отметьте согласие в окне подтверждения или сначала отмените эти ДЗ.",
      deleteChanged:
        "Тема не удалена: с момента открытия страницы у неё изменился объём работы учеников. Обновите страницу — в окне подтверждения будут актуальные последствия."
    },
    sectionTitle: "Редактирование темы",
    basicInfo: "Основная информация",
    titleLabel: "Название темы",
    descriptionLabel: "Описание — необязательно",
    numbers: "Номера",
    numbersDescription: "Можно вставлять длинные списки в несколько строк.",
    files: "Файлы",
    replaceTheory: "Заменить файл теории",
    replaceHomework: "Заменить файл заданий",
    replaceHint: "Можно выбрать новый файл или перетащить его сюда.",
    deleteTheory: {
      label: "Удалить файл теории",
      title: "Удалить файл теории?",
      description:
        "Файл теории будет откреплён от темы и удалён из хранилища. Ученики перестанут его видеть. Это действие нельзя отменить."
    },
    deleteHomework: {
      label: "Удалить файл заданий",
      title: "Удалить файл заданий?",
      description:
        "Файл заданий будет откреплён от темы и удалён из хранилища. Ученики перестанут его видеть. Это действие нельзя отменить."
    },
    saving: "Сохранение",
    answersTitle: "Условия и ответы к заданиям",
    answersDescription: "LaTeX-условия и ответы к номерам."
  },
  submit: {
    save: "Сохранить изменения",
    saving: "Сохраняем изменения…",
    checking: "Проверяем изменения…",
    previewFailed: "Не удалось проверить изменения. Сохраняем как есть.",
    pendingHint: "Файлы и номера обновляются. Не закрывайте страницу.",
    dialogTitle: "Из темы исчезнут номера с работой учеников",
    dialogIntro:
      "Эти номера пропадут из темы, а вместе с ними — всё, что к ним привязано. Восстановить будет нечем.",
    added: "Появятся новые номера: {numbers}.",
    kept: "Останется без изменений: {count}.",
    assignedAck:
      "Понимаю, что {numbers} сейчас в активных ДЗ — задание у ученика станет короче, и он об этом не узнает.",
    confirm: "Да, удалить эти номера",
    pending: "Сохраняем…"
  },
  answerManager: {
    status: { full: "Условие и ответ", partial: "Частично заполнено", empty: "Пусто" },
    navTitle: "Навигация по условиям и ответам",
    shownRange: "Показаны номера {start}-{end} из {total}",
    savedSummary:
      "Сохранено условий: {conditions} из {total}. Сохранено ответов: {answers} из {total}. Для больших тем блок разбит на страницы по {pageSize} номеров.",
    page: "Страница",
    prev: "Назад",
    next: "Вперед",
    cardKicker: "Материалы к номеру",
    hasCondition: "Условие есть",
    noCondition: "Без условия",
    hasAnswer: "Ответ есть",
    noAnswer: "Без ответа",
    conditionLabel: "LaTeX-условие",
    conditionPlaceholder:
      "Например:\nРешите уравнение $$2x^2-3x-5=0$$\n\nМожно добавлять текст и формулы в одном поле.",
    latexHintBefore: "Поддерживаются inline-формулы через ",
    latexHintMiddle: " и отдельные блоки через ",
    latexHintAfter: ".",
    conditionPreview: "Предпросмотр условия",
    conditionEmpty: "Пока условие к этому номеру не добавлено.",
    saveCondition: "Сохранить условие",
    saving: "Сохраняем…",
    deleteCondition: "Удалить условие",
    deleteConditionTitle: "Удалить условие № {number}?",
    deleteConditionDescription:
      "Сохранённое условие в LaTeX будет удалено. Ученики и ИИ-проверка перестанут его видеть. Это действие нельзя отменить.",
    answerLabel: "LaTeX-ответ",
    answerPlaceholder:
      "Например:\n$$x = \\frac{-b \\pm \\sqrt{D}}{2a}$$\n\nИли с текстом:\nПодставим в формулу: $D=b^2-4ac$",
    answerPreview: "Предпросмотр ответа",
    answerEmpty: "Пока ответ к этому номеру не добавлен.",
    saveAnswer: "Сохранить ответ",
    deleteAnswer: "Удалить ответ",
    deleteAnswerTitle: "Удалить ответ № {number}?",
    deleteAnswerDescription:
      "Сохранённый ответ в LaTeX будет удалён. ИИ-проверка перестанет сверять решения с ним. Это действие нельзя отменить.",
    pageOf: "Страница {page} из {total}",
    prevPage: "Предыдущая страница",
    nextPage: "Следующая страница"
  },
  singleNumber: {
    back: "← К теме",
    title: "Номер {number}",
    sectionTitle: "Условие и ответ",
    sectionDescription: "Редактируйте LaTeX-условие и ответ для этого номера.",
    conditionLabel: "Условие (LaTeX)",
    conditionPlaceholder: "Введите условие в формате LaTeX",
    answerLabel: "Ответ (LaTeX)",
    answerPlaceholder: "Введите ответ в формате LaTeX",
    preview: "Предпросмотр"
  },
  createForm: {
    createInvalid: "Проверьте форму: название, описание, оба файла и список номеров обязательны.",
    createFailed: "Не удалось создать тему. Проверьте подключение к базе данных и повторите попытку.",
    networkCreate: "Сеть прервалась во время создания темы. Попробуйте ещё раз.",
    fileHelper: "Поддерживаются PDF, DOCX, PNG и JPG. Можно выбрать файл или просто перетащить его в это поле.",
    uploading: "Загрузка файла…",
    uploaded: "Загружено:",
    sizeUnits: { b: "Б", kb: "КБ", mb: "МБ" },
    titleLabel: "Название темы",
    titlePlaceholder: "Например, Логарифмы и их свойства",
    descriptionLabel: "Описание",
    optional: "— необязательно",
    descriptionPlaceholder: "Что нужно изучить в теории и на что обратить внимание в заданиях по теме.",
    theoryFile: "Файл теории",
    homeworkFile: "Файл заданий",
    numbersDescription: "Подходит и для коротких списков, и для больших тем на сотни номеров.",
    hintUploading: "Дождитесь окончания загрузки файлов. Кнопка создания станет доступной автоматически.",
    hintReady: "Оба файла загружены. Теперь можно создавать тему.",
    hintStart: "Сначала загрузите файл теории и файл заданий.",
    submit: "Создать тему",
    submitting: "Создаем тему…"
  },
  createSwitch: { ai: "С помощью ИИ", manual: "Вручную", aria: "Способ создания темы" },
  importPrompt: {
    copy: "Скопировать промпт для ИИ",
    copied: "Скопировано",
    clipboardDenied: "Браузер не дал доступ к буферу обмена"
  },
  importPanel: {
    readFailed: "Не удалось прочитать файл.",
    importFailed: "Импорт не удался. Попробуйте ещё раз.",
    serverSilent: "Сервер не ответил. Проверьте соединение и попробуйте снова.",
    dropTitle: "Перетащите ответ ИИ сюда или нажмите",
    dragTitle: "Отпустите файл",
    successTitle: "Файл добавлен",
    fileRead: "Файл прочитан — нажмите «Проверить файл»",
    oneJson: "Один файл .json · ",
    pasteText: "вставить текстом",
    jsonLabel: "JSON текстом",
    hintCreate:
      "Промпт и задачник — в любой чат с ИИ, ответ-файл загрузите сюда. Название, описание и номера темы приедут из файла.",
    hintAdd:
      "Промпт и задачник — в любой чат с ИИ, ответ-файл загрузите сюда. Номера с условиями и ответами добавятся в эту тему.",
    check: "Проверить файл",
    checking: "Проверяем…",
    fileSummary: "Файл «{title}», задач внутри: {count}",
    willCreate: "Будет создана тема",
    duplicateTitle:
      "Тема с таким названием уже существует. Возможно, этот задачник уже импортирован — тогда отмените импорт и добавьте номера в существующую тему с её страницы редактирования.",
    tiles: { add: "Добавим", fill: "Заполним пустых", overwrite: "Перезапишем", untouched: "Без изменений" },
    overwriteLabel: "Перезаписывать уже заполненные условия и ответы",
    overwriteWarning: "Ручные правки этих номеров ({count} шт.) будут потеряны.",
    issues: "Отбраковано при проверке",
    warnings: "Предупреждения от модели",
    sample: "Как это увидит ученик",
    sampleNumber: "Номер {number}",
    answer: "Ответ",
    noAnswer: "Ответа нет — автопроверка отправит номер на ручную проверку.",
    apply: "Импортировать",
    applyCreate: "Создать тему и импортировать",
    applying: "Импортируем…",
    cancel: "Отменить",
    done: "Готово: добавлено {created}, заполнено {filled}, перезаписано {overwritten}",
    doneSkipped: ", пропущено заполненных {skipped}"
  },
  numbersField: {
    label: "Номера заданий",
    description: "Запятая, пробел, новая строка или диапазон через тире.",
    placeholder: "1-5, 8, 12-14",
    empty: "Пока нет номеров",
    range: "Диапазон {from}-{to}",
    computing: "Обновляем список номеров…",
    unrecognized: "Не удалось распознать номера. Используйте числа и диапазоны вроде 1-5.",
    finalList: "Итоговый список: {list}"
  },
  reorder: {
    saveFailed: "Не удалось сохранить порядок тем.",
    hint: "Перетащите карточку, чтобы изменить порядок тем — его видят и ученики."
  },
  history: {
    loadFailed: "Не удалось загрузить историю. Попробуйте ещё раз.",
    loadFailedShort: "Не удалось загрузить историю.",
    show: "История статуса",
    hide: "Скрыть историю статуса",
    current: "Сейчас: {status}",
    timeZone: "МСК",
    empty: "Записей пока нет. История появится после новой отметки или проверки.",
    notRecorded: "Изменения до включения истории не записывались.",
    loading: "Загружаем историю…",
    retry: "Повторить",
    earlier: "Более ранние записи"
  },
  lib: {
    import: {
      empty: "Файл пустой.",
      notJson:
        "Файл не разбирается как JSON. Чаще всего модель не удвоила обратные слэши в формулах — попросите её прислать файл заново, строго по промпту.",
      notObject: "Файл должен быть JSON-объектом. Проверьте, что скопирован весь ответ модели.",
      version: "Не та версия формата: ожидается formatVersion {version}. Возьмите свежий промпт со страницы импорта.",
      noTopic: "В файле нет блока topic с названием темы.",
      emptyTitle: "В файле пустое название темы (topic.title).",
      noNumbers: "В файле нет списка задач (numbers).",
      tooMany: "За один импорт берём не больше {max} задач — остальные пропущены. Разбейте файл на части.",
      notObjectEntry: "Пропущена запись: это не объект задачи.",
      badNumber: "Пропущена запись с неверным номером: {value}.",
      duplicate: "Номер {number} встречается несколько раз — взят первый.",
      emptyCondition: "Номер {number} пропущен: пустое условие.",
      nothingParsed: "В файле нет ни одной задачи, которую удалось бы разобрать."
    },
    numbersChange: {
      studentForms: ["{n} ученика", "{n} учеников", "{n} учеников"],
      statusAt: "статус у {students}",
      notesAt: "заметки у {students}",
      deadlineAt: "дедлайн у {students}",
      assignmentForms: ["{n} активное ДЗ", "{n} активных ДЗ", "{n} активных ДЗ"],
      inAssignments: "входит в {assignments}",
      verdictForms: ["{n} вердикт", "{n} вердикта", "{n} вердиктов"],
      verdictsOfCheck: "{verdicts} ИИ-проверки",
      lessonItemForms: ["{n} пункт", "{n} пункта", "{n} пунктов"],
      lessonItems: "{items} в наборах занятий",
      conditionAndAnswer: "условие и ответ",
      condition: "условие",
      answer: "ответ",
      answerFile: "файл с ответом",
      nothing: "ничего не потеряется",
      statusForms: ["{n} статус", "{n} статуса", "{n} статусов"],
      statusLine: "{statuses} светофора у учеников",
      noteForms: ["{n} заметка", "{n} заметки", "{n} заметок"],
      noteLine: "{notes} учеников",
      assignedLine: "{numbers} из активных ДЗ (сами ДЗ тоже удалятся вместе с фото решений)",
      verdictLine: "{verdicts} ИИ-проверок",
      lessonLine: "{items} в наборах занятий и черновиках ДЗ",
      latexLine: "LaTeX: условий — {conditions}, ответов — {answers}"
    },
    upload: {
      nameTooLong: "Имя файла должно содержать не больше {max} символов.",
      badChars: "Имя файла содержит недопустимые символы.",
      extension: "Поддерживаются только PDF, DOCX, PNG и JPG.",
      emptySize: "Файл пуст или имеет некорректный размер.",
      tooBig: "Файл слишком большой. Максимальный размер — 15 МБ.",
      mimeMismatch: "Тип файла не соответствует его расширению.",
      sizeMismatch: "Фактический размер файла не совпадает с заявленным.",
      signature: "Содержимое файла не соответствует заявленному формату."
    },
    history: { system: "Система", ai: "ИИ", openLesson: "Открыть урок", openHomework: "Открыть ДЗ" }
  }
};

export const topicsEn: typeof topicsRu = {
  widgets: {
    numberLabel: "No. {number}",
    numberForms: ["{n} problem", "{n} problems"],
    selectPlaceholder: "Select",
    confirm: { kicker: "Confirmation", confirm: "Yes, delete", pending: "Deleting…", cancel: "Cancel" },
    delete: "Delete",
    fileDrop: {
      helper: "Drag a file here or click to choose one.",
      none: "No file selected",
      replace: "Replace file",
      choose: "Choose file"
    },
    dropzoneUploadAria: "Uploading files",
    copy: { title: "Click to copy", copied: "Copied", copiedAria: "{label} copied" },
    numberSelectAria: "Select No. {number}",
    datetime: {
      placeholder: "Pick date and time",
      weekDays: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
      months: [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ],
      prevMonth: "Previous month",
      nextMonth: "Next month",
      time: "Time",
      hours: "Hours",
      minutes: "Minutes",
      clear: "Clear",
      today: "Today",
      done: "Done"
    }
  },
  errors: {
    sessionExpired: "Your session has expired. Reload the page and sign in again.",
    numberGone: "This problem no longer exists. Reload the page.",
    fileInvalid: "The file failed validation. Check its format and size.",
    uploadFailed: "Could not upload the file. Try again.",
    blobRegisterFailed: "Could not finish uploading the file. Try again.",
    blobUploadFailed: "Could not upload the file to storage. Check the file storage settings and try again.",
    networkUpload: "The connection dropped while uploading the file.",
    conditionSave: "Could not save the statement.",
    conditionSaveFallback: "Could not save the statement.",
    conditionDelete: "Could not delete the statement.",
    answerBind: "Could not attach the answer to the problem.",
    answerSave: "Could not save the answer.",
    answerSaveFallback: "Could not save the answer.",
    answerDelete: "Could not delete the answer."
  },
  list: {
    kicker: "Topics",
    title: "Materials and problems",
    createSection: "Create a new topic",
    allTopics: "All topics",
    empty: "No topics yet",
    cardKicker: "Topic",
    activeMeta: "{count} active",
    open: "Open",
    notices: {
      created: "New topic created.",
      deleted: "Topic deleted.",
      invalid: "Check the form: title, description, files and the problem list are required.",
      upload: "Could not upload the files. Check the storage settings and try again.",
      save: "Could not save the topic to the database. Check the PostgreSQL connection and server logs.",
      delete: "Could not delete the topic. Check the server logs and try again."
    }
  },
  deleteTopic: {
    label: "Delete topic",
    title: "Delete this topic?",
    before: "Topic ",
    quoted: "“{title}”",
    after: " will be deleted together with its attached files and per-problem statuses. This cannot be undone.",
    afterWithTotal: " will be deleted together with its attached files and all its problems ({total}). This cannot be undone.",
    workBefore: "Deleting the topic will permanently erase work on ",
    workAfterForms: [" problem:", " problems:"],
    noWork: "This topic's problems have no student progress, statements or answers yet."
  },
  view: {
    back: "← All topics",
    eyebrow: "Topic",
    materialsTitle: "Materials",
    materialsDescription: "Theory and homework files, as the student sees them.",
    theory: "Theory",
    homework: "Homework",
    numbersTitle: "Problems and answers",
    numbersDescription: "Statements and answers for the topic's problems."
  },
  viewNumbers: {
    emptyTitle: "No problems yet",
    emptyHint: "Add problems on the Edit tab.",
    condition: "Statement",
    noCondition: "No statement yet.",
    answer: "Answer",
    showAnswer: "Show answer",
    noAnswer: "No answer yet."
  },
  tabs: { view: "View", edit: "Edit", aria: "Topic views" },
  edit: {
    notices: {
      saved: "Topic changes saved.",
      theoryDeleted: "Theory file deleted.",
      homeworkDeleted: "Homework file deleted.",
      invalid: "Check the form: title, description and the problem list are required.",
      upload: "Could not process the file. Try again or reload the page.",
      fileDelete: "Could not delete the file. Try again.",
      save: "Could not save the changes. Check the database connection and try again.",
      numbersTwin:
        "Changes not saved: some new problems match existing ones up to leading zeros (for example, 01 and 1). They are the same problem — keep only one spelling.",
      numbersConfirm:
        "Changes not saved: removing problems with student work needs confirmation. Reload the page and save again — the list of consequences will be shown before saving.",
      numbersAssigned:
        "Changes not saved: some of the removed problems are in active homework. Tick the acknowledgement in the confirmation dialog or cancel that homework first.",
      deleteChanged:
        "Topic not deleted: the amount of student work has changed since the page was opened. Reload the page — the confirmation dialog will show the current consequences."
    },
    sectionTitle: "Edit topic",
    basicInfo: "Basic information",
    titleLabel: "Topic title",
    descriptionLabel: "Description — optional",
    numbers: "Problems",
    numbersDescription: "You can paste long lists across several lines.",
    files: "Files",
    replaceTheory: "Replace theory file",
    replaceHomework: "Replace homework file",
    replaceHint: "Choose a new file or drag it here.",
    deleteTheory: {
      label: "Delete theory file",
      title: "Delete the theory file?",
      description:
        "The theory file will be detached from the topic and removed from storage. Students will no longer see it. This cannot be undone."
    },
    deleteHomework: {
      label: "Delete homework file",
      title: "Delete the homework file?",
      description:
        "The homework file will be detached from the topic and removed from storage. Students will no longer see it. This cannot be undone."
    },
    saving: "Save",
    answersTitle: "Statements and answers",
    answersDescription: "LaTeX statements and answers for each problem."
  },
  submit: {
    save: "Save changes",
    saving: "Saving changes…",
    checking: "Checking changes…",
    previewFailed: "Could not check the changes. Saving as is.",
    pendingHint: "Files and problems are being updated. Keep this page open.",
    dialogTitle: "Problems with student work will be removed",
    dialogIntro:
      "These problems will disappear from the topic along with everything attached to them. There is no way to restore them.",
    added: "New problems will be added: {numbers}.",
    kept: "Unchanged: {count}.",
    assignedAck:
      "I understand that {numbers} are in active homework — the student's assignment will get shorter and they will not be told.",
    confirm: "Yes, delete these problems",
    pending: "Saving…"
  },
  answerManager: {
    status: { full: "Statement and answer", partial: "Partially filled", empty: "Empty" },
    navTitle: "Statements and answers",
    shownRange: "Showing problems {start}-{end} of {total}",
    savedSummary:
      "Statements saved: {conditions} of {total}. Answers saved: {answers} of {total}. Large topics are split into pages of {pageSize} problems.",
    page: "Page",
    prev: "Back",
    next: "Next",
    cardKicker: "Problem materials",
    hasCondition: "Has statement",
    noCondition: "No statement",
    hasAnswer: "Has answer",
    noAnswer: "No answer",
    conditionLabel: "LaTeX statement",
    conditionPlaceholder:
      "For example:\nSolve the equation $$2x^2-3x-5=0$$\n\nYou can mix text and formulas in one field.",
    latexHintBefore: "Inline formulas with ",
    latexHintMiddle: " and display blocks with ",
    latexHintAfter: " are supported.",
    conditionPreview: "Statement preview",
    conditionEmpty: "No statement for this problem yet.",
    saveCondition: "Save statement",
    saving: "Saving…",
    deleteCondition: "Delete statement",
    deleteConditionTitle: "Delete the statement for No. {number}?",
    deleteConditionDescription:
      "The saved LaTeX statement will be deleted. Students and the AI checker will no longer see it. This cannot be undone.",
    answerLabel: "LaTeX answer",
    answerPlaceholder:
      "For example:\n$$x = \\frac{-b \\pm \\sqrt{D}}{2a}$$\n\nOr with text:\nSubstitute into the formula: $D=b^2-4ac$",
    answerPreview: "Answer preview",
    answerEmpty: "No answer for this problem yet.",
    saveAnswer: "Save answer",
    deleteAnswer: "Delete answer",
    deleteAnswerTitle: "Delete the answer for No. {number}?",
    deleteAnswerDescription:
      "The saved LaTeX answer will be deleted. The AI checker will no longer compare solutions against it. This cannot be undone.",
    pageOf: "Page {page} of {total}",
    prevPage: "Previous page",
    nextPage: "Next page"
  },
  singleNumber: {
    back: "← Back to topic",
    title: "Problem {number}",
    sectionTitle: "Statement and answer",
    sectionDescription: "Edit the LaTeX statement and answer for this problem.",
    conditionLabel: "Statement (LaTeX)",
    conditionPlaceholder: "Enter the statement in LaTeX",
    answerLabel: "Answer (LaTeX)",
    answerPlaceholder: "Enter the answer in LaTeX",
    preview: "Preview"
  },
  createForm: {
    createInvalid: "Check the form: title, description, both files and the problem list are required.",
    createFailed: "Could not create the topic. Check the database connection and try again.",
    networkCreate: "The connection dropped while creating the topic. Try again.",
    fileHelper: "PDF, DOCX, PNG and JPG are supported. Choose a file or just drag it into this field.",
    uploading: "Uploading file…",
    uploaded: "Uploaded:",
    sizeUnits: { b: "B", kb: "KB", mb: "MB" },
    titleLabel: "Topic title",
    titlePlaceholder: "For example, Logarithms and their properties",
    descriptionLabel: "Description",
    optional: "— optional",
    descriptionPlaceholder: "What to study in the theory and what to watch for in the homework.",
    theoryFile: "Theory file",
    homeworkFile: "Homework file",
    numbersDescription: "Works for short lists and for big topics with hundreds of problems.",
    hintUploading: "Wait for the uploads to finish. The create button will become available automatically.",
    hintReady: "Both files are uploaded. You can create the topic now.",
    hintStart: "Upload the theory file and the homework file first.",
    submit: "Create topic",
    submitting: "Creating topic…"
  },
  createSwitch: { ai: "With AI", manual: "Manually", aria: "How to create the topic" },
  importPrompt: {
    copy: "Copy the AI prompt",
    copied: "Copied",
    clipboardDenied: "The browser blocked clipboard access"
  },
  importPanel: {
    readFailed: "Could not read the file.",
    importFailed: "Import failed. Try again.",
    serverSilent: "The server did not respond. Check your connection and try again.",
    dropTitle: "Drag the AI reply here or click",
    dragTitle: "Drop the file",
    successTitle: "File added",
    fileRead: "File loaded — click “Check file”",
    oneJson: "One .json file · ",
    pasteText: "paste as text",
    jsonLabel: "JSON as text",
    hintCreate:
      "Send the prompt and the problem book to any AI chat, then upload the reply file here. The topic title, description and problems come from the file.",
    hintAdd:
      "Send the prompt and the problem book to any AI chat, then upload the reply file here. Problems with statements and answers will be added to this topic.",
    check: "Check file",
    checking: "Checking…",
    fileSummary: "File “{title}”, problems inside: {count}",
    willCreate: "Topic to be created",
    duplicateTitle:
      "A topic with this title already exists. This problem book may already be imported — if so, cancel and add the problems to the existing topic from its edit page.",
    tiles: { add: "Will add", fill: "Will fill empty", overwrite: "Will overwrite", untouched: "Unchanged" },
    overwriteLabel: "Overwrite statements and answers that are already filled",
    overwriteWarning: "Manual edits to these problems ({count}) will be lost.",
    issues: "Rejected during validation",
    warnings: "Warnings from the model",
    sample: "How the student will see it",
    sampleNumber: "Problem {number}",
    answer: "Answer",
    noAnswer: "No answer — AI check will send this problem for manual review.",
    apply: "Import",
    applyCreate: "Create topic and import",
    applying: "Importing…",
    cancel: "Cancel",
    done: "Done: added {created}, filled {filled}, overwritten {overwritten}",
    doneSkipped: ", skipped filled {skipped}"
  },
  numbersField: {
    label: "Homework problems",
    description: "Comma, space, new line, or a range with a dash.",
    placeholder: "1-5, 8, 12-14",
    empty: "No problems yet",
    range: "Range {from}-{to}",
    computing: "Updating the problem list…",
    unrecognized: "Could not recognise any problems. Use numbers and ranges like 1-5.",
    finalList: "Final list: {list}"
  },
  reorder: {
    saveFailed: "Could not save the topic order.",
    hint: "Drag a card to reorder topics — students see this order too."
  },
  history: {
    loadFailed: "Could not load the history. Try again.",
    loadFailedShort: "Could not load the history.",
    show: "Status history",
    hide: "Hide status history",
    current: "Now: {status}",
    timeZone: "MSK",
    empty: "No entries yet. History will appear after the next mark or check.",
    notRecorded: "Changes made before history was enabled were not recorded.",
    loading: "Loading history…",
    retry: "Retry",
    earlier: "Earlier entries"
  },
  lib: {
    import: {
      empty: "The file is empty.",
      notJson:
        "The file cannot be parsed as JSON. Most often the model did not double the backslashes in formulas — ask it to send the file again, strictly following the prompt.",
      notObject: "The file must be a JSON object. Check that the whole model reply was copied.",
      version: "Wrong format version: formatVersion {version} expected. Take a fresh prompt from the import page.",
      noTopic: "The file has no topic block with the topic title.",
      emptyTitle: "The topic title in the file is empty (topic.title).",
      noNumbers: "The file has no problem list (numbers).",
      tooMany: "At most {max} problems are imported at once — the rest were skipped. Split the file into parts.",
      notObjectEntry: "Entry skipped: it is not a problem object.",
      badNumber: "Entry with an invalid number skipped: {value}.",
      duplicate: "Problem {number} appears more than once — the first one was taken.",
      emptyCondition: "Problem {number} skipped: empty statement.",
      nothingParsed: "The file has no problems that could be parsed."
    },
    numbersChange: {
      studentForms: ["{n} student", "{n} students"],
      statusAt: "status for {students}",
      notesAt: "notes from {students}",
      deadlineAt: "deadline for {students}",
      assignmentForms: ["{n} active assignment", "{n} active assignments"],
      inAssignments: "part of {assignments}",
      verdictForms: ["{n} verdict", "{n} verdicts"],
      verdictsOfCheck: "{verdicts} from AI checks",
      lessonItemForms: ["{n} item", "{n} items"],
      lessonItems: "{items} in lesson sets",
      conditionAndAnswer: "statement and answer",
      condition: "statement",
      answer: "answer",
      answerFile: "answer file",
      nothing: "nothing will be lost",
      statusForms: ["{n} traffic-light status", "{n} traffic-light statuses"],
      statusLine: "{statuses} for students",
      noteForms: ["{n} student note", "{n} student notes"],
      noteLine: "{notes}",
      assignedLine: "{numbers} from active homework (the homework itself will be deleted too, with solution photos)",
      verdictLine: "{verdicts} from AI checks",
      lessonLine: "{items} in lesson sets and homework drafts",
      latexLine: "LaTeX: statements — {conditions}, answers — {answers}"
    },
    upload: {
      nameTooLong: "The file name must be at most {max} characters.",
      badChars: "The file name contains invalid characters.",
      extension: "Only PDF, DOCX, PNG and JPG are supported.",
      emptySize: "The file is empty or has an invalid size.",
      tooBig: "The file is too big. Maximum size is 15 MB.",
      mimeMismatch: "The file type does not match its extension.",
      sizeMismatch: "The actual file size differs from the declared size.",
      signature: "The file contents do not match the declared format."
    },
    history: { system: "System", ai: "AI", openLesson: "Open lesson", openHomework: "Open homework" }
  }
};
