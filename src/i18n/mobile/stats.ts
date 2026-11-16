// Mobile-only strings of the statistics area. Site texts stay in `dict.planner.statistics` /
// `dict.students.timeline`.
const ru = {
  chart: {
    // Charts have no hover on a phone: the selected point is announced and shown in a caption.
    pointHint: "Коснитесь точки, чтобы увидеть значение.",
    pointValue: "{label}: {value}"
  }
};

const en: typeof ru = {
  chart: {
    pointHint: "Tap a point to see its value.",
    pointValue: "{label}: {value}"
  }
};

export const stats = { ru, en };
