// Mobile-only strings of the groups area (groups list, group detail, attendance table).
// Site texts stay in `dict.planner.groups`, `dict.planner.attendance` and `dict.planner.groupStatistics`.
const ru = {
  list: {
    openGroupAria: "Открыть группу «{name}»",
    gradeHint: "Класс — необязательно, от 1 до 11. Позже его изменить нельзя."
  },
  detail: {
    menuAria: "Действия с группой",
    tabsAria: "Разделы группы",
    // The other three tab labels are site texts: `dict.planner.groups.detail.participants` / `.attendance`
    // and `dict.students.detail.tabLessons`. The site's section title «Статистика группы» is too long for a tab.
    statisticsTab: "Статистика",
    renameHint: "Класс и предмет после создания группы не меняются."
  },
  members: {
    searchPlaceholder: "Начните вводить имя…",
    searchPrompt: "Поиск идёт по имени среди ваших учеников. Ученик из другой группы будет переведён сюда.",
    // The site says "find a student in the field below": on a phone the search is a sheet behind a button.
    empty: "В группе пока никого нет — добавьте первого ученика.",
    // Caption of a member row until the student has marked a single number.
    speed: "Скорость: {speed}",
    aiProfile: "Профиль для ИИ",
    aiProfileHint: "Скорость и заметка попадают в ИИ-подбор уроков и ДЗ. Скорость сохраняется сразу, заметка — когда вы выходите из поля.",
    // The button of the member sheet; the site's remove control is an icon with an aria-label.
    remove: "Убрать из группы"
  },
  statistics: {
    openStudent: "Карточка ученика",
    openStudentAria: "Открыть карточку ученика {name}",
    reportAria: "Отчёт ученика {name}: {period}"
  },
  attendance: {
    // Replaces the site's "clicking a cell cycles…" line: on a phone there is also the long press.
    tapHint: "Отметки ставятся сами по активности на уроке. Касание меняет отметку: был → опоздал → не был → по уважительной; долгое нажатие открывает все варианты.",
    listHint: "Отметки ставятся сами по активности на уроке; выберите нужную, чтобы исправить.",
    modeAria: "Вид посещаемости",
    modeTable: "Таблица",
    modeLessons: "По занятиям",
    lessonLabel: "Занятие",
    lessonOption: "{date} · {title}",
    lessonLive: "{date} · {title} · идёт сейчас",
    openLessonAria: "Открыть занятие «{title}», {date}",
    cellAria: "{name}, {date}: {mark}",
    markAria: "{name}: {mark}",
    markSheetHint: "{date} · {title}",
    notParticipatedLegend: "«·» — {text}",
    // A mark is a 44 pt square: the site's «опозд.» and «уваж.» do not fit it.
    tileLate: "оп.",
    tileExcused: "ув.",
    // The button that opens the three periods of the report, and the title of their sheet.
    pdf: "PDF",
    pdfTitle: "Отчёт о посещаемости (PDF)",
    reportAria: "Отчёт о посещаемости (PDF): {period}",
    // Title of the file viewer: the server's file name is Russian and long; the title stands alone.
    reportTitle7d: "Посещаемость: 7 дней",
    reportTitle30d: "Посещаемость: 30 дней",
    reportTitleYear: "Посещаемость: учебный год"
  },
  report: {
    // A report finished after the teacher left the group screen: it is not opened over the screen they
    // went to, it waits here until they open it.
    ready: "Отчёт готов: {title}",
    open: "Открыть отчёт"
  },
  lessons: {
    openAria: "Открыть занятие «{title}»"
  }
};

const en: typeof ru = {
  list: {
    openGroupAria: "Open the group “{name}”",
    gradeHint: "Grade is optional, from 1 to 11. It cannot be changed later."
  },
  detail: {
    menuAria: "Group actions",
    tabsAria: "Group sections",
    statisticsTab: "Statistics",
    renameHint: "Grade and subject cannot be changed after the group is created."
  },
  members: {
    searchPlaceholder: "Start typing a name…",
    searchPrompt: "The search is by name among your students. A student from another group will be moved here.",
    empty: "The group is empty — add the first student.",
    speed: "Speed: {speed}",
    aiProfile: "AI profile",
    aiProfileHint: "Speed and the note go into AI selection of lessons and homework. Speed is saved at once, the note when you leave the field.",
    remove: "Remove from the group"
  },
  statistics: {
    openStudent: "Student card",
    openStudentAria: "Open the student card of {name}",
    reportAria: "Report for {name}: {period}"
  },
  attendance: {
    tapHint: "Marks are set automatically from lesson activity. A tap cycles the mark: present → late → absent → excused; a long press shows every option.",
    listHint: "Marks are set automatically from lesson activity; pick another one to correct it.",
    modeAria: "Attendance view",
    modeTable: "Table",
    modeLessons: "By lesson",
    lessonLabel: "Lesson",
    lessonOption: "{date} · {title}",
    lessonLive: "{date} · {title} · in progress",
    openLessonAria: "Open the lesson “{title}”, {date}",
    cellAria: "{name}, {date}: {mark}",
    markAria: "{name}: {mark}",
    markSheetHint: "{date} · {title}",
    notParticipatedLegend: "“·” — {text}",
    tileLate: "late",
    tileExcused: "exc.",
    pdf: "PDF",
    pdfTitle: "Attendance report (PDF)",
    reportAria: "Attendance report (PDF): {period}",
    reportTitle7d: "Attendance: 7 days",
    reportTitle30d: "Attendance: 30 days",
    reportTitleYear: "Attendance: school year"
  },
  report: {
    ready: "The report is ready: {title}",
    open: "Open the report"
  },
  lessons: {
    openAria: "Open the lesson “{title}”"
  }
};

export const groups = { ru, en };
