// Mobile-only strings of the statistics area. Site texts stay in `dict.planner.statistics`,
// `dict.planner.teacherStats`, `dict.planner.drilldown` and `dict.students.timeline*`.
const ru = {
  chart: {
    // Charts have no hover on a phone: the tapped point or column is shown in a caption below.
    pointHint: "Коснитесь графика или листайте стрелками, чтобы увидеть значение.",
    barHint: "Коснитесь графика или листайте стрелками, чтобы увидеть неделю.",
    previousAria: "Предыдущее значение",
    nextAria: "Следующее значение",
    periodAria: "Период графика",
    segmentValue: "{label}: {value} ({percent}%)"
  },
  picker: {
    searchPlaceholder: "Поиск по списку"
  },
  ranking: {
    // Also read by the group's own ranking (statistics tab of a group): one wording for «Место {n}».
    placeAria: "Место {n}"
  },
  gaps: {
    openTopicAria: "Открыть редактирование темы «{title}»"
  }
};

const en: typeof ru = {
  chart: {
    pointHint: "Tap the chart or use the arrows to see a value.",
    barHint: "Tap the chart or use the arrows to see a week.",
    previousAria: "Previous value",
    nextAria: "Next value",
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
