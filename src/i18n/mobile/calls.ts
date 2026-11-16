// Mobile-only strings of the parent-calls area. Site texts stay in `dict.planner.calls`.
// Call comments are personal data: never put them into a notification, a log line or a share sheet.
const ru = {
  log: {
    sheetTitle: "Записать звонок",
    saved: "Звонок записан"
  }
};

const en: typeof ru = {
  log: {
    sheetTitle: "Log a call",
    saved: "Call logged"
  }
};

export const calls = { ru, en };
