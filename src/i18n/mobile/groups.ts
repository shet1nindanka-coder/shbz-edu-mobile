// Mobile-only strings of the groups area (groups list, group detail, attendance table).
// Site texts stay in `dict.planner.groups`, `dict.planner.attendance` and `dict.planner.groupStatistics`.
// The screens show as few words as they can (docs/design/glass-over-paper.md §1a): most keys here are
// either a one-word label or the spoken name (`…Aria`) of something the eye reads as a shape or a number.
const ru = {
  list: {
    openGroupAria: "Открыть группу «{name}»",
    // The button of the list and of the sheet it opens; the site's «Создать группу» is its spoken name.
    create: "Создать",
    gradeHint: "Класс потом изменить нельзя."
  },
  // The site's banners without their second sentence.
  notices: {
    created: "Группа создана",
    deleted: "Группа удалена"
  },
  detail: {
    menuAria: "Действия с группой",
    tabsAria: "Разделы группы",
    // The other three tab labels are site texts: `dict.planner.groups.detail.participants` / `.attendance`
    // and `dict.students.detail.tabLessons`. The site's section title «Статистика группы» is too long for a tab.
    statisticsTab: "Статистика"
  },
  members: {
    // The caption of a found student who is in another group: adding moves the student here at once.
    fromOtherGroup: "из другой группы",
    aiProfileHint: "Сохраняется само и идёт в ИИ-подбор.",
    // The button of the member sheet; its spoken name is the site's «Убрать … из группы».
    remove: "Убрать"
  },
  statistics: {
    // The fourth figure of the group: how many members need attention.
    attention: "внимание",
    attentionAria: "Нужно внимание: {n} из {total}",
    openStudent: "Карточка ученика",
    openStudentAria: "Открыть карточку ученика {name}",
    reportAria: "Отчёт ученика {name}: {period}"
  },
  attendance: {
    // Replaces the site's "clicking a cell cycles…" line: on a phone there is also the long press.
    tapHint: "Касание меняет отметку, долгое нажатие — выбор.",
    noPastLessons: "Прошедших занятий нет",
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
    // A mark is a 44 pt square: the site's «опозд.» and «уваж.» do not fit it.
    tileLate: "оп.",
    tileExcused: "ув.",
    // Spoken name of the download button that opens the three periods of the report.
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
    ready: "Отчёт готов: {title}"
  },
  lessons: {
    openAria: "Открыть занятие «{title}»",
    empty: "Занятий пока нет",
    // Spoken name of «Все занятия»: the count of the group's lessons is not shown.
    allAria: "Все занятия: {n}"
  }
};

const en: typeof ru = {
  list: {
    openGroupAria: "Open the group “{name}”",
    create: "Create",
    gradeHint: "The grade cannot be changed later."
  },
  notices: {
    created: "Group created",
    deleted: "Group deleted"
  },
  detail: {
    menuAria: "Group actions",
    tabsAria: "Group sections",
    statisticsTab: "Statistics"
  },
  members: {
    fromOtherGroup: "from another group",
    aiProfileHint: "Saved automatically, used by AI selection.",
    remove: "Remove"
  },
  statistics: {
    attention: "attention",
    attentionAria: "Needs attention: {n} of {total}",
    openStudent: "Student card",
    openStudentAria: "Open the student card of {name}",
    reportAria: "Report for {name}: {period}"
  },
  attendance: {
    tapHint: "A tap changes the mark, a long press picks one.",
    noPastLessons: "No past lessons",
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
    tileLate: "late",
    tileExcused: "exc.",
    pdfTitle: "Attendance report (PDF)",
    reportAria: "Attendance report (PDF): {period}",
    reportTitle7d: "Attendance: 7 days",
    reportTitle30d: "Attendance: 30 days",
    reportTitleYear: "Attendance: school year"
  },
  report: {
    ready: "The report is ready: {title}"
  },
  lessons: {
    openAria: "Open the lesson “{title}”",
    empty: "No lessons yet",
    allAria: "All lessons: {n}"
  }
};

export const groups = { ru, en };
