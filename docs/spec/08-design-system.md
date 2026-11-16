# 08 — Design system → React Native theme

Subsystem spec for the native (Expo / React Native, TypeScript) rewrite of **ШБЗ Школа**.
Everything below was read from the site code; nothing is invented. Where the site documentation and the
CSS disagree, **the CSS wins** and the disagreement is listed in §0.2.

Sources read (all under `/home/user/web_shetya`, read-only):
`DESIGN.md`, `PRODUCT.md`, `app/globals.css` (4151 lines, all of it), `tailwind.config.ts`, `app/layout.tsx`,
`app/icon.tsx`, `app/apple-icon.tsx`, `app/opengraph-image.tsx`, `lib/logo-font.ts`, `components/logo.tsx`,
`components/badge.tsx`, `section-card.tsx`, `page-header.tsx`, `shbz-page-header.tsx`, `shbz-nav-card.tsx`,
`shbz-select.tsx`, `shbz-datetime-picker.tsx`, `confirm-dialog.tsx`, `delete-button.tsx`, `progress-bar.tsx`,
`homework-status-badge.tsx`, `app-state-shells.tsx`, `dashboard-nav.tsx`, `interface-settings-panel.tsx`,
`locale-switch.tsx`, `login-form.tsx`, `lesson-result-toggle.tsx`, `number-select-card.tsx`,
`file-resource-card.tsx`, `file-drop-input.tsx`, `animated-dropzone.tsx`, `copy-value.tsx`, `count-up-value.tsx`,
`student-notifications-bell.tsx`, `student-weekly-activity.tsx`, `deadlines-calendar.tsx`,
`student-deadlines-calendar-skeleton.tsx`, `lesson-compose-card.tsx`, `teacher-student-tabs.tsx`,
`teacher-topic-tabs.tsx`, `use-streak-motion.ts`, `lib/utils.ts`, `lib/animation-hooks.ts`,
`lib/student-streak-colors.ts`, `lib/i18n/locale.ts`, `lib/i18n/format.ts`, `actions/locale.ts`,
`lib/i18n/dictionaries/{ru,en,topics,student,students}.ts`, `app/(dashboard)/layout.tsx`,
`app/(auth)/login/page.tsx`, `app/not-found.tsx`, `app/(dashboard)/error.tsx`.

Contents:

- §0 Reading guide and known contradictions
- §1 Colour tokens (light + dark)
- §2 Typography
- §3 Spacing, radius, borders, shadows, layout
- §4 Status (traffic-light) palette and labels
- §5 Component inventory (visual anatomy)
- §6 Motion rules
- §7 Logo, app icon, splash
- §8 Ready-to-paste TypeScript theme
- §9 Shell screens and states owned by this subsystem
- §10 View models
- §11 Mutations and queries
- §12 Business rules the mock must imitate
- §13 Realtime / polling
- §14 Proposed mobile API contract
- §15 Open questions

---

## 0. Reading guide

### 0.1 Two token layers on the site, one in the app

`globals.css` contains two generations of tokens:

- `--theme-*` + classes `ui-*` — the old design. At line 2511 (`ШБЗ: адаптация старой палитры`) every
  `--theme-*` variable is **re-pointed to a `--shbz-*` variable**, and the `ui-*` classes are restyled to
  look like the new design.
- `--shbz-*` + classes `shbz-*` — the current design ("новый дизайн").

The mobile app needs **only the `--shbz-*` layer**. All values in this document are the *effective*
(cascade-resolved) values. Where a legacy `ui-*` class is still used by a component, its resolved look is
given and mapped onto a `shbz` primitive.

Cascade rule used to resolve conflicts: `globals.css` starts with `@tailwind base/components/utilities`, so
every hand-written class in that file comes **after** Tailwind utilities and wins over a utility of equal
specificity. Consequences that matter (and are easy to get wrong by reading JSX only):

| JSX says | Effective result | Why |
|---|---|---|
| `shbz-btn-primary h-[54px] text-base` (login submit) | height **44**, font **14** | `.shbz-btn-primary { height: var(--shbz-btn-h); font-size: 14px }` wins |
| `shbz-btn-outline px-5 py-2.5 text-sm` | height 44, padding 0 16, font 14 | same |
| `shbz-btn-primary shbz-btn-field px-[26px]` | height 52, padding 0 24, font 15 | `.shbz-btn-field` declared later |
| `Badge` `rounded-[8px]` + `ui-status-surface` | radius **12** | `.ui-status-surface { border-radius: 12px }` wins |
| `Badge` `font-medium` + `ui-badge-soft` | weight **600**, no border | `.ui-badge-soft { border: none; font-weight: 600 }` wins |
| `ui-state-shell rounded-[12px]` | radius **16** | group rule at line 2606 |
| `ui-button-primary … font-semibold` | weight **700** | `.ui-button-primary { font-weight: 700 }` wins |

### 0.2 Where `DESIGN.md` / `PRODUCT.md` are stale (code is the truth)

| Topic | DESIGN.md / PRODUCT.md | Actual code |
|---|---|---|
| Typeface | Onest (DESIGN), Inter / JetBrains Mono (PRODUCT) | **Montserrat** variable font via `next/font/google`, subsets `latin` + `cyrillic`, CSS var `--font-logo`, applied on `<body>` (`app/layout.tsx:13,71`). `--font-body` / `--font-display` both resolve to it. Tailwind `fontFamily.sans` = `var(--font-logo), Montserrat, system-ui, -apple-system, sans-serif` |
| Kicker colour | `#9aa0a6` | `--shbz-kicker: #63676d` (dark `#7c8087`) |
| Placeholder colour | `#abaeb3` | `--shbz-placeholder: #6d7076` (dark `#6a6e75`) |
| Status text colours | `#1b9e63` / `#c98a1e` / `#d64550` | `--shbz-green-text #127a4c`, `--shbz-yellow-text #8a5d05`, `--shbz-red-text #b3202c` (the DESIGN.md hexes survive only as the RGB base of the dark *soft* fills, at 16 % alpha) |
| Input font size | 15 px | **16 px** (`.shbz-input`, comment: iOS Safari zooms below 16) |
| Button geometry | per-variant paddings 13/26, 9/16 … | unified: every action button is **44 px** high, 14 px text, `line-height: 1` (`--shbz-btn-h`) |
| Primary disabled | "neutral grey" | correct — `background: --shbz-seg-bg; color: --shbz-seg-text; opacity: 1` |
| Language | "Весь интерфейс русский" (PRODUCT) | bilingual ru/en via `lib/i18n`, cookie `shbz-lang` |
| Density setting | "плотность (комфортная / компактная)" (PRODUCT) | **does not exist in code**. Only theme (system/light/dark), hints (on/off) and language |
| "DESIGN.md отсутствует" (PRODUCT) | — | it exists |
| "логотипа как отдельного ассета нет" | — | logo is live text (`components/logo.tsx`); the only binary brand assets are the 5 Montserrat TTFs in `assets/fonts/montserrat/` |
| Body default hints | — | hints are **off by default** (`storedHints … || "off"`) |

Owner decisions recorded in code comments that must be preserved:

- Primary button keeps the bright gradient with **white** label although contrast is below WCAG AA
  (`globals.css:1751`, dated 2026-08-20) — "не менять без его отмашки".
- The logo suffix «Школа» uses the same gradient as buttons, not the flat brand colour
  (`globals.css:1626`).
- Lesson-result buttons carry words only, no glyphs (`lesson-result-toggle.tsx:9`).
- Student has no profile block in the header; only bell, gear, logout (`dashboard-nav.tsx:188`).

---

## 1. Colour tokens

All tokens are CSS custom properties on `:root` (light) and `html[data-theme="dark"]` (dark).
`rgba()` values are kept as-is in the "value" column and additionally **flattened to opaque hex** over the
surface they normally sit on (card `#ffffff` / `#131417`; page `#ffffff` / `#0b0c0e`), so they can be used
on Android where translucent borders over shadows render badly. Flattening = straight sRGB alpha blend.

### 1.1 Core surfaces and text

| Token (`--shbz-…`) | Role | Light | Dark |
|---|---|---|---|
| `page-bg` | screen background | `#ffffff` | `#0b0c0e` |
| `card-bg` | card, modal, menu, outline/danger button fill, tab bar fill | `#ffffff` | `#131417` |
| `card-border` | 1 px card hairline | `#ececee` | `#26282c` |
| `soft-bg` | nested soft panel, check-row, note field, read-only field | `#f8f9fa` | `#1a1c1f` |
| `soft-border` | soft-panel hairline, inner separators | `#f0f0f1` | `#26282c` |
| `panel-bg` | week-activity panel, calendar cell | `#fbfbfc` | `#17181b` |
| `row-border` | list row separator | `#f4f4f5` | `#222428` |
| `header-bg` | (legacy translucent header, used by loading skeleton header only) | `rgba(255,255,255,0.85)` | `rgba(11,12,14,0.85)` |
| `header-border` | top bar bottom hairline | `#efefef` | `#222428` |
| `divider` | generic divider | `#e4e5e7` | `#34373c` |
| `text-strong` | headings, values, primary text | `#0a0a0a` | `#f5f6f7` |
| `label` | form labels, default body copy (`--theme-text-default`) | `#2c2e33` | `#c9ccd1` |
| `text-muted` | secondary text | `#6a6e75` | `#9ba0a6` |
| `text-soft` | tertiary text (role caption, show-password link) | `#8b8f96` | `#85898f` |
| `kicker` | uppercase over-titles, tiny labels, icon strokes | `#63676d` | `#7c8087` |
| `placeholder` | input placeholder | `#6d7076` | `#6a6e75` |

Note: the real top bar (`.shbz-topbar`) uses the **opaque** `page-bg`, not `header-bg`.

### 1.2 Inputs, outlines, tabs, segments, progress

| Token | Role | Light | Dark |
|---|---|---|---|
| `input-bg` | input / select / textarea fill | `#ffffff` | `#0f1012` |
| `input-border` | 1.5 px field border, dashed dropzone border, switch track border | `#e4e5e7` | `#2c2e33` |
| `input-border-focus` | border of open select / date trigger / focused note field | `#0a0a0a` | `#f5f6f7` |
| `input-ring` | 4 px focus ring of select/date trigger/note field | `rgba(54,224,164,0.15)` → `#e1faf1` | `rgba(54,224,164,0.18)` → `#193930` on card |
| `dropzone-bg` | dropzone fill | `#fbfcfd` | `#0f1012` |
| `outline-border` | outline button / icon circle / search pill border | `#e4e5e7` | `#34373c` |
| `outline-hover` | same, hovered/pressed/open | `#0a0a0a` | `#f5f6f7` |
| `tab-border` | 1.5 px border of the tab-bar pill | `#0a0a0a` | `#e8e9ea` |
| `tab-text` | tab label, outline-button label | `#14161a` | `#d6d8db` |
| `tab-active-bg` | active tab fill, **dark button** fill, copy pill fill | `#0a0a0a` | `#f5f6f7` |
| `tab-active-text` | active tab label, dark-button label | `#ffffff` | `#0a0a0a` |
| `tab-hover` | hover/pressed underlay, muted badge fill, active icon-circle fill | `#f2f3f4` | `#24262a` |
| `seg-bg` | segmented control track, switch track (off), **disabled primary button fill** | `#ecedef` | `#222428` |
| `seg-active-bg` | selected segment | `#ffffff` | `#0f1012` |
| `seg-text` | unselected segment label, disabled primary label | `#6a6e75` | `#9ba0a6` |
| `progress-track` | progress bar track, upload bar track | `#efeff1` | `#26282c` |

### 1.3 Accent ("Мятный рассвет")

| Token | Role | Light | Dark |
|---|---|---|---|
| `accent-grad` | `linear-gradient(90deg, #5ac8ea 0%, #36e0a4 100%)` — primary button, progress fill, title dot, nav-card top band, focused input border, switch on, selected calendar day, logo suffix | same | same |
| `accent-grad-diag` | `linear-gradient(135deg, #5ac8ea, #36e0a4)` — avatar | same | same |
| `accent-solid` | flat accent: focus outline, checkbox checked, today ring, links ("Сегодня", "Прочитать все"), unread dot, activity bar | `#16b07e` | `#36e0a4` |
| `accent-shadow` | primary button glow | `rgba(54,224,164,0.30)` | same |
| `accent-shadow-hover` | primary button glow hover | `rgba(54,224,164,0.42)` | same |
| `--theme-accent-soft` | tonal fill: selected select option, tonal button | `rgba(54,224,164,0.12)` → `#e7fbf4` | `rgba(54,224,164,0.14)` → `#18312b` on card |
| `--theme-accent-soft-hover` | copy-flash / realtime-flash start colour | `rgba(54,224,164,0.18)` → `#dbf9ef` | `rgba(54,224,164,0.20)` → `#1a3d33` |
| `--theme-accent-border` | selected number-card ring (theme accent variant) | `rgba(22,176,126,0.35)` → `#ade3d2` | `rgba(54,224,164,0.35)` → `#1f5b48` |
| `page-glow` | login background: `radial-gradient(720px 420px at 50% -8%, rgba(54,224,164,α), rgba(90,200,234,0) 70%)` | α = 0.12 | α = 0.09 |
| dashboard glow | `radial-gradient(640px 320px at 100% 0%, rgba(54,224,164,0.07), rgba(90,200,234,0) 70%)` on page bg (`app/(dashboard)/layout.tsx:24`) | same | same |
| `::selection` | `rgba(22,176,126,0.15)` | same | same |

Gradient midpoint (for single-colour fallbacks): `#48d4c7`.

### 1.4 Status / semantic colours

| Token | Role | Light | Dark (value) | Dark flattened on card `#131417` |
|---|---|---|---|---|
| `green-soft` | GREEN fill, success notice fill, selected check-row fill, dropzone success fill, icon tile | `#eaf7ef` | `rgba(27,158,99,0.16)` | `#142a23` |
| `green-text` | GREEN text, success text, tonal text | `#127a4c` | `#59d49d` | — |
| `yellow-soft` | YELLOW fill, warning notice fill | `#fef4e3` | `rgba(201,138,30,0.16)` | `#302718` |
| `yellow-text` | YELLOW text | `#8a5d05` | `#e8b45c` | — |
| `red-soft` | RED fill, error notice fill (`ui-notice-error`), danger button pressed fill | `#fceded` | `rgba(214,69,80,0.16)` | `#321c20` |
| `red-text` | RED text, inline field error text | `#b3202c` | `#ff8f94` | — |
| `--theme-success-border` | GREEN / success 1 px border | `rgba(27,158,99,0.25)` → `#c6e7d8` | `rgba(89,212,157,0.30)` | `#284e3f` |
| `--theme-warning-border` | YELLOW / warning 1 px border | `rgba(201,138,30,0.30)` → `#efdcbc` | `rgba(232,180,92,0.30)` | `#53442c` |
| `danger-outline` | RED border, danger button border, `ui-notice-error` border | `#f3c7c9` | `rgba(229,72,77,0.40)` | `#67292d` |
| `danger-solid` | destructive text/fill, unread counter fill, "Очистить" link, confirm-dialog kicker | `#e5484d` | `#ff6b70` | — |
| `danger-bg` | `shbz-notice-error` fill | `#fceded` | `rgba(229,72,77,0.12)` | `#2c1a1d` |
| `danger-border` | `shbz-notice-error` border | `#f3c7c9` | `rgba(229,72,77,0.35)` | `#5c262a` |
| `danger-text` | `shbz-notice-error` text, danger icon-button glyph | `#b3202c` | `#ff8f94` | — |

### 1.5 Calendar, streak, weekly activity

