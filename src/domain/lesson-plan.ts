// Ported 1:1 from the site (lib/lesson-plan.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
import type { HomeworkNumberStatus } from "@/domain/enums";
import { extractJsonObject } from "@/domain/solution-check-parse";
import { compareHomeworkNumbers } from "@/domain/utils";

/*
 * Факты и валидация ИИ-подбора заданий на урок.
 * Здесь НЕТ эвристик подбора: никаких множителей скорости, баллов приоритета
 * и расчёта «минут на задачу». Сколько и каких задач дать — решает модель;
 * код лишь собирает доступные номера, отбрасывает то, что правила промпта
 * всё равно запрещают брать (дальние номера темы), и валидирует ответ.
 */

export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 240;
export const MIN_SPEED = 1;
export const MAX_SPEED = 10;
export const MAX_GROUP_SIZE = 30;

// Предохранители, а не подбор: защита от разорительного запроса и от сорвавшейся модели.
export const MAX_SHORTLIST = 60; // сколько кандидатов уходит во второй этап с полными условиями
export const MAX_PLAN_ITEMS = 40; // потолок номеров в плане одного ученика
export const CONDITION_CHARS_LIMIT = 600;
export const MAX_STUDENT_NOTE_CHARS = 160;
// Сколько ближайших нерешённых номеров каждой темы видит отсев (пробелы — сверх этого).
export const LESSON_TOPIC_HEAD = 25;

export const MAX_TEACHER_NOTE_LENGTH = 500;
export const MAX_TITLE_LENGTH = 200;
const MAX_COMMENT_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 400;
const MAX_MODEL_MINUTES = 240;

export type PlanReason = "NEW" | "GAP";

const PLAN_REASONS: PlanReason[] = ["NEW", "GAP"];

export type AvailableNumber = {
  id: string;
  number: string;
  topicId: string;
  topicTitle: string;
  topicDisplayOrder: number;
  displayOrder: number;
  estimatedMinutes: number | null;
  conditionLatex: string | null;
  status: HomeworkNumberStatus | null;
  note: string | null;
  deadlineAt: Date | null;
  statusChangedAt: Date | null;
  /** Номер уже выдавался в ДЗ, но так и не решён — повторная выдача уместна. */
  assignedBefore: boolean;
  /** Задачу разбирали на уроке, но ученик её не решил (итог NOT_SOLVED) — вернуть уместно. */
  attemptedInLesson: boolean;
};

export type LessonPlanContextTopics = {
  topics: {
    id: string;
    title: string;
    displayOrder: number;
    numbers: {
      id: string;
      number: string;
      displayOrder: number;
      estimatedMinutes: number | null;
      conditionLatex: string | null;
      status: HomeworkNumberStatus | null;
      note: string | null;
      deadlineAt: Date | null;
      statusChangedAt: Date | null;
      assignedBefore: boolean;
      attemptedInLesson: boolean;
    }[];
  }[];
  excludedNumberIds: string[];
};

export type PlanParams = {
  title: string;
  durationMinutes: number;
  topicIds: string[];
  teacherNote: string;
};

export type ParsedPlanItem = {
  index: number;
  reason: PlanReason;
  minutes: number | null;
  comment: string;
};

export type ParsedPlan = {
  items: ParsedPlanItem[]; // основная часть — на всю длительность занятия
  extraItems: ParsedPlanItem[]; // дополнительная — если основная решена раньше времени
  summary: string;
};

export function toFiniteInteger(value: unknown): number | null {
  // Number(null) === 0 и Number("") === 0 — считаем это отсутствием значения.
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed);
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Только фактические исключения, без ранжирования: уже выданное на уроках,
 * активные ДЗ, прорешанные (GREEN/YELLOW) номера и темы вне фильтра. Порядок
 * нейтральный и стабильный — для воспроизводимости, а не для приоритета.
 */
