import type { Dictionary } from "@/lib/i18n/dictionary";
import { apiCommonEn } from "@/lib/i18n/dictionaries/api-common";
import { apiContentEn } from "@/lib/i18n/dictionaries/api-content";
import { apiPlannerEn } from "@/lib/i18n/dictionaries/api-planner";
import { apiStudentEn } from "@/lib/i18n/dictionaries/api-student";
import { plannerEn } from "@/lib/i18n/dictionaries/planner";
import { auditEn, notificationsEn } from "@/lib/i18n/dictionaries/records";
import { studentEn } from "@/lib/i18n/dictionaries/student";
import { studentsEn } from "@/lib/i18n/dictionaries/students";
import { topicsEn } from "@/lib/i18n/dictionaries/topics";

export const en: Dictionary = {
  apiCommon: apiCommonEn,
  apiStudent: apiStudentEn,
  apiContent: apiContentEn,
  apiPlanner: apiPlannerEn,
  audit: auditEn,
  notifications: notificationsEn,
  student: studentEn,
  topics: topicsEn,
  students: studentsEn,
  planner: plannerEn,
  meta: {
    description: "ШБЗ Школа platform: shared topics and materials, individual progress and homework for students.",
    ogLocale: "en_GB"
  },
  common: {
    save: "Save",
    go: "Open",
    retry: "Try again",
    home: "Home",
    noDate: "No date",
    homeworkN: "Homework {n}"
  },
  roles: {
    STUDENT: "Student",
    TEACHER: "Teacher",
    DEVELOPER: "Developer"
  },
  status: {
    GREEN: { label: "Solved on the first try", shortLabel: "Green" },
    YELLOW: { label: "Fixed after self-check", shortLabel: "Yellow" },
    RED: { label: "Needs the teacher's help", shortLabel: "Red" }
  },
  fileSize: { bytes: "B", kilobytes: "KB", megabytes: "MB" },
  passwordPolicy: {
    tooShort: "The password must be at least 8 characters long.",
    tooLong: "The password must be at most {max} characters long.",
    noLetter: "The password must contain at least one letter.",
    noDigit: "The password must contain at least one digit.",
    common: "This password is too common — choose another one."
  },
  progress: {
    statuses: { GREEN: "Solved", YELLOW: "Solved with mistakes", RED: "Not solved", none: "No mark" },
    sources: {
      teacher: "Teacher's mark",
      homework_check: "Homework check",
      lesson_teacher: "Lesson result by the teacher",
      lesson_check: "In-lesson check",
      lesson_end: "Lesson ended"
    },
    decisions: {
      changed: "Status changed",
      reaffirmed: "Mark confirmed again",
      unchanged: "Status already matches",
      uncertain: "The check was inconclusive",
      downgrade_blocked: "A homework check doesn't lower an achieved status",
      newer_status: "Kept the mark made after the check started",
      no_status: "This result doesn't change overall progress",
      lesson_result_preserved: "Kept the lesson result set earlier"
    }
  },
  nav: {
    sections: "Sections",
    menu: "Menu",
    settings: "Settings",
    logout: "Log out",
    student: {
      overview: "overview",
      lesson: "lesson",
      homeworks: "homework",
      deadlines: "deadlines",
      theory: "theory",
      info: "info",
      settings: "settings"
    },
    teacher: {
      overview: "overview",
      topics: "topics",
      students: "students",
      groups: "groups",
      lessons: "lessons",
      calls: "calls",
      settings: "settings"
    },
    developer: {
      topics: "topics",
      accounts: "accounts",
      calls: "calls",
      statistics: "statistics",
      panel: "dev panel",
      settings: "settings"
    }
  },
  login: {
    title: "Sign in",
    subtitle: "Sign in to your personal account",
    loginLabel: "Login",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    showPassword: "Show",
    hidePassword: "Hide",
    showPasswordAria: "Show password",
    hidePasswordAria: "Hide password",
    submit: "Sign in",
    submitting: "Signing in…",
    help: "Can't sign in? Contact your teacher:",
    rateLimitedFor: "Too many sign-in attempts. Try again in {minutes}.",
    minuteForms: ["{n} minute", "{n} minutes"],
    errors: {
      empty: "Enter your login and password.",
      invalid: "Wrong login or password.",
      database:
        "Could not sign you in — something broke on our side. Try again in a minute, and if it still fails, contact your teacher.",
      rateLimited: "Too many sign-in attempts. Wait a few minutes and try again."
    }
  },
  numberSearch: {
    placeholder: "Find a problem",
    searching: "Searching…",
    invalid: "Enter a valid problem number.",
    notFound: "No topic found for this problem number.",
    aria: "Find a problem number and open its topic",
    submit: "Find"
  },
  shells: {
    errorTitle: "This section is temporarily unavailable",
    errorDescription:
      "Something went wrong while loading your account. Try again or go back to the home page.",
    loginErrorTitle: "Could not open the sign-in page",
    loginErrorDescription: "The sign-in page is temporarily unavailable. Try reloading or go back to the home page.",
    notFoundTitle: "Page not found",
    notFoundDescription: "This page may have been removed, or the link you followed is wrong."
  },
  settings: {
    kicker: "Profile and interface",
    title: "Settings",
    notices: {
      infoUpdated: "Your personal information has been updated.",
      infoInvalid: "Enter a name for your profile.",
      infoSave: "Could not save your personal information. Please try again.",
      passwordUpdated: "Your password has been updated.",
      passwordInvalid:
        "New password: at least 8 characters, must include letters and digits, and must not be too simple.",
      passwordMismatch: "The new password and its confirmation don't match.",
      passwordCurrent: "The current password is incorrect.",
      passwordRateLimited: "Too many password change attempts. Wait 15 minutes and try again.",
      passwordSave: "Could not update the password. Please try again."
    },
    personalInfo: "Personal information",
    name: "Name",
    namePlaceholder: "Your name",
    loginLabel: "Sign-in login",
    loginCopyLabel: "Login",
    nameHint: "The name in the header updates right away.",
    changePassword: "Change password",
    currentPassword: "Current password",
    currentPasswordPlaceholder: "Enter your current password",
    newPassword: "New password",
    newPasswordPlaceholder: "8+ characters, letters and digits",
    repeatPassword: "Repeat the new password",
    repeatPasswordPlaceholder: "Repeat the new password",
    updatePassword: "Update password",
    passwordHint: "Sessions on other devices will be signed out; this one will be safely refreshed.",
    profileStatus: "Profile status",
    role: "Role",
    onPlatform: "Member since"
  },
  interface: {
    title: "Interface",
    theme: {
      label: "Theme",
      hint: "Light, dark or system appearance.",
      system: "System",
      systemShort: "System",
      light: "Light",
      dark: "Dark"
    },
    hints: {
      label: "Hints",
      hint: "Explanations under each settings block.",
      on: "Shown",
      off: "Hidden"
    },
    language: {
      label: "Language",
      hint: "Interface language. Applies immediately on every page.",
      ru: "Русский",
      en: "English"
    }
  },
  studentHome: {
    kicker: "Overview",
    title: "Your account"
  },
  teacherHome: {
    kicker: "Overview",
    title: "Teacher's account",
    topics: { kicker: "Topics", title: "Materials and answers", topics: "Topics", numbers: "Problems" },
    students: { kicker: "Students", title: "Accounts and progress", students: "Students", files: "Files" },
    calls: { kicker: "Calls", title: "Parent contact", due: "Time to call", overdue: "Overdue" }
  }
};
