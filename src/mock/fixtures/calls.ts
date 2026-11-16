/**
 * Parent calls — docs/spec/09-data-i18n-math.md §2.10 with 90-addendum-6 §6.6. All offsets are Moscow
 * calendar days. Comments are personal data: they exist only here and in the teacher / developer projections.
 */
import type { ParentCallOutcome } from "@/api/types";

import type { FixtureBuilder } from "./builder";
import { USER } from "./ids";

const POLINA_COMMENTS: (string | null)[] = [
  null,
  "Договорились о дополнительном занятии перед контрольной.",
  "Папа просит присылать итоги занятий раз в неделю.",
  null,
  "Обсудили пропуски: в октябре была на соревнованиях.",
  "Мама довольна прогрессом по квадратным уравнениям. Просит обратить внимание на оформление: Полина часто теряет знак при переносе слагаемых и торопится в длинных выкладках. Дома занимается по сорок минут через день, чаще не получается из-за секции. Договорились созвониться после следующей контрольной.",
  null,
  "Перезвонить после 19:00.",
];

export function addCalls(b: FixtureBuilder): void {
  // Артём: created 35 days ago, no calls → "due", «звонков ещё не было».
  // Даша (created −5 d) and Тимур (created today): no calls → "ok".

  // Кирилл: last REACHED 50 days ago → "overdue"; an unanswered attempt 3 days ago does not move the anchor.
  b.call({ studentId: USER.kirill, teacherId: USER.anna, outcome: "REACHED", calledAt: b.at(-50, 12), comment: "Мама просит присылать ДЗ в мессенджер." });
  b.call({ studentId: USER.kirill, teacherId: USER.anna, outcome: "NO_ANSWER", calledAt: b.at(-3, 18, 30) });

  // Полина: 23 rows over 11 months (the history shows 20), last REACHED 10 days ago → "ok", 20 days until due.
  // The oldest row has no teacher (statistics: "outside teacher cards").
  for (let index = 0; index < 23; index += 1) {
    const day = -(10 + (22 - index) * 14);
    const last = index === 22;
    const outcome: ParentCallOutcome = last || index % 3 !== 1 ? "REACHED" : "NO_ANSWER";
    b.call({
      studentId: USER.polina,
      teacherId: index === 0 ? null : USER.anna,
      outcome,
      calledAt: b.at(day, 17 + (index % 3), (index * 7) % 60),
      comment: outcome === "REACHED" ? POLINA_COMMENTS[index % POLINA_COMMENTS.length]! : null,
    });
  }

  // Илья: last REACHED 29 days ago → "ok" with one day left (boundary).
  b.call({ studentId: USER.ilya, teacherId: USER.anna, outcome: "REACHED", calledAt: b.at(-64, 18), comment: "Родители просят больше задач на проценты." });
  b.call({ studentId: USER.ilya, teacherId: USER.anna, outcome: "REACHED", calledAt: b.at(-29, 18, 15), comment: "Обсудили подготовку к контрольной по логарифмам." });

  // Мария: last REACHED exactly 30 days ago, no comment → "due" at the boundary.
  b.call({ studentId: USER.maria, teacherId: USER.anna, outcome: "REACHED", calledAt: b.at(-30, 19) });

  // Igor's students: Софья (created −40 d, no calls) → "due"; Егор → "ok".
  b.call({ studentId: USER.egor, teacherId: USER.igor, outcome: "REACHED", calledAt: b.at(-12, 18), comment: "Всё по плану." });
}
