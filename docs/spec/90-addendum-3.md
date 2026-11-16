# 90 — Addendum 3: the three daily AI budgets — fixed window, scope names, reset action, and the "used" numbers

Closes one gap found by the completeness review of specs `01`–`09` (the only wrong claim out of about 130
spot-checked ones): `05-teacher-lessons-plans.md` §4.5 describes the AI-plan daily budget as a rolling 24 h
window. In the code it is a **fixed window aligned to the Unix epoch**. The same rule applies to the two
sibling daily budgets described in `03-student-homework-lesson.md`, which state the window length but not its
type. This addendum fixes the wording, names the missing scope, and separates the budget counter from the
other "runs in 24 h" numbers the developer sees.

Marking used below: **[CODE]** = fact read from the site code (file named). **[PROPOSAL]** = suggested mobile
contract (the site has no mobile API). **CORRECTION to `<file>`** = an existing spec line that the code
contradicts or leaves ambiguous.

Source files read for this addendum (web repo, read-only): `lib/plan-budget.ts`,
`lib/persistent-rate-limit.ts`, `lib/rate-limit.ts` (`RateLimitResult`, `buildRateLimitKey`,
`getRetryAfterSeconds`), `lib/api-rate-limit.ts`, `lib/solution-check.ts`, `lib/lesson-item-check.ts`,
`lib/lesson-plan-queue.ts`, `lib/solution-check-queue.ts`, `lib/ai-limit-alerts.ts`, `lib/developer-alerts.ts`,
`lib/telegram-digest-job.ts`, `lib/telegram-digest.ts`, `lib/site-settings.ts`, `actions/developer.ts`,
`app/api/student/homework-checks/route.ts`, `app/api/student/lesson-submissions/route.ts`,
`app/api/teacher/lessons/route.ts`, `app/api/teacher/homework-plans/route.ts`,
`app/api/teacher/lessons/[lessonId]/participants/[participantId]/regenerate/route.ts`,
`app/(dashboard)/teacher/panel/page.tsx`, `components/developer-panel.tsx`,
`lib/i18n/dictionaries/planner.ts`, `lib/i18n/dictionaries/records.ts`, `lib/i18n/dictionaries/api-common.ts`,
`prisma/schema.prisma` (`RateLimitBucket`, `HomeworkCheck`), `tests/ai-limit-alerts.test.ts`.

---

## 1. Corrections

### 1.1 CORRECTION to `05-teacher-lessons-plans.md` §4.5 (first bullet)

Spec text: "Global (all teachers) limit `aiPlanDailyLimit` (default 300) **per rolling 24 h window**."

Right value from the code (`lib/plan-budget.ts` → `consumePersistentRateLimit`, `lib/persistent-rate-limit.ts`):

- The budget is one Postgres bucket: scope **`api:ai-plans:global`**, identifier **`global`**,
  `windowMs = 24 * 60 * 60_000 = 86 400 000`.
- The window is **fixed**, not rolling: `windowStart = floor(now / windowMs) * windowMs`,
  `resetAt = windowStart + windowMs`. With a 24 h window this is **00:00 UTC = 03:00 Europe/Moscow** every
  day (`tests/ai-limit-alerts.test.ts` asserts the reset text "Счётчик обнулится в 03:00 МСК" for
  `resetAt = Date.UTC(2026, 9, 23)`).
- The counter does **not** free a slot 24 h after each generation. All generations of the current window stay
  counted until the boundary, then the whole counter starts from zero.

Replacement text for the first bullet of `05` §4.5:

> Budget unit = one generation (one participant). Global (all teachers and developers, lessons **and** homework
> drafts) limit `aiPlanDailyLimit` (default 300, range 1..100000) per **fixed 24 h window aligned to the epoch:
> the counter resets at 00:00 UTC (03:00 Moscow)**. Bucket scope `api:ai-plans:global`, identifier `global`.
> A request that does not fit is refused **entirely** (the amount is returned to the bucket) →
> `budgetExhausted`.

The other three bullets of `05` §4.5 are correct as written.

### 1.2 CORRECTION to `05-teacher-lessons-plans.md` §0.3 (limits table, row "AI plan global daily budget")

Spec text: "`aiPlanDailyLimit` default `300` generations / 24 h". Not wrong, but ambiguous in the same way.
Read it as: "`300` generations per fixed 24 h window (00:00 UTC → 00:00 UTC), scope `api:ai-plans:global`".

