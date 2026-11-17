/**
 * Audit journal (70 rows over 14 days) and site settings — docs/spec/09-data-i18n-math.md §2.12.
 * Every row carries `meta.i18n = { key, params }` so the journal renders in the UI language, except three
 * old rows that only have the Russian `summary`.
 */
import type { AuditLog, SiteSettings, UserRole } from "@/api/types";
import { HOUR_MS } from "@/domain/moscow-time";

import type { FixtureBuilder } from "./builder";
import { USER } from "./ids";

type Actor = Pick<AuditLog, "actorId" | "actorName" | "actorRole">;

const actor = (id: string, name: string, role: UserRole): Actor => ({ actorId: id, actorName: name, actorRole: role });

const ANNA = actor(USER.anna, "Анна Петрова", "TEACHER");
const IGOR = actor(USER.igor, "Игорь Соколов", "TEACHER");
const DEV = actor(USER.dev, "Разработчик ШБЗ", "DEVELOPER");
const ILYA = actor(USER.ilya, "Илья Смирнов", "STUDENT");
const MARIA = actor(USER.maria, "Мария Волкова", "STUDENT");
const ARTEM = actor(USER.artem, "Артём Кузнецов", "STUDENT");
const POLINA = actor(USER.polina, "Полина Морозова", "STUDENT");
/** System actors are stored as a Russian snapshot; the journal translates them (`auditActorNameFor`). */
const AUTO_CHECK: Actor = { actorId: null, actorName: "Автопроверка", actorRole: null };
const AUTO_FINISH: Actor = { actorId: null, actorName: "Автозавершение урока", actorRole: null };

const CLIENT_IPS = ["203.0.113.24", "198.51.100.7", "203.0.113.88", "192.0.2.41"] as const;

/** Settings of a fresh mock: the defaults of 09 §1.2, every AI switch on. */
export function defaultSiteSettings(): SiteSettings {
  return {
    aiEnabled: true,
    aiModel: "gpt-6.1-sol",
    aiShortlistModel: "gpt-6-luna",
    aiReasoningEffort: "high",
    aiMinConfidence: 0.6,
    aiDailyLimit: 300,
    aiPerStudentHourlyLimit: 10,
    aiCheckConcurrency: 3,
    photoRetentionDays: 0,
    maxPhotosPerAssignment: 10,
    completedChecksKept: 50,
    lessonPlanEnabled: true,
    lessonPlanShortlistSize: 30,
    lessonPlanMaxItems: 40,
    lessonPlanConcurrency: 3,
    aiPlanDailyLimit: 300,
    homeworkPlanEnabled: true,
    homeworkPlanMaxItems: 40,
    homeworkPlanShortlistSize: 60,
    lessonCheckEnabled: true,
    lessonCheckDailyLimit: 300,
    lessonCheckPerStudentHourlyLimit: 30,
    lessonIdleWarnMinutes: 8,
    lessonIdleAlertMinutes: 15,
    loginHelpContact: "@shbz_teacher",
  };
}

