// Mobile-only strings of the developer's «Аккаунты» screen (teachers, students, ownership, passwords).
// Site texts stay in `dict.students.*`.
const ru = {
  // The site shows a table row with buttons; a phone row is one touch target that opens a sheet.
  row: {
    teacherActions: "Действия с аккаунтом учителя",
    studentActions: "Учитель, пароль и удаление аккаунта"
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
    studentActions: "Teacher, password and account deletion"
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
