// Mobile-only strings of the developer's «Аккаунты» screen (teachers, students, ownership, passwords).
// Site texts stay in `dict.students.*`.
const ru = {
  // The site shows a table row with buttons; here a row is one touch target that opens a sheet.
  row: {
    teacherActions: "Действия с аккаунтом учителя",
    studentActions: "Учитель, пароль и удаление аккаунта",
    // The mark of a student whose new teacher is picked but not saved yet.
    changed: "изменено"
  },
  create: {
    // The header button of a phone: «Новый аккаунт» does not fit next to the segments.
    short: "Новый",
    onceHint: "После создания логин и пароль будут показаны один раз — скопируйте их и передайте человеку."
  },
  search: {
    clear: "Очистить поиск"
  },
  // Accessible names that start with the visible label («Сменить пароль», «Учитель ученика»), so voice
  // control finds the control by what it shows; the site's aria strings reword it in English.
  a11y: {
    resetStudentPassword: "Сменить пароль ученика",
    resetTeacherPassword: "Сменить пароль учителя",
    ownerOf: "Учитель ученика {name}"
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
    changed: "changed"
  },
  create: {
    short: "Add",
    onceHint: "Once the account is created, its login and password are shown one time — copy them and pass them on."
  },
  search: {
    clear: "Clear search"
  },
  a11y: {
    resetStudentPassword: "Reset password for the student",
    resetTeacherPassword: "Reset password for the teacher",
    ownerOf: "Student's teacher: {name}"
  },
  owner: {
    saveHint: "The teacher changes once you tap “Save changes” at the bottom of the screen."
  }
};

export const accounts = { ru, en };
