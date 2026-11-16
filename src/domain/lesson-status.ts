// Ported 1:1 from the site (lib/lesson-status.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
// Статус урока — производная от расписания, а не хранимое состояние:
// до startsAt урок «Запланирован», в интервале startsAt…startsAt+duration —
// «Идёт», после — «Завершён». У урока без даты остаётся статус из БД
// (исторические уроки и ручные сборки без расписания).
// Единственное перекрытие: finishedAt — учитель завершил урок досрочно,
// расписание после этого не имеет значения.

export type DerivedLessonStatus = "PLANNED" | "ACTIVE" | "FINISHED";

const KNOWN_STATUSES: DerivedLessonStatus[] = ["PLANNED", "ACTIVE", "FINISHED"];

export function deriveLessonStatus(
  lesson: {
    startsAt: Date | string | null;
    durationMinutes: number;
    status: string;
    finishedAt?: Date | string | null;
  },
  now: number = Date.now()
): DerivedLessonStatus {
  if (lesson.finishedAt) {
    const finished = new Date(lesson.finishedAt).getTime();

    if (Number.isFinite(finished) && finished <= now) {
      return "FINISHED";
    }
  }

  const start = lesson.startsAt ? new Date(lesson.startsAt).getTime() : Number.NaN;

  if (!Number.isFinite(start)) {
    return KNOWN_STATUSES.includes(lesson.status as DerivedLessonStatus)
      ? (lesson.status as DerivedLessonStatus)
      : "PLANNED";
  }

  if (now < start) {
    return "PLANNED";
  }

  const durationMs = Math.max(0, lesson.durationMinutes) * 60_000;

  if (now < start + durationMs) {
    return "ACTIVE";
  }

  return "FINISHED";
}

/** Предел setTimeout: больший delay (от 2^31 мс ≈ 24,8 суток) браузер выполняет сразу. */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Как часто видимая вкладка «Урок» сверяется со стенными часами — страховка таймера начала. */
export const LESSON_START_CHECK_INTERVAL_MS = 30_000;

// Запас после startsAt: refresh должен прийти, когда сервер уже считает урок идущим.
const LESSON_START_REFRESH_GRACE_MS = 1000;

// Ожидание до перерисовки без предела setTimeout; null — дата битая или свежий рендер уже после начала.
function lessonStartWaitMs(startsAt: Date | string, serverNow: number, clientNow?: number): number | null {
  const start = new Date(startsAt).getTime();
  const now = clientNow === undefined ? serverNow : Math.max(serverNow, clientNow);

  if (!Number.isFinite(start) || !Number.isFinite(now) || (clientNow === undefined && start <= serverNow)) {
    return null;
  }

  return Math.max(0, start - now) + LESSON_START_REFRESH_GRACE_MS;
}

/**
 * Через сколько мс перерисовать пустую вкладку «Урок», чтобы застать начало урока.
 * serverNow — время рендера страницы по часам сервера (снятое до запроса данных),
 * clientNow — Date.now() устройства.
 * Первый показ мог прийти из кэша роутера («Назад», staleTimes) со старым serverNow,
 * поэтому берём более позднее из двух. Свежий ответ на refresh передаётся без clientNow:
 * верим серверу, иначе спешащие часы устройства гоняли бы refresh по кругу до начала.
 * null — таймер не ставим: дата битая, урок дальше предела setTimeout или свежий
 * рендер уже после начала (refresh ничего не изменит, а повтор зациклился бы).
 */
export function lessonStartRefreshDelay(
  startsAt: Date | string,
  serverNow: number,
  clientNow?: number
): number | null {
  const delay = lessonStartWaitMs(startsAt, serverNow, clientNow);

  return delay !== null && delay <= MAX_TIMER_DELAY_MS ? delay : null;
}

/** Наблюдатель начала урока на одном рендере вкладки «Урок». */
export type LessonStartWatch = {
  startsAt: Date | string;
  /** Время рендера по часам сервера. */
  serverNow: number;
  /** Date.now() устройства в момент, когда рендер смонтирован и поставлен таймер. */
  mountedAt: number;
  /** Первый показ: страница могла прийти из кэша роутера со старым serverNow. */
  firstRender: boolean;
  /** Таймер lessonStartRefreshDelay уже сработал. */
  timerFired: boolean;
  /** Этот рендер уже обновляли. */
  refreshed: boolean;
};

/**
 * Обновить ли вкладку «Урок» сейчас (now — Date.now(), hidden — document.hidden).
 * Таймер стоит, пока устройство спит, а после пробуждения ноутбука с открытой вкладкой
 * visibilitychange не приходит. Стенные часы во сне идут, поэтому вкладка сверяется с ними
 * (раз в LESSON_START_CHECK_INTERVAL_MS и при показе): прошло ли с монтирования столько, сколько
 * ждёт таймер. Date.now() со startsAt напрямую не сравниваем: при спешащих часах устройства
 * refresh шёл бы каждые полминуты до настоящего начала.
 * Один refresh на рендер: ответ на него смонтирует наблюдатель заново со свежим serverNow.
 * Скрытую вкладку не обновляем, как и realtime-слушатель, — обновимся при показе.
 */
export function shouldRefreshForLessonStart(watch: LessonStartWatch, now: number, hidden: boolean): boolean {
  if (watch.refreshed || hidden) {
    return false;
  }

  if (watch.timerFired) {
    return true;
  }

  const wait = lessonStartWaitMs(watch.startsAt, watch.serverNow, watch.firstRender ? watch.mountedAt : undefined);

  return wait !== null && now - watch.mountedAt >= wait;
}