| Token | Role | Light | Dark (value) | Dark flattened on card |
|---|---|---|---|---|
| `cal-ok-bg` | day with deadlines, all done | `#fff7ea` | `rgba(242,169,59,0.10)` | `#29231b` |
| `cal-ok-border` | | `#f5dfb8` | `rgba(242,169,59,0.35)` | `#614824` |
| `cal-ok-mark` | diamond mark | `#f2a93b` | `#f2a93b` | — |
| `cal-late-bg` | day with unfinished deadlines | `#fff5f5` | `rgba(229,72,77,0.10)` | `#28191c` |
| `cal-late-border` | | `#f5c6c9` | `rgba(229,72,77,0.35)` | `#5c262a` |
| `cal-late-mark` | diamond mark | `#e5484d` | `#ff6b70` | — |
| `cal-cell-bg` | ordinary day of current month | `#fbfbfc` | `#17181b` | — |
| `cal-cell-border` | | `#f0f0f1` | `#26282c` | — |
| `cal-out-bg` | day outside current month | `#fdfdfe` | `#131417` | — |
| `cal-out-text` | its number (also date-picker out-of-month days) | `#c7cad0` | `#4a4d52` | — |
| `cal-ring` | today ring (inset 2 px) / open-day ring (outer 3 px) | `rgba(10,10,10,0.12)` → `#e2e2e2` | `rgba(255,255,255,0.18)` | `#3d3e41` |
| `streak-bg` | streak hero fill (tier `starter`) | `linear-gradient(135deg, #fff3e4, #ffe9d2)` | `linear-gradient(135deg, rgba(242,146,46,0.18), rgba(242,146,46,0.08))` | `#3b2b1b → #251e19` |
| `streak-border` | | `#fbdfbe` | `rgba(242,146,46,0.35)` | `#61401f` |
| `streak-text` | hero kicker, day counter | `#b5701a` | `#e8a35c` | — |
| `streak-flame` | flame icon fill | `#f2922e` | `#f2922e` | — |
| `streak-pill-bg` | counter pill inside hero | `rgba(255,255,255,0.7)` | `rgba(0,0,0,0.25)` | — |
| `week-cell` | weekday column cell | `#f1f2f4` | `#222428` | — |
| `week-dot-off` | empty-day dot | `#d7d9dd` | `#3a3d42` | — |

**Streak colour tiers** (`lib/student-streak-colors.ts`, `globals.css:2282`). Tier by current streak length:

| Tier | Streak ≥ | Accent |
|---|---|---|
| `starter` | 0 | default palette above (orange) |
| `ember` | 10 | `#f2922e` |
| `amber` | 25 | `#e0a80c` |
| `lime` | 50 | `#7cb818` |
| `emerald` | 100 | `#16a878` |
| `cyan` | 150 | `#0aa8c4` |
| `blue` | 200 | `#3b82f6` |
| `violet` | 300 | `#8b5cf6` |
| `rose` | 500 | `#ef4667` |
| `gold` | 1000 | `#c9a227` |

For every tier except `starter` the hero colours are derived with `color-mix(in srgb, …)`:
`bgStart = mix(accent 16 %, card-bg)`, `bgEnd = mix(accent 7 %, card-bg)`, gradient 135°,
`border = mix(accent 38 %, card-bg)`, `text = mix(accent 45 %, text-strong)`, `flame = accent`.
Pre-computed results:

| Tier | Light bgStart | Light bgEnd | Light border | Light text | Dark bgStart | Dark bgEnd | Dark border | Dark text |
|---|---|---|---|---|---|---|---|---|
| ember | `#fdeede` | `#fef7f0` | `#fad6b0` | `#72471a` | `#37281b` | `#231d19` | `#684420` | `#f4c99d` |
| amber | `#faf1d8` | `#fdf9ee` | `#f3dea3` | `#6a510b` | `#342c15` | `#211e16` | `#614c13` | `#ecd38d` |
| lime | `#eaf4da` | `#f6faef` | `#cde4a7` | `#3d5810` | `#242e17` | `#1a1f17` | `#3b5217` | `#bfda93` |
| emerald | `#daf1e9` | `#eff9f6` | `#a6decc` | `#0f513c` | `#132c27` | `#131e1e` | `#144c3c` | `#91d3be` |
| cyan | `#d8f1f6` | `#eef9fb` | `#a2dee9` | `#0a515e` | `#122c33` | `#121e23` | `#104c59` | `#8bd3e0` |
| blue | `#e0ebfe` | `#f1f6fe` | `#b5d0fc` | `#204074` | `#19263b` | `#161c27` | `#223e6c` | `#a1c2f7` |
| violet | `#ece5fe` | `#f7f4fe` | `#d3c1fc` | `#442f74` | `#26203b` | `#1b1927` | `#412f6c` | `#c5b1f7` |
| rose | `#fce1e7` | `#fef2f4` | `#f9b9c5` | `#712534` | `#361c24` | `#22181d` | `#672735` | `#f2a7b6` |
| gold | `#f6f0dc` | `#fbf8f0` | `#eadcad` | `#604e17` | `#302b1a` | `#201e18` | `#584a1d` | `#e1d099` |

Milestones used for "next goal" copy: `STREAK_COLOR_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 500, 1000]`.

### 1.6 Brand / logo colours

| Token | Value | Use |
|---|---|---|
| `--brand` | `#16c79f` (`LOGO_BRAND = "#16C79F"`) | flat brand colour: favicon / app-icon plate, og:image suffix |
| `--brand-deep` | `#0e9b80` | flat brand for small sizes and print (PDF, handout) |
| `--ink` | `#0a0a0a` light / `#ffffff` dark (`LOGO_INK = "#0A0A0A"`) | «ШБЗ» part of the logo |
| `LOGO_DARK_BG` | `#101212` | declared in `lib/logo-font.ts`, unused on the site — a ready dark splash/icon background |

### 1.7 Misc literal colours used by primitives

| Where | Value |
|---|---|
| Modal overlay | `rgba(15,23,42,0.45)` (`#0f172a73`) |
| Mobile menu overlay | `rgba(0,0,0,0.20)` + `backdrop-blur-sm` |
| Skeleton base, light | `color-mix(text-soft 14 %, transparent)` = `rgba(139,143,150,0.14)` → `#efeff0` on white |
| Skeleton base, dark | `rgba(30,41,59,0.78)` → `#1c2433` on card (the dark rule at `globals.css:1370` has higher specificity than the A11 rule) |
| Skeleton shimmer | light: `transparent → rgba(255,255,255,0.6) → transparent`; dark: `transparent → rgba(255,255,255,0.08) → transparent` |
| Switch knob | `#ffffff`, shadow `0 1px 3px rgba(10,10,10,0.25)` |
| Checkbox check stroke | `white` |
| Label on gradient / avatar / danger-solid / unread counter | `#ffffff` in both themes |
| Old Tailwind palette (`brand.50…900`, `accent.gold #ffcf66`, `accent.mint #73dcb9`, `boxShadow.glow`, `backgroundImage.mesh`) | declared in `tailwind.config.ts`, **not part of the current design** — do not port |

---

## 2. Typography

### 2.1 Families

- **UI family: Montserrat** (Google Fonts, variable, all weights). Loaded in `app/layout.tsx` with
  `Montserrat({ subsets: ["latin", "cyrillic"], variable: "--font-logo" })`.
- Weights actually used in markup: **400** (`font-normal`, body), **500** (`font-medium`, 65 uses),
  **600** (`font-semibold`, 196), **700** (`font-bold`, 150), **800** (`font-extrabold`, 45),
  **900** (logo only).
- Static TTFs shipped in the repo (`assets/fonts/montserrat/`): `Montserrat-Regular.ttf`,
  `Montserrat-Medium.ttf`, `Montserrat-SemiBold.ttf`, `Montserrat-Bold.ttf`, `Montserrat-Black.ttf`.
  There is **no ExtraBold (800) TTF** in the repo — the site gets 800 from the variable web font.
- Mono: Tailwind `font-mono` = `"JetBrains Mono", ui-monospace, monospace`, but JetBrains Mono is not
  loaded, so the system monospace is what renders. 6 usages (generated passwords, JSON import paste).
- Math: KaTeX (`katex/dist/katex.min.css`) — own font set; belongs to the content subsystem, not the theme.

**Expo equivalents**

```ts
// npx expo install expo-font @expo-google-fonts/montserrat
import {
  Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold,
  Montserrat_700Bold, Montserrat_800ExtraBold, Montserrat_900Black
} from "@expo-google-fonts/montserrat";
```

React Native cannot synthesize weights for custom fonts on Android: use one `fontFamily` per weight and
never set `fontWeight` together with it. Mono: `Platform.select({ ios: "Menlo", android: "monospace" })`.
Cyrillic is included in the Google package (the site requests the `cyrillic` subset explicitly).

### 2.2 Global text settings

- `body { line-height: 1.5; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility }`.
- Tabular digits (`font-variant-numeric: tabular-nums`) on every counter: `.ui-num`,
  `.ui-metric-pill-value`, `.ui-mini-stat-card-value`, `.ui-stat-card-value` → RN `fontVariant: ["tabular-nums"]`.
- Uppercase is allowed **only** for kickers / tiny labels. Buttons, tabs and titles are sentence case;
  navigation tab labels are deliberately **lowercase** («обзор», «дз», «дедлайны»; en: "overview", "homework").
- All button / chip / badge / tab labels are `white-space: nowrap` (Montserrat is wide).
- Logo letter-spacing `-0.015em`, weight 900, line-height 1.

### 2.3 Scale (effective values)

`lh` = line-height. "inherit 1.5" means no explicit value → `size × 1.5`.

| Role | Class / place | Size | Weight | Letter-spacing | lh | Colour |
|---|---|---|---|---|---|---|
| Display / page title | `.shbz-h1` | `clamp(26px, 5vw, 40px)` → **26 on phones** (< 520 px wide), 40 from 800 px | 800 | −1 px | inherit 1.5 (DESIGN.md intends 1.1) | text-strong |
| Legacy page title | `PageHeader` h1 | `clamp(24px, 4vw, 34px)` → 24 on phones | 800 | −0.8 px | 1.25 | text-strong |
| Login title | `LoginForm` | `clamp(26px, 5vw, 30px)` → 26 | 800 | −0.8 px | 1.5 | text-strong |
| Dialog title | `ConfirmDialog` h3 | 24 | 800 | −0.5 px | 32 | text-strong |
| Streak headline | weekly activity | 26 | 800 | −0.5 px | 1.5 | text-strong |
| Metric value | nav-card stat | 23 | 800 | 0 | 1.5 | text-strong |
| Section title | `.shbz-section-title` | 20 | 700 | 0 | 1.5; margin-bottom 18 | text-strong |
| Calendar month | calendar header | 20 | 800 | −0.3 px | 28 | text-strong |
| Mini stat value | weekly activity panels | 19 | 800 | −0.2 px | 1.25 | text-strong |
| Number title | number cards (`text-lg`) | 18 | 600 | 0 | 28 | text-strong |
| Card title | `ShbzNavCard` | 17 | 700 | 0 | 1.35, clamp 2 lines, min-height 2.7em | text-strong |
| Empty-state title | `text-2xl font-semibold` | 24 | 600 | 0 | 32 | text-strong |
| Input text | `.shbz-input` | **16** | 400 | 0 | — | text-strong |
| Body | `.shbz-textarea`, week summary | 15 | 400 | 0 | 1.5 | text-strong / label |
| Select text | `.shbz-select`, `ShbzSelect` md | 15 | 600 | 0 | — | text-strong |
| Body small | `text-sm` (248 uses) | 14 | 400–600 | 0 | 20 | text-muted / label |
| Button | all `shbz-btn-*` | 14 | 700 primary/dark/danger-solid; 600 outline/danger | 0 | 1 | per variant |
| Button large / field | `--lg`, `--field` | 15 | same | 0 | 1 | |
| Tab | `.shbz-tab` | 14 | 600 | 0 | — | tab-text |
| Segment | `.shbz-seg-btn` | 13.5 | 600 | 0 | — | seg-text |
| Form label | `.ui-form-label`, `text-[13px] font-semibold` | 13 | 600 | 0 | — | label |
| Meta | nav-card `meta` | 13 | 600 | 0 | — | text-muted |
| Chip | `.shbz-chip` | 12.5 | 700 | 0 | 1.5 | status text |
| Muted badge | `.shbz-badge-muted` | 12.5 | 600 | 0 | 1.5 | kicker |
| Status badge | `Badge` (`text-[12px] font-medium`) | 12 | 500 (600 for "not marked") | 0 | 1.5 | status text |
| Caption | `text-xs` (88 uses) | 12 | 400–700 | 0 | 16 | text-muted / soft |
| Hint | `.ui-hint` in settings | 12.5 | 400 | 0 | 1.5 | kicker |
| Kicker | `.shbz-kicker` | 12 | 700 | 1.6 px, UPPERCASE | 1.5 | kicker |
| Kicker small | `.ui-kicker` | 11 | 700 | 1.2 px, UPPERCASE | 1.5 | kicker |
| Card kicker | nav card, popover | 10.5 | 700 | 1.2 px, UPPERCASE | — | kicker |
| Stat label | nav-card stat | 10 | 600 | 0.6 px, UPPERCASE | — | kicker |
| Weekday (calendar) | deadlines calendar | 12 | 700 | 1 px, UPPERCASE | — | kicker |
| Weekday (picker) | date picker | 10 | 700 | 0.8 px | — | kicker |
| Avatar initials | `.shbz-avatar` | 14 | 800 | 0.5 px | — | `#ffffff` |
| Notification title / body / time | bell panel | 13.5 / 12.5 / 11.5 | 600 (read) or 800 (unread) / 400 / 600 | 0 | snug (1.375) | text-strong / text-muted / kicker |
| Unread counter | bell | 10.5 | 800 | 0 | — | `#ffffff` |
| Copy pill | `.ui-copy-pill` | 12 | 700 | 0 | 1 | tab-active-text |
| 404 numeral | not-found | 64 (80 from 640 px) | 700 | 0 | — | text-muted |

Recommended phone mapping (the phone always lands on the `clamp()` minimum): display **26/32**,
section title **20/26**, body **15/22**, small **14/20**, caption **12/16**. The site's inherited 1.5 on
the 26 px title (39 px line) is an accident of inheritance; use 32.

---

## 3. Spacing, radius, borders, shadows, layout

### 3.1 Spacing

Base unit is Tailwind's 4 px. Values that recur in the design (px):

| Name | Value | Where |
|---|---|---|
| `xxs` | 4 | tab-bar inner gap, segment gap, picker grid gap |
| `xs` | 6 | status-toggle gap, small stacks, menu padding |
| `sm` | 9 | label → field (`mb-[9px]`, `gap-[9px]`), search icon gap |
| `md` | 10–12 | button rows (`gap-2.5` = 10, `gap-3` = 12 — the two most frequent gaps) |
| `field` | 18 | gap between form fields, section-title bottom margin, nav-card inner gap, card padding on phones |
| `lg` | 20 | card-grid gap, soft-panel padding (`p-5`) |
| `xl` | 22 | nav-card padding |
| `card` | 28 | `.shbz-section-pad` on ≥ 641 px (**18 on ≤ 640 px — the phone value**) |
| `sectionGap` | 44 | between page sections (`space-y-11`, `mb-11`) |
| `headerGap` | 40 | below `ShbzPageHeader` (`mb-10`); 36 below legacy `PageHeader` |
| `gutter` | 16 | horizontal page padding on phones (`px-4`); 32 from 640 px |
| `pageTop` / `pageBottom` | 32 / 64 | `pt-8` / `pb-16` (72 from 640 px) |

Other fixed measures: nav-card stat gap 26; login card padding 30; login form max-width 416; dialog
padding 24, max-width 448 (`max-w-md`) or 576 (`wide`); container max-width 1180.

### 3.2 Radius

