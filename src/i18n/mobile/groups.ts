// Mobile-only strings of the groups area (groups list, group detail, attendance table).
// Site texts stay in `dict.planner.groups` and `dict.planner.attendance`.
const ru = {
  attendance: {
    tapHint: "Касание меняет отметку: был → опоздал → не был → по уважительной.",
    reportPreparing: "Готовим отчёт о посещаемости…",
    reportOpen: "Открыть отчёт (PDF)"
  }
};

const en: typeof ru = {
  attendance: {
    tapHint: "Tap to change the mark: present → late → absent → excused.",
    reportPreparing: "Preparing the attendance report…",
    reportOpen: "Open the report (PDF)"
  }
};

export const groups = { ru, en };
