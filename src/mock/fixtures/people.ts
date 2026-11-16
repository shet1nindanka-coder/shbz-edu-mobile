/** Users (14), student profiles and groups (3) — docs/spec/09-data-i18n-math.md §2.3, 90-addendum-6 §6.6. */
import type { UserRole } from "@/api/types";
import { HOUR_MS } from "@/domain/moscow-time";

import type { FixtureBuilder } from "./builder";
import { DEMO_PASSWORDS, GROUP, USER, userKey } from "./ids";

type UserSpec = {
  id: string;
  name: string;
  login: string;
  password: string;
  role: UserRole;
  teacherId: string | null;
  /** Days before T0 the account was created; "today" = a few hours before the seed. */
  createdDaysAgo: number | "today";
  /** `undefined` = no `StudentProfile` row at all. */
  profile?: { speed: number | null; aiNote: string | null; groupId: string | null };
};

const { developer, teacher, student } = DEMO_PASSWORDS;

const USERS: UserSpec[] = [
  { id: USER.dev, name: "Разработчик ШБЗ", login: "dev@example.com", password: developer, role: "DEVELOPER", teacherId: null, createdDaysAgo: 200 },
  { id: USER.anna, name: "Анна Петрова", login: "teacher@example.com", password: teacher, role: "TEACHER", teacherId: null, createdDaysAgo: 180 },
  { id: USER.igor, name: "Игорь Соколов", login: "teacher2@example.com", password: teacher, role: "TEACHER", teacherId: null, createdDaysAgo: 90 },
  // Zero students, groups and lessons → every teacher empty state.
  { id: USER.olga, name: "Ольга Новикова", login: "teacher3@example.com", password: teacher, role: "TEACHER", teacherId: null, createdDaysAgo: 2 },
  {
    id: USER.ilya, name: "Илья Смирнов", login: "ilya@example.com", password: student, role: "STUDENT", teacherId: USER.anna, createdDaysAgo: 120,
    profile: { speed: 6, aiNote: "Сильный, но торопится: ошибки в знаках.", groupId: null },
  },
  {
    // Member of 8А who took part in no lesson ("and 1 more", "·" cells of the attendance table).
    id: USER.maria, name: "Мария Волкова", login: "maria@example.com", password: student, role: "STUDENT", teacherId: USER.anna, createdDaysAgo: 120,
    profile: { speed: 5, aiNote: null, groupId: GROUP.g8a },
  },
  {
    id: USER.artem, name: "Артём Кузнецов", login: "artem@example.com", password: student, role: "STUDENT", teacherId: USER.anna, createdDaysAgo: 35,
    profile: { speed: 8, aiNote: "Быстро считает, но пропускает проверку ОДЗ.", groupId: GROUP.g8a },
  },
  {
    id: USER.polina, name: "Полина Морозова", login: "polina@example.com", password: student, role: "STUDENT", teacherId: USER.anna, createdDaysAgo: 60,
    profile: { speed: 5, aiNote: "Аккуратная, теряется в длинных выкладках.", groupId: GROUP.g8a },
  },
  {
    id: USER.kirill, name: "Кирилл Зайцев", login: "kirill@example.com", password: student, role: "STUDENT", teacherId: USER.anna, createdDaysAgo: 95,
    profile: { speed: 3, aiNote: "Нужны короткие шаги и повтор формул.", groupId: GROUP.g8a },
  },
  {
    // Speed not set → `dict.planner.lessonCreateForm.speedNotSet`.
    id: USER.dasha, name: "Даша Белова", login: "dasha@example.com", password: student, role: "STUDENT", teacherId: USER.anna, createdDaysAgo: 5,
    profile: { speed: null, aiNote: "Индивидуальные занятия, готовится к контрольной.", groupId: null },
  },
  // Brand-new account without a profile row and with nothing assigned → every student empty state.
  { id: USER.timur, name: "Тимур Новиков", login: "timur@example.com", password: student, role: "STUDENT", teacherId: USER.anna, createdDaysAgo: "today" },
  {
    id: USER.sofia, name: "Софья Орлова", login: "sofia@example.com", password: student, role: "STUDENT", teacherId: USER.igor, createdDaysAgo: 40,
    profile: { speed: 7, aiNote: null, groupId: GROUP.g10b },
  },
  {
    id: USER.egor, name: "Егор Лебедев", login: "egor@example.com", password: student, role: "STUDENT", teacherId: USER.igor, createdDaysAgo: 40,
    profile: { speed: 4, aiNote: null, groupId: GROUP.g10b },
  },
  // A student without an owner teacher (developer accounts: `dict.students.studentsManager.noOwner`).
  { id: USER.orphan, name: "Лев Без-Учителя", login: "lev@example.com", password: student, role: "STUDENT", teacherId: null, createdDaysAgo: 15 },
];

export function addPeople(b: FixtureBuilder): void {
  for (const spec of USERS) {
    const createdAt = spec.createdDaysAgo === "today" ? b.earlierToday(3 * HOUR_MS) : b.at(-spec.createdDaysAgo, 10, 30);
    b.add("users", {
      id: spec.id,
      name: spec.name,
      email: spec.login,
      role: spec.role,
      teacherId: spec.teacherId,
      createdAt,
      updatedAt: createdAt,
      password: spec.password,
    });
    if (spec.profile) {
      b.add("profiles", {
        id: `prof_${userKey(spec.id)}`,
        userId: spec.id,
        subject: "MATH",
        grade: null,
        levelScore: null,
        placedAt: null,
        speed: spec.profile.speed,
        aiNote: spec.profile.aiNote,
        aiPortrait: null,
        portraitUpdatedAt: null,
        groupId: spec.profile.groupId,
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  b.add("groups", { id: GROUP.g8a, name: "8А — алгебра", subject: "MATH", grade: 8, teacherId: USER.anna, createdAt: b.at(-100, 11), updatedAt: b.at(-100, 11) });
  // No members and no lessons → the group empty states.
  b.add("groups", { id: GROUP.empty, name: "Резерв (пустая группа)", subject: "MATH", grade: null, teacherId: USER.anna, createdAt: b.at(-30, 11), updatedAt: b.at(-30, 11) });
  b.add("groups", { id: GROUP.g10b, name: "10Б — профиль", subject: "MATH", grade: 10, teacherId: USER.igor, createdAt: b.at(-45, 11), updatedAt: b.at(-45, 11) });
}
