// Display titles of screens for app bars: the section name with a capital letter (`m.shell.tabs`), since
// `dict.nav.*` is lower-case by design. A screen that is not a section falls back to its section.
import type { ScreenId } from "@/api/types";
import type { MobileDictionary } from "@/i18n/mobile";

type TabTitles = MobileDictionary["shell"]["tabs"];

const TITLE_KEY: Record<ScreenId, keyof TabTitles> = {
  "auth.launch": "overview",
  "auth.login": "overview",
  "shell.notifications": "settings",
  "shell.settings": "settings",
  "shell.numberSearch": "settings",
  "shared.fileViewer": "settings",
  "student.home": "overview",
  "student.lesson": "lesson",
  "student.homeworks": "homeworks",
  "student.homework": "homeworks",
  "student.deadlines": "deadlines",
  "student.theory": "theory",
  "student.info": "info",
  "student.number": "theory",
  "teacher.home": "overview",
  "teacher.students": "students",
  "teacher.student.review": "students",
  "teacher.student.assign": "students",
  "teacher.student.lessons": "students",
  "content.topics": "topics",
  "content.topic": "topics",
  "content.topicEdit": "topics",
  "content.number": "topics",
  "groups.list": "groups",
  "groups.detail": "groups",
  "planner.lessons": "lessons",
  "planner.drafts": "lessons",
  "planner.lessonNew": "lessons",
  "planner.lessonBoard": "lessons",
  "planner.draftNew": "lessons",
  "planner.draftBoard": "lessons",
  "calls.list": "calls",
  "developer.accounts": "accounts",
  "stats.main": "statistics",
  "developer.panel": "panel",
  "developer.journal": "panel",
};

/** Capitalised section title of a screen, e.g. "Занятия" for every planner screen. */
export function screenTitle(screen: ScreenId, titles: TabTitles): string {
  return titles[TITLE_KEY[screen]];
}