export function addJournal(b: FixtureBuilder): void {
  // ───────────────────────────── AUTH — 25 rows ─────────────────────────────
  const logins: [Actor, number, number, number][] = [
    [ANNA, -13, 8, 55], [ILYA, -13, 16, 2], [DEV, -12, 10, 11], [MARIA, -12, 18, 40], [ANNA, -11, 9, 3],
    [ARTEM, -10, 17, 21], [POLINA, -9, 19, 5], [IGOR, -8, 12, 30], [ANNA, -7, 8, 47], [ILYA, -6, 20, 14],
    [DEV, -5, 11, 2], [MARIA, -4, 18, 9], [ANNA, -3, 9, 15], [ARTEM, -2, 16, 58], [POLINA, -2, 17, 1],
    [ANNA, -1, 8, 51], [ILYA, -1, 19, 33], [DEV, -1, 10, 20], [ANNA, 0, 0, 0],
  ];
  logins.forEach(([who, day, hour, minute], index) => {
    // The newest login is "an hour before the seed" so it never lands in the future.
    const createdAt = day === 0 ? b.rel(-1 * HOUR_MS - 5 * 60_000) : b.at(day, hour, minute);
    b.audit({ createdAt, category: "AUTH", action: "auth.login", ...who, clientIp: CLIENT_IPS[index % CLIENT_IPS.length]!, text: { key: "auth.login" } });
  });
  const failedLogins: [string, string][] = [
    ["ilya@example.com", b.at(-9, 20, 2)],
    ["teacher@example.con", b.at(-3, 9, 14)],
    ["ilya@example.com", b.rel(-5 * HOUR_MS)],
    ["maria@example.com", b.rel(-4 * HOUR_MS)],
  ];
  failedLogins.forEach(([login, createdAt], index) => {
    b.audit({ createdAt, category: "AUTH", action: "auth.login", outcome: "failed", clientIp: CLIENT_IPS[(index + 1) % CLIENT_IPS.length]!, text: { key: "auth.login.failed", params: { login } } });
  });
  b.audit({ createdAt: b.at(-12, 19, 30), category: "AUTH", action: "auth.logout", ...MARIA, clientIp: CLIENT_IPS[1], text: { key: "auth.logout" } });
  b.audit({ createdAt: b.at(-5, 11, 45), category: "AUTH", action: "auth.logout", ...DEV, clientIp: CLIENT_IPS[2], text: { key: "auth.logout" } });

  // ───────────────────────────── AI — 25 rows ─────────────────────────────
  const checks: [day: number, hour: number, correct: number, incorrect: number, uncertain: number, target: string][] = [
    [-13, 19, 2, 0, 0, "hw_maria_done1"], [-12, 18, 1, 1, 0, "hw_ilya_done"], [-11, 20, 3, 0, 0, "hw_maria_done1"],
    [-10, 19, 3, 0, 0, "hw_maria_done1"], [-9, 17, 0, 2, 1, "hw_kirill_overdue1"], [-7, 19, 2, 0, 0, "hw_maria_done2"],
    [-6, 18, 1, 0, 1, "hw_ilya_uncertain"], [-5, 21, 2, 1, 0, "hw_polina_limit"], [-4, 19, 1, 1, 1, "hw_ilya_overdue"],
    [-2, 18, 0, 1, 0, "hw_ilya_overdue"], [-2, 18, 4, 0, 0, "hw_maria_done3"], [-2, 19, 0, 0, 0, "hw_ilya_later"],
  ];
  checks.forEach(([day, hour, correct, incorrect, uncertain, target], index) => {
    const inputTokens = 3000 + ((index * 547) % 6001);
    const outputTokens = 300 + ((index * 83) % 901);
    b.audit({
      createdAt: b.at(day, hour, 1 + index),
      category: "AI",
      action: "solution.check",
      ...AUTO_CHECK,
      targetType: "HomeworkAssignment",
      targetId: target,
      model: "gpt-6.1-sol",
      inputTokens,
      outputTokens,
      costRub: (1.2 + ((index * 0.79) % 8.6)).toFixed(4),
      durationMs: 8000 + ((index * 2917) % 32001),
      text: { key: "solution.check", params: { correct, incorrect, uncertain } },
    });
  });
  const failedChecks: [string, string, string][] = [
    [b.at(-5, 20, 40), "hw_polina_limit", "Request timed out"],
    [b.rel(-3 * HOUR_MS), "hw_ilya_failed", "insufficient quota"],
    [b.rel(-1 * HOUR_MS + 9000), "hw_ilya_failed", "Provider responded with статус 429: rate limit exceeded"],
  ];
  failedChecks.forEach(([createdAt, target, error], index) => {
    b.audit({
      createdAt,
      category: "AI",
      action: "solution.check",
      outcome: "failed",
      ...AUTO_CHECK,
      targetType: "HomeworkAssignment",
      targetId: target,
      model: "gpt-6.1-sol",
      durationMs: 20_000 + index * 7000,
      error,
      text: { key: "solution.check.failed" },
    });
  });
  const itemChecks: [number, string, "correct" | "incorrect" | "uncertain"][] = [
    [-8, "215", "correct"], [-8, "223", "incorrect"], [-4, "218", "uncertain"], [-4, "226", "incorrect"],
  ];
  itemChecks.forEach(([day, number, verdict], index) => {
    b.audit({
      createdAt: b.at(day, 17, 12 + index * 9),
      category: "AI",
      action: "lesson_item.check",
      ...AUTO_CHECK,
      targetType: "Lesson",
      targetId: day === -8 ? "les_g3" : "les_g4",
      targetLabel: "Занятие группы · Квадратные функции",
      model: "gpt-6.1-sol",
      inputTokens: 3400 + index * 410,
      outputTokens: 320 + index * 55,
      costRub: (1.4 + index * 0.37).toFixed(4),
      durationMs: 9000 + index * 1800,
      text: { key: "lesson_item.check", params: { number, verdict } },
    });
  });
  const plans: [string, number, string, string, string][] = [
    ["lesson_plan.shortlist", -10, "gpt-6-luna", "Артём Кузнецов", "les_g3"],
    ["lesson_plan.generate", -10, "gpt-6.1-sol", "Артём Кузнецов", "les_g3"],
    ["lesson_plan.shortlist", -6, "gpt-6-luna", "Полина Морозова", "les_g4"],
    ["lesson_plan.generate", -6, "gpt-6.1-sol", "Полина Морозова", "les_g4"],
    ["homework_plan.generate", -3, "gpt-6.1-sol", "Артём Кузнецов", "hp_issued"],
    ["homework_plan.generate", -2, "gpt-6.1-sol", "Кирилл Зайцев", "hp_conflict"],
  ];
  plans.forEach(([action, day, model, name, target], index) => {
    b.audit({
      createdAt: b.at(day, 12, 3 + index),
      category: "AI",
      action,
      ...ANNA,
      targetType: "Lesson",
      targetId: target,
      model,
      inputTokens: 4200 + index * 730,
      outputTokens: 500 + index * 110,
      costRub: (model === "gpt-6-luna" ? 1.2 + index * 0.05 : 4.1 + index * 0.9).toFixed(4),
      durationMs: 11_000 + index * 4300,
      text: { key: action as "lesson_plan.generate", params: { name } },
    });
  });

  // ───────────────────────────── DATA — 20 rows ─────────────────────────────
  // `action` is the site's action name (07 §4.6: `student.create`, `lesson.schedule`, …) — the journal
  // labels it; the template of the text is `text.key` (`student.created`, `lesson.scheduled`, …).
  // Three old rows written before `meta.i18n` existed: only the Russian summary.
  b.audit({ createdAt: b.at(-14, 10, 5), category: "DATA", action: "student.create", ...ANNA, targetType: "User", targetLabel: "Тестовый Ученик", summary: "Создан ученик Тестовый Ученик" });
  b.audit({ createdAt: b.at(-14, 11, 20), category: "DATA", action: "topic.create", ...DEV, targetType: "Topic", targetLabel: "Пробная тема", summary: "Создана тема «Пробная тема», номеров: 4" });
  b.audit({ createdAt: b.at(-14, 11, 45), category: "DATA", action: "developer.settings_saved", ...DEV, summary: "Настройки сохранены и применены — подействуют в течение 15 секунд." });

  b.audit({ createdAt: b.at(-13, 12), category: "DATA", action: "student.delete", ...ANNA, targetType: "User", targetLabel: "Тестовый Ученик", text: { key: "student.deleted", params: { name: "Тестовый Ученик" } } });
  b.audit({ createdAt: b.at(-13, 12, 30), category: "DATA", action: "topic.delete", ...DEV, targetType: "Topic", targetLabel: "Пробная тема", text: { key: "topic.deleted", params: { count: 2 } } });
  b.audit({ createdAt: b.at(-12, 10, 40), category: "DATA", action: "student.owner_change", ...DEV, text: { key: "account.owner_changed", params: { count: 1 } } });
  b.audit({ createdAt: b.at(-10, 12, 1), category: "DATA", action: "lesson.schedule", ...ANNA, targetType: "Lesson", targetId: "les_g3", targetLabel: "Занятие группы · Квадратные функции", text: { key: "lesson.scheduled", params: { startsAt: b.at(-8, 17) } } });
  b.audit({ createdAt: b.at(-8, 18, 1), category: "DATA", action: "lesson.auto_results", ...AUTO_FINISH, targetType: "Lesson", targetId: "les_g3", targetLabel: "Занятие группы · Квадратные функции", text: { key: "lesson.auto_results", params: { notSolved: 1, skipped: 9, attendance: 0 } }, meta: { notSolved: 1, skipped: 9, attendance: 0 } });
  b.audit({ createdAt: b.at(-7, 9, 30), category: "DATA", action: "topic.create", ...DEV, targetType: "Topic", targetId: "top_word", targetLabel: "Текстовые задачи", text: { key: "topic.created", params: { title: "Текстовые задачи", count: 40 } } });
  b.audit({ createdAt: b.at(-6, 12, 2), category: "DATA", action: "lesson.schedule", ...ANNA, targetType: "Lesson", targetId: "les_g4", targetLabel: "Занятие группы · Квадратные функции", text: { key: "lesson.scheduled", params: { startsAt: b.at(-4, 17) } } });
  b.audit({ createdAt: b.at(-5, 10, 31), category: "DATA", action: "student.create", ...ANNA, targetType: "User", targetId: USER.dasha, targetLabel: "Даша Белова", text: { key: "student.created", params: { name: "Даша Белова" } } });
  b.audit({ createdAt: b.at(-5, 11, 10), category: "DATA", action: "developer.retention_run", ...DEV, text: { key: "developer.retention_run", params: { photos: 14, files: 9 } } });
  b.audit({ createdAt: b.at(-4, 18, 1), category: "DATA", action: "lesson.auto_results", ...AUTO_FINISH, targetType: "Lesson", targetId: "les_g4", targetLabel: "Занятие группы · Квадратные функции", text: { key: "lesson.auto_results", params: { notSolved: 2, skipped: 11, attendance: 0 } }, meta: { notSolved: 2, skipped: 11, attendance: 0 } });
  b.audit({ createdAt: b.at(-4, 18, 20), category: "DATA", action: "progress.status", ...ANNA, targetType: "ProgressStatusEvent", text: { key: "progress.status", params: { source: "lesson_teacher", previousStatus: null, status: "YELLOW", decision: "changed" } } });
  b.audit({ createdAt: b.at(-3, 9, 40), category: "DATA", action: "developer.settings_saved", ...DEV, text: { key: "developer.settings_saved" } });
  b.audit({ createdAt: b.at(-2, 18, 0), category: "DATA", action: "progress.status", ...AUTO_CHECK, targetType: "ProgressStatusEvent", targetId: "pse_ilya_118_25", text: { key: "progress.status", params: { source: "homework_check", previousStatus: null, status: "RED", decision: "changed" } } });
  b.audit({ createdAt: b.at(-1, 10), category: "DATA", action: "developer.broadcast_sent", ...DEV, text: { key: "developer.broadcast_sent", params: { count: 10 } } });
  b.audit({ createdAt: b.at(-1, 12, 10), category: "DATA", action: "progress.status", ...ANNA, targetType: "ProgressStatusEvent", text: { key: "progress.status", params: { source: "teacher", previousStatus: "RED", status: "GREEN", decision: "changed" } } });
  b.audit({ createdAt: b.at(-1, 12, 15), category: "DATA", action: "progress.status", ...ANNA, targetType: "ProgressStatusEvent", text: { key: "progress.status", params: { source: "teacher", previousStatus: "YELLOW", status: "YELLOW", decision: "reaffirmed" } } });
  b.audit({ createdAt: b.at(-28, 17, 50), category: "DATA", action: "lesson.finish", ...ANNA, targetType: "Lesson", targetId: "les_early", targetLabel: "Занятие группы · Линейные уравнения", text: { key: "lesson.finished_early" } });

  // The journal is read newest first: keep the table in chronological order like the other tables.
  b.tables.auditLogs.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