### 1.3 CORRECTION to `03-student-homework-lesson.md` §3.3 row 13 and §3.7 row 20

Both rows give the window length ("/ 86 400 000 ms", "/ 24 h") without the window type. They are the same
limiter as §1.1 and therefore **fixed windows that reset at 00:00 UTC (03:00 Moscow)**:

- §3.3 row 13 — scope `api:homework-checks:global`, identifier `global`, limit `aiDailyLimit`.
- §3.7 row 20 — scope `api:lesson-checks:global`, identifier `global`, limit `lessonCheckDailyLimit`.

A 429 caused by either budget stops at the window boundary, not 24 h after the first check of the day.

### 1.4 CORRECTION to `07-developer-content.md` §1.9 / §3.13 (wording of "Reset daily AI budget")

`07` §3.13 already states the right bucket for `resetAiDailyBudgetAction` (`api:homework-checks:global`).
Two things are missing there and are easy to misread from the button label "Сбросить дневной бюджет ИИ":

- the action does **not** reset `api:lesson-checks:global` or `api:ai-plans:global` (§5 below);
- the action does **not** change the Status-tab tile "Запусков за 24 часа" or the header chip
  "ИИ: {used} / {limit} за 24 ч" — those show `checksLastDay`, a row count, not the bucket (§6 below).

### 1.5 Scope name that appears in no spec

`api:ai-plans:global` (constant `AI_PLAN_GLOBAL_BUDGET_SCOPE`, `lib/plan-budget.ts`). Add it to every rate-limit
list that already names `api:homework-checks:global` and `api:lesson-checks:global`.

---

## 2. The limiter — one mechanism for all three budgets **[CODE]**

`lib/persistent-rate-limit.ts`. Table `RateLimitBucket { key (PK), windowStart, hits, updatedAt }`;
`key = sha256("<scope>:<identifier>")` (`buildRateLimitKey`, `lib/rate-limit.ts`). One row per scope+identifier.

### 2.1 Operations

| Function | Inputs | Effect | Output |
|---|---|---|---|
| `consumePersistentRateLimit` | `scope`, `identifier`, `limit`, `windowMs`, `amount = 1`, `now = Date.now()` | One atomic upsert: if the stored `windowStart` differs from the current window's start → `hits = amount`; else `hits = hits + amount`. `windowStart` is overwritten with the current one. | `RateLimitResult` (§2.2). **Blocked when the incremented `hits > limit`.** |
| `releasePersistentRateLimitHit` | `scope`, `identifier`, `windowMs`, `amount = 1`, `now` | `hits = hits − amount`, only if the row's `windowStart` equals the **current** window's start and `hits ≥ amount`. Non-integer or `< 1` amount → no-op. | none |
| `resetPersistentRateLimit` | `scope`, `identifier` | Deletes the bucket row. | none |

Rules that follow directly from this code:

1. **Fixed window.** `windowStart = floor(now / windowMs) * windowMs`; `resetAt = windowStart + windowMs`.
2. **Lazy reset.** Nothing runs at the boundary. The first `consume` in a new window overwrites the row with
   `hits = amount`. A `release` that arrives after the boundary finds no row for the new window and does
   nothing ("the counter has already started again").
3. **The increment happens even when the call is refused.** The upsert adds `amount` first and compares
   afterwards. Whether the refused amount stays in the bucket depends on the caller (§3: it stays for the two
   check budgets, it is given back for the plan budget).
4. **`limit` is not stored.** It is passed on every call, so a new limit from the dev panel is compared with
   the `hits` already accumulated in the current window.
5. **Refused result:** `{ allowed: false, remaining: 0, retryAfterMs: max(1, resetAt − now), resetAt }`.
   **Allowed result:** `{ allowed: true, remaining: max(0, limit − hits), retryAfterMs: 0, resetAt }`.
6. Housekeeping: with probability 0.01 per call, buckets not updated for 30 days are deleted (fire-and-forget).
   Not observable by clients.

The same function serves every `enforceApiRateLimit` scope, so the per-user limits are fixed windows too:
a 60 s limit resets at each whole minute, the per-student hourly limits (`api:homework-checks`,
`api:lesson-checks`, window 3 600 000 ms) reset at each whole hour. This is already stated correctly in
`01` §4.3, `02`, `04`, `06`, `07`.

