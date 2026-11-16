/**
 * Demo personas — which login shows which state (docs/spec/09-data-i18n-math.md §2.5, 90-addendum-6 §9.3).
 * Listed on the "Demo data" screen of mock builds; a tap fills the login form. The notes are
 * developer-facing (that screen is not part of the product), hence plain English and not in a dictionary.
 */
import type { UserRole } from "@/api/types";

import { PINNED_LOGIN } from "../controls";
import { DEMO_PASSWORDS } from "./ids";

export type DemoPersona = {
  login: string;
  password: string;
  /** null for the pseudo-login that has no account behind it. */
  role: UserRole | null;
  /** Display name of the account ("" for the pseudo-login). */
  name: string;
  /** What signing in with this login demonstrates. */
  note: string;
};

const { developer, teacher, student } = DEMO_PASSWORDS;

export const DEMO_PERSONAS: readonly DemoPersona[] = [
  { login: "ilya@example.com", password: student, role: "STUDENT", name: "Илья Смирнов", note: "The \"everything\" student: 9 homeworks in every attention rank and check state, streak 5 (best 9), notes, 8 notifications, an individual lesson tomorrow." },
  { login: "polina@example.com", password: student, role: "STUDENT", name: "Полина Морозова", note: "A live lesson in progress with items in every state; a homework with the photo batch limit reached." },
  { login: "artem@example.com", password: student, role: "STUDENT", name: "Артём Кузнецов", note: "Live lesson with the extra part unlocked; a homework whose AI check is running right now." },
  { login: "kirill@example.com", password: student, role: "STUDENT", name: "Кирилл Зайцев", note: "Has not opened the live lesson; weak profile, overdue homeworks, streak 0." },
  { login: "maria@example.com", password: student, role: "STUDENT", name: "Мария Волкова", note: "No lessons at all, every homework completed, streak broken; 22 notifications (the cap of 20)." },
  { login: "dasha@example.com", password: student, role: "STUDENT", name: "Даша Белова", note: "A lesson that starts 3 minutes after the seed (watch it begin), one homework, a stale AI plan." },
  { login: "timur@example.com", password: student, role: "STUDENT", name: "Тимур Новиков", note: "Brand-new account: every student empty state." },
  { login: "teacher@example.com", password: teacher, role: "TEACHER", name: "Анна Петрова", note: "7 students, 2 groups, 18 lessons, 9 homework drafts, parent calls in every state, reminders in the bell." },
  { login: "teacher2@example.com", password: teacher, role: "TEACHER", name: "Игорь Соколов", note: "Second owner (isolation); the realtime stream is always refused — the app must work without it." },
  { login: "teacher3@example.com", password: teacher, role: "TEACHER", name: "Ольга Новикова", note: "Every teacher empty state." },
  { login: "dev@example.com", password: developer, role: "DEVELOPER", name: "Разработчик ШБЗ", note: "Topics, accounts, read-only calls, statistics, dev panel, journal, service alerts." },
  { login: "egor@example.com", password: student, role: "STUDENT", name: "Егор Лебедев", note: "The password-change limiter is pinned: every valid attempt answers 429." },
  { login: PINNED_LOGIN, password: student, role: null, name: "", note: "No account: sign-in with this login is always rate-limited (\"try again in 7 minutes\")." },
];