| Token | px | Used by |
|---|---|---|
| `xs` | 7 | checkbox |
| `sm` | 8 | chips, badges, streak counter pill, compact date trigger, error-icon tile |
| `seg` | 9 | segment button and its sliding indicator |
| `selectXs` | 10 | `ShbzSelect` size xs; legacy `--radius-lg` (copy row) |
| `md` | 12 | every button, input, textarea, tab, notice, menu and its options, day cells, status buttons/badges, check-row, small select |
| `select` | 14 | `ShbzSelect` md, `.shbz-select` |
| `lg` | 16 | cards, modal card, tab-bar pill, soft panels, dropzone, popovers, streak hero, number cards; bottom sheet = `16 16 0 0` |
| `full` | 999 | avatar, title dot, switch, spinner, progress, icon circles (40 px), bell counter, danger icon button — *only functionally round things* |

Tiny specials: diamond mark 3 (9×9 square rotated 45°), legend swatch 5.
Legacy `--radius-*` (`sm 6, md 8, lg 10, xl 12, 2xl 16, full 999`) are only referenced by legacy classes.

### 3.3 Border widths

- **1 px** — static hairlines: cards, soft panels, notices, menus, status badges, separators.
- **1.5 px** — everything interactive: inputs, selects, outline/danger/dark buttons, tab-bar pill, icon
  circles, switch track, check-row, dashed dropzone, note field. ("Полуторапиксельная рамка — метка «сюда можно нажать»".)
- **2 px** — checkbox border, focus outline, selected number-card ring, today ring (inset).
- **Dashed 1.5 px** = invitation (empty dropzone, empty note field, "compose lesson" card). Becomes solid
  once there is content. Dashed 1 px soft border = empty-state panel.

RN note: `1.5` is a valid `borderWidth`; on 2× screens it renders as 3 device pixels.

### 3.4 Shadows

Two-layer, soft and wide. "Тень — это воздух": shadows separate a card from the page, they never signal
interactivity. Nested panels have **no** shadow.

| Name | Light | Dark |
|---|---|---|
| `card` (`--shbz-card-shadow`) — `.shbz-card`, modal card | `0 1px 2px rgba(10,10,10,0.04), 0 14px 38px rgba(10,10,10,0.07)` | `0 1px 2px rgba(0,0,0,0.4), 0 14px 38px rgba(0,0,0,0.5)` |
| `surface` (`--theme-shadow-soft`) — legacy `ui-surface`, `ui-state-shell`, file cards | `0 1px 2px rgba(10,10,10,0.04), 0 8px 24px rgba(10,10,10,0.05)` | `0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)` |
| `cardHover` (pointer devices only, not needed on touch) | `0 2px 4px rgba(10,10,10,0.05), 0 14px 36px rgba(10,10,10,0.09)` | `0 2px 4px rgba(0,0,0,0.45), 0 14px 36px rgba(0,0,0,0.4)` |
| `popover` — select menu, date picker, bell panel | `0 4px 10px rgba(10,10,10,0.06), 0 20px 48px rgba(10,10,10,0.18)` (calendar day popover: second layer 0.14) | same literal values (hard-coded in JSX) |
| `accentGlow` — primary button only | `0 6px 18px rgba(54,224,164,0.30)`; legacy `ui-button-primary`: `0 5px 14px …0.30` | same |
| `segment` — selected segment / its indicator | `0 1px 2px rgba(10,10,10,0.10)` | same |
| `knob` — switch knob | `0 1px 3px rgba(10,10,10,0.25)` | same |
| `copyPill` | `0 4px 12px rgba(10,10,10,0.18)` | same |
| `raisedIcon` — delete "×" over an image | `0 2px 6px rgba(15,23,42,0.14)` | same |

React Native: with the New Architecture (RN ≥ 0.76 / Expo SDK ≥ 52) the `boxShadow` style accepts these
strings verbatim on iOS and Android. Fallback for older setups (single layer): iOS
`shadowColor #0a0a0a, shadowOpacity 0.07, shadowRadius 19, shadowOffset {0,14}`; Android `elevation: 3`
(light) and **no elevation in dark** — rely on the `#26282c` border, as dark-mode elevation shadows are
invisible on `#0b0c0e`.

### 3.5 Layout rules

- Single-column feed; container `max-width: 1180px`; gutters 16 (phone) / 32.
- Page rhythm: page header (kicker + title + gradient dot, 40 below) → sections 44 apart → cards with
  28 (18 on phone) padding.
- Card grids are always fluid: `repeat(auto-fit, minmax(260–320px, 1fr))`, gap 20 → on a phone this is
  always **one column**. Never hard-code a column count.
- Tailwind breakpoints in use: `sm 640`, `md 768` (tab-bar pill appears, burger disappears), `lg 1024`,
  `xl 1280`. The phone app corresponds to the `< 640` branch everywhere.
- Runtime UI modes (attributes on `<html>`): `data-theme="light|dark"`, `data-theme-mode="system|light|dark"`,
  `data-hints="on|off"`. With hints off, every element with class `ui-hint` is `display: none` and page
  headers shrink their vertical padding to 16.
- Z-order: sticky top bar 50, modal overlay 50, portalled menus/popovers 1000, mobile menu overlay 30 /
  panel 40.
- Touch targets: `.ui-copy-row { min-height: 44px }` ("палец на мобильном"), status buttons
  `min-h-[44px]`, all action buttons 44. Use 44 as the app-wide minimum hit size.

---

## 4. Status (traffic-light) palette and labels

### 4.1 Enum and style contract

`HomeworkNumberStatus = "GREEN" | "YELLOW" | "RED"`, nullable (`null` = not marked).
`lib/utils.ts → homeworkStatusMeta` maps each status to three class strings:

| Status | `cardClassName` | `buttonClassName` | `subtleClassName` |
|---|---|---|---|
| GREEN | `ui-status-surface ui-status-green` | `ui-status-option ui-status-green` | `ui-status-surface ui-status-green` |
| YELLOW | `ui-status-surface ui-status-yellow` | `ui-status-option ui-status-yellow` | `ui-status-surface ui-status-yellow` |
| RED | `ui-status-surface ui-status-red` | `ui-status-option ui-status-red` | `ui-status-surface ui-status-red` |

Effective style of those classes (both variants: 1 px border, radius 12):

| Status | Fill | Text | Border (light) | Border (dark) |
|---|---|---|---|---|
| GREEN | `green-soft` `#eaf7ef` / dark `rgba(27,158,99,0.16)` | `green-text` `#127a4c` / `#59d49d` | `rgba(27,158,99,0.25)` | `rgba(89,212,157,0.30)` |
| YELLOW | `yellow-soft` `#fef4e3` / dark `rgba(201,138,30,0.16)` | `yellow-text` `#8a5d05` / `#e8b45c` | `rgba(201,138,30,0.30)` | `rgba(232,180,92,0.30)` |
| RED | `red-soft` `#fceded` / dark `rgba(214,69,80,0.16)` | `red-text` `#b3202c` / `#ff8f94` | `#f3c7c9` | `rgba(229,72,77,0.40)` |
| none (badge) | `tab-hover` `#f2f3f4` / `#24262a` | `kicker` `#63676d` / `#7c8087` | none | none |
| neutral (lesson "not reached", active) `ui-status-neutral` | `tab-hover` | `text-strong` | `text-strong` | `text-strong` |
| inactive option `ui-status-button` | `card-bg` | `tab-text` | `outline-border` | `outline-border` |

The borderless variant of the same pairs is `.shbz-chip-green|yellow|red` (radius 8).
Rule: green / yellow / red are **reserved for statuses and direct signals**; never decorative.

### 4.2 Labels

| Key | ru | en |
|---|---|---|
| `dict.status.GREEN.label` | Решен с первого раза | Solved on the first try |
| `dict.status.GREEN.shortLabel` | Зеленый | Green |
| `dict.status.YELLOW.label` | Исправлен после самопроверки | Fixed after self-check |
| `dict.status.YELLOW.shortLabel` | Желтый | Yellow |
| `dict.status.RED.label` | Нужна помощь преподавателя | Needs the teacher's help |
| `dict.status.RED.shortLabel` | Красный | Red |
| `dict.student.statusBadge.unmarked` | Не отмечено | Not marked |
| `dict.progress.statuses.GREEN` | Решил | Solved |
| `dict.progress.statuses.YELLOW` | Решил с ошибками | Solved with mistakes |
| `dict.progress.statuses.RED` | Не решил | Not solved |
| `dict.progress.statuses.none` | Без отметки | No mark |

`HomeworkStatusBadge` shows `dict.status[status].shortLabel`, or `dict.student.statusBadge.unmarked` for `null`.

### 4.3 Lesson-result palette (reuses the traffic light)

`lesson-result-toggle.tsx → lessonResultMeta`. Enum `LessonResultValue = "SOLVED" | "PARTIAL" | "NOT_SOLVED" | "SKIPPED"`.

| Value | Active style | `dict.students.lessonResult.*` ru | en |
|---|---|---|---|
| SOLVED | GREEN option | решил | solved |
| PARTIAL | YELLOW option | с ошибками | with mistakes |
| NOT_SOLVED | RED option | не решил | not solved |
| SKIPPED | neutral option (`ui-status-neutral`) | не успел | not reached |
| group aria | — | Итог урока | Lesson result |

### 4.4 Other fixed colour semantics

- Notices: success = GREEN pair, warning = YELLOW pair, error = RED pair (see §5.10).
- Calendar: amber = "deadline, all done"; red = "has unfinished"; ring = today (see §1.5).
- Page-header metric tones (`PageHeader`): `default → text-strong`, `accent → accent-solid`,
  `success → green-text`, `warning → yellow-text`, `danger → red-text`.
- Streak warm palette belongs **only** to the student streak.

---

## 5. Component inventory

Conventions: sizes in px (= dp in RN); "pressed" = the web `:active` state; hover states are listed only
when they should become the RN pressed state. Every pressable scales to **0.97 in 60 ms** on press and
returns in 180 ms (`ease-out`) unless stated otherwise.

### 5.1 Buttons

Common geometry (`.shbz-btn-primary|outline|dark|danger`): `height 44` (`--shbz-btn-h`), `font 14`,
`line-height 1`, `radius 12`, content centered, single line, no wrapping. Vertical padding in markup never
changes the height.

| Variant | Class | Fill | Border | Label | Padding-x | Shadow | Pressed | Disabled |
|---|---|---|---|---|---|---|---|---|
| **Primary** | `shbz-btn-primary` | `accent-grad` (90°) | none | `#ffffff`, 700 | from markup (18–26; use **22**) | `0 6px 18px accent-shadow` | scale 0.97 | fill `seg-bg`, label `seg-text`, opacity 1, no shadow |
| Primary large | `+ shbz-btn-primary--lg` | same | | 15 px | 24, **height 48** | same | | same |
| Primary field | `+ shbz-btn-field` | same | | 15 px | 24, **height 52** (pairs with an input) | same | | same |
| **Outline** | `shbz-btn-outline` | `card-bg` | 1.5 `outline-border` | `tab-text`, 600 | 16 | none | scale 0.97, border → `outline-hover` | opacity 0.6 |
| Outline large / field | `--lg` / `--field` | | | 15 px | 24, height 48 / 52 | | | |
| **Dark** | `shbz-btn-dark` | `tab-active-bg` (ink / off-white) | 1.5 transparent | `tab-active-text`, 700 | 22 | none | scale 0.97 (hover: brightness 1.25 light / 0.85 dark) | opacity 0.45 |
| **Danger** | `shbz-btn-danger` | `card-bg` | 1.5 `danger-outline` | `danger-solid`, 600 | 20, icon gap 6 | none | scale 0.97, fill → `red-soft` | opacity 0.45 |
| Danger small | `+ shbz-btn-danger--sm` | | | 13 px | 14, **height 36** | | | |
| **Danger solid** | `shbz-btn-danger-solid` | `danger-solid` | 1.5 transparent | `#ffffff`, 700 | padding 11 × 20 (≈ 46 high on web; use 44) | none | scale 0.97 (hover brightness 1.08) | opacity 0.45 (0.6 in dialog) |
| **Danger icon** | `shbz-btn-danger-icon` | transparent | 1.5 transparent | glyph `×`, 17 px, `danger-text`, opacity 0.55 | 26 × 26 circle | none | opacity 1, fill `red-soft`, border `danger-outline` | opacity 0.3 |
| Danger icon raised (over images) | `--raised` | `card-bg` | `soft-border` | `text-muted`, opacity 1 | 26 × 26 | `0 2px 6px rgba(15,23,42,0.14)` | fill `red-soft`, glyph `danger-text` | opacity 0.4 |
| **Icon circle** (gear, bell, burger) | `shbz-icon-circle` | `card-bg`/transparent | 1.5 `outline-border` | icon 18–20, `text-strong` | 40 × 40 circle | none | border `outline-hover` | — active: border `text-strong`, fill `tab-hover` |
| **Tonal** (legacy, 1 use) | `ui-button-tonal` | `--theme-accent-soft` | 1.5 transparent | `green-text` | min-height 44 | none | fill `accent-soft-hover` | opacity 0.45 |
| **Text link button** | inline | none | none | 13 px 600; `accent-solid` ("Сегодня", "Прочитать все"), `danger-solid` ("Очистить"), `text-soft` ("Показать"/"Скрыть" password) | — | — | opacity | — |

Legacy aliases still present in JSX: `ui-button-primary` ≡ Primary (min-height 44, shadow
`0 5px 14px`, disabled opacity 0.45), `ui-button-secondary` ≡ Outline (disabled opacity 0.45),
`ui-button-danger` ≡ Danger. Build one RN `Button` with
`variant: "primary" | "outline" | "dark" | "danger" | "dangerSolid" | "tonal"` and
`size: "sm" (36) | "md" (44) | "lg" (48) | "field" (52)`.

Loading state: label swaps to a pending string ("Входим…", "Удаляем…") and the button is disabled; where a
spinner is shown it is `.shbz-spinner`: 14 × 14 ring, 2 px `currentColor`, top transparent, 0.7 s linear rotation.

Rule: never place a second gradient element next to the primary button.

### 5.2 Text input, textarea, note field, search

**Input** (`.shbz-input`): width 100 %, height 52 (`--shbz-field-h`), padding 0 16, font 16/400,
text `text-strong`, fill `input-bg`, border 1.5 `input-border`, radius 12, placeholder `placeholder`.
**Focus**: border becomes transparent and a 1.5 px **gradient border** (`accent-grad`) takes its place
(`background-clip: padding-box, border-box`) — no ring, no size change. RN: wrap the `TextInput` in a
`LinearGradient` with 1.5 padding and an inner view filled with `input-bg` (radius 12 outer / 10.5 inner),
shown only when focused; unfocused = plain border.

Label above: 13/600 `label`, gap 9. Field-to-field gap 18.
Password field: right padding 88; inside-right text button (34 high, radius 12, 13/600 `text-soft`)
«Показать» / «Скрыть» (`dict.login.showPassword` / `hidePassword`; en "Show" / "Hide").

**Textarea** (`.shbz-textarea`): min-height 96, padding 14 × 16, 15/400, lh 1.5, same border/focus.