### 2.2 Type

```ts
// lib/rate-limit.ts
type RateLimitResult = {
  allowed: boolean;
  remaining: number;      // 0 when refused
  retryAfterMs: number;   // 0 when allowed; max(1, resetAt − now) when refused
  resetAt: number;        // epoch ms of the next window boundary
};
```

---

## 3. The three daily budgets **[CODE]**

All three: identifier `global`, `windowMs = 86 400 000`, reset at 00:00 UTC (03:00 Moscow). They are
**independent buckets** — spending one never affects the others.

| | Homework AI checks | Live-lesson AI checks | AI plans (lessons + homework drafts) |
|---|---|---|---|
| Scope | `api:homework-checks:global` | `api:lesson-checks:global` | `api:ai-plans:global` |
| Constant | `AI_CHECK_GLOBAL_BUDGET_SCOPE`, `lib/solution-check.ts` | `LESSON_CHECK_GLOBAL_BUDGET_SCOPE`, `lib/lesson-item-check.ts` | `AI_PLAN_GLOBAL_BUDGET_SCOPE`, `lib/plan-budget.ts` |
| Limit (site setting) | `aiDailyLimit` — default `floor(AI_CHECK_DAILY_LIMIT)` if that env is a finite number > 0, else `300`; clamp 1..100000 | `lessonCheckDailyLimit` — default `300`; clamp 1..100000 | `aiPlanDailyLimit` — default `300`; clamp 1..100000 |
| Settings read | `getSiteSettings()` (15 s in-memory cache) | `getSiteSettings()` (15 s cache) | `getSiteSettingsUncached()` |
| Unit | one check run = one `POST` (the whole current photo batch) | one submission = one lesson item (1–3 photos) | one generation = one participant; a lesson/draft for N participants takes N at once |
| Consumed by | `enforceApiRateLimit` (amount 1) | `enforceApiRateLimit` (amount 1) | `reservePlanGenerations(count, limit)` → `consumePersistentRateLimit(amount = count)` |
| Where | `POST /api/student/homework-checks`, **last** step, after the `HomeworkCheck` row exists (`03` §3.3 row 13) | `POST /api/student/lesson-submissions`, **last** step, after files and the `LessonItemSubmission` row exist (`03` §3.7 row 20) | `POST /api/teacher/lessons`, `POST /api/teacher/homework-plans` (amount = participants), `POST /api/teacher/lessons/{lessonId}/participants/{participantId}/regenerate` (amount 1) |
| Not consumed when | any earlier step of the route fails | any earlier step of the route fails | lesson created with `skipPlan: true`; planner disabled / AI not configured (`unavailable`); queue check fails first (`queueFull`); `count ≤ 0` |
| Refusal answer | `429 { error: dict.apiCommon.rateLimited }`, header `Retry-After: max(1, ceil((resetAt − now) / 1000))` | same | create: `200 { ok: true, lessonId \| planId, planError: "budgetExhausted" }` and `planError = "plan-error:budgetExhausted"` on **every** participant; regenerate: `429 { error: dict.planner.planErrors.budgetExhausted }`, **no** `Retry-After` |
| Roll-back on refusal | the just-created `HomeworkCheck` row is deleted (failure to delete → warn `solution.check.budget_rollback_failed`) | the submission row, its `StoredFile` rows and the stored files are deleted (failure → warn `lesson_check.budget_rollback_failed`) | create: the lesson/draft stays, without sets; regenerate: previous set and error stay untouched |
| Refused attempt stays in `hits` | **yes** (no release after a refusal) | **yes** | **no** — the refused `count` is released immediately |
| Later refunds | −1 when the check fails **before the first model request** (`modelCallStarted === false`: AI disabled / not configured, no photos or no numbers, no photo readable from storage); −N when the stale sweep fails N `PENDING` rows older than 15 min. Stale `CHECKING` rows (45 min) are **not** refunded | −1 before the first model request (lesson check disabled / not configured, no photos, no photo readable); −N for N stale `PENDING` submissions (15 min). Stale `CHECKING` not refunded | **none** — a generation that later fails (`failed`, `emptyPlan`, `noCandidates`, …) keeps its slot |
| Limiter store failure | `503 { error: dict.apiCommon.serviceUnavailable }`, `Retry-After: 5`; the check row is rolled back the same way | same; submission and files rolled back | error `lesson_plan.budget_failed` logged → treated as **`queueFull`** (create: `planError`; regenerate: 503) |

