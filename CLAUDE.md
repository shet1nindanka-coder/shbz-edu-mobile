# CLAUDE.md

Guidance for AI agents working in this repository. Read `AGENTS.md` too (Expo-specific rules).

## What this project is

**ШБЗ Школа — мобильное приложение.** A fully native client (Expo SDK 58 / React Native 0.88 / TypeScript
strict / expo-router) that mirrors the web platform «ШБЗ Школа» for all three roles: STUDENT, TEACHER,
DEVELOPER. UI is bilingual (ru default, en).

**The web site is a separate repository and must not be modified.** This app currently runs entirely on
**mock data**: every screen talks to a typed `ApiClient`; today it is implemented in-process by
`MockApiClient`, later by an `HttpApiClient` against a real server. Screens never know which one they use.

## Source of truth

`docs/spec/` is the specification extracted from the site's code. Precedence:

1. `docs/spec/00-unified-contract.md` — canonical types, API contract (112 methods, 9 client members), screen
   registry, navigation. Wins on every name/shape/path/error code.
2. `docs/spec/90-addendum-*.md` — corrections (`CORRECTION to …` notes override the numbered specs).
3. `docs/spec/01…09-*.md` — owner specs: layouts, texts, business rules, fixtures, design system.

`docs/foundation.md` is the reference of the shared layers (API binding, mock context, providers, navigation,
UI kit, i18n, domain helpers, math/files): read the relevant section before writing a screen or a mock member.

Do not invent behaviour: screens, limits, enum values, error codes and copy come from the spec. If the spec
is silent, follow the nearest site behaviour described there and leave a `// SPEC-GAP:` comment.

## Commands

```bash
npm run typecheck   # tsc --noEmit — must be clean
npm run lint        # expo lint --max-warnings=0 — must be clean
npm run test        # tsx --test tests/**/*.test.ts (pure logic, no RN imports)
npm run export:web  # static web build; used here to verify screens with Playwright (no device in CI)
npx expo start      # dev server (Expo Go on a phone)
```

- Installing packages: `EXPO_OFFLINE=1 npx expo install <pkg>` (the Expo version API is not reachable from
  the cloud container). **Do not add dependencies** unless the task says so — everything needed is installed.
- `docs.expo.dev` is not reachable from the container. The installed packages' type definitions and READMEs
  under `node_modules/` are the authoritative API reference for this SDK version — read them before using an
  Expo / React Native API; do not rely on memory (APIs changed across SDKs).
- Never create `ios/` or `android/` by hand (Continuous Native Generation).
- Everything must work in **Expo Go** (no custom native modules) and must also **render on web**
  (`react-native-web`) because web export is how screens are verified. Native-only modules are wrapped in a
  service with a `.web.ts(x)` variant or a runtime guard (`Platform.OS`).

## Architecture — where things live

Path alias: `@/*` → `src/*`.

```
src/app/            expo-router routes ONLY. Route files are thin: they read params and render a screen from
                    src/screens. Layouts (`_layout.tsx`) define navigators. Owned by the shell.
src/api/            ApiClient contract: `types/` (canonical types), `client.ts` (interface, 9 members),
                    `errors.ts` (ApiError), `index.ts` (`useApi()`, client factory).
src/mock/           MockApiClient: `store` (in-memory rows + persistence), `clock`, `fixtures/`, `members/`
                    (one file per ApiClient member), `rules/` (server-side business rules).
src/domain/         Pure helpers ported 1:1 from the site (numbers, statuses, Moscow dates, lesson status,
                    attendance, parent-call state, streak…). No React, no RN imports. Unit-tested.
src/lib/i18n/       Dictionaries copied VERBATIM from the site (same path as on the site so the `@/lib/i18n/…`
                    imports inside them resolve). Never hand-edit; excluded from lint.
src/i18n/           `useI18n()` → `{ locale, dict, m }`, provider, locale preference. `m` = mobile-only
                    strings: `src/i18n/mobile/<area>.ts` (each area owns its file, ru + en, same keys; areas: common, shell, student, studentWork, teacher, accounts, planner, groups, calls, stats, content, developer).
src/theme/          Design tokens (light/dark), `useTheme()`, fonts.
src/ui/             Reusable primitives (Text, Button, Card, Input, Segmented, Sheet, Dialog, Select, Notice,
                    Badge, StatusBadge, ProgressBar, Skeleton, EmptyState, Screen, AppBar…).
src/components/     Shared composites and hooks used by several areas: math (MathContent), files (FileCard,
                    FileViewer, PhotoGrid), retry-wait (useRetryWait, RetryWaitLine), load-failure (LoadFailure),
                    undo-toast, date-time, action-sheet, lessons (handout), progress-history. A helper that two
                    areas need goes here (or to src/domain / src/services), never into one area's folder.
src/services/       Device services: session (secure storage), preferences, biometrics, notifications,
                    files, photos (camera / gallery / document pickers), network/offline, realtime, query
                    (QueryClient offline rules, pending writes, mergeQueryData), clock, keep-awake. Each hides
                    platform differences.
src/navigation/     Screen registry (`ScreenId`), `NavTarget` → route mapping, per-role tab config,
                    `useAppNavigation()` / `useNavTarget()`, `useScreenFocused()`, `useRefetchOnFocus()`.
src/providers/      Composition root (`AppProviders`): `useSession()`, `useCurrentUser()`, `usePreferences()`,
                    `<Hint>`, pending-writes queue (offline note saving), demo backend access.
src/screens/<area>/ Screen components. Areas: shell, student, teacher, planner, groups, calls, stats,
                    content, developer. An area owns its folder.
tests/              `*.test.ts`, pure logic only.
```

