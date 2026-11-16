// Mobile-only strings of the teacher area (overview, students, homework review, assigning, reports).
// Site texts stay in `dict.students.*` and `dict.teacherHome`.
const ru = {
  report: {
    // The weekly PDF is downloaded and handed to the system viewer instead of opening in a browser tab.
    preparing: "Готовим отчёт…",
    ready: "Отчёт готов",
    open: "Открыть отчёт",
    share: "Поделиться отчётом"
  },
  review: {
    photoOf: "Фото {index} из {total}"
  }
};

const en: typeof ru = {
  report: {
    preparing: "Preparing the report…",
    ready: "The report is ready",
    open: "Open the report",
    share: "Share the report"
  },
  review: {
    photoOf: "Photo {index} of {total}"
  }
};

export const teacher = { ru, en };
