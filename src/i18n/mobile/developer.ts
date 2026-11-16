// Mobile-only strings of the developer area (accounts, dev panel, journal).
// Site texts stay in `dict.planner.devPanel`, `dict.planner.journal`, `dict.students.accounts`.
const ru = {
  accounts: {
    passwordCopied: "Пароль скопирован",
    credentialsShare: "Поделиться данными для входа"
  },
  panel: {
    unsavedTitle: "Есть несохранённые изменения",
    unsavedBody: "Если уйти с экрана, изменения настроек будут потеряны.",
    discard: "Не сохранять"
  }
};

const en: typeof ru = {
  accounts: {
    passwordCopied: "Password copied",
    credentialsShare: "Share sign-in details"
  },
  panel: {
    unsavedTitle: "You have unsaved changes",
    unsavedBody: "If you leave this screen, your changes to the settings will be lost.",
    discard: "Discard"
  }
};

export const developer = { ru, en };
