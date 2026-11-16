// Mobile-only strings of the statistics area. Site texts stay in `dict.planner.statistics`,
// `dict.planner.teacherStats`, `dict.planner.drilldown` and `dict.students.timeline*`.
const ru = {
  chart: {
    // Charts have no hover on a phone: the tapped point or column is shown in a caption below.
    pointHint: "Коснитесь точки, чтобы увидеть значение.",
    barHint: "Коснитесь столбца, чтобы увидеть неделю.",
    periodAria: "Период графика",
    segmentValue: "{label}: {value} ({percent}%)"
  },
  picker: {
    searchPlaceholder: "Поиск по списку"
  },
  ranking: {
    placeAria: "Место {n}"
  },
  gaps: {
    openTopicAria: "Открыть редактирование темы «{title}»"
  }
};

const en: typeof ru = {
  chart: {
    pointHint: "Tap a point to see its value.",
    barHint: "Tap a column to see its week.",
    periodAria: "Chart period",
    segmentValue: "{label}: {value} ({percent}%)"
  },
  picker: {
    searchPlaceholder: "Search the list"
  },
  ranking: {
    placeAria: "Place {n}"
  },
  gaps: {
    openTopicAria: "Edit the topic “{title}”"
  }
};

export const stats = { ru, en };