**Note field** (`.shbz-note-field`, the student's sticker): min-height 58, padding 10 × 14, 14, lh 1.5,
fill `soft-bg`, border 1.5 **dashed** `input-border` while empty → **solid** when it has text; focus:
solid border `input-border-focus`, fill `input-bg`, ring `0 0 0 4px input-ring`. `maxLength 240`, 2 rows,
autosave 650 ms after typing and on blur; "Сохранено" flash 1600 ms in `green-text` 12/600.

**Search pill** (`.shbz-search`): height 46, width 300 on desktop, **100 % on phones**, padding 0 18,
border 1.5 `outline-border`, radius 12, fill `card-bg`, gap 9; magnifier 16 px stroke `kicker` 2.2
(`<circle cx=11 cy=11 r=7/>`, `<line 16.5,16.5 → 21,21/>`); inner input 14 px, borderless; focus-within
border `accent-solid`; submit arrow 20 px `M5 12h14M13 6l6 6-6 6` stroke 2.6. Error text below: 12/500 `red-text`.
Placeholder `dict.numberSearch.placeholder` — «Найти номер» / "Find a problem".

**Read-only field** (`.ui-readonly-field`): fill `soft-bg`, border 1.5 `soft-border`, radius 16, text `text-muted`.

**File row** (`FileDropInput`): label 13/600; row radius 12, border 1 `soft-border`, fill `soft-bg`,
padding 13 / 14 right / 18 left; file name 14 (600 `text-strong` when chosen, 400 `text-soft` when not);
dark button «Выбрать файл» / «Заменить файл» ("Choose file" / "Replace file"); helper 12.5 `kicker`.

### 5.3 Checkbox, check-row, switch

**Checkbox** (`.shbz-checkbox` / non-input twin `.shbz-check-mark`): 22 × 22, border 2 `input-border`,
radius 7, fill `input-bg`. Checked: border + fill `accent-solid`, white check
`<path d="M2.2 6.4 4.9 9 9.8 3.4" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
(viewBox `0 0 12 12`, drawn 13 px). Check pops in: scale 0.4 → 1, opacity 0 → 1, 220 ms,
`cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot). Pressed: scale 0.92. Disabled: opacity 0.5.

**Check-row** (`.shbz-check-row`, selectable student rows): row padding 10/12 right/14 left, gap 12,
radius 12, fill `soft-bg`, border 1.5 transparent, text 14/600 `text-strong`, name truncates, checkbox
pinned right. Selected: border `accent-solid`, fill `green-soft`. Unselected rows are at opacity 0.72.

**Switch** (`.shbz-switch`): track 46 × 26, radius 999, fill `seg-bg`, border 1.5 `input-border`; knob
20 × 20 white circle at left 3.5, shadow `0 1px 3px rgba(10,10,10,0.25)`. On: track fill `accent-grad`,
border transparent, knob translateX **19.5**. Transition 200 ms (`--duration-slow`), knob easing
`cubic-bezier(0.77, 0, 0.175, 1)`. Label to the right, gap 11: title 14/600 `text-strong`, optional
sub-line 12 `text-muted`.

### 5.4 Cards and containers

| Primitive | Class | Anatomy |
|---|---|---|
| **Card** | `.shbz-card` | fill `card-bg`, border 1 `card-border`, radius 16, shadow `card`. Padding via `.shbz-section-pad` = 28 (18 on phones) |
| **Section** | `SectionCard` | title row (`.shbz-section-title` 20/700, optional description 14 `text-muted` with class `ui-hint`, optional right-aligned action) + a Card below (gap 18) |
| **Soft panel** | `.shbz-panel-soft` (= `ui-panel-soft`, `ui-card-soft`, `ui-settings-card`, `ui-mini-stat-card`, `ui-action-card`, `ui-metric-pill`) | fill `soft-bg`, border 1 `soft-border`, radius 16, **no shadow**; usual padding 20 or 18 × 20 |
| **Legacy surface** | `.ui-surface`, `.ui-state-shell`, `.ui-file-card`, `.ui-section-card` | same as Card but shadow `surface` |
| **Nav card** | `ShbzNavCard` | Card with `overflow: hidden`, padding 0; **5 px gradient band** on top (`accent-grad`); body padding 22, gap 18: kicker 10.5/700/1.2 UPPER `kicker` → title 17/700 (2-line clamp, reserve 2.7em) → stats row (gap 26; each: label 10/600/0.6 UPPER `kicker`, value 23/800 `text-strong`, margin-top 2) → optional meta 13/600 `text-muted` → footer buttons row (gap 10, pinned to bottom). The only place the accent is decoration |
| **Number card** | `.teacher-number-card` (`NumberSelectCard`) | radius 16, border 1 `soft-border`, fill `card-bg`, padding 16; row: check-mark (left) + status badge (right); title «№ {number}» 18/600 (`dict.topics.widgets.numberLabel`: «№ {number}» / "No. {number}"); condition (KaTeX) 14; footnote 12 `text-muted`. Selected: 2 px ring `accent-solid`. Whole card toggles; the formula block stays scrollable/selectable |
| **Compose card** | `LessonComposeCard` | radius 16, border 1.5 **dashed** `input-border`, padding 16 × 20, gap 14; 36 × 36 circle `green-soft` with «+» 20/700 `green-text`; title 15/700; hint 12 `text-muted` |
| **Metric pill** | `.ui-metric-pill` (`PageHeader.metrics`) | soft panel, min 120 × 72, column: label 12/600 `kicker` over value 14/800 (tone colour, §4.4) |
| **Avatar** | `.shbz-avatar` | 42 × 42 circle, `accent-grad-diag` (135°), initials 14/800/0.5 white. Initials = first letters of the first two words of the name, upper-cased; `?` if empty |
| **Title dot** | `.shbz-dot` | gradient circle: 12 next to `.shbz-h1`, 10 next to legacy title, 9 on login. Vertically centered on the line, gap 12 |

Two-floor rule: page → card (shadow) → soft panel (tone + hairline). No third level.

### 5.5 Page header

`ShbzPageHeader { kicker?, title, aside? }`: row with 24 gap, 40 bottom margin. Left: kicker
(12/700/1.6 UPPER, `kicker`) and, 10 below, the title (26 on phones/800/−1) followed by the 12 px gradient
dot. `aside` (search pill, actions) is **full width under the title on phones**, right-aligned from 640 px.

Legacy `PageHeader` (6 files) adds: back link (14/600 `text-muted`, e.g. «← Ко всем темам» /
"← All topics"), description (14 `text-muted`), metric pills, actions row.

### 5.6 Navigation chrome (site) → mobile mapping

Site top bar (`.shbz-topbar`, sticky, fill `page-bg`, bottom hairline `header-border`, padding 14 × 16):
logo 24 px left; on phones the right side holds three 40 × 40 circles: **bell**, **gear**, **burger**.
The burger opens a panel under the bar (fill `card-bg`, padding 16, bottom hairline) over a
`rgba(0,0,0,0.2)` blurred overlay: vertical list of `.shbz-tab` links (gap 4), then a separator
(`soft-border`), then avatar 42 + name 14/700 + role 12 `text-soft` + outline «Выйти» / "Log out".

Desktop tab bar (`.shbz-tabbar`): inline pill, padding 6, gap 4, border 1.5 `tab-border`, radius 16, fill
`card-bg`. Tab (`.shbz-tab`): padding 9 × 18, radius 12, 14/600, colour `tab-text`, lowercase label.
Active: fill `tab-active-bg`, label `tab-active-text` — an **inverted ink pill** that slides between tabs
(§6.4). Hover/pressed: `tab-hover`.

Icons (inline SVG, 24 × 24 viewBox, `fill: none`, `stroke: currentColor`, round caps/joins):

- Gear (18 px, stroke 1.7): `<circle cx="12" cy="12" r="3.2"/>` +
  `M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z`
- Bell (18 px, stroke 1.9): `M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9` + `M13.7 21a2 2 0 0 1-3.4 0`
- Burger (20 × 20 viewBox, stroke 1.5): lines y = 5, 10, 15 from x 3 to 17; close: `5,5→15,15` and `15,5→5,15`
- Chevron (14 px, stroke 2.5): `M6 9l6 6 6-6`
- Check (14 px, stroke 2.5): `M5 13l4 4L19 7`; dropzone check `M5 13l4 4 10-10` (stroke 2.2); tick `M4 12.5l5 5L20 7`
- Calendar (16/12 px, stroke 2/2.2): `<rect x="3" y="5" width="18" height="16" rx="3"/>`, lines `3,10→21,10`, `8,3→8,7`, `16,3→16,7`
- Copy (16 px, stroke 2): `<rect x="9" y="9" width="13" height="13" rx="2"/>` + `M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1`
- Flame (13 px, **filled** `streak-flame`): `M12 2c1 3-1.5 4.5-1.5 7A3.5 3.5 0 0 0 14 12c0-2 1.5-3 1.5-3 1 4 .5 5-.5 7a4 4 0 1 1-7-3.5C9.5 9 11 7 12 2z`
- Month arrows are the characters `←` `→`; delete icon is the character `×`.

**Mobile translation**: keep a slim header (logo or screen title + bell circle with counter + gear
circle) and move sections to a native **bottom tab bar** styled from the tab-bar tokens: bar fill
`card-bg`, top hairline `header-border`; active item = ink pill (`tab-active-bg` fill, radius 12,
`tab-active-text` label 14/600… or icon + label) sliding between items; inactive `tab-text`. Lowercase
labels from `dict.nav.{student|teacher|developer}.*`. Section counts per role exceed 5 (student 6,
teacher 6, developer 5, each excluding settings) — see open question Q4.

### 5.7 Tabs and segmented controls

**Segmented control** (`.shbz-seg`): inline track, padding 5, gap 4, radius 12, fill `seg-bg`. Button
(`.shbz-seg-btn`): padding 9 × 16, radius 9, 13.5/600, colour `seg-text`. Selected: fill
`seg-active-bg`, shadow `segment`, label **`accent-solid`** — or `text-strong` with the `--plain`
modifier (used for in-page navigation tabs). The selected fill is a separate sliding indicator element
(§6.4). Modifiers: `--fill` (full width, equal flex, single row, padding-x 6) — settings blocks;
`--fill-mobile` (same, only < 640 px) — teacher's student tabs. On very narrow screens (< 360 px ru,
< 430 px en) short labels are substituted (`shortLabel`).

Used for: theme (Системная/Авто · Светлая · Тёмная), hints (Включены · Скрыты), language
(Русский · English; compact RU · EN on login), topic view/edit («Просмотр» · «Редактирование»),
student detail tabs («Проверка ДЗ · {n}» · «Выдать ДЗ» · «Занятия»).

**Status / result option group** (`ResultToggle`): 2 × 2 grid on phones (gap 6, equal row heights), a row
from 640 px. Button: radius 12, border 1, min-height 44, 600; size `lg` 13.5 px, `md` 12 px; label may
wrap inside the button. Inactive = `ui-status-button`; active = the status option style (§4.1). Tapping
the active option clears it (`null`). Disabled opacity 0.6. Activating plays the "stamp" (§6.5).

### 5.8 Chips and badges

| Primitive | Geometry | Colours |
|---|---|---|
| **Chip** `.shbz-chip` + `-green|-yellow|-red` | padding 6 × 13, radius 8, 12.5/700, no border | soft fill + status text |
| **Muted badge** `.shbz-badge-muted` | same box, 12.5/600 | fill `tab-hover`, text `kicker` |
| **Row chip** `.shbz-chip--row` (next to buttons in a row) | height 44, padding 0 16, radius 12, 14/600, centered | as its colour class |
| **Status badge** `Badge` + `subtleClassName` | padding 4 × 10, border 1, radius 12, 12/500, lh 18 → 28 high | §4.1 |
| **"Not marked" badge** `Badge` + `ui-badge-soft` | padding 4 × 10, no border, radius 8, 12/600 | fill `tab-hover`, text `kicker` |
| **Unread counter** | min 18 × 18, padding-x 4, circle, 10.5/800 white, fill `danger-solid`, offset −4/−4 on the bell; shows `9+` above 9 | |
| **Count chip** `.ui-chip-count` | 1 px `soft-border`, soft fill, `text-muted` | |

### 5.9 Dialogs (confirm) and sheets

`ConfirmDialog` (used through `DeleteButton`): overlay `rgba(15,23,42,0.45)`; on ≥ 641 px a centered card
(max-width 448, or 576 with `wide`; max-height 85vh; scrollable) with a 3 px backdrop blur;
**on ≤ 640 px it is a bottom sheet**: overlay aligned to the bottom with no padding, card full width,
`max-height: 88vh`, radius `16 16 0 0`, no blur ("дорого для школьных телефонов").
Card = `.shbz-card` with padding 24:

1. Kicker 12/700/1.6 UPPER, colour **`danger-solid`** — `dict.topics.widgets.confirm.kicker`
   («Подтверждение» / "Confirmation").
2. Title 24/800/−0.5 `text-strong` (e.g. «Удалить тему?» / "Delete this topic?").
3. Description 14, lh 24 (always explains the consequences; may contain a list and a consent checkbox).
4. Buttons row (margin-top 20, gap 12, wraps): **Outline** cancel (auto-focused) — «Отмена» / "Cancel";
   **Danger solid** confirm — «Да, удалить» / "Yes, delete"; pending label «Удаляем…» / "Deleting…".

Behaviour: tap on overlay / Esc / cancel close it (all blocked while `isPending`); `confirmDisabled`
blocks confirm until a consent checkbox is ticked; body scroll is locked while open; close plays the exit
animation first (§6.6). `DeleteButton` trigger variants: `default` (Danger button «Удалить» / "Delete"),
`sm` (36 high), `icon` («×» circle, needs an aria label).

RN: implement as a modal bottom sheet (`@gorhom/bottom-sheet` or RN `Modal` + Reanimated) with the same
content order; hardware back = cancel unless pending.

### 5.10 Notices (inline banners) — the site has **no toasts**

There is no toast / snackbar component anywhere in the code. Feedback is given by:

| Pattern | Look | Used for |
|---|---|---|
| `shbz-notice-error` | radius 12, border 1 `danger-border`, fill `danger-bg`, text `danger-text`; padding 12 × 16, 14/500 | form errors (login etc.) |
| `shbz-notice-success` | radius 12, fill and border `green-soft`, text `green-text` | "saved" banners after redirects (`?saved=1`) |
| `ui-notice-success` / `-warning` / `-error` | radius 12, 1 px status border, soft fill, status text (§4.1 colours); padding 12 × 16, 14 | legacy banners; warning also for "migration not applied" notices |
| Inline save flash | 12/600 `green-text` «Сохранено» for 1600 ms; 12/500 `text-muted` while saving | note autosave |
| Copy pill | see §5.14 | copy to clipboard |
| Field error | 12/500 `red-text` under the control | search, forms |

