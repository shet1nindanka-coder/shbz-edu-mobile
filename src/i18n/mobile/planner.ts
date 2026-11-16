// Mobile-only strings of the planner area (lessons, lesson board, homework drafts).
// Site texts stay in `dict.planner.*`.
const ru = {
  lessonBoard: {
    // replaces `dict.planner.lessonBoard.print` («Для печати»): the handout is a PDF opened by the system
    handout: "Раздатка (PDF)",
    handoutPreparing: "Готовим раздатку…",
    // replaces `dict.planner.lessonBoard.hotkeysHint` (no keyboard on a phone)
    resultHint: "Отметьте итог по каждому номеру касанием."
  },
  plan: {
    generating: "ИИ подбирает номера…",
    reorderHint: "Удерживайте номер, чтобы изменить порядок."
  }
};

const en: typeof ru = {
  lessonBoard: {
    handout: "Handout (PDF)",
    handoutPreparing: "Preparing the handout…",
    resultHint: "Tap to mark the result of each problem."
  },
  plan: {
    generating: "AI is picking problems…",
    reorderHint: "Press and hold a problem to change the order."
  }
};

export const planner = { ru, en };
