// Mobile-only strings of the developer's «Аккаунты» screen (teachers, students, ownership, passwords).
// Site texts stay in `dict.students.*`.
const ru = {
  // The site shows a table row with buttons; a phone row is one touch target that opens a sheet.
  row: {
    teacherActions: "Действия с аккаунтом учителя",
    studentActions: "Учитель, пароль и удаление аккаунта",
    // Owner line of a student row: the site shows a picker in every row, the phone shows the name.
    owner: "Учитель: {name}"
  },
  search: {
    clear: "Очистить поиск"
  },
  // Owner changes are drafts until saved; the bar with the save button sits at the bottom of the screen.
  owner: {
    saveHint: "Смена учителя вступит в силу после кнопки «Сохранить изменения» внизу экрана."
  }
};

const en: typeof ru = {
  row: {
    teacherActions: "Teacher account actions",
    studentActions: "Teacher, password and account deletion",
    owner: "Teacher: {name}"
  },
  search: {
    clear: "Clear search"
  },
  owner: {
    saveHint: "The teacher changes once you tap “Save changes” at the bottom of the screen."
  }
};

export const accounts = { ru, en };