export function collectAvailableNumbers(
  context: LessonPlanContextTopics,
  params: { topicIds?: string[] }
): AvailableNumber[] {
  const excluded = new Set(context.excludedNumberIds);
  const topicFilter = params.topicIds && params.topicIds.length > 0 ? new Set(params.topicIds) : null;

  const available: AvailableNumber[] = [];

  for (const topic of context.topics) {
    if (topicFilter && !topicFilter.has(topic.id)) {
      continue;
    }

    for (const number of topic.numbers) {
      if (excluded.has(number.id)) {
        continue;
      }

      available.push({
        id: number.id,
        number: number.number,
        topicId: topic.id,
        topicTitle: topic.title,
        topicDisplayOrder: topic.displayOrder,
        displayOrder: number.displayOrder,
        estimatedMinutes: number.estimatedMinutes,
        conditionLatex: number.conditionLatex,
        status: number.status,
        note: number.note,
        deadlineAt: number.deadlineAt,
        statusChangedAt: number.statusChangedAt,
        assignedBefore: number.assignedBefore,
        attemptedInLesson: number.attemptedInLesson
      });
    }
  }

  available.sort(
    (a, b) =>
      a.topicDisplayOrder - b.topicDisplayOrder ||
      a.displayOrder - b.displayOrder ||
      compareHomeworkNumbers(a.number, b.number)
  );

  return available;
}

/** Описание сжатого формата для системных промптов отсева (урок и ДЗ). */
export const SHORTLIST_FORMAT_NOTE =
  'Формат кандидатов: candidates — группы по темам {"topic": название, "rows": [...]}. Каждая строка rows — [index, номер, bankMinutes, флаги, дней с последней смены статуса, заметка ученика]; пустые значения в конце строки опущены, null — значение неизвестно. Флаги — буквы: R — красный статус (не решил), A — assignedBefore, L — attemptedInLesson, O — просрочен дедлайн. От каждой темы переданы ближайшие нерешённые номера по порядку и все пробелы; дальние номера тем не передаются.';

/** То же для второго этапа: пустые поля кандидатов опущены. */
export const PLAN_CANDIDATES_FORMAT_NOTE =
  "У кандидатов опущены пустые поля: поля нет — значит null или false (нет assignedBefore — номер не выдавался, нет bankMinutes — оценки времени нет).";

