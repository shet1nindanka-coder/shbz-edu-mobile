/**
 * Homework drafts (`Lesson.kind = HOMEWORK`) — docs/spec/09-data-i18n-math.md §2.9 as extended by
 * 90-addendum-6 §6.2 and §6.4: nine drafts of Анна covering generation, issue and every stored plan error.
 */
import type { HomeworkPlanParams, IsoDateTime } from "@/api/types";
import { MINUTE_MS } from "@/domain/moscow-time";

import type { FixtureBuilder, ItemSpec } from "./builder";
import { GROUP, TOPIC, USER } from "./ids";

const items = (labels: string[]): ItemSpec[] => labels.map((n) => ({ n }));

function params(title: string, topicId: string, deadlineAt: IsoDateTime, extra: Partial<HomeworkPlanParams> = {}): HomeworkPlanParams {
  return { title, topicId, deadlineAt, teacherNote: "", sourceLessonId: null, dailyMinutes: 60, outputLocale: "ru", ...extra };
}

export function addDrafts(b: FixtureBuilder): void {
  // ── hp_generating — all three participants pending (created 3 s before the seed); resolve after the first read.
  {
    const deadlineAt = b.at(7, 20);
    const title = b.draftAutoTitle(TOPIC.systems, deadlineAt);
    b.lesson({
      id: "hp_generating",
      kind: "HOMEWORK",
      title,
      teacherId: USER.anna,
      groupId: GROUP.g8a,
      topicId: TOPIC.systems,
      deadlineAt,
      planParams: params("", TOPIC.systems, deadlineAt),
      createdAt: b.rel(-3000),
      participants: [
        { studentId: USER.artem, speed: 8, planGeneratedAt: null, items: [] },
        { studentId: USER.polina, speed: 5, planGeneratedAt: null, items: [] },
        { studentId: USER.kirill, speed: 3, planGeneratedAt: null, items: [] },
      ],
    });
    // Per participant `5000 + 1000 × (i % 3)` ms, i = index in name order: Артём, Кирилл, Полина.
    const scripted: { student: string; delayMs: number; main: string[] | null }[] = [
      { student: "artem", delayMs: 5000, main: ["num_401", "num_402", "num_403", "num_404", "num_405"] },
      // Кирилл has closed every number of the topic → nothing left to pick.
      { student: "kirill", delayMs: 6000, main: null },
      { student: "polina", delayMs: 7000, main: ["num_401", "num_402", "num_403", "num_404"] },
    ];
    for (const entry of scripted) {
      const participantId = `lp_hp_generating_${entry.student}`;
      b.add("planScripts", {
        id: participantId,
        outcome: entry.main
          ? { kind: "items", mainNumberIds: entry.main, extraNumberIds: [], summary: "Системы по нарастающей: подстановка, затем сложение." }
          : { kind: "error", code: "homeworkNoCandidates" },
      });
      b.add("jobs", { id: `job_hp_generating_${entry.student}`, kind: "planGeneration", refId: participantId, state: "waiting", delayMs: entry.delayMs, dueAt: null, payload: {}, createdAt: b.t0 });
    }
  }

  // ── hp_ready — both ready, nothing issued.
  {
    const deadlineAt = b.at(4, 20);
    const createdAt = b.at(-1, 16);
    b.lesson({
      id: "hp_ready",
      kind: "HOMEWORK",
      title: "Логарифмы к пятнице",
      teacherId: USER.anna,
      topicId: TOPIC.log,
      deadlineAt,
      planParams: params("Логарифмы к пятнице", TOPIC.log, deadlineAt, { dailyMinutes: 45 }),
      createdAt,
      participants: [
        { studentId: USER.ilya, speed: 6, planGeneratedAt: b.plusMinutes(createdAt, 0.1), planSummary: "Закрываем пробелы по области определения, затем новые уравнения.", items: items(["010211", "010212", "010213", "010214"]) },
        { studentId: USER.maria, speed: 5, planGeneratedAt: b.plusMinutes(createdAt, 0.11), planSummary: "Простейшие логарифмические уравнения по порядку.", items: items(["010203", "010204", "010205", "010206"]) },
      ],
    });
  }

  // ── hp_issued — created from the lesson les_g4. Артём: issued (the assignment exists). Полина: stale stamp
  //    (the id of an assignment that no longer exists — issued, then cancelled).
  {
    const deadlineAt = b.at(3, 20);
    const createdAt = b.at(-3, 12);
    b.lesson({
      id: "hp_issued",
      kind: "HOMEWORK",
      title: "Закрепление занятия",
      teacherId: USER.anna,
      groupId: GROUP.g8a,
      topicId: TOPIC.quadratic,
      deadlineAt,
      planParams: params("Закрепление занятия", TOPIC.quadratic, deadlineAt, { sourceLessonId: "les_g4" }),
      createdAt,
      participants: [
        { studentId: USER.artem, speed: 8, planGeneratedAt: b.plusMinutes(createdAt, 0.1), planSummary: "Повторяем то, что не получилось на занятии.", issuedAssignmentId: "hw_artem_issued", issuedAt: b.at(-3, 12, 5), items: items(["220", "226"]) },
        { studentId: USER.polina, speed: 5, planGeneratedAt: b.plusMinutes(createdAt, 0.11), planSummary: "Повторяем то, что не получилось на занятии.", issuedAssignmentId: "hw_polina_cancelled", issuedAt: b.at(-3, 12, 6), items: items(["223", "226"]) },
      ],
    });
  }

  // ── hp_stale — pending for 20 minutes: stale, retry only.
  {
    const deadlineAt = b.at(6, 20);
    b.lesson({
      id: "hp_stale",
      kind: "HOMEWORK",
      title: "Текстовые задачи — неделя",
      teacherId: USER.anna,
      topicId: TOPIC.word,
      deadlineAt,
      planParams: params("Текстовые задачи — неделя", TOPIC.word, deadlineAt),
      createdAt: b.rel(-20 * MINUTE_MS),
      participants: [{ studentId: USER.dasha, planGeneratedAt: null, items: [] }],
    });
  }

  // ── hp_past — the deadline passed; issue → `deadlinePassed`.
  {
    const deadlineAt = b.at(-1, 20);
    b.lesson({
      id: "hp_past",
      kind: "HOMEWORK",
      title: "Производная (просрочен)",
      teacherId: USER.anna,
      topicId: TOPIC.derivative,
      deadlineAt,
      planParams: params("Производная (просрочен)", TOPIC.derivative, deadlineAt),
      createdAt: b.at(-6, 12),
      participants: [{ studentId: USER.ilya, speed: 6, planGeneratedAt: null, planError: "plan-error:homeworkParams", items: [] }],
    });
  }

  // ── hp_conflict — issue partly fails: Артём solved 127 and 130 after generation, Полина's set was emptied.
  {
    const deadlineAt = b.at(5, 20);
    const createdAt = b.at(-2, 13);
    const generatedAt = b.plusMinutes(createdAt, 0.1);
    b.lesson({
      id: "hp_conflict",
      kind: "HOMEWORK",
      title: b.draftAutoTitle(TOPIC.linear, deadlineAt),
      teacherId: USER.anna,
      groupId: GROUP.g8a,
      topicId: TOPIC.linear,
      deadlineAt,
      planParams: params("", TOPIC.linear, deadlineAt, { dailyMinutes: 30 }),
      createdAt,
      participants: [
        { studentId: USER.artem, speed: 8, planGeneratedAt: generatedAt, planSummary: "Закрепляем дроби и раскрытие скобок.", items: items(["120", "124", "127", "130"]) },
        { studentId: USER.kirill, speed: 3, planGeneratedAt: generatedAt, planSummary: "Короткие уравнения в один-два шага.", items: items(["112", "113", "118"]) },
        { studentId: USER.polina, speed: 5, planGeneratedAt: generatedAt, planSummary: "Повторение раскрытия скобок.", items: [] },
      ],
    });
  }

  // ── hp_full — fully issued (one participant, the assignment exists).
  {
    const deadlineAt = b.at(2, 20);
    const createdAt = b.at(-8, 11, 50);
    b.lesson({
      id: "hp_full",
      kind: "HOMEWORK",
      title: b.draftAutoTitle(TOPIC.quadratic, deadlineAt),
      teacherId: USER.anna,
      topicId: TOPIC.quadratic,
      deadlineAt,
      planParams: params("", TOPIC.quadratic, deadlineAt),
      createdAt,
      participants: [
        { studentId: USER.maria, speed: 5, planGeneratedAt: b.plusMinutes(createdAt, 0.1), planSummary: "Вершина параболы и нули функции.", issuedAssignmentId: "hw_maria_done3", issuedAt: b.at(-8, 12), items: items(["204", "207", "211", "215"]) },
      ],
    });
  }

  // ── hp_queue — create-time refusal `queueFull`.
  {
    const deadlineAt = b.at(8, 20);
    b.lesson({
      id: "hp_queue",
      kind: "HOMEWORK",
      title: b.draftAutoTitle(TOPIC.derivative, deadlineAt),
      teacherId: USER.anna,
      topicId: TOPIC.derivative,
      deadlineAt,
      planParams: params("", TOPIC.derivative, deadlineAt),
      createdAt: b.at(-1, 17),
      participants: [{ studentId: USER.dasha, planGeneratedAt: null, planError: "plan-error:queueFull", items: [] }],
    });
  }

  // ── hp_errors — three generation errors side by side; nothing can be issued.
  {
    const deadlineAt = b.at(9, 20);
    b.lesson({
      id: "hp_errors",
      kind: "HOMEWORK",
      title: b.draftAutoTitle(TOPIC.quadratic, deadlineAt),
      teacherId: USER.anna,
      groupId: GROUP.g8a,
      topicId: TOPIC.quadratic,
      deadlineAt,
      planParams: params("", TOPIC.quadratic, deadlineAt),
      createdAt: b.at(-2, 15),
      participants: [
        { studentId: USER.artem, speed: 8, planGeneratedAt: null, planError: "plan-error:emptyPlan", items: [] },
        { studentId: USER.kirill, speed: 3, planGeneratedAt: null, planError: "plan-error:homeworkNoCandidates", items: [] },
        // Display fixture: the row keeps the code although the student exists (on the site only a race leaves it behind).
        { studentId: USER.polina, speed: 5, planGeneratedAt: null, planError: "plan-error:studentMissing", items: [] },
      ],
    });
  }
}