Details per budget that the existing specs do not state:

**Homework and lesson check budgets**

- The 429 body is the generic `apiCommon.rateLimited` text («Слишком много запросов. Подождите немного и
  попробуйте снова.» / "Too many requests. Wait a moment and try again.") — the same body and status as the
  per-student hourly limit and the per-minute limits. The only difference visible to a client is the size of
  `Retry-After`: up to 86 400 s for a daily budget, up to 3 600 s for the hourly limit.
- Because refused attempts stay counted (§2.1 rule 3), after exhaustion `hits` keeps growing by 1 with every
  further refused `POST`. Consequences inside the same window:
  - a refund (pre-model failure, stale `PENDING`) reopens the budget only if `hits` drops back to `< limit`;
  - raising `aiDailyLimit` / `lessonCheckDailyLimit` in the dev panel helps only once the new limit is
    `≥ hits + 1` (and, for these two routes, after the 15 s settings cache expires);
  - at the window boundary everything is forgotten regardless.
- A refund is applied to the **current** window only. A check started at 02:58 Moscow that fails before the
  model at 03:01 refunds nothing (its slot belonged to the previous window).
- The dev-panel action "Unfreeze stale checks" (`unfreezeChecksAction`: `PENDING`/`CHECKING` homework checks
  older than 15 min → `FAILED`) releases **no** budget slots. Only the per-student stale sweep inside the
  student routes refunds `PENDING` rows.

**Plan budget**

- Order inside `reservePlanGenerations(count, dailyLimit)`: (1) `count ≤ 0` → allowed, nothing consumed;
  (2) `queued + active + count > 150` (`MAX_PLAN_QUEUE`) → `queueFull`, budget untouched; (3) consume `count`;
  allowed → `null`; refused → release `count`, return `budgetExhausted`; (4) any exception in step 3 (including
  a failed release) → `queueFull`.
- All-or-nothing: with 290 of 300 used, a lesson for 30 students is refused entirely and the bucket stays at
  290; a lesson for 10 students created right after it is accepted.
- Raising `aiPlanDailyLimit` takes effect on the next request (settings are read uncached, `hits` is never
  inflated by refusals).
- One bucket for both products and all users: lesson plans, homework-draft plans, regenerations, by every
  teacher and by the developer.
- Auto-resume after a server restart (`resumeStaleLessonPlans`, `lib/lesson-plan-queue.ts`: participants with
  no plan, no error and no issued homework, `updatedAt` between 2 min and 24 h ago, once per process life)
  puts tasks straight into the queue and does **not** call `reservePlanGenerations` — it consumes nothing.
- The teacher-facing text for `budgetExhausted` says "…нажмите «Повторить» завтра" / "…press "Retry"
  tomorrow". By the code the retry starts working at **03:00 Moscow**: a teacher refused at 01:30 Moscow can
  retry 90 minutes later the same calendar day; a teacher refused at 10:00 Moscow has to wait 17 hours.

---

## 4. Window boundary — worked examples for the mock **[CODE]**

`DAY = 86 400 000`. `windowStart(now) = floor(now / DAY) * DAY`. Times below are Europe/Moscow (UTC+3).

| Moment | `api:ai-plans:global` (limit 300) | What the teacher gets |
|---|---|---|
| Mon 23:00 — 200 generations done since Mon 03:00 | `hits = 200`, window Mon 03:00 → Tue 03:00 | lesson for 30 → accepted, `hits = 230` |
| Tue 02:30 — 70 more | `hits = 300` | lesson for 1 → `budgetExhausted` (`hits` back to 300) |
| Tue 02:59 | still 300 | regenerate → 429 `budgetExhausted` |
| Tue 03:00 | first consume of the new window sets `hits = amount` | regenerate → 200, `hits = 1` |

Under the (wrong) rolling reading the teacher would still be blocked at Tue 03:00, because 300 generations
lie in the preceding 24 h. Under the real rule up to 600 generations can run within a few hours around the
boundary (300 before 03:00, 300 after).

The same table applies to `api:homework-checks:global` / `api:lesson-checks:global` with these differences:
the refusal is `429 rateLimited` with `Retry-After = seconds until 03:00 Moscow`, and each refused attempt adds
1 to `hits`.