function daysBetween(from: Date | null, to: Date) {
  if (!from) {
    return null;
  }

  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function isOverdue(candidate: AvailableNumber, now: Date) {
  return Boolean(candidate.deadlineAt && candidate.deadlineAt < now && candidate.status !== "GREEN");
}

/** Пробел — то, что промпт велит вернуть в работу: красный, выдававшийся, разобранный на уроке, просроченный. */
export function isGapCandidate(candidate: AvailableNumber, now: Date) {
  return candidate.status === "RED" || candidate.assignedBefore || candidate.attemptedInLesson || isOverdue(candidate, now);
}

/**
 * Ученик идёт по номерам темы подряд, поэтому номер №300 при нерешённом №12
 * модель не возьмёт — а платим мы за каждый переданный. Оставляем все пробелы
 * и первые headPerTopic нерешённых номеров каждой темы; порядок не меняется.
 */
export function trimToTopicHeads(available: AvailableNumber[], headPerTopic: number, now: Date): AvailableNumber[] {
  const taken = new Map<string, number>();

  return available.filter((candidate) => {
    if (isGapCandidate(candidate, now)) {
      return true;
    }

    const count = taken.get(candidate.topicId) ?? 0;

    if (count >= headPerTopic) {
      return false;
    }

    taken.set(candidate.topicId, count + 1);
    return true;
  });
}

const STATUS_FLAGS: Record<string, string> = { RED: "R", YELLOW: "Y", GREEN: "G" };

/** Флаги отсева одной строкой: R/Y/G — статус, A — assignedBefore, L — attemptedInLesson, O — просрочен. */
function candidateFlags(candidate: AvailableNumber, now: Date) {
  return [
    candidate.status ? STATUS_FLAGS[candidate.status] ?? "" : "",
    candidate.assignedBefore ? "A" : "",
    candidate.attemptedInLesson ? "L" : "",
    isOverdue(candidate, now) ? "O" : ""
  ].join("");
}

/**
 * Кандидаты отсева в сжатом виде: тема один раз на группу, номер — строкой
 * [index, номер, bankMinutes, флаги, дней со смены статуса, заметка]
 * с отброшенными пустыми хвостами. Те же факты, что раньше, но в ~10 раз меньше токенов.
 */
export function buildShortlistCandidates(candidates: AvailableNumber[], now: Date) {
  const groups: { topic: string; rows: unknown[][] }[] = [];

  candidates.forEach((candidate, index) => {
    const row: unknown[] = [
      index,
      candidate.number,
      candidate.estimatedMinutes,
      candidateFlags(candidate, now),
      daysBetween(candidate.statusChangedAt, now),
      candidate.note ? candidate.note.slice(0, MAX_STUDENT_NOTE_CHARS) : null
    ];

    while (row.length > 2 && (row[row.length - 1] === null || row[row.length - 1] === "")) {
      row.pop();
    }

    const last = groups[groups.length - 1];

    if (last && last.topic === candidate.topicTitle) {
      last.rows.push(row);
    } else {
      groups.push({ topic: candidate.topicTitle, rows: [row] });
    }
  });

  return groups;
}

/** Кандидаты второго этапа: прежние поля, но null и false не передаются — промпт трактует отсутствие как «нет». */
export function buildPlanCandidates(candidates: AvailableNumber[], now: Date) {
  return candidates.map((candidate, index) => {
    const entry: Record<string, unknown> = {
      index,
      topic: candidate.topicTitle,
      number: candidate.number,
      bankMinutes: candidate.estimatedMinutes,
      status: candidate.status,
      daysSinceStatus: daysBetween(candidate.statusChangedAt, now),
      overdue: isOverdue(candidate, now),
      assignedBefore: candidate.assignedBefore,
      attemptedInLesson: candidate.attemptedInLesson,
      note: candidate.note ? candidate.note.slice(0, MAX_STUDENT_NOTE_CHARS) : null,
      condition: candidate.conditionLatex?.slice(0, CONDITION_CHARS_LIMIT) ?? null
    };

    for (const key of Object.keys(entry)) {
      if (entry[key] === null || entry[key] === undefined || entry[key] === false) {
        delete entry[key];
      }
    }

    return entry;
  });
}

/** Разбор первого этапа (отсев): {"indexes":[0,4,7]} → валидные уникальные индексы. */
export function parseShortlistResponse(content: string, candidateCount: number): number[] {
  let payload: { indexes?: unknown };

  try {
    payload = extractJsonObject(content) as { indexes?: unknown };
  } catch {
    return [];
  }

  if (!payload || !Array.isArray(payload.indexes)) {
    return [];
  }

  const seen = new Set<number>();
  const indexes: number[] = [];

  for (const raw of payload.indexes) {
    const index = toFiniteInteger(raw);

    if (index === null || index < 0 || index >= candidateCount || seen.has(index)) {
      continue;
    }

    seen.add(index);
    indexes.push(index);

    if (indexes.length >= MAX_SHORTLIST) {
      break;
    }
  }

  return indexes;
}

/** Разбор второго этапа: порядок элементов от модели сохраняется — это порядок решения на уроке. */
export function parseLessonPlanResponse(content: string, candidateCount: number): ParsedPlan {
  const empty: ParsedPlan = { items: [], extraItems: [], summary: "" };
  let payload: { items?: unknown; extraItems?: unknown; summary?: unknown };

  try {
    payload = extractJsonObject(content) as { items?: unknown; extraItems?: unknown; summary?: unknown };
  } catch {
    return empty;
  }

  if (!payload || !Array.isArray(payload.items)) {
    return empty;
  }

  // Общий набор индексов: номер не может быть одновременно в основной и дополнительной части.
  const seen = new Set<number>();

  const collect = (rawList: unknown, limit: number): ParsedPlanItem[] => {
    if (!Array.isArray(rawList)) {
      return [];
    }

    const collected: ParsedPlanItem[] = [];

    for (const raw of rawList) {
      if (!raw || typeof raw !== "object") {
        continue;
      }

      const record = raw as Record<string, unknown>;
      const index = toFiniteInteger(record.index);

      if (index === null || index < 0 || index >= candidateCount || seen.has(index)) {
        continue;
      }

      const reasonRaw = typeof record.reason === "string" ? record.reason.toUpperCase() : "";
      const reason = (PLAN_REASONS as string[]).includes(reasonRaw) ? (reasonRaw as PlanReason) : "NEW";

      const minutesRaw = toFiniteInteger(record.minutes);
      const minutes = minutesRaw === null || minutesRaw < 1 ? null : Math.min(MAX_MODEL_MINUTES, minutesRaw);

      const comment = typeof record.comment === "string" ? record.comment.trim().slice(0, MAX_COMMENT_LENGTH) : "";

      seen.add(index);
      collected.push({ index, reason, minutes, comment });

      if (collected.length >= limit) {
        break;
      }
    }

    return collected;
  };

  const items = collect(payload.items, MAX_PLAN_ITEMS);
  const extraItems = collect(payload.extraItems, MAX_PLAN_ITEMS);
  const summary = typeof payload.summary === "string" ? payload.summary.trim().slice(0, MAX_SUMMARY_LENGTH) : "";

  return { items, extraItems, summary };
}

/** Скорость ученика: целое 1..10 либо null («не указана»). */
export function normalizeSpeed(raw: unknown): number | null {
  const speed = toFiniteInteger(raw);

  if (speed === null) {
    return null;
  }

  return clampInteger(speed, MIN_SPEED, MAX_SPEED);
}

export function normalizePlanParams(raw: {
  title?: unknown;
  durationMinutes?: unknown;
  topicIds?: unknown;
  teacherNote?: unknown;
}): PlanParams {
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, MAX_TITLE_LENGTH) : "";

  const durationRaw = toFiniteInteger(raw.durationMinutes);
  const durationMinutes =
    durationRaw === null ? 60 : clampInteger(durationRaw, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES);

  const topicIds = Array.isArray(raw.topicIds)
    ? raw.topicIds.map((value) => String(value).trim()).filter(Boolean)
    : [];

  const teacherNote =
    typeof raw.teacherNote === "string" ? raw.teacherNote.trim().slice(0, MAX_TEACHER_NOTE_LENGTH) : "";

  return { title, durationMinutes, topicIds, teacherNote };
}

