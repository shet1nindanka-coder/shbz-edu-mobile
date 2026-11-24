# «Стекло над листом» — the design system of the app

The owner-approved redesign (handoff of November 2026). It **replaces** `docs/spec/08-design-system.md`
and the navigation layout of `docs/spec/00-unified-contract.md` §3.1 for everything visual: colours,
scales, components, the dock, screen layouts. The specs still rule on behaviour, data, texts taken from
the site, limits and error codes.

The feel: light and simple, like Telegram. A light-grey page, white borderless cards with a soft shadow,
one accent, glass only on navigation.

## 1. Rules that come from the owner's remarks — do not undo them

1. **One screen — one task.** Details open on a tap: a pushed screen or a bottom sheet.
2. **A list row** is a title, one caption and at most one element on the right. The whole row is pressed.
   There are no «Открыть» buttons in rows.
3. **A coloured label only where attention is needed** («просрочено», «нужна помощь»). A neutral fact
   («37 из 50») is plain grey text.
4. **No upper-case over-titles** and no duplicated captions.
5. **Many numbers never grow the screen.** A homework of 50 numbers is: «Осталось 13 из 50», the bar by
   status, ONE row of tiles with the numbers that still need work (those that need help first, then the
   unmarked) and ONE card of the selected number. Every number is in the sheet «Все номера», grouped by
   status; when all numbers share a prefix the tiles show the last three digits.
6. **«Add…» forms and secondary actions are folded** behind a button. A screen starts with its list.
7. **A tablet screen is never half empty.** Panels run the full height down to the dock; where it fits —
   a list on the left, the content of the selected item on the right.
8. **One system of sizes** (§3). Nothing outside the scales.
9. **Search is a round button** next to the bell, not a field on every screen.
10. **As little text as possible** (the owner: «слишком много текста, причём везде»). The interface shows,
    it does not explain. See §1a.
11. **The dock is switched by a tap or by a slide**: a finger pressed on the dock drags the lens across the
    items, the item under it lights up, and lifting the finger opens that section.

### 1a. The text diet

What a screen may say, in the order of preference: nothing (a shape, a colour, a position) → an icon → a
number → one or two words. Each visible string must pass «would the screen be unusable without it?».

- **No sentences on a screen.** No instructions («нажмите на ученика…»), no «what will happen» notes, no
  descriptions under titles, no explanations under fields, no «обновлять экран не нужно». What truly needs
  explaining goes into a `<Hint>` (hidden unless the user turns hints on), at most one per screen, at most
  one line. A consequence that cannot be undone is said once, in the confirm dialog.
- **A row is its title.** A caption is allowed only when it carries the ONE fact the list is opened for
  (the deadline of a homework, the time of a lesson, the state that needs attention) — a few words, never
  two facts joined by «·». Everything else of the item is on the screen the row opens. Logins, e-mails,
  counters «N номеров · M активных», «добавлен 18 ноября» are not row captions.
- **The fact on the right is a number or a glyph**, not a phrase: «1/3», «5», a status dot / chip only for
  attention. Never «решено 11», «выдано 0 из 3».
- **Numbers speak with a label of one or two words.** A statistic is a figure and its name; no note line
  under it, no «из 21 выданных ДЗ», no percentages repeated in words.
- **Status is colour and shape**, not words: a tile, a bar segment, a dot. The words stay in
  `accessibilityLabel`s and in the «Все номера» sheet's group titles.
- **Buttons are one or two words** («Составить», «Выдать», «Сохранить», «Удалить»); a universal action is
  an icon button (plus, trash, download, copy, filter) with an `accessibilityLabel`.
- **A field has one name** — a label OR a placeholder, not both, and no helper line. Limits and formats
  are said when they are broken (the error), counters appear when 80 % of the limit is used.
- **A section caption** only where a screen has two or more lists; never one that repeats the header.
- **An empty state is one short line** (and its action button, if there is an action).
- **Dates are short**: «24 нояб., 16:00» (`formatMsk(…, 'dayMonthShort')`), no year inside the current year, no seconds, «МСК» only where a
  time is entered.
- **Nothing is lost for a screen reader**: what was cut from the eye stays in the `accessibilityLabel` of
  the row / control.

Product rules the design must keep:

- A student cannot change the colour of a number's status: the check or the teacher sets it.
- Green, yellow and red are used for number statuses only.
- AI-check diagnostics and parent-call comments are visible to the teacher and the developer only.
- Numbers are strings with leading zeros (`051004`); never turn them into numeric values.

## 2. Colours