---

## 5. `resetAiDailyBudgetAction` — exact scope **[CODE]**

`actions/developer.ts`. Role: `DEVELOPER` only (`requireUser(UserRole.DEVELOPER)`). Input: none (the form
data is ignored). No rate limit, no confirmation on the site.

| Step | Effect |
|---|---|
| 1 | `resetPersistentRateLimit("api:homework-checks:global", "global")` — deletes that one bucket row. |
| 2 | Log `site_settings.ai_budget_reset { userId }`. |
| 3 | Audit log: category `DATA`, action `developer.ai_budget_reset`, outcome `ok`; returns `{ ok: true, message }` — «Дневной бюджет автопроверки сброшен.» / "The daily AI check budget has been reset." |
| on error | Audit `developer.ai_budget_reset`, outcome `failed`; `{ ok: false, message }` — «Не удалось сбросить бюджет — подробности в логах сервера.» / "Could not reset the budget — see the server logs for details." |

What it does **not** do:

- It does **not** touch `api:lesson-checks:global` (live-lesson checks) or `api:ai-plans:global` (AI plans).
  No action or setting on the site resets those two; they clear only at 03:00 Moscow (or by raising their
  limits — for the lesson budget subject to the `hits` inflation of §3).
- It does **not** touch the per-student hourly buckets (`api:homework-checks`, `api:lesson-checks`, keyed by
  student id).
- It does **not** delete `HomeworkCheck` rows, so `checksLastDay` (§6) and everything derived from it — the
  Status tile, its progress bar, the header chip, the `dev_ai_budget_*` notifications — stay exactly as they
  were. The button hint «Обнулить счётчик запусков за сегодня.» / "Zero today's run counter." refers to the
  bucket, which is not shown anywhere in the UI.

After a successful reset the next homework check in the same window starts the bucket at `hits = 1`, i.e. a
full `aiDailyLimit` is available again until 03:00 Moscow.

---

## 6. Four different "used today" numbers — do not merge them **[CODE]**