Recommendation for mobile: keep inline banners at the top of the affected card (they survive navigation
the same way the site's redirect query params do) and, for transient confirmations, a toast styled like
the copy pill: fill `tab-active-bg`, label `tab-active-text` 12–13/700, radius 999, padding 5 × 11
(scale up to 10 × 16), shadow `0 4px 12px rgba(10,10,10,0.18)`.

### 5.11 Select

`ShbzSelect { value, onChange, options: {value,label}[], disabled?, placeholder?, ariaLabel?, size?, menuWidth? }`.

Trigger sizes:

| size | height | radius | font | padding-x |
|---|---|---|---|---|
| `md` (default) | 50 | 14 | 15 | 16 |
| `sm` | 46 | 12 | 14 | 14 |
| `xs` | 38 | 10 | 13 | 12 |

Trigger: full width, fill `input-bg`, border 1.5 `input-border`, weight 600, text `text-strong` (or
`placeholder` when nothing is selected; default placeholder `dict.topics.widgets.selectPlaceholder` —
«Выбрать» / "Select"), label truncates, chevron 14 px stroke `kicker` 2.5 on the right. Open: border
`input-border-focus`, ring `0 0 0 4px input-ring`, chevron rotates 180° in 180 ms
(`cubic-bezier(0.77,0,0.175,1)`). Disabled: opacity 0.55.

Menu (portalled, opens 6 px below; flips above when < 240 px below and more room above): width = trigger
width (min 120), max-height clamp 160–300, scrollable, radius 12, border 1 `card-border`, fill `card-bg`,
padding 6, shadow `popover`, entry animation `shbz-dropdown-in` (§6.6). Option: padding 10 × 12, radius
12, weight 600, font = trigger font; selected: fill `--theme-accent-soft`, text `green-text`, trailing
check 14 px; pressed/hover: fill `tab-hover`.

The native `<select class="shbz-select">` variant has the same look (50 high, radius 14, 15/600, chevron
`#9AA0A6`, turning `#16b07e` on focus together with the gradient border); `--sm` = 46 / 12 / 14.

RN: trigger identical; the menu becomes a bottom sheet list (same option row style, 44 min height) for
long lists and may stay an anchored popover for ≤ 6 options.

### 5.12 Date-time picker

`ShbzDateTimePicker { value: string, onChange, onCommit?, disabled?, placeholder?, variant?: "field" | "compact" }`.
Value format is a local `YYYY-MM-DDTHH:mm` string (empty string = no value).

Trigger `field`: height 46, radius 12, border 1.5, padding-x 14, text 14/500 (or `placeholder` colour),
calendar icon 16 right. Trigger `compact`: inline, radius 8, border 1, padding 6 × 10, 12.5/600, icon 12
left, ring 3 px when open. Display format `dd.MM.yyyy, HH:mm` via `Intl` (`ru-RU`; `en-GB` →
`dd/MM/yyyy, HH:mm`). Placeholder `dict.topics.widgets.datetime.placeholder` — «Выбрать дату и время» /
"Pick date and time". Open state: border `input-border-focus` + ring; disabled opacity 0.55.

Popover: width 308 (max 92vw), radius 16, border 1 `card-border`, fill `card-bg`, padding 16, shadow
`popover`, max-height 300–520, flips up when needed (estimated height 470). Contents top to bottom:

1. Header: outline button `←` · month + year 14/800 («Октябрь 2026»; months from
   `datetime.months`) · outline button `→` (aria «Предыдущий месяц» / «Следующий месяц»).
2. Weekday row: 7 columns, 10/700/0.8 `kicker` — «ПН ВТ СР ЧТ ПТ СБ ВС» / "MO TU WE TH FR SA SU". Week starts on **Monday**.
3. Day grid: 6 rows × 7 (always 42 cells), gap 4; cell height 36, radius 12, 13/600. In-month `text-strong`,
   out-of-month `cal-out-text` (still tappable); **selected**: fill `accent-grad`, text white; **today**
   (not selected): inset ring 1.5 `accent-solid`.
4. Time row (margin-top 12, gap 8): label «Время» / "Time" 11/700/1 UPPER `kicker`; hours select (`xs`,
   width 78, options `00`–`23`, placeholder `--`); `:`; minutes select (`xs`, width 78, options `00`–`59`).
5. Footer (margin-top 14, top hairline `soft-border`, padding-top 12): left text button «Очистить» /
   "Clear" (`danger-solid`); right: text button «Сегодня» / "Today" (`accent-solid`) + dark button
   «Готово» / "Done".

Rules: picking a day keeps the already chosen time, otherwise sets **23:59**; picking hours with no value
uses today and minutes 59; picking minutes with no value uses hours 23; «Сегодня» = today 23:59 and jumps
the view to the current month; «Очистить» sets `""` and closes; `onCommit` fires once when the popover
closes. Opening resets the visible month to the selected date (or today).

RN: bottom sheet with the same grid (cells can grow to 44), or the platform picker wrapped so that the
"no time chosen → 23:59" default and the Clear action are preserved.

### 5.13 Progress

- `.shbz-progress-track`: height 8, radius 999, fill `progress-track`; `.shbz-progress-fill`: `accent-grad`, radius 999.
- `ProgressBar { value 0–100, size }`: track height `sm 8 | md 10 | lg 12`, same colours; value clamped to
  0–100; `role="progressbar"`. Fill grows with a 420 ms spring-like ease (`--anim-spring`).
- Upload bar inside a dropzone: max-width 280, height 6, margin-top 6, track `progress-track`, fill
  `accent-grad`, width follows the real upload percentage with a 220 ms linear transition.
- Completion percent helper: `completionPercent(done, total) = total ? round(done / total × 100) : 0`.

### 5.14 Copy row

`CopyValue`: the whole row is the tap target (min-height 44, radius 10); value text + copy icon 16
(opacity 0.55). On copy: background flashes from `--theme-accent-soft-hover` back to its own colour over
900 ms; a pill «Скопировано» / "Copied" (`dict.topics.widgets.copy.copied`) rises 4 px above the row
(fill `tab-active-bg`, text `tab-active-text` 12/700, padding 5 × 11, radius 999) and hides after
**1300 ms**. Screen-reader text «{label} скопирован» / "{label} copied". Title «Нажмите, чтобы
скопировать» / "Click to copy". RN: `expo-clipboard` + the same pill (plus optional haptic).

### 5.15 Dropzone → mobile file/photo picker

Site component `AnimatedDropzone` (state machine `idle → drag → uploading → success`, one `data-state`):
dashed 1.5 `input-border`, radius 16, fill `dropzone-bg`; icon tile 44 × 44 radius 12 `green-soft` /
`green-text`; title 14.5/700; optional subtitle; upload bar. `uploading`: border solid
`mix(accent-solid 55 %, input-border)` (`#73c8ad` light / `#329071` dark). `success`: solid border
`green-text`, fill `green-soft`, icon drops out and a check is drawn, title cross-fades to the success
text in `green-text`, held for **900 ms** (`SUCCESS_HOLD_MS`), then back to idle.

Drag-and-drop does not exist on a phone: keep the tile + title + the `uploading` and `success` states;
the tap opens camera / gallery / files. Allowed uploads on the site: `.pdf .docx .png .jpg .jpeg`.
Newly added file cards enter with `shbz-file-in` (opacity 0 + translateY 6 + scale 0.95 → rest, 280 ms);
a card being uploaded shows the preview at opacity 0.55 with a 22 px spinner
(2.5 px ring `green-soft`, top `accent-solid`, 800 ms) and a shimmer sweep (1.2 s).

### 5.16 Popover panel (notifications) — anatomy to reuse for sheets

Width `min(340, viewport − 16)`, radius 16, border 1 `card-border`, fill `card-bg`, shadow `popover`.
Header row (padding 12 × 16, bottom hairline `soft-border`): title 14/800 + text button «Прочитать все» /
"Mark all as read" (12.5/600 `accent-solid`, only when there are unread). List max-height 380, rows
(padding 12 × 16, bottom hairline `row-border`, gap 10): 8 px dot (`accent-solid` if unread, transparent
if read, margin-top 7) + title 13.5 (800 unread / 600 read) + body 12.5 `text-muted` + time 11.5/600
`kicker`. Pressed row fill `soft-bg`. Empty: centered 14 `text-muted`, padding-y 40 — «Уведомлений нет» /
"No notifications". Loading: 3 skeleton rows of identical geometry cross-fading to content (§6.8).

### 5.17 Skeletons and loading states

`.ui-skeleton`: block with the **same height and radius as the content it replaces** (radius comes from
markup: full for text pills, 16 for cards), base colour §1.7, with a shimmer band sweeping left → right
(`translateX(-100% → 100%)`, **1.2 s linear infinite**; 2nd and 3rd siblings delayed 150 / 300 ms).
Skeleton → content swap is a cross-fade (160 ms, content delayed 120 ms), never a hard replace.
Reduced motion: shimmer off, static blocks.

Shipped skeleton layouts (`components/app-state-shells.tsx`):

- `AuthLoadingState` — centered card (max-width 448, padding 24): 56 × 56 tile (radius 8), 12 × 112 pill,
  40 × 208 block; two "label 12 × 64/80 + field 48 high" pairs (radius 8); a 48-high button block.
- `DashboardLoadingState` — header skeleton (44 × 44 tile + two text pills; profile capsule) + section body.
- `DashboardSectionLoadingState { showSectionTabs? }` — optional row of four 44-high pills
  (widths 112, 112, 128, 144); four 160-high cards (radius 16); one 220-high and one 340-high block (radius 12).
- `StudentDeadlinesCalendarSkeleton` — card min-height 430 with a centered 20 px spinner, a
  "button · title · button" row (32 × 80, 24 × 176, 32 × 80), 7 weekday blocks (24 high, radius 8) and 42
  day blocks (48 high, radius 12), pulsing.

Spinners: `.shbz-spinner` 14 px (inline in buttons), 20 px (calendar), 22 px (uploading file).

### 5.18 Empty and error states

- **Empty section** (`ui-panel-soft rounded-[16px] border-dashed px-5 py-10 text-center`): soft panel with
  a **dashed** 1 px `soft-border`, radius 16, padding 40 × 20, centered; title 24/600 `text-strong`; hint
  14 `text-muted`, margin-top 8. It enters with `ui-enter-item` 260 ms. Examples:
  «Номера пока не добавлены» / «Добавьте номера во вкладке «Редактирование».» —
  "No problems yet" / "Add problems on the Edit tab."
- **Missing file** (`FileResourceCard`): dashed soft panel, padding 24 × 16, 14 `text-muted`.
- **Empty list inside a popover**: centered 14 `text-muted`, padding-y 40.
- **Route error** (`RouteErrorState`): centered card (max-width 768, padding 24/32, radius 16, shadow
  `surface`, pop-in animation): 56 × 56 tile radius 8, fill `red-soft`, glyph «!» 18/600 `red-text`;
  title 30/600; description 14, lh 28, `text-muted`; buttons row centered gap 12: Primary retry + Outline home.
  Copy: `dict.shells.errorTitle` «Раздел временно недоступен» / "This section is temporarily unavailable";
  `dict.shells.errorDescription` «Во время загрузки кабинета что-то пошло не так. Попробуйте повторить
  запрос или вернуться на главную страницу.» / "Something went wrong while loading your account. Try
  again or go back to the home page."; `dict.common.retry` «Попробовать снова» / "Try again";
  `dict.common.home` «На главную» / "Home". Login variant: `dict.shells.loginErrorTitle` «Не удалось
  открыть вход» / "Could not open the sign-in page", `loginErrorDescription`.
- **Not found** (`app/not-found.tsx`): same card (max-width 576): «404» 64/700 `text-muted`; title 20/600
  `dict.shells.notFoundTitle` «Страница не найдена» / "Page not found"; description
  `notFoundDescription` «Возможно, эта страница была удалена или вы перешли по неверной ссылке.» /
  "This page may have been removed, or the link you followed is wrong."; Primary «На главную» / "Home".

### 5.19 Streak hero and weekly activity (visual only)

Hero (`.shbz-streak-hero`): radius 16, border 1 `streak-border`, gradient fill `streak-bg` (135°),
padding 22 × 24. Row: kicker 12/700/1.2 UPPER `streak-text` + counter pill (radius 8, padding 6 × 12,
fill `streak-pill-bg`, flame 13 px + count 12.5/800 `streak-text`). Headline 26/800/−0.5 below (margin-top 12).
Tier via `data-streak-tier` (§1.5). Two soft panels below (padding 18 × 20): kicker 12/700/1 UPPER + value 19/800.

Week panel: radius 16, border 1 `soft-border`, fill `panel-bg`, padding 24. Seven equal columns (gap 10):
cell 64 high, radius 12, fill `week-cell`, mark at the bottom (padding-bottom 8) — **active day = bar
20 × 8** `accent-solid`, **empty day = dot 8 × 8** `week-dot-off` (shape duplicates colour); today has an
inset 1.5 ring `accent-solid`; label below 12/700 (`accent-solid` + underline for today, else `kicker`).

### 5.20 Calendar grid (visual only)

Card with header (outline prev · month 20/800 · outline next), weekday row 12/700/1 UPPER `kicker`, 7-col
grid gap 10 (use 4–6 on phones). Cell: height 64, radius 12, border 1, day number 15/600, optional
9 × 9 diamond mark (radius 3, rotated 45°) 5 below. Colours §1.5. Today: inset ring 2 `cal-ring`; open
day: outer ring 3 `cal-ring`. Day popover: radius 16, padding 14, soft header block (radius 12, padding
12 × 16, kicker 10.5 + date 16/800); **on phones it spans the full grid width** — make it a bottom sheet.
Legend row: diamond + 13/600 `text-muted` labels, gap 22.

---

## 6. Motion rules

### 6.1 Principles (from `DESIGN.md` + `globals.css`)

- Motion is feedback, never decoration; 150–200 ms for ordinary transitions.
- Animate only `transform`, `opacity` (and height for collapses).
- No infinite animation at rest. Infinite motion is allowed only as a loading indicator (spinner,
  shimmer, upload).
- Exit is always faster than entry.
- Everything is disabled under reduced motion (`prefers-reduced-motion: reduce`): movement is removed,
  opacity fades may stay. RN: `AccessibilityInfo.isReduceMotionEnabled()` / Reanimated `useReducedMotion()`.
- On touch devices (`hover: none, pointer: coarse`) entry animations are shorter: `ui-fade-slide` 150 ms,
  `ui-pop-in` 120 ms, pressable transitions 100 ms; number cards lose their shadow.

### 6.2 Tokens

| Token | Value |
|---|---|
| `--anim-spring` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--anim-standard` | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| overshoot (checkbox) | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| bounce (streak) | `cubic-bezier(0.22, 1.4, 0.36, 1)` |
| `--duration-fast` | 150 ms |
| `--duration-base` | 180 ms |
| `--duration-slow` | 200 ms |

Reanimated: `Easing.bezier(x1, y1, x2, y2)` with the same control points.

### 6.3 Press feedback (the system's signature)

Every button / pressable: `scale(0.97)` reached in **60 ms**, released over 180 ms `--ease-out`
(140 ms for `.ui-pressable`). Checkbox: `scale(0.92)`. Disabled elements never transform.
Desktop-only lifts (`translateY(-1px)` primary, `-2px` card) are not ported.

### 6.4 Sliding tab indicator (A02)

The selected fill of the tab bar and of segmented controls is a separate absolutely positioned element
that **moves** to the new tab: `transform` + `width` + `height`, 260 ms `--anim-spring`; opacity 180 ms.
Motion modes (`tabIndicatorMotion`): `slide` only when the active tab changes; `none` on first layout,
resize, font load (jump into place without animation); `fade` when nothing is active (e.g. the settings
screen is outside the tab bar) — fades out in place and fades back in under the new tab. Tab labels
recolour over 150 ms together with the indicator. The content under tabs re-enters with
`ui-enter-item` 180 ms `--ease-out`.

### 6.5 Catalogue

| ID | What | Spec |
|---|---|---|
| A01 | Page / list cascade (`.ui-enter`) | each direct child: opacity 0 → 1, translateY 10 → 0, 240 ms `--anim-spring`, delay `index × 45 ms`, capped at index 6 (270 ms); nested cascade adds 120 ms |
| — | `ui-fade-slide` | opacity + translateY 10, 250 ms `--ease-out` (150 ms on touch) |
| — | `ui-pop-in` | opacity + scale 0.97 + translateY 8, 180 ms `--ease-out` (120 ms on touch) |
| A03 | Status "stamp" on activation | scale 0.94 → 1.03 (60 %) → 1, 220 ms `--anim-spring`; tick: scale 0.6 → 1 (220 ms) + stroke draw 260 ms, 60 ms delay (`stroke-dasharray 26`) |
| A03 | Progress fill | width, 420 ms `--anim-spring` |
| A04 | Count-up numbers (`useCountUp`) | 0 → target, **600 ms**, easeOutCubic `1 − (1 − p)³`; only for server statistics, never for user-edited counters; reduced motion → final value |
| A04 | Chart bars | height, 520 ms `--anim-spring`, delay `index × 70 ms` |
| A05 | Streak (the only loud animation; only when the counter really grew) | `useStreakMotion`: `ignite` (0 → > 0), `grow` (increase), `drop` (decrease), state held **900 ms**. Flame: scale 1 → 1.45 / rotate −8° (30 %) → 0.92 / 5° (60 %) → 1, 900 ms bounce + orange glow `drop-shadow 0 0 10px rgba(242,146,46,0.85)` at 40 %; count: translateY −3 + scale 1.18 at 35 %, 700 ms; hero: scale 1.015 + shadow `0 8px 30px rgba(242,146,46,0.35)` at 40 %, 900 ms; `drop`: horizontal shake ±3 px, 500 ms. Week cells cascade: opacity + scale 0.88 → 1, 320 ms, 50 ms stagger |
| A06 | Urgent deadline "breath" | ring `0 0 0 0 → 0 0 0 12px` fading from `accent-solid` 35 %, 1.8 s `--ease-out`, **2 iterations**, not infinite |
| A06 | Collapse | height 320 ms `--ease-drawer` + opacity 200 ms; chevron rotates 180° in 240 ms |
| A07 | Row leaving a list | collapse height 260 ms `--ease-drawer`, opacity 180 ms, translateX 24, then remove from state after 260 ms |
| A07 | Empty state entry | `ui-enter-item` 260 ms |
| A08 | Dropzone | see §5.15; success settle `scale 1.015 → 0.985 → 1.005 → 1`, 320 ms |
| A09 | Dialogs | §6.6 |
| A10 | Realtime highlight | only for items that arrived while the screen was visible (`useFreshMarks`, mark lives **1400 ms**): entry 260 ms then background flash `accent-soft-hover → surface`, 900 ms `--ease-out`. Unread counter pops `scale 1 → 1.25 → 1`, 240 ms, when it grows (`useBump`, 260 ms) |
| A11 | Skeleton shimmer + cross-fade | §5.17 |
| — | Copy flash | §5.14 (900 ms flash, pill 220/260 ms, visible 1300 ms) |
| — | Checkbox check | 220 ms overshoot |
| — | Switch | 200 ms, knob `--ease-in-out` |
| — | Select chevron | 180 ms `--ease-in-out` |
| — | Spinner | 0.7 s linear (button), 0.8 s (file) |

### 6.6 Overlays

| Overlay | Enter | Exit |
|---|---|---|
| Dropdown / popover (`shbz-dropdown-in`) | opacity 0 → 1, scale 0.96 → 1, translateY −4 → 0, 200 ms `--ease-out`, origin = the edge it grows from (top, bottom when opened upward, top-left / top-right for edge-aligned popovers) | unmount (no exit animation) |
| Modal backdrop | opacity 0 → 1, 200 ms ease | reverse, 120 ms |
| Modal card, ≥ 641 px | opacity + scale 0.96 → 1, 200 ms `--anim-spring` | opacity → 0, scale → 0.98, **120 ms** `--ease-in-out` |
| Modal card, ≤ 640 px (**bottom sheet — the phone case**) | translateY 100 % → 0, **260 ms** `--ease-drawer` | translateY → 100 %, **160 ms** `--ease-drawer` |
| Mobile menu panel | opacity + translateY −8 + scale 0.98, 250 ms `--ease-out`; overlay 200 ms | unmount |

`useDialogExit` waits 160 ms (phone) / 120 ms before unmounting; with reduced motion it closes immediately.

---

## 7. Logo, app icon, splash

### 7.1 Logo — live text, no SVG exists

`components/logo.tsx`: the lockup is **text**, two spans with no space between them:
`<span>ШБЗ</span><span class="logo__sub">Школа</span>` → renders «ШБЗШкола». There are **no SVG paths
or image files for the logo anywhere in the repository**.

| Property | Value |
|---|---|
| Font | Montserrat **900** (Black) — `assets/fonts/montserrat/Montserrat-Black.ttf` |
| Letter-spacing | `-0.015em` (e.g. −0.36 at 24 px) |
| Line-height | 1 (stacked variant: two lines, 0.95) |
| «ШБЗ» colour | `--ink`: `#0a0a0a` light, `#ffffff` dark (`variant="on-dark"` forces white) |
| «Школа» colour | text filled with `accent-grad` (`#5ac8ea → #36e0a4`, 90°) via `background-clip: text` |
| `variant="mono"` | both parts `currentColor`, no gradient |
| Small version (`size < 22`) | class `logo--small` sets `color: --brand-deep (#0e9b80)`; used as flat colour in print / PDF |
| Sizes in use | 24 (top bar), 26 (login, top-left at 36/32 px from the corner), 160 (og:image) |
| Accessible name | «ШБЗ Школа» (`aria-label`, `role="img"`) |

og:image (`app/opengraph-image.tsx`) uses the **flat** brand colour for the suffix: white 1200 × 630
canvas, Montserrat 900, 160 px, letter-spacing −0.015em, «ШБЗ» `#0A0A0A` + «Школа» `#16C79F`.

RN implementation:

```tsx
// Flat (always safe): two nested <Text> in Montserrat_900Black
<Text style={{ fontFamily: "Montserrat_900Black", fontSize: size, letterSpacing: -0.015 * size, lineHeight: size * 1.1, color: ink }}>
  ШБЗ<Text style={{ color: "#16c79f" }}>Школа</Text>
</Text>
// Gradient suffix (matches the site header): @react-native-masked-view/masked-view + expo-linear-gradient,
// mask = the «Школа» text, gradient colors ["#5ac8ea", "#36e0a4"], start {x:0,y:0.5}, end {x:1,y:0.5}.
```

### 7.2 App icon — drawing code found

`app/icon.tsx` (favicon 32 × 32) and `app/apple-icon.tsx` (180 × 180) draw the same composition with
`next/og` `ImageResponse`: **the single letter «Ш»** from the lockup, white, Montserrat 900,
`line-height: 1`, centered on a plate filled with `LOGO_BRAND = "#16C79F"`.

| | Favicon | Apple icon |
|---|---|---|
| Canvas | 32 × 32 | 180 × 180 |
| Plate | `#16C79F`, `borderRadius: 7` (≈ 22 %) | `#16C79F`, full bleed (iOS rounds it) |
| Glyph | «Ш», `#fff`, 900, `fontSize: 19` (≈ 60 %) | «Ш», `#fff`, 900, `fontSize: 108` (60 %) |

Recommendations for the Expo app:

- `icon.png` 1024 × 1024: full-bleed `#16C79F`, white «Ш» in Montserrat Black at **≈ 614 px** (60 %),
  optically centered. No transparency, no pre-rounded corners.
- Android adaptive icon: `backgroundColor: "#16C79F"`; foreground = white «Ш» scaled to fit the 66 %
  safe zone (glyph ≈ 40 % of the 1024 canvas); monochrome layer = the same glyph.
- The gradient is **not** used on the icon in code; keep the flat brand colour for consistency with the
  web favicon (see Q2).

### 7.3 Splash

The site has no splash; the closest thing is the login background: `page-bg` + `page-glow`
(mint radial glow at the top centre) with the logo.

- Light: background `#ffffff`, centered lockup «ШБЗШкола» (ink + `#16c79f`), width ≈ 55 % of the screen.
- Dark: background `#0b0c0e` (app page colour; `LOGO_DARK_BG #101212` is the declared alternative),
  lockup with white «ШБЗ».
- `expo-splash-screen` supports a static image only, so export the lockup as a PNG with the flat brand
  colour; fade into the first screen (200 ms).
- Status bar: dark content on `#ffffff`, light content on `#0b0c0e`. The site declares no `theme-color`.

---

## 8. Ready-to-paste TypeScript theme

```ts
// theme.ts — generated from app/globals.css of the web app (ШБЗ Школа). Light and dark are equal citizens:
// never hard-code a colour in a component, always read it from `theme.colors`.

export type ThemeName = "light" | "dark";
export type ThemeMode = "system" | "light" | "dark";
export type HomeworkNumberStatus = "GREEN" | "YELLOW" | "RED";
export type LessonResultValue = "SOLVED" | "PARTIAL" | "NOT_SOLVED" | "SKIPPED";
export type StreakTier =
  | "starter" | "ember" | "amber" | "lime" | "emerald" | "cyan" | "blue" | "violet" | "rose" | "gold";

export const fonts = {
  regular: "Montserrat_400Regular",
  medium: "Montserrat_500Medium",
  semibold: "Montserrat_600SemiBold",
  bold: "Montserrat_700Bold",
  extrabold: "Montserrat_800ExtraBold",
  black: "Montserrat_900Black" // logo only
} as const;

const lightColors = {
  // surfaces
  pageBg: "#ffffff",
  cardBg: "#ffffff",
  cardBorder: "#ececee",
  softBg: "#f8f9fa",
  softBorder: "#f0f0f1",
  panelBg: "#fbfbfc",
  rowBorder: "#f4f4f5",
  headerBorder: "#efefef",
  divider: "#e4e5e7",
  // text
  textStrong: "#0a0a0a",
  label: "#2c2e33",
  textMuted: "#6a6e75",
  textSoft: "#8b8f96",
  kicker: "#63676d",
  placeholder: "#6d7076",
  onAccent: "#ffffff",
  // inputs / outlines
  inputBg: "#ffffff",
  inputBorder: "#e4e5e7",
  inputBorderFocus: "#0a0a0a",
  inputRing: "rgba(54, 224, 164, 0.15)",
  dropzoneBg: "#fbfcfd",
  outlineBorder: "#e4e5e7",
  outlineHover: "#0a0a0a",
  // tabs / segments / progress
  tabBorder: "#0a0a0a",
  tabText: "#14161a",
  tabActiveBg: "#0a0a0a",
  tabActiveText: "#ffffff",
  tabHover: "#f2f3f4",
  segBg: "#ecedef",
  segActiveBg: "#ffffff",
  segText: "#6a6e75",
  progressTrack: "#efeff1",
  // accent
  accentSolid: "#16b07e",
  accentSoft: "rgba(54, 224, 164, 0.12)",
  accentSoftStrong: "rgba(54, 224, 164, 0.18)",
  accentBorder: "rgba(22, 176, 126, 0.35)",
  accentShadow: "rgba(54, 224, 164, 0.3)",
  // status
  greenSoft: "#eaf7ef",
  greenText: "#127a4c",
  greenBorder: "rgba(27, 158, 99, 0.25)",
  yellowSoft: "#fef4e3",
  yellowText: "#8a5d05",
  yellowBorder: "rgba(201, 138, 30, 0.3)",
  redSoft: "#fceded",
  redText: "#b3202c",
  redBorder: "#f3c7c9",
  // danger
  dangerSolid: "#e5484d",
  dangerOutline: "#f3c7c9",
  dangerBg: "#fceded",
  dangerBorder: "#f3c7c9",
  dangerText: "#b3202c",
  // calendar
  calOkBg: "#fff7ea",
  calOkBorder: "#f5dfb8",
  calOkMark: "#f2a93b",
  calLateBg: "#fff5f5",
  calLateBorder: "#f5c6c9",
  calLateMark: "#e5484d",
  calCellBg: "#fbfbfc",
  calCellBorder: "#f0f0f1",
  calOutBg: "#fdfdfe",
  calOutText: "#c7cad0",
  calRing: "rgba(10, 10, 10, 0.12)",
  // streak (tier "starter")
  streakBgStart: "#fff3e4",
  streakBgEnd: "#ffe9d2",
  streakBorder: "#fbdfbe",
  streakText: "#b5701a",
  streakFlame: "#f2922e",
  streakPillBg: "rgba(255, 255, 255, 0.7)",
  weekCell: "#f1f2f4",
  weekDotOff: "#d7d9dd",
  // misc
  overlay: "rgba(15, 23, 42, 0.45)",
  skeleton: "rgba(139, 143, 150, 0.14)",
  skeletonShine: "rgba(255, 255, 255, 0.6)",
  switchKnob: "#ffffff",
  // brand
  brand: "#16c79f",
  brandDeep: "#0e9b80",
  logoInk: "#0a0a0a"
};

export type ThemeColors = typeof lightColors;

const darkColors: ThemeColors = {
  pageBg: "#0b0c0e",
  cardBg: "#131417",
  cardBorder: "#26282c",
  softBg: "#1a1c1f",
  softBorder: "#26282c",
  panelBg: "#17181b",
  rowBorder: "#222428",
  headerBorder: "#222428",
  divider: "#34373c",
  textStrong: "#f5f6f7",
  label: "#c9ccd1",
  textMuted: "#9ba0a6",
  textSoft: "#85898f",
  kicker: "#7c8087",
  placeholder: "#6a6e75",
  onAccent: "#ffffff",
  inputBg: "#0f1012",
  inputBorder: "#2c2e33",
  inputBorderFocus: "#f5f6f7",
  inputRing: "rgba(54, 224, 164, 0.18)",
  dropzoneBg: "#0f1012",
  outlineBorder: "#34373c",
  outlineHover: "#f5f6f7",
  tabBorder: "#e8e9ea",
  tabText: "#d6d8db",
  tabActiveBg: "#f5f6f7",
  tabActiveText: "#0a0a0a",
  tabHover: "#24262a",
  segBg: "#222428",
  segActiveBg: "#0f1012",
  segText: "#9ba0a6",
  progressTrack: "#26282c",
  accentSolid: "#36e0a4",
  accentSoft: "rgba(54, 224, 164, 0.14)",
  accentSoftStrong: "rgba(54, 224, 164, 0.2)",
  accentBorder: "rgba(54, 224, 164, 0.35)",
  accentShadow: "rgba(54, 224, 164, 0.3)",
  greenSoft: "rgba(27, 158, 99, 0.16)",
  greenText: "#59d49d",
  greenBorder: "rgba(89, 212, 157, 0.3)",
  yellowSoft: "rgba(201, 138, 30, 0.16)",
  yellowText: "#e8b45c",
  yellowBorder: "rgba(232, 180, 92, 0.3)",
  redSoft: "rgba(214, 69, 80, 0.16)",
  redText: "#ff8f94",
  redBorder: "rgba(229, 72, 77, 0.4)",
  dangerSolid: "#ff6b70",
  dangerOutline: "rgba(229, 72, 77, 0.4)",
  dangerBg: "rgba(229, 72, 77, 0.12)",
  dangerBorder: "rgba(229, 72, 77, 0.35)",
  dangerText: "#ff8f94",
  calOkBg: "rgba(242, 169, 59, 0.1)",
  calOkBorder: "rgba(242, 169, 59, 0.35)",
  calOkMark: "#f2a93b",
  calLateBg: "rgba(229, 72, 77, 0.1)",
  calLateBorder: "rgba(229, 72, 77, 0.35)",
  calLateMark: "#ff6b70",
  calCellBg: "#17181b",
  calCellBorder: "#26282c",
  calOutBg: "#131417",
  calOutText: "#4a4d52",
  calRing: "rgba(255, 255, 255, 0.18)",
  streakBgStart: "rgba(242, 146, 46, 0.18)",
  streakBgEnd: "rgba(242, 146, 46, 0.08)",
  streakBorder: "rgba(242, 146, 46, 0.35)",
  streakText: "#e8a35c",
  streakFlame: "#f2922e",
  streakPillBg: "rgba(0, 0, 0, 0.25)",
  weekCell: "#222428",
  weekDotOff: "#3a3d42",
  overlay: "rgba(15, 23, 42, 0.45)",
  skeleton: "rgba(30, 41, 59, 0.78)",
  skeletonShine: "rgba(255, 255, 255, 0.08)",
  switchKnob: "#ffffff",
  brand: "#16c79f",
  brandDeep: "#0e9b80",
  logoInk: "#ffffff"
};

/** Opaque equivalents of the translucent dark tokens, blended over cardBg #131417 (use on Android if needed). */
export const darkFlattenedOnCard = {
  greenSoft: "#142a23",
  yellowSoft: "#302718",
  redSoft: "#321c20",
  greenBorder: "#284e3f",
  yellowBorder: "#53442c",
  redBorder: "#67292d",
  dangerBg: "#2c1a1d",
  dangerBorder: "#5c262a",
  accentSoft: "#18312b",
  accentSoftStrong: "#1a3d33",
  accentBorder: "#1f5b48",
  inputRing: "#193930",
  calOkBg: "#29231b",
  calOkBorder: "#614824",
  calLateBg: "#28191c",
  calLateBorder: "#5c262a",
  calRing: "#3d3e41",
  streakBgStart: "#3b2b1b",
  streakBgEnd: "#251e19",
  streakBorder: "#61401f",
  skeleton: "#1c2433"
} as const;

/** Opaque equivalents of the translucent light tokens, blended over #ffffff. */
export const lightFlattenedOnCard = {
  accentSoft: "#e7fbf4",
  accentSoftStrong: "#dbf9ef",
  accentBorder: "#ade3d2",
  greenBorder: "#c6e7d8",
  yellowBorder: "#efdcbc",
  inputRing: "#e1faf1",
  calRing: "#e2e2e2",
  skeleton: "#efeff0"
} as const;

export const gradients = {
  /** linear-gradient(90deg, #5ac8ea 0%, #36e0a4 100%) — the only brand accent */
  accent: { colors: ["#5ac8ea", "#36e0a4"] as const, start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  /** linear-gradient(135deg, #5ac8ea, #36e0a4) — avatar */
  accentDiag: { colors: ["#5ac8ea", "#36e0a4"] as const, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  /** streak hero: 135deg from streakBgStart to streakBgEnd */
  streakDirection: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }
} as const;

export const radii = {
  checkbox: 7,
  sm: 8, // chips, badges
  seg: 9, // segment button + indicator
  selectXs: 10,
  md: 12, // buttons, inputs, tabs, notices, menus, status options
  select: 14,
  lg: 16, // cards, sheets, tab bar, panels, dropzone, popovers
  full: 999
} as const;

export const borders = { hairline: 1, interactive: 1.5, strong: 2 } as const;

export const space = {
  xxs: 4,
  xs: 6,
  sm: 9, // label -> field
  md: 12, // button rows
  field: 18, // form gap, section-title margin, card padding on phones
  lg: 20, // card grid gap, soft panel padding
  xl: 22, // nav card padding
  card: 18, // .shbz-section-pad at <= 640px (28 on wide screens)
  cardWide: 28,
  gutter: 16, // horizontal screen padding
  pageTop: 32,
  pageBottom: 64,
  headerGap: 40, // below page header
  sectionGap: 44 // between sections
} as const;

export const sizes = {
  buttonSm: 36,
  button: 44,
  buttonLg: 48,
  field: 52, // input and "field" buttons
  select: { md: 50, sm: 46, xs: 38 },
  dateTrigger: 46,
  search: 46,
  textareaMin: 96,
  noteMin: 58,
  iconCircle: 40,
  avatar: 42,
  checkbox: 22,
  switchTrack: { width: 46, height: 26 },
  switchKnob: 20,
  switchKnobOffset: 3.5,
  switchKnobTravel: 19.5,
  progress: { sm: 8, md: 10, lg: 12 },
  navCardBand: 5,
  titleDot: 12,
  minTouch: 44,
  spinner: 14,
  dangerIcon: 26,
  calendarCell: 64,
  pickerCell: 36
} as const;

type TextStyleToken = {
  fontFamily: string;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: "uppercase" | "none";
};

export const typography = {
  display: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -1 },
  dialogTitle: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 32, letterSpacing: -0.5 },
  streakHeadline: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 34, letterSpacing: -0.5 },
  metric: { fontFamily: fonts.extrabold, fontSize: 23, lineHeight: 30 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 },
  miniStat: { fontFamily: fonts.extrabold, fontSize: 19, lineHeight: 24, letterSpacing: -0.2 },
  numberTitle: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 28 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23 },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 32 },
  input: { fontFamily: fonts.regular, fontSize: 16 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  button: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 14 },
  buttonSoft: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 14 }, // outline, danger
  buttonLg: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 15 },
  tab: { fontFamily: fonts.semibold, fontSize: 14 },
  segment: { fontFamily: fonts.semibold, fontSize: 13.5 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  chip: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 19 },
  badge: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 19 },
  kicker: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 18, letterSpacing: 1.6, textTransform: "uppercase" },
  kickerSm: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 16, letterSpacing: 1.2, textTransform: "uppercase" },
  cardKicker: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase" },
  statLabel: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" },
  avatar: { fontFamily: fonts.extrabold, fontSize: 14, letterSpacing: 0.5 },
  counter: { fontFamily: fonts.extrabold, fontSize: 10.5 }
} satisfies Record<string, TextStyleToken>;

/** CSS-style strings; pass to the RN `boxShadow` style (New Architecture). */
const lightShadows = {
  card: "0 1px 2px rgba(10,10,10,0.04), 0 14px 38px rgba(10,10,10,0.07)",
  surface: "0 1px 2px rgba(10,10,10,0.04), 0 8px 24px rgba(10,10,10,0.05)",
  popover: "0 4px 10px rgba(10,10,10,0.06), 0 20px 48px rgba(10,10,10,0.18)",
  accentGlow: "0 6px 18px rgba(54,224,164,0.3)",
  segment: "0 1px 2px rgba(10,10,10,0.1)",
  knob: "0 1px 3px rgba(10,10,10,0.25)",
  pill: "0 4px 12px rgba(10,10,10,0.18)",
  raisedIcon: "0 2px 6px rgba(15,23,42,0.14)"
};

const darkShadows: typeof lightShadows = {
  ...lightShadows,
  card: "0 1px 2px rgba(0,0,0,0.4), 0 14px 38px rgba(0,0,0,0.5)",
  surface: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)"
};

export const motion = {
  duration: {
    press: 60,
    fast: 150,
    base: 180,
    slow: 200,
    enter: 240,
    enterStagger: 45,
    enterMaxIndex: 6,
    tabSlide: 260,
    sheetIn: 260,
    sheetOut: 160,
    dialogIn: 200,
    dialogOut: 120,
    dropdownIn: 200,
    progress: 420,
    countUp: 600,
    statusStamp: 220,
    checkPop: 220,
    copyFlash: 900,
    copyPillVisible: 1300,
    savedFlashVisible: 1600,
    freshMark: 1400,
    streak: 900,
    dropzoneSuccessHold: 900,
    shimmer: 1200,
    spinner: 700
  },
  /** cubic-bezier control points -> Easing.bezier(...) */
  easing: {
    spring: [0.22, 1, 0.36, 1],
    standard: [0.2, 0.8, 0.2, 1],
    out: [0.23, 1, 0.32, 1],
    inOut: [0.77, 0, 0.175, 1],
    drawer: [0.32, 0.72, 0, 1],
    overshoot: [0.34, 1.56, 0.64, 1],
    bounce: [0.22, 1.4, 0.36, 1]
  },
  pressScale: 0.97,
  checkboxPressScale: 0.92
} as const;

export const streakTiers: Record<StreakTier, { min: number; accent: string | null }> = {
  starter: { min: 0, accent: null },
  ember: { min: 10, accent: "#f2922e" },
  amber: { min: 25, accent: "#e0a80c" },
  lime: { min: 50, accent: "#7cb818" },
  emerald: { min: 100, accent: "#16a878" },
  cyan: { min: 150, accent: "#0aa8c4" },
  blue: { min: 200, accent: "#3b82f6" },
  violet: { min: 300, accent: "#8b5cf6" },
  rose: { min: 500, accent: "#ef4667" },
  gold: { min: 1000, accent: "#c9a227" }
};

export const STREAK_COLOR_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 500, 1000] as const;

function mixHex(a: string, weightA: number, b: string): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [parse(a), parse(b)];
  return "#" + x.map((v, i) => Math.round(v * weightA + y[i] * (1 - weightA)).toString(16).padStart(2, "0")).join("");
}

/** Mirrors the color-mix() rules of .shbz-streak-hero[data-streak-tier]. */
export function streakPalette(tier: StreakTier, colors: ThemeColors) {
  const accent = streakTiers[tier].accent;
  if (!accent) {
    return {
      bgStart: colors.streakBgStart, bgEnd: colors.streakBgEnd,
      border: colors.streakBorder, text: colors.streakText, flame: colors.streakFlame
    };
  }
  return {
    bgStart: mixHex(accent, 0.16, colors.cardBg),
    bgEnd: mixHex(accent, 0.07, colors.cardBg),
    border: mixHex(accent, 0.38, colors.cardBg),
    text: mixHex(accent, 0.45, colors.textStrong),
    flame: accent
  };
}

function statusPalette(c: ThemeColors) {
  return {
    GREEN: { bg: c.greenSoft, text: c.greenText, border: c.greenBorder },
    YELLOW: { bg: c.yellowSoft, text: c.yellowText, border: c.yellowBorder },
    RED: { bg: c.redSoft, text: c.redText, border: c.redBorder },
    /** null status badge ("Не отмечено") */
    none: { bg: c.tabHover, text: c.kicker, border: "transparent" },
    /** active "SKIPPED" lesson result */
    neutral: { bg: c.tabHover, text: c.textStrong, border: c.textStrong },
    /** inactive status option button */
    idle: { bg: c.cardBg, text: c.tabText, border: c.outlineBorder }
  } satisfies Record<HomeworkNumberStatus | "none" | "neutral" | "idle", { bg: string; text: string; border: string }>;
}

export const lessonResultStatus: Record<LessonResultValue, HomeworkNumberStatus | "neutral"> = {
  SOLVED: "GREEN",
  PARTIAL: "YELLOW",
  NOT_SOLVED: "RED",
  SKIPPED: "neutral"
};

function buildTheme(name: ThemeName, colors: ThemeColors, shadows: typeof lightShadows) {
  return {
    name,
    dark: name === "dark",
    colors,
    gradients,
    shadows,
    radii,
    borders,
    space,
    sizes,
    fonts,
    typography,
    motion,
    status: statusPalette(colors),
    statusBarStyle: name === "dark" ? ("light" as const) : ("dark" as const)
  };
}

export const lightTheme = buildTheme("light", lightColors, lightShadows);
export const darkTheme = buildTheme("dark", darkColors, darkShadows);
export type Theme = typeof lightTheme;

export function resolveTheme(mode: ThemeMode, systemScheme: "light" | "dark" | null | undefined): Theme {
  const name: ThemeName = mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;
  return name === "dark" ? darkTheme : lightTheme;
}

/** Same rule as initialsOf() in components/dashboard-nav.tsx */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}

/** Same rule as getStudentStreakColorMeta() in lib/student-streak-colors.ts */
export function streakColorMeta(currentStreak: number) {
  const n = Math.max(0, Math.floor(currentStreak));
  const order: StreakTier[] = ["starter", "ember", "amber", "lime", "emerald", "cyan", "blue", "violet", "rose", "gold"];
  const tier = [...order].reverse().find((t) => n >= streakTiers[t].min) ?? "starter";
  const currentThreshold = streakTiers[tier].min > 0 ? streakTiers[tier].min : null;
  const nextThreshold = STREAK_COLOR_MILESTONES.find((m) => n < m) ?? null;
  return { tier, currentThreshold, nextThreshold, daysToNextThreshold: nextThreshold ? nextThreshold - n : null };
}
```

---

## 9. Shell screens and states owned by this subsystem

This subsystem owns no business screens. It owns the app shell, the interface-preferences block and the
generic state screens that every other subsystem reuses.

### 9.1 App shell (site: `app/(dashboard)/layout.tsx` + `components/dashboard-nav.tsx`)

- **Route**: wraps every `/student/*`, `/teacher/*`, `/developer/*` page. **Roles**: all three.
- **Site layout**: page background `page-bg` + dashboard glow; sticky top bar (§5.6); content container
  max 1180 with 16 px gutters, 32 top / 64 bottom.
- **Nav items by role** (`buildNavItems`; labels `dict.nav.*`; "settings" is rendered as the gear circle, not a tab):

| Role | Item (route) | ru | en |
|---|---|---|---|
| STUDENT | `/student` | обзор | overview |
| | `/student/lesson` | урок | lesson |
| | `/student/homeworks` | дз | homework |
| | `/student/deadlines` | дедлайны | deadlines |
| | `/student/theory` | теория | theory |
| | `/student/info` | общая инфа | info |
| | `/student/settings` (gear) | настройки | settings |
| TEACHER | `/teacher` | обзор | overview |
| | `/teacher/topics` | темы | topics |
| | `/teacher/students` | ученики | students |
| | `/teacher/groups` | группы | groups |
| | `/teacher/lessons` (also active for `/teacher/homework-plans`) | занятия | lessons |
| | `/teacher/calls` | звонки | calls |
| | `/teacher/settings` (gear) | настройки | settings |
| DEVELOPER | `/developer/topics` | темы | topics |
| | `/developer/accounts` | аккаунты | accounts |
| | `/developer/calls` | звонки | calls |
| | `/developer/statistics` | статистика | statistics |
| | `/developer/panel` | дев-панель | dev panel |
| | `/developer/settings` (gear) | настройки | settings |

  Other shell strings: `dict.nav.sections` «Разделы» / "Sections", `dict.nav.menu` «Меню» / "Menu",
  `dict.nav.settings` «Настройки» / "Settings", `dict.nav.logout` «Выйти» / "Log out";
  roles `dict.roles`: STUDENT «Ученик» / "Student", TEACHER «Преподаватель» / "Teacher",
  DEVELOPER «Разработчик» / "Developer".
- **Role home** (`roleHome`): STUDENT → `/student`, TEACHER → `/teacher`, DEVELOPER → `/developer/topics`.
  The logo links to the role home.
- **Role difference**: the student has no avatar/name in the header (bell, gear, logout only); teacher
  and developer show avatar + name + role.
- **Phone translation**: native bottom tab bar + slim header (title/logo, bell, gear); profile + logout
  move to the settings screen. See Q4 for the item count problem.

### 9.2 Interface preferences block (site: `components/interface-settings-panel.tsx`, part of each role's settings page)

- **Routes**: `/student/settings`, `/teacher/settings`, `/developer/settings`. **Roles**: all.
- **Layout**: section title `dict.interface.title` («Интерфейс» / "Interface") → one card → fluid grid
  (`minmax(min(290px, 100%), 1fr)`, gap 16 → one column on a phone) of three soft panels (padding 20).
  Each panel: kicker label 11/700/1.2 UPPER → full-width segmented control → hint 12.5 `kicker`
  (class `ui-hint`, hidden when hints are off).

| Panel | Label ru / en | Options (value → ru / en) | Hint ru / en |
|---|---|---|---|
| Language | Язык / Language | `ru` → Русский / Русский; `en` → English / English | Язык интерфейса кабинета. Применяется сразу на всех страницах. / Interface language. Applies immediately on every page. |
| Theme | Тема / Theme | `system` → Системная (short: Авто) / System; `light` → Светлая / Light; `dark` → Тёмная / Dark | Светлое, тёмное или системное оформление интерфейса. / Light, dark or system appearance. |
| Hints | Подсказки / Hints | `on` → Включены / Shown; `off` → Скрыты / Hidden | Пояснения к настройкам под каждым блоком. / Explanations under each settings block. |

- **Controls**: tapping a segment applies immediately (no save button). The language switch is disabled
  while its request is pending and highlights the pending choice optimistically; on failure it reverts.
- **States**: no loading/empty/error UI; a failed language change silently reverts the highlight.
- **Phone**: three stacked soft panels inside the settings screen; the same segmented controls at full width.
- The login screen shows the compact language switch (`RU` / `EN`) in the top-right corner — language can
  be chosen before signing in.

### 9.3 Loading shells

- `AuthLoadingState` (route: `(auth)/loading.tsx`, anonymous) and `DashboardLoadingState` /
  `DashboardSectionLoadingState` (`(dashboard)/loading.tsx`, `student/loading.tsx`, `teacher/loading.tsx`)
  — skeleton geometry in §5.17. Phone: show the section skeleton (cards 160 high, radius 16, stacked in
  one column) under the already-rendered header and tab bar.

### 9.4 Error shell

- `RouteErrorState` (`(dashboard)/error.tsx`, `(auth)/error.tsx`) — anatomy and copy in §5.18. Controls:
  **retry** (re-runs the failed load) and **home** (role home). Phone: full-screen centered state inside
  the shell, same two buttons stacked or in a row.

### 9.5 Not-found shell

- `app/not-found.tsx`, `(dashboard)/not-found.tsx` — §5.18. One Primary button to the home screen. On the
  phone this is shown for a deep link to an entity that no longer exists.

---

## 10. View models

```ts
export type Locale = "ru" | "en";            // LOCALES = ["ru", "en"], DEFAULT_LOCALE = "ru"
export type ThemeMode = "system" | "light" | "dark"; // default "system"
export type HintsMode = "on" | "off";        // default "off"
export type UserRole = "STUDENT" | "TEACHER" | "DEVELOPER";

/** Device-level interface preferences (not stored in the account on the site). */
export type InterfacePreferences = {
  themeMode: ThemeMode;
  hints: HintsMode;
  locale: Locale;
};

/** What the shell needs about the signed-in user (from requireUser() in app/(dashboard)/layout.tsx). */
export type ShellUser = {
  id: string;
  name: string;   // max 120 chars (MAX_USER_NAME_LENGTH)
  email: string;  // used as login, max 254 chars (MAX_LOGIN_LENGTH)
  role: UserRole;
};

export type NavItem = {
  key: string;         // e.g. "overview", "homeworks"
  route: string;       // site route, e.g. "/student/homeworks"
  labelKey: string;    // e.g. "nav.student.homeworks"
  isSettings: boolean; // rendered as the gear, not as a tab
};

export type HomeworkNumberStatus = "GREEN" | "YELLOW" | "RED";
export type StatusBadgeModel = { status: HomeworkNumberStatus | null };

export type PageHeaderMetricTone = "default" | "accent" | "success" | "warning" | "danger";
export type PageHeaderMetric = { label: string; value: string | number; tone?: PageHeaderMetricTone };

export type NavCardModel = {
  kicker: string;
  title: string;
  stats?: Array<{ label: string; value: string | number }>;
  meta?: string;
};

export type SelectOption = { value: string; label: string };

/** ShbzDateTimePicker value: local "YYYY-MM-DDTHH:mm", "" when empty. */
export type DateTimeInputValue = string;

export type ConfirmDialogModel = {
  title: string;
  description?: string;
  confirmLabel?: string; // default dict.topics.widgets.confirm.confirm
  pendingLabel?: string; // default dict.topics.widgets.confirm.pending
  cancelLabel?: string;  // default dict.topics.widgets.confirm.cancel
  isPending: boolean;
  confirmDisabled: boolean;
  wide: boolean;
};

export type DropzonePhase = "idle" | "drag" | "success" | "uploading";
export type StreakMotionState = "ignite" | "grow" | "drop" | null;
```

Formatting helpers every screen relies on (`lib/utils.ts`, `lib/i18n`):

| Helper | Rule |
|---|---|
| `intlLocaleOf(locale)` | `en` → `"en-GB"`, `ru` → `"ru-RU"` (en uses en-GB spelling and date order) |
| `formatDate(value, locale)` | `{ day: "2-digit", month: "long", year: "numeric" }`; empty → «Без даты» / "No date" |
| `formatShortDate` | `{ day: "numeric", month: "long", year: "numeric" }` with the trailing « г.» stripped |
| `formatDateTime` | `{ day, month: "2-digit", year, hour, minute: "2-digit" }` |
| `formatFileSize(size, locale)` | `< 1024` → `N Б/B`; `< 1 048 576` → `N.N КБ/KB`; else `N.N МБ/MB` |
| `format(template, params)` | replaces `{name}` placeholders; unknown ones stay |
| `plural(locale, n, forms)` | ru: 3 forms (1 / 2–4 / 5+, with 11–14 exception); en: 2 forms (1 / other); forms contain `{n}` |
| `completionPercent(done, total)` | `total ? Math.round(done / total * 100) : 0` |
| Time zone | the product assumes **Europe/Moscow** for "today", streaks, overdue markers and notification times |

---

## 11. Mutations and queries

Only three "writes" belong to this subsystem, and two of them never touch the server.

### 11.1 Theme mode — client only

- **Storage**: `localStorage["shbz-theme"]` ∈ `"system" | "light" | "dark"`; legacy key `tutorflow-theme`
  is read as a fallback. Default `"system"`; any other stored value → `"system"`.
- **Effect**: `document.documentElement.dataset.themeMode = mode`,
  `dataset.theme = mode === "system" ? (prefers-color-scheme: dark ? "dark" : "light") : mode`.
  When the mode is `system`, the app listens to OS scheme changes and re-applies live.
- Applied before first paint by an inline script in `app/layout.tsx` (no flash). On any storage error the
  fallback is `system` / `light` / hints `off`.
- **No server call, no validation, no rate limit.**

### 11.2 Hints — client only

- **Storage**: `localStorage["shbz-hints"]` ∈ `"on" | "off"` (legacy `tutorflow-hints`). Default `"off"`;
  anything except `"on"` is `"off"`.
- **Effect**: `dataset.hints`; `off` hides every `.ui-hint` element.

### 11.3 Locale — server action `setLocaleAction(value: string)` (`actions/locale.ts`)

- **Input**: `value` must be `"ru"` or `"en"` (`isLocale`).
- **Success**: `{ ok: true, locale }`; sets cookie `shbz-lang` (`path: "/"`, `sameSite: "lax"`,
  `maxAge: 31 536 000 s` = 365 days), calls `revalidatePath("/", "layout")`, logs
  `settings.locale.changed`. The client then calls `router.refresh()`.
- **Failure**: `{ ok: false }` for an unknown value (no message shown; the switch reverts).
- **Auth**: none — works before login; nothing is written to the database.
- **Side effects that matter to other subsystems**: the locale is sent with every request, and
  server-generated texts follow it — API error messages (`dict.apiCommon` etc.), notification texts
  (`listNotifications(userId, limit, locale)`), and **AI-written texts** (homework/lesson checks use the
  student's locale, lesson/homework planning uses the teacher's locale).

### 11.4 Queries

None. The shell receives the current user from the session (`requireUser()`); everything else here is static.

---

## 12. Business rules the mobile mock must imitate

1. **Theme resolution**: `resolved = mode === "system" ? systemScheme : mode`; the default mode is
   `system`; switching is instant, without restart; with `system`, follow OS changes live.
2. **Both themes are first-class**: no component may use a literal colour; every screen must be checked
   in light and dark (and with hints on and off).
3. **Hints**: default **off**. Texts marked as hints on the site (section descriptions, setting
   explanations, the login subtitle «Войдите в личный кабинет платформы» / "Sign in to your personal
   account", status-hint lines, file-card descriptions, dropzone helper lines) must be wrapped in a
   `<Hint>` component that renders nothing when hints are off.
4. **Locale**: default `ru`; device-level, available before login; persists for a year; changing it
   re-renders everything immediately and must be sent to the API (see §14). Brand name «ШБЗ Школа» is
   never translated.
5. **One accent voice**: at most one gradient element per block; the gradient means action or progress.
6. **Traffic-light exclusivity**: green/yellow/red only for statuses and direct signals; styles come from
   the status palette (the `homeworkStatusMeta` contract), never local shades.
7. **Functional roundness**: `radius 999` only for avatar, dot, switch, spinner, progress, icon circles.
8. **Dashed = invitation**: dashed border while empty, solid once filled.
9. **Destructive actions always confirm** through the confirm sheet with an explanation of consequences;
   the confirm button is the only solid red element; nothing can be dismissed while the request is pending.
10. **Primary disabled** is neutral grey (`segBg` / `segText`), not a faded gradient.
11. **Reduced motion** disables all movement; the app must be fully usable without animation.
12. **Streak tier** = function of the current streak (thresholds 10 / 25 / 50 / 100 / 150 / 200 / 300 /
    500 / 1000); the loud streak animation plays **only** when the counter actually changes
    (`ignite` from 0, `grow` on increase, `drop` on decrease).
13. **Count-up** runs only for server-provided statistics, never for values the user is editing.
14. **Realtime highlight** applies only to items that arrived while the screen was visible — never on the
    first load or a manual refresh.
15. **Minimum touch target 44**.
16. **Input font ≥ 16** (kept for parity; on native it simply reads well).
17. **Role home**: STUDENT → overview, TEACHER → overview, DEVELOPER → topics.

---

## 13. Realtime / polling

This subsystem has none of its own. What the shell must provide for others:

- Follow the OS colour-scheme change live when the mode is `system` (RN `useColorScheme()` /
  `Appearance.addChangeListener`).
- Visual hooks for realtime-driven UI owned by other subsystems: the fresh-row flash (A10, mark lives
  1400 ms), the unread-counter pop, and the streak animation states (held 900 ms). The site mounts
  `DashboardRealtimeListener` (SSE `/api/realtime`) and `StudentStreakProvider` in the dashboard layout —
  their data contracts are specified in the realtime / student subsystems.

---

## 14. Proposed mobile API contract

Interface preferences are device-level on the site, so the app can store them locally
(`AsyncStorage` keys `shbz-theme`, `shbz-hints`, `shbz-lang`) and needs **no endpoint** for v1.

What the server contract must carry for this subsystem:

```http
# Every request
Accept-Language: ru | en        # replaces the shbz-lang cookie; unknown/missing -> "ru"
X-Time-Zone: Europe/Moscow      # informational; the server computes "today" in Moscow time
```

```ts
// GET /api/mobile/v1/me  -> the shell's user (owned by the auth subsystem; listed here because the shell renders it)
type MeResponse = {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "TEACHER" | "DEVELOPER";
};

// Optional, only if preferences should roam between devices (not on the site today — see Q5):
// GET /api/mobile/v1/me/preferences -> InterfacePreferences
// PUT /api/mobile/v1/me/preferences  body: Partial<InterfacePreferences> -> InterfacePreferences
//   400 { error: "invalid_preferences" } when themeMode ∉ system|light|dark, hints ∉ on|off, locale ∉ ru|en
type InterfacePreferences = { themeMode: "system" | "light" | "dark"; hints: "on" | "off"; locale: "ru" | "en" };
```

Client-side interface the mock must implement now:

```ts
export interface PreferencesStore {
  load(): Promise<InterfacePreferences>;               // defaults: { themeMode: "system", hints: "off", locale: "ru" }
  setThemeMode(mode: ThemeMode): Promise<void>;
  setHints(hints: HintsMode): Promise<void>;
  setLocale(locale: Locale): Promise<{ ok: true; locale: Locale } | { ok: false }>;
}
```

Conventions the future API should keep so that the UI primitives stay data-compatible:

- Status values are exactly `"GREEN" | "YELLOW" | "RED" | null`; lesson results exactly
  `"SOLVED" | "PARTIAL" | "NOT_SOLVED" | "SKIPPED" | null`.
- Dates are ISO-8601 strings (`toISOString()`), formatted on the device with `ru-RU` / `en-GB`.
- Error payloads are `{ error: string }` with an already-localised message (the site returns localised
  JSON errors from `dict.api*`); the app shows it in an error notice.
- Files are downloaded from an authenticated endpoint (site: `/files/{fileId}`, `?download=1` to force a
  download) — never from public URLs.

---

## 15. Open questions

- **Q1. Typeface confirmation.** `DESIGN.md` still says Onest and `PRODUCT.md` says Inter / JetBrains
  Mono, but the code loads Montserrat everywhere. The spec follows the code (Montserrat 400–900 from
  `@expo-google-fonts/montserrat`). Confirm that Montserrat is the intended brand typeface for the app.
- **Q2. App icon colour.** Code draws the icon as a white «Ш» on flat `#16C79F`; the in-app logo suffix
  uses the aqua→mint gradient by owner decision. Should the store icon stay flat (as the favicon) or use
  the gradient? Suggested: flat, to match the existing favicon / apple-touch-icon.
- **Q3. No vector logo exists.** The logo is live text in Montserrat Black. For the splash screen and
  store listing a PNG/SVG lockup has to be exported from that text; the gradient suffix needs a masked
  view in RN (suggested: gradient in the header, flat `#16c79f` on the static splash).
- **Q4. Bottom navigation.** The site has 6 primary sections for the student (overview, lesson, homework,
  deadlines, theory, info), 6 for the teacher and 5 for the developer, plus settings behind a gear. A
  native tab bar holds 5 at most. Suggested: student — overview · lesson · homework · deadlines · more
  (theory, info); teacher — overview · students · lessons · groups · more (topics, calls); settings stays
  a gear in the header. Needs a product decision.
- **Q5. Where preferences live.** Theme and hints are per-browser (`localStorage`), language is a
  per-browser cookie. Suggested for the app: per-device storage (same behaviour); account-level sync only
  if requested.
- **Q6. "Density" setting.** `PRODUCT.md` promises comfortable/compact density, but there is no such
  setting in the code. The app ships theme + hints + language only unless told otherwise.
- **Q7. Toasts.** The site has none (inline notices + redirect query params). Suggested: inline notices
  for errors and form results, plus a small pill toast (copy-pill style) for transient confirmations.
  Confirm that introducing a toast is acceptable.
- **Q8. Primary button contrast.** White label on the bright gradient is below WCAG AA and is an explicit
  owner decision on the site. The app copies it as is; flagging in case the store accessibility review matters.
- **Q9. Gradient focus border.** The focused-input gradient border is a CSS trick
  (`background-clip`). In RN it needs a `LinearGradient` wrapper per input; acceptable fallback is a
  1.5 px `accentSolid` border.
- **Q10. Two-layer shadows.** They need the RN `boxShadow` style (New Architecture, Expo SDK ≥ 52). On
  older setups Android falls back to `elevation` (single layer, not tinted) — the dark theme should then
  rely on borders only.
- **Q11. Backdrop blur.** Desktop dialogs blur the backdrop by 3 px, but the site disables blur on phones
  for performance. The app follows the phone behaviour (plain overlay).
- **Q12. Hover-only affordances.** Card lift, button brightness, "show copy icon on hover" and
  hover-revealed delete icons do not exist on touch. Suggested: always-visible icons at the resting
  opacity and the press scale as the only feedback.
- **Q13. Drag-and-drop dropzone and hover states.** Not applicable on a phone; the dropzone becomes a tap
  target opening camera / gallery / files, keeping only the `uploading` and `success` states.
- **Q14. Portalled popovers.** Select menus, the date-time picker, the notifications panel and the
  calendar day popover are anchored popovers on the site. Suggested: bottom sheets on the phone (the
  site already turns confirm dialogs into bottom sheets below 640 px).
- **Q15. Math rendering.** Conditions and answers are KaTeX HTML with a custom line-breaking rule
  (`lib/math-line-breaks.ts`). There is no native KaTeX; it needs a WebView-based renderer or
  `react-native-mathjax`-style component themed with these tokens (text colour, 14 px size) — owned by
  the content subsystem, flagged here because it must follow light/dark.
- **Q16. Monospace font.** Tailwind names JetBrains Mono, but it is never loaded, so the system mono
  renders. Suggested: platform monospace; bundle JetBrains Mono only if the look matters.
- **Q17. Title line-height.** The page title inherits `line-height: 1.5` on the site (39 px at 26 px)
  although `DESIGN.md` specifies 1.1. The theme uses 32; confirm or adjust.
- **Q18. Dark splash colour.** `LOGO_DARK_BG = "#101212"` is declared but unused; the app's dark page
  colour is `#0b0c0e`. Suggested: `#0b0c0e` so the splash blends into the first screen.