export type LessonItemsUpdatePlan = {
  /** id строк набора, которых нет в новом списке и по которым сдач не было. */
  toDelete: string[];
  /** Существующие строки: новый порядок и часть (основная/дополнительная). */
  toUpdate: { id: string; order: number; isExtra: boolean }[];
  /** Новые номера. */
  toCreate: { homeworkNumberId: string; order: number; isExtra: boolean }[];
  /** Строки со сдачами ученика, которые новый список убирает: удалять нельзя. */
  blockedItemIds: string[];
};

/**
 * Дифференциальная правка набора участника. Строка LessonAssignmentItem — якорь
 * для сдач ученика (LessonItemSubmission каскадится от item), поэтому «заменить
 * список» нельзя через delete+create: существующие номера обновляются на месте,
 * а номер со сдачей из набора не убирается — это уже история работы ученика.
 * mainIds и extraIds считаются уже нормализованными (уникальны, не пересекаются).
 */
export function planLessonItemsUpdate(
  existing: { id: string; homeworkNumberId: string; hasSubmission: boolean }[],
  mainIds: string[],
  extraIds: string[]
): LessonItemsUpdatePlan {
  const existingByNumberId = new Map(existing.map((item) => [item.homeworkNumberId, item]));
  const plan: LessonItemsUpdatePlan = { toDelete: [], toUpdate: [], toCreate: [], blockedItemIds: [] };
  const desired = [
    ...mainIds.map((homeworkNumberId, order) => ({ homeworkNumberId, order, isExtra: false })),
    ...extraIds.map((homeworkNumberId, order) => ({ homeworkNumberId, order: mainIds.length + order, isExtra: true }))
  ];
  const desiredNumberIds = new Set(desired.map((entry) => entry.homeworkNumberId));

  for (const entry of desired) {
    const current = existingByNumberId.get(entry.homeworkNumberId);

    if (current) {
      plan.toUpdate.push({ id: current.id, order: entry.order, isExtra: entry.isExtra });
    } else {
      plan.toCreate.push(entry);
    }
  }

  for (const item of existing) {
    if (desiredNumberIds.has(item.homeworkNumberId)) {
      continue;
    }

    if (item.hasSubmission) {
      plan.blockedItemIds.push(item.id);
    } else {
      plan.toDelete.push(item.id);
    }
  }

  return plan;
}