Routes: each role is a route group with one real segment — `src/app/(student)/student/…`,
`(teacher)/teacher/…`, `(developer)/developer/…` — so URLs equal the site's paths. Settings, notifications,
number search, file viewer and Demo data are root-stack routes above the role group. `/dev-ui` (UI kit gallery)
and `/dev-math` (formula gallery) are developer-only pages. The route table is the comment at the top of
`src/navigation/routes.ts`.

Screens: a screen lives in `src/screens/<area>/<Name>Screen.tsx`; the export name and props are fixed by the
route file that renders it. Tab roots render `<Screen header={<ShellAppBar title=… />} bottomInset={false}>`,
pushed screens `<Screen header={<DetailAppBar title=… />}>` (both from `@/screens/shell`). Navigate only
through `useAppNavigation()` / `useNavTarget()` — never import `expo-router` in a screen.

Mock members: `src/mock/members/<member>.ts` exports `create<Member>(ctx: MockContext)`. Use `ctx.auth`,
`ctx.guard`, `ctx.q`, `ctx.limits`, `ctx.progress.write`, `ctx.homework.issue`, `ctx.jobs`, `ctx.errors`
instead of re-implementing rules; fixtures (`src/mock/fixtures/**`) change only together with a
`FIXTURES_REVISION` bump. Member tests use `createTestMock()` from `@/mock/testing`.

Generated files (never hand-edit, regenerate with the script): `src/lib/i18n/**` (`npm run sync:i18n --
<site repo>`), `src/components/math/generated/**` (`scripts/build-katex-assets.mjs`),
`src/services/files/generated/**` + `assets/mock-files/**` (`scripts/build-mock-files.mjs`),
`assets/images/**` (`scripts/build-icons.mjs`).

Rules:

- **Data access** — screens call `useApi()` and wrap calls in TanStack Query (`useQuery` / `useMutation`).
  Query keys: `[member, method, ...args]`. After a mutation invalidate the affected keys. No `fetch` in
  screens, no direct import of `src/mock` from screens.
- **Errors** — API methods reject with `ApiError { code, message, status, retryAfterSeconds?, params?,
  details? }`. Branch on `code`, show `message` (already localised). `sessionExpired` → sign out (handled
  centrally). Never auto-retry a mutation.
- **Mock backend** — behaves like the server: validates input with the site's limits, enforces role and
  ownership (foreign resource → 404), produces the same error codes, mirrors side effects (e.g. lesson result
  → number status), simulates latency and async jobs (checks, plan generation) on the mock clock. Privacy
  rules from the spec apply to mock responses too (e.g. a student never receives `errorKind`).
- **Time** — all "today"/deadline logic is Moscow time (`Europe/Moscow`) regardless of the device zone; use
  the helpers in `src/domain`. Instants are ISO strings; calendar days are `YYYY-MM-DD` Moscow days.
  Date-time pickers hold a Moscow wall-clock value: pass `today={mskToday()}` to `DateTimeField` and convert
  with `parseMskDateTimeInput` / `toMskDateTimeInput`.
- **Hints** — explanatory lines are wrapped in `<Hint>` so the "hints" preference can hide them.
- **i18n** — no hard-coded user-facing strings. Site texts come from `dict.*` (same keys as the site);
  mobile-only texts from `m.<area>.*`, always in both languages. Placeholders via `format()`, plural forms via
  `plural(locale, n, forms)`.
- **Styling** — `StyleSheet` + theme tokens from `useTheme()`; no hard-coded colours, radii or font sizes in
  screens. Status colours come from the status meta helper, not from literals. Fonts: one `fontFamily` per
  weight (never `fontWeight` with a custom family).
- **Math** — conditions and answers are rendered only through `MathContent` (KaTeX, same output as the site).
- **Web quirk** — inactive tab scenes stay in the DOM on web (inert); Playwright selectors in screenshot
  scripts need `:not([inert] *)`.
- **Files** — a response never contains a URL; use `FileService` with a `fileId` / `StoredFileRef`. Route
  params are untrusted (every route is a deep link): the file viewer takes file references from its URL and
  gets a downloaded document's `localUri` only in memory, through `openFiles`.
- **Overlays** — a `Modal` is a separate native window: it renders `<OverlayCoverSlot />` (the biometric lock
  cover) and reads `useWindowInsets()`. `BottomSheet` and `FileViewerModal` already do; prefer them.
- **Lists** — long lists use FlashList; screens respect safe areas via the `Screen` primitive.
- **Accessibility** — touch targets ≥ 44 pt, `accessibilityRole` / `accessibilityLabel` on controls.

## Privacy and safety

- Parent-call comments are personal data: visible only to the owning teacher and the developer; never logged,
  never placed in notifications.
- AI-check diagnostics (`errorKind`, `errorNote`, `injectionSuspected`, `injectionNote`) are never sent to or
  shown to a student.
- No secrets in the repo. The session token lives in secure storage only.

## Conventions

- TypeScript strict, no `any` (use `unknown` + narrowing). Named exports; one component per file.
- File names: `kebab-case.ts(x)`. Components `PascalCase`, hooks `useX`.
- Comments explain *why*, in English. UI copy is ru/en via dictionaries.
- Before finishing a change: `npm run typecheck`, `npm run lint`, `npm run test`.
