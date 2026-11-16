/** Notifications — docs/spec/09-data-i18n-math.md §2.11: every type, the unread badge, the 20 cap, legacy rows. */
import { HOUR_MS, MINUTE_MS } from "@/domain/moscow-time";

import type { FixtureBuilder } from "./builder";
import { USER } from "./ids";

const HOMEWORKS = "/student/homeworks";

export function addNotifications(b: FixtureBuilder): void {
  // ── Илья: 8 rows, 3 unread.
  b.notification({ userId: USER.ilya, type: "homework-assigned", createdAt: b.at(-20, 12, 1), read: true, href: HOMEWORKS, params: { variant: "assigned", topic: "Линейные уравнения", numbers: "112, 113", count: 2, deadlineAt: b.at(-14, 20) } });
  b.notification({ userId: USER.ilya, type: "homework-checked", createdAt: b.at(-19, 18, 1), read: true, href: `${HOMEWORKS}/hw_ilya_done`, params: { correct: 2, incorrect: 0, uncertain: 0, applied: 1 } });
  b.notification({ userId: USER.ilya, type: "homework-checked", createdAt: b.at(-2, 18, 1), read: true, href: `${HOMEWORKS}/hw_ilya_overdue`, params: { correct: 0, incorrect: 1, uncertain: 0, applied: 0 } });
  // Legacy row without params: the title is translated by the legacy map, the body stays Russian.
  b.notification({ userId: USER.ilya, type: "homework-checked", createdAt: b.at(-2, 19, 1), read: true, href: `${HOMEWORKS}/hw_ilya_later`, params: null, title: "Результат автопроверки готов", body: "Автопроверка: часть номеров нужно перерешать." });
  // Broadcast: free text of the developer, shown as stored in any language; no target.
  b.notification({ userId: USER.ilya, type: "broadcast", createdAt: b.at(-1, 10), read: true, href: null, params: null, title: "Каникулы: занятий 4 ноября не будет", body: "Домашние задания сдаём как обычно." });
  b.notification({ userId: USER.ilya, type: "homework-checked", createdAt: b.rel(-3 * HOUR_MS + 9000), href: `${HOMEWORKS}/hw_ilya_uncertain`, params: { correct: 3, incorrect: 0, uncertain: 1, applied: 2 } });
  {
    // "today, 09:15" when the seed happens later in the day; otherwise an hour before the seed.
    const morning = b.at(0, 9, 15);
    const hourAgo = b.rel(-61 * MINUTE_MS);
    b.notification({ userId: USER.ilya, type: "homework-assigned", createdAt: morning < hourAgo ? morning : hourAgo, href: HOMEWORKS, params: { variant: "deadline", topic: "Линейные уравнения", numbers: "120", count: 1, deadlineAt: b.at(1, 20) } });
  }
  b.notification({ userId: USER.ilya, type: "homework-assigned", createdAt: b.rel(-10 * MINUTE_MS), href: HOMEWORKS, params: { variant: "assigned", topic: "Логарифмические уравнения", numbers: "010203, 010204, 010209", count: 3, deadlineAt: b.at(10, 20) } });

  // ── Мария: 22 rows, all read → proves the cap of 20, `unreadCount` 0.
  for (let index = 0; index < 22; index += 1) {
    const day = -(30 - index);
    if (index % 2 === 0) {
      b.notification({ userId: USER.maria, type: "homework-assigned", createdAt: b.at(day, 12, index), read: true, href: HOMEWORKS, params: { variant: "assigned", topic: index % 4 === 0 ? "Линейные уравнения" : "Квадратные функции", numbers: index % 4 === 0 ? "112, 113, 118" : "204, 207", count: index % 4 === 0 ? 3 : 2, deadlineAt: b.at(day + 7, 20) } });
    } else {
      b.notification({ userId: USER.maria, type: "homework-checked", createdAt: b.at(day, 19, index), read: true, href: `${HOMEWORKS}/hw_maria_done${1 + (index % 3)}`, params: { correct: 2 + (index % 2), incorrect: 0, uncertain: 0, applied: 1 + (index % 2) } });
    }
  }

  // ── The other students: their assigned homeworks.
  b.notification({ userId: USER.artem, type: "homework-assigned", createdAt: b.at(-3, 12, 5), read: true, href: HOMEWORKS, params: { variant: "assigned", topic: "Квадратные функции", numbers: "220, 226", count: 2, deadlineAt: b.at(3, 20) } });
  b.notification({ userId: USER.artem, type: "homework-assigned", createdAt: b.at(-1, 12), href: HOMEWORKS, params: { variant: "assigned", topic: "Логарифмические уравнения", numbers: "010208, 010209, 010210, 010211", count: 4, deadlineAt: b.at(3, 20) } });
  b.notification({ userId: USER.polina, type: "homework-assigned", createdAt: b.at(-2, 12), href: HOMEWORKS, params: { variant: "assigned", topic: "Квадратные функции", numbers: "204, 207", count: 2, deadlineAt: b.at(4, 20) } });
  b.notification({ userId: USER.kirill, type: "homework-assigned", createdAt: b.at(-16, 12), read: true, href: HOMEWORKS, params: { variant: "assigned", topic: "Квадратные функции", numbers: "204, 207, 211", count: 3, deadlineAt: b.at(-9, 20) } });
  b.notification({ userId: USER.kirill, type: "homework-assigned", createdAt: b.at(-10, 12), read: true, href: HOMEWORKS, params: { variant: "assigned", topic: "Производная и исследование функций", numbers: "301, 302", count: 2, deadlineAt: b.at(-3, 20) } });
  b.notification({ userId: USER.dasha, type: "homework-assigned", createdAt: b.at(-3, 12), href: HOMEWORKS, params: { variant: "assigned", topic: "Линейные уравнения", numbers: "112, 113", count: 2, deadlineAt: b.at(2, 20) } });
  b.notification({ userId: USER.sofia, type: "homework-assigned", createdAt: b.at(-2, 12), href: HOMEWORKS, params: { variant: "assigned", topic: "Производная и исследование функций", numbers: "308, 310", count: 2, deadlineAt: b.at(4, 20) } });
  // Тимур and Ольга: none.

  // ── Анна: parent-call reminders (2 unread). Мария's reminder is created lazily by the first bell read.
  b.notification({ userId: USER.anna, type: "parent_call_due", createdAt: b.at(-20, 9), read: true, href: `/teacher/calls?studentId=${USER.kirill}`, params: { state: "due", name: "Кирилл Зайцев", days: 30, hasReachedCall: true } });
  b.notification({ userId: USER.anna, type: "parent_call_due", createdAt: b.at(-5, 9), href: `/teacher/calls?studentId=${USER.artem}`, params: { state: "due", name: "Артём Кузнецов", days: 30, hasReachedCall: false } });
  b.notification({ userId: USER.anna, type: "parent_call_due", createdAt: b.at(-5, 15), href: `/teacher/calls?studentId=${USER.kirill}`, params: { state: "overdue", name: "Кирилл Зайцев", days: 45, hasReachedCall: true } });

  // ── Developer: one of every alert type.
  b.notification({ userId: USER.dev, type: "dev_ai_budget_out", createdAt: b.at(-6, 22), read: true, href: "/developer/panel", params: { used: 300, limit: 300 } });
  b.notification({ userId: USER.dev, type: "dev_storage", createdAt: b.at(-3, 11), read: true, href: "/developer/panel?tab=actions", params: { gb: "12.4" } });
  b.notification({ userId: USER.dev, type: "dev_stale_checks", createdAt: b.at(-2, 11), read: true, href: "/developer/panel?tab=actions", params: { count: 2 } });
  b.notification({ userId: USER.dev, type: "dev_errors", createdAt: b.rel(-2 * HOUR_MS), href: "/developer/panel/journal?outcome=failed&days=1", params: { count: 4 } });
  b.notification({ userId: USER.dev, type: "dev_ai_budget_warn", createdAt: b.rel(-1 * HOUR_MS), href: "/developer/panel", params: { used: 251, limit: 300 } });
}
