// Mobile-only strings of the statistics area. Site texts stay in `dict.planner.statistics`,
// `dict.planner.teacherStats`, `dict.planner.drilldown` and `dict.students.timeline*`.
const ru = {
  // Short names where the site's wording is a phrase; the full one stays in the accessible name.
  short: {
    // The first summary figure («Решено из выданного»).
    solved: "Решено",
    // The third view of the header («Метрики платформы»).
    platform: "Платформа",
    // The donut card («Как решаются выданные ДЗ»).
    issued: "Выданные ДЗ",
    // A figure of a teacher card («Созвоны с родителями»).
    calls: "Созвоны"
  },
  chart: {
    previousAria: "Предыдущее значение",
    nextAria: "Следующее значение",
    periodAria: "Период графика",
    segmentValue: "{label}: {value} ({percent}%)"
  },
  picker: {
    searchPlaceholder: "Поиск"
  },
  ranking: {
    // Also read by the group's own ranking (statistics tab of a group): one wording for «Место {n}».
    placeAria: "Место {n}"
  },
  bank: {
    hint: "Банк — все номера всех тем по каждому ученику."
  },
  gaps: {
    openTopicAria: "Открыть редактирование темы «{title}»",
    // The topics with gaps that are not listed; a screen reader hears the site's sentence.
    more: "+{n}"
  }
};

const en: typeof ru = {
  short: {
    solved: "Problems solved",
    platform: "Platform",
    issued: "Assigned homework",
    calls: "Calls made"
  },
  chart: {
    previousAria: "Previous value",
    nextAria: "Next value",
    periodAria: "Chart period",
    segmentValue: "{label}: {value} ({percent}%)"
  },
  picker: {
    searchPlaceholder: "Search"
  },
  ranking: {
    placeAria: "Place {n}"
  },
  bank: {
    hint: "The bank is every problem of every topic for each student."
  },
  gaps: {
    openTopicAria: "Edit the topic “{title}”",
    more: "+{n}"
  }
};

export const stats = { ru, en };