All tokens live in `src/theme/colors.ts` (values of the mockups' `a.css`). Read them from
`useTheme().colors`; never write a colour in a component.

| Token | Light | Dark | Use |
|---|---|---|---|
| `pageBg` | `#f4f6f6` | `#0b0c0e` | the page |
| `cardBg` | `#ffffff` | `#131417` | cards, sheets |
| `cardBorder` | transparent | `rgba(255,255,255,.07)` | card edge (dark only) |
| `textStrong` | `#0a0a0a` | `#f2f3f4` | text |
| `label` | `#2c2e33` | `#d5d8dc` | secondary text |
| `textMuted` | `#5f646b` | `#a3a8b0` | captions |
| `line` / `line2` | `#ececee` / `#dcdee1` | `#24272c` / `#363a41` | row hairline / control outline |
| `softBg` / `soft2` | `#f4f5f6` / `#eceef0` | `#191b1f` / `#24272c` | panel in a card / neutral fill |
| `accentSolid` | `#0d7a57` | `#5fe6ac` | accent as text (links) |
| `onAccent` | `#06281c` | `#06281c` | text on the mint gradient |
| green `Soft` / `Text` / `Solid` | `#e6f6ed` / `#0f6b41` / `#1b9e63` | `#143024` / `#5fe6ac` / `#36e0a4` | «решил сам» |
| yellow | `#fdf1dc` / `#7d5200` / `#e8b04a` | `#33290f` / `#f3c56f` / `#e8b04a` | «исправил» |
| red | `#fbe9ea` / `#a8262f` / `#c2313c` | `#3a1a1e` / `#ff8f97` / `#ff6b75` | «нужна помощь» |
| streak | `#fff1e0` / `#8a4a00`, flame `#f2922e` | `#33230f` / `#ffb561` | «огонёк» |
| `glass` / `glassLine` | `rgba(255,255,255,.62)` / `.9` | `rgba(30,33,38,.6)` / `rgba(255,255,255,.14)` | dock, round header buttons |

**One accent:** the mint gradient `#5ac8ea → #36e0a4` (`gradients.accent`) — only for the main action
and for progress (primary button, progress fill, switch "on", the avatar of the signed-in user, the icon
tile of a screen's main card).

**Glass** (`<Glass>`): translucent fill over a blurred backdrop (`expo-blur`), a light rim, a deep soft
shadow. Navigation only — the dock and the round header buttons. Android gets a nearly opaque fill
instead of a blur.

**Shadows** (`theme.shadows`): `card` (cards), `glass`, `popover` (sheets, the search panel),
`accentGlow` (primary button), `segment`, `lens`.

## 3. Scales — nothing outside them

| What | Values |
|---|---|
| Heights (`sizes.control`) | **52** the main action of a screen, the profile avatar · **44** buttons, inputs, number tiles, marks, round header buttons · **36** compact buttons in rows, segments, list avatars (the touch target is still 44) · **28** status labels, counters, the switch |
| Radii (`radii`) | **8** `sm` labels, a segment · **12** `md` everything that is pressed · **16** `lg` a panel inside a card · **24** `xl` cards and sheets · **round** `full` dock, avatars, progress bars |
| Type (`typography`) | **34 / 24** screen title tablet / phone · **20 / 17** card title · **15** body, buttons · **13** captions · **12** labels · **11** dock labels |
| Spacing (`space`) | 2 `xxxs` · 4 `xxs` · 8 `xs`/`sm` · 12 `md` · 16 `lg` · 24 `xl` · 32 `xxl` |
| Screen gutter | phone 16, tablet 24 (`space.gutter`) |
| Icons | Lucide, stroke 2, sizes 16 · 20 · 24 (`sizes.icon`) |

The theme exists for two **layout classes**: `phone` and `tablet` (window width ≥ 768). The scales are
shared; a few tokens differ and components pick them up from the theme without branching:
`typography.pageTitle` 24 / 34, `typography.sectionTitle` 17 / 20, `space.gutter` 16 / 24, `space.card`
16 / 24, `space.block` 12 / 16. `theme.tablet` is true on a tablet.

Font: **Onest** (`@expo-google-fonts/onest`), one `fontFamily` per weight (400 / 500 / 600 / 700 / 800,
900 for the logo).

## 4. Components (`src/ui`)

| Need | Component |
|---|---|
| A screen | `<Screen header={…}>` — grey page with the glow, scrolls, pads the dock. The header scrolls with the content. Blocks are spaced by `space.block` automatically. |
| Header of a section root | `<ShellAppBar title aside />` (`@/screens/shell`) — the title and the three round buttons |
| Header of a pushed screen | `<DetailAppBar title backTitle right aside />` — «‹ back» link above the title |
| A card | `<Card>` — on the page it is THE card (white, radius 24, shadow); inside a card or a sheet it becomes a soft panel (radius 16). Two floors only: page → card → panel. `dashed` = an invitation / empty slot. |
| A card of rows | `<ListCard>` with `<ListRow title subtitle meta right left chevron subtitleTone onPress />` |
| A caption above a card | `<SectionCaption>` (13 / 600, muted). `SectionCard` = caption + card. |
| A title inside a card | `<Text variant="sectionTitle">` (17 / 20) |
| The main card's leading mark | `<IconTile icon />` (44, mint) |
| Buttons | `<Button variant size>`: `primary` — the main action, ONE per screen (`size="lg"` = 52); `outline` — an ordinary action; `dark` — an action with consequences («Завершить урок»); `danger` — delete, sign out; `tonal` — neutral. A transition is a `<TextButton>`. `size="sm"` (36) inside rows. |
| Icon buttons | `<IconButton>`: default = the 44 outlined mark for content (close, «⋯», arrows); `variant="glass"` — header only |
| Status label | `<Chip tone="red|yellow|green|muted|streak|accent">` (28 high) / `<StatusBadge>`; only where attention is needed |
| Number tile | `<NumberTile label status current onPress />` (44) |
| Bar by status | `<StatusBar counts={{ green, yellow, red, none }} />` |
| Numbers of a set | `<NumbersOverview>` + `<AllNumbersSheet>` (`@/components/numbers`), pure logic in `@/domain/number-focus` |
| Progress | `<ProgressBar value />` (8 high, mint) |
| People | `<Avatar name tone="neutral" />` (36, lists) · `<Avatar name />` (44 / 52, mint: the signed-in user or the person the screen is about) |
| Switch between views | `<Segmented options value onChange fill />` (44 track, 36 segments) |
| Fields | `<TextField>` (44; `size="lg"` 52 on the login form), `<TextArea>`, `<Select>`, `<DateTimeField>`, `<Switch label trailing />` |
| Details of a row | `<BottomSheet visible title onClose>` — radius 24, a centred 520 card on a tablet |
| Tablet panels | `<Screen scroll={!theme.tablet} maxWidth="full">` + `<Panels><Panel weight header footer tabletOnly /></Panels>`; `<ListRow selected />` marks the row shown in the next panel |
| Empty / loading / error | `<EmptyState>`, `<LoadingState variant="list">`, `<LoadFailure>`, `<Notice>` |

Short status names (the owner's wording) are `m.common.statuses`: «решил сам / исправил / нужна помощь /
не отмечено»; the long site names stay as accessibility labels. Helpers: `statusLabel`,
`statusGroupTitle`, `statusBreakdown` (`@/components/numbers`). The one caption of a homework row is
`deadlineCaption()` (`@/domain/deadline-caption`): «сегодня до 23:59», «до завтра, 23:59», «до пятницы»,
«просрочено 2 дня» (`attention: true` → red).

## 5. Navigation

**Header of a screen:** the title on the left (with the link «‹ Back» above it on a pushed screen), on the
right three round glass buttons 44 — number search, notifications, the avatar. The avatar opens the
profile. Search opens a panel at the top of the screen; it closes after the jump to the found number. A
pushed screen on a phone shows only the link, the title and its own controls; a tablet keeps the three
buttons.

**Dock** (`DockHost` / `Dock`, `src/navigation/dock.tsx`): a glass capsule at the bottom, on a phone and
on a tablet. It is one overlay above the whole role tree and settings, not a navigator's tab bar; the lit
item comes from the current path (`dockActiveIndex`). Under the lit item lies the «lens» — a white drop
with a mint rim; on a change it travels on a spring (~0.5 s), squeezes a little and a glint runs across
it. With reduced motion it jumps. The dock hides while the keyboard is up and on the screens shown
without it (sign-in, the search panel, the notifications sheet, the file viewer).

| Role | Phone | Tablet |
|---|---|---|
| Student | обзор · урок · дз · дедлайны · теория | the same + инфа |
| Teacher | обзор · ученики · группы · занятия · ещё | обзор · темы · ученики · группы · занятия · звонки |
| Developer | темы · аккаунты · звонки · статистика · дев-панель | the same |

The teacher's «ещё» opens a sheet: темы, звонки, настройки (the owner's decision: calls behind «ещё»,
groups in the dock). A student opens «Баллы» from the profile on a phone.

Every primary section is a tab route of the role's tab navigator (`tabsForRole`), so it keeps its own
stack whichever device shows it in the dock.

## 6. Icons (the owner's choice, Lucide)

Semantic names of `src/ui/icon.tsx`; the glyph data is generated by `scripts/build-lucide-icons.mjs`
from `lucide-static` (a dev dependency) into `src/ui/internal/generated/lucide-icons.ts`.

| Section / action | Lucide | | Section / action | Lucide |
|---|---|---|---|---|
| Обзор | `house` | | Уведомления | `bell` |
| Урок | `presentation` | | Поиск | `search` |
| ДЗ | `notebook-pen` | | Серия дней | `flame` |
| Дедлайны | `calendar-days` | | ИИ-проверка | `sparkles` |
| Теория | `book-open` | | Фото | `camera` |
| Общая инфа | `info` | | Загрузить / скачать | `upload` / `download` |
| Настройки | `settings` | | Добавить / удалить | `plus` / `trash-2` |
| Темы | `folder-open` | | Меню «ещё» | `ellipsis` |
| Ученики | `users` | | Скопировать | `copy` |
| Группы | `book-user` | | Видно только учителю | `lock` |
| Занятия | `calendar-check` | | Перейти | `arrow-right` |
| Звонки | `phone` | | Выйти | `log-out` |
| Аккаунты | `key-round` | | Решил сам | `check` |
| Статистика | `chart-column` | | Исправил | `rotate-ccw` |
| Дев-панель | `terminal` | | Нужна помощь / не отмечено | `x` / `circle-dashed` |

## 7. Screen recipes

- **Section root:** `<Screen header={<ShellAppBar title={m.shell.tabs.x} aside={segments or the main button} />}>`,
  then cards. A list is a `ListCard` of `ListRow`s; an «Add…» action is a button in the header `aside`
  that opens a sheet with the form.
- **Detail:** `<Screen header={<DetailAppBar title backTitle={parent section} />}>`. Tabs of a detail are a
  `Segmented` in the header `aside`.
- **A row that needs actions:** the row opens a sheet (or a pushed screen) with the details and the
  actions; it does not carry buttons.
- **Tablet:** two panels side by side — the list card on the left (the selected row has a soft fill), the
  detail card on the right, both stretched to the dock (`flex: 1`). Use `theme.tablet`.

## 8. What is deliberately not built

- «Позвать учителя» of the student's lesson mockup: the app has no such request.
- «Разобрать ещё раз», «решено 37 из 60» per theory topic, the ruble spend of the dev panel: there is no
  data for them (mockup placeholders, handoff §11).
- The «Движение стекла» switch of the settings mockup (the owner's answer): the lens animation follows the
  system's reduced-motion setting.
- Teacher mockups, no data in the requests the app makes: the group segments and «был сегодня» of the
  students list, «осталось» as a fourth figure, the «Диагностика ИИ» / «За 30 дней по теме» / «Для
  ИИ-подбора» cards of the student card (per-number diagnostics are in the number's sheet), the overview
  rows «ДЗ просрочено» / «ИИ не уверена» / per-student «Пора позвонить» (calls are one row with counts),
  the per-number status bars and «Подобрать ДЗ» of the topics panel, «План · N номеров» of the lessons
  panel (sets are per student: the panel shows counters), «решает … / просит помощи» on the board (the
  real states are shown: checking, not opened yet, no submissions for N min…), the «Условия» panel and a
  whole-draft «Подобрать заново» of a homework draft, the period switch and the «За 30 дней» footer of
  groups.
- Developer mockups, no data: the class in a student's caption, the cards «ИИ-проверок», «Активных
  учеников», «Где чаще всего красное» and the header period switch of statistics (the app's real views
  and rankings are shown), the teacher filter of calls.
- Kept from the site, not from the mockups: the four lesson results (решил / с ошибками / не решил / не
  успел) instead of three; the texts of buttons and captions.

## 9. Known deviations of behaviour that came with the layout

The redesign changes the look and the layout only; these are the places where the layout itself moved a
function:

- A number tile of a topic opens the number screen for the teacher too (it used to be reachable from the
  search only): the «show answer» toggles of the old per-number cards are gone.
- The accounts list opens on «Все» (mockup) instead of «Учителя».
- Row buttons are gone everywhere: a student's login copy / password reset / delete are in the student
  card's «⋯» menu (phone) or the summary panel (tablet); a lesson's delete and handout are in the
  board's «⋯» menu (phone) or the lesson panel (tablet); a call's history is in the row's sheet.
- The floating undo toast of the lesson board is an inline notice in the student's sheet / panel.
- Lists of students, lessons, drafts and calls are plain `ListCard`s inside the screen's scroll (past
  lessons are paged by «Показать ещё»), not virtualised lists.
- Tablet screens built of panels refetch on focus and through realtime; pull-to-refresh is a phone gesture
  (a `Panel` takes `refreshing` / `onRefresh` where a list panel needs it).