| # | Number | Definition | Window | Covers | Where it is used |
|---|---|---|---|---|---|
| 1 | **Bucket `hits`** | counter of §2 for one scope | **fixed**, 03:00 → 03:00 Moscow | each budget separately | the only thing that decides `429` / `budgetExhausted`. **Not displayed anywhere on the site.** Feeds the Telegram alerts (#4) |
| 2 | **`checksLastDay`** | `count(HomeworkCheck where createdAt ≥ now − 24 h)`; `0` on DB error | **true trailing 24 h** | homework checks only | dev panel: header chip, Status tile + bar (`app/(dashboard)/teacher/panel/page.tsx`, `components/developer-panel.tsx`); developer bell alerts `dev_ai_budget_warn` / `dev_ai_budget_out` (`lib/developer-alerts.ts`) |
| 3 | `homeworkChecksInWindow`, `lessonChecksInWindow` | `count(HomeworkCheck where createdAt ≥ windowStart)`, `count(LessonItemSubmission where submittedAt ≥ windowStart)` with the same `floor(now / DAY) * DAY` | fixed, like #1, but counting **rows** | homework checks, lesson submissions | only the 23:00 Moscow Telegram digest line "Лимит проверок ДЗ: X из Y, на уроке: X из Y" (`lib/telegram-digest-job.ts`). Not in any UI |
| 4 | Telegram budget alerts | `used = limit − remaining` from the consume result; "80 %" when `used ≥ ceil(limit × 0.8)`, "исчерпан" on the first refusal; each once per window (`resetAt`) per scope, state in process memory | fixed, like #1 | all three scopes | Telegram only (`lib/ai-limit-alerts.ts`). Not in any UI |

### 6.1 Why #1 and #2 differ (homework-check budget)

| Cause | Effect |
|---|---|
| Window type | `checksLastDay` at 09:00 Moscow still counts checks from 09:00–03:00 of the previous window; the bucket forgot them at 03:00. |
| Refused attempts | counted in `hits` (the row is deleted, so not in `checksLastDay`). |
| Refunds | a check that failed before the model, or a swept stale `PENDING`, was given back to the bucket but its `FAILED` row still counts in `checksLastDay`. |
| Deleted rows | rows removed by history pruning (`completedChecksKept`, default 50 finished checks per student) or by cascade when the homework is deleted leave `checksLastDay` but not `hits`. |
| Dev-panel reset | zeroes `hits`, leaves `checksLastDay` unchanged. |
| Scope | `checksLastDay` knows nothing about lesson checks or plans; it is always compared with `aiDailyLimit`. |

Example (limit 300): 200 checks between 22:00 and 02:59 Moscow, then 150 between 03:00 and 09:00. At 09:00:
bucket `hits = 150` → students are **not** refused; `checksLastDay = 350` → tile "350 / 300", bar 100 %, chip
yellow, bell alert `dev_ai_budget_out { used: 350, limit: 300 }`.

### 6.2 What the developer UI derives from `checksLastDay` (unchanged from `07` §1.9, `01` §4.8 — restated for contrast)

- Header chip `format(chipAi, { used: checksLastDay, limit: aiDailyLimit })` — «ИИ: {used} / {limit} за 24 ч» /
  "AI: {used} / {limit} in 24 h"; yellow when `checksLastDay ≥ aiDailyLimit × 0.8`, else green.
- Status tile `runs24h` «Запусков за 24 часа» / "Runs in 24 hours": `{checksLastDay} / {aiDailyLimit}`, hint
  `runsHint` «дневной бюджет ИИ» / "daily AI budget", bar `min(100, round(checksLastDay / max(1, aiDailyLimit) × 100))` %.
- Bell alerts (evaluated at most once per developer per 10 min, on `GET /api/notifications`), with
  `limit = max(1, aiDailyLimit)`:
  - `dev_ai_budget_out { used: checksLastDay, limit }` when `checksLastDay ≥ limit`, cooldown 24 h —
    «Дневной бюджет ИИ исчерпан» / «Проверки и подбор остановлены до сброса окна: {used} из {limit} за 24 часа.»
  - else `dev_ai_budget_warn { used, limit }` when `checksLastDay ≥ limit × 0.8`, cooldown 24 h —
    «Бюджет ИИ на исходе» / «Использовано {used} из {limit} запусков за 24 часа — осталось меньше 20%.»
  - Both conditions read **no bucket**. The alert can appear while students are still being served (example
    in §6.1) and says nothing about the lesson-check or plan budgets, whatever its text suggests.
- The dev panel shows **no usage figure at all** for `lessonCheckDailyLimit` and `aiPlanDailyLimit`; only the
  three limit fields on the Settings tab: `dailyLimit` «Запусков в день, всего» / "Runs per day, total" (hint
  «Общий предохранитель расходов» / "Overall spending cap"), `lessonDailyLimit` «Сдач в день, всего» /
  "Submissions per day, total" (hint «Отдельный кошелёк: урок не тратит бюджет проверок ДЗ» / "Separate
  budget: lessons do not spend the homework check budget"), `planDailyLimit` «Подборов в день, всего» /
  "Selections per day, total" (hint «Общий потолок ИИ-подбора уроков и ДЗ: один ученик — один подбор» /
  "Overall cap on AI lesson and homework selection: one student — one selection").

---

## 7. Screens affected (no new screens)

| Screen (owner spec) | State driven by a daily budget | When the state ends |
|---|---|---|
| Student — homework detail, "start AI check" (`03` §3.3) | `429 rateLimited` after the photos are attached; the check row is not created | next 03:00 Moscow, or a dev-panel reset, or a refund / raised limit that brings `hits` under the limit |
| Student — Lesson tab, "submit" for one item (`03` §3.7) | `429 rateLimited`; the uploaded photos are discarded, the item keeps its previous state | next 03:00 Moscow, or a refund / raised limit. **Not** cleared by the dev-panel reset |
| Teacher — lesson create / homework-draft create (`05` §3.1, §3.13) | lesson or draft is created, every participant shows the `budgetExhausted` error card with "Повторить" | per participant: a successful regenerate |
| Teacher — lesson board / draft board, "Повторить" / "Пересобрать" (`05` §3.7) | `429 budgetExhausted`; set and previous error unchanged | next 03:00 Moscow, or a raised `aiPlanDailyLimit`. **Not** cleared by the dev-panel reset |
| Developer — panel, Status tab + header chip (`07` §1.9) | shows `checksLastDay / aiDailyLimit` (trailing 24 h, homework checks only) | slides continuously; unaffected by the reset action |
| Developer — panel, Actions tab, "Сбросить дневной бюджет ИИ" (`07` §3.13) | resets the homework-check bucket only | — |
| Developer — notifications (`01` §4.8) | `dev_ai_budget_warn` / `dev_ai_budget_out` from `checksLastDay` | cooldown 24 h per type |

---

## 8. View-model types

```ts
/** The three global daily AI budgets. Identifier is always "global". */
type AiBudgetScope =
  | "api:homework-checks:global"   // limit: SiteSettings.aiDailyLimit
  | "api:lesson-checks:global"     // limit: SiteSettings.lessonCheckDailyLimit
  | "api:ai-plans:global";         // limit: SiteSettings.aiPlanDailyLimit

const AI_BUDGET_WINDOW_MS = 86_400_000;   // fixed window, aligned to the Unix epoch (00:00 UTC = 03:00 Moscow)

/** Server-side state of one budget (table RateLimitBucket). */
type AiBudgetBucket = {
  windowStart: number;   // epoch ms; floor(now / AI_BUDGET_WINDOW_MS) * AI_BUDGET_WINDOW_MS at the last consume
  hits: number;          // may exceed the limit for the two check budgets (refused attempts are counted)
};

/** Result of every consume (lib/rate-limit.ts). */
type RateLimitResult = { allowed: boolean; remaining: number; retryAfterMs: number; resetAt: number };

/** Outcome of reservePlanGenerations(count, aiPlanDailyLimit). null = accepted. */
type PlanReservationRefusal = "budgetExhausted" | "queueFull" | null;

/** What the developer panel shows today: NOT a bucket. */
type DeveloperPanelBudgetTile = {
  checksLastDay: number;   // HomeworkCheck rows created in the trailing 24 h
  aiDailyLimit: number;
  percent: number;         // min(100, round(checksLastDay / max(1, aiDailyLimit) * 100))
  chipWarn: boolean;       // checksLastDay >= aiDailyLimit * 0.8
};
```

---

## 9. Business rules for the mock

Implement one limiter and use it for all three budgets (and, if rate limits are mocked at all, for the
per-user ones with their own `windowMs`):

```ts
function windowStartOf(now: number, windowMs: number) {
  return Math.floor(now / windowMs) * windowMs;
}

function consume(bucket: AiBudgetBucket | undefined, limit: number, amount: number, now: number, windowMs = AI_BUDGET_WINDOW_MS) {
  const windowStart = windowStartOf(now, windowMs);
  const hits = !bucket || bucket.windowStart !== windowStart ? amount : bucket.hits + amount;
  const resetAt = windowStart + windowMs;
  const next: AiBudgetBucket = { windowStart, hits };            // stored even when refused
  const result: RateLimitResult = hits > limit
    ? { allowed: false, remaining: 0, retryAfterMs: Math.max(1, resetAt - now), resetAt }
    : { allowed: true, remaining: Math.max(0, limit - hits), retryAfterMs: 0, resetAt };
  return { next, result };
}

function release(bucket: AiBudgetBucket | undefined, amount: number, now: number, windowMs = AI_BUDGET_WINDOW_MS) {
  if (!bucket || !Number.isInteger(amount) || amount < 1) return bucket;
  if (bucket.windowStart !== windowStartOf(now, windowMs) || bucket.hits < amount) return bucket;   // no-op
  return { ...bucket, hits: bucket.hits - amount };
}
```

1. **Reset at the boundary, lazily.** Never run a timer that subtracts hits 24 h after each run. A mock clock
   that crosses 00:00 UTC must make the next request succeed; a request at 23:59:59 UTC with an exhausted
   budget must fail.
2. **Homework check / lesson submission** (`03` §3.3 row 13, §3.7 row 20): `consume(amount = 1)` as the last
   step; on refusal keep the incremented bucket, delete the just-created row (and files for a submission),
   answer `429 rateLimited` with `retryAfterSeconds = max(1, ceil(retryAfterMs / 1000))`.
3. **Refunds:** `release(1)` when a mocked check ends `FAILED` before the model stage (scenarios "AI disabled",
   "no photos", "photo unreadable"); `release(N)` when the stale sweep fails N `PENDING` rows; nothing for a
   failure after the model stage or for a stale `CHECKING`.
4. **Plans:** `reservePlanGenerations` exactly as in §3 — queue check first (`> 150` → `queueFull`), then
   `consume(amount = participants)`; on refusal `release(amount)` and return `budgetExhausted`. Create still
   returns the lesson/draft with `plan: "budgetExhausted"`; regenerate answers `429 budgetExhausted` without
   `retryAfterSeconds` (`90-addendum-1.md` A.3 rule 3 stays valid). A generation that fails later keeps its slot.
5. **Dev-panel reset** deletes the `api:homework-checks:global` bucket only. In the mock, after pressing it:
   homework checks work again; a lesson-submission 429 and a `budgetExhausted` on regenerate stay.
6. **Dev-panel tile and chip** are computed from the mock's `HomeworkCheck` rows of the trailing 24 h, never
   from the bucket; pressing reset must not change them.
7. The debug switch requested in `05` §7 item 17 and `03` §6.5 ("force 429 / budgetExhausted") should be
   implemented as "set `hits = limit` for scope X in the current window", so the state clears by itself at
   the mocked 00:00 UTC — this is the behaviour the UI has to be tested against.

---

## 10. Proposed mobile API endpoints **[PROPOSAL]**

Nothing here changes the site; the mobile routes call the same `lib/` functions and read the same table.

1. **No new endpoint is required** for the correction itself. The existing proposals keep their shape:
   `POST /student/homeworks/{assignmentId}/checks` and
   `POST /student/lessons/{lessonId}/items/{itemId}/submissions` (`03` §6) answer
   `429 rateLimited` with `retryAfterSeconds`; `POST /teacher/lessons`, `POST /teacher/homework-plans` answer
   `201 … plan: "budgetExhausted"`; `POST …/regenerate` answers `429 budgetExhausted`;
   `POST /developer/actions/reset-ai-budget` keeps the site semantics of §5.
2. **Optional, read-only: expose the real buckets to the developer.** The site shows only `checksLastDay`.
   A mobile dev panel could show the number that actually decides refusals:

   ```ts
   // added to DeveloperPanelData (GET /developer/panel, 07 §6.6)
   type AiBudgetUsage = {
     scope: AiBudgetScope;
     limit: number;            // current site setting
     used: number;             // bucket.hits if bucket.windowStart === current windowStart, else 0
     resetAt: string;          // ISO; windowStart + 86 400 000
   };
   aiBudgets: AiBudgetUsage[];   // always 3 items, in the order of AiBudgetScope
   ```

   Source: `RateLimitBucket` row with `key = sha256("<scope>:global")`. `checksLastDay` stays in the payload
   under its own name and label ("runs in 24 h"); the two must not share a label.
3. **Optional: tell the teacher when the plan budget resets.** The site sends nothing with `budgetExhausted`.
   The mobile route can add `details.resetAt` (ISO of the next 00:00 UTC, computed with the §2 formula, no
   site change) so the app can render "available again at 03:00" instead of "tomorrow". If this is not
   adopted, `90-addendum-1.md` A.3 rule 3 applies unchanged (no `retryAfterSeconds`, manual retry only).
4. **Optional: let the client tell a daily-budget 429 from a per-user 429** on the two student endpoints, e.g.
   `details.limit: "user" | "dailyBudget"`. The site returns an identical body for both; today the only
   distinguishing signal is the size of `retryAfterSeconds` (§3).

---

## 11. Open questions

1. Should the mobile dev panel keep the site's tile (`checksLastDay`, trailing 24 h, homework only), add the
   real buckets of §10.2, or replace the tile? The site's own label "дневной бюджет ИИ" under a trailing-24 h
   row count is the source of the confusion this addendum fixes.
2. Should the mobile "reset AI budget" action stay homework-only (site behaviour) or take a `scope`? Today a
   developer has no way to reopen the lesson-check or plan budget before 03:00 Moscow other than raising the
   limit in Settings.
3. Student-facing wording for a daily-budget 429: the site shows the generic "Too many requests. Wait a moment
   and try again." although the wait can be up to 24 h. Keep it, or show a budget-specific text when
   §10.4 is adopted?
4. `90-addendum-1.md` A.3 rule 3 tells the client to disable the triggering control until
   `now + retryAfterSeconds`. For a daily-budget 429 that is up to 24 h, while a dev-panel reset, a refund or
   a raised limit can reopen the budget earlier. Suggested: for `retryAfterSeconds > 3600` do not lock the
   control; show the message and allow a manual retry.
