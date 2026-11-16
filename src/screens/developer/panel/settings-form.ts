// Settings tab of the developer panel as data (docs/spec/07-developer-content.md §4.5): the five groups, the
// 25 fields with the site's ranges, and the draft ⇄ `SiteSettings` conversion. Pure — covered by
// tests/developer-panel-settings.test.ts.
//
// The site silently resets a blank number to the env default and clamps an out-of-range one; 07 §7 item 11
// asks the app to validate the ranges on the phone instead, so an invalid field blocks the save here.
import type { ReasoningEffort, SiteSettings } from '@/api/types';
import { REASONING_EFFORTS } from '@/api/types';
import type { Dictionary } from '@/lib/i18n/dictionary';

type SettingsText = keyof Dictionary['planner']['devPanel']['settings'];

type KeysOfType<T> = { [K in keyof SiteSettings]: SiteSettings[K] extends T ? K : never }[keyof SiteSettings];
export type BoolSettingKey = KeysOfType<boolean>;
export type NumberSettingKey = KeysOfType<number>;
export type TextSettingKey = Exclude<KeysOfType<string>, 'aiReasoningEffort'>;

export type SwitchFieldSpec = {
  kind: 'bool';
  key: BoolSettingKey;
  label: SettingsText;
  /** Sub-label that follows the value («включена — …» / «выключена — …»). */
  onText?: SettingsText;
  offText?: SettingsText;
  /** Fixed explanatory sub-label (a hint). */
  hint?: SettingsText;
};
export type NumberFieldSpec = {
  kind: 'int' | 'float';
  key: NumberSettingKey;
  label: SettingsText;
  hint: SettingsText;
  min: number;
  max: number;
  step: number;
};
export type TextFieldSpec = { kind: 'text'; key: TextSettingKey; label: SettingsText; hint: SettingsText; maxLength: number };
export type EffortFieldSpec = { kind: 'effort'; key: 'aiReasoningEffort'; label: SettingsText; hint: SettingsText };
export type SettingFieldSpec = SwitchFieldSpec | NumberFieldSpec | TextFieldSpec | EffortFieldSpec;

export type SettingsGroupKey = 'aiCheck' | 'lessonPlan' | 'classwork' | 'homeworkPlan' | 'files';
export type SettingsGroup = { key: SettingsGroupKey; fields: readonly SettingFieldSpec[] };

const int = (key: NumberSettingKey, label: SettingsText, hint: SettingsText, min: number, max: number): NumberFieldSpec => ({
  kind: 'int',
  key,
  label,
  hint,
  min,
  max,
  step: 1,
});

/** Groups and fields exactly as on the site's form (07 §4.5 table). */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    key: 'aiCheck',
    fields: [
      { kind: 'bool', key: 'aiEnabled', label: 'aiCheck', onText: 'aiOn', offText: 'aiOff' },
      { kind: 'text', key: 'aiModel', label: 'model', hint: 'modelHint', maxLength: 100 },
      { kind: 'text', key: 'aiShortlistModel', label: 'shortlistModel', hint: 'shortlistModelHint', maxLength: 100 },
      { kind: 'effort', key: 'aiReasoningEffort', label: 'effort', hint: 'effortHint' },
      { kind: 'float', key: 'aiMinConfidence', label: 'minConfidence', hint: 'minConfidenceHint', min: 0, max: 1, step: 0.05 },
      int('aiDailyLimit', 'dailyLimit', 'dailyLimitHint', 1, 100_000),
      int('aiPerStudentHourlyLimit', 'hourlyLimit', 'hourlyLimitHint', 1, 1000),
      int('aiCheckConcurrency', 'checkConcurrency', 'checkConcurrencyHint', 1, 8),
    ],
  },
  {
    key: 'lessonPlan',
    fields: [
      { kind: 'bool', key: 'lessonPlanEnabled', label: 'lessonPlanOn' },
      int('lessonPlanShortlistSize', 'shortlist', 'shortlistHint', 20, 150),
      int('lessonPlanMaxItems', 'maxItems', 'maxItemsHint', 5, 60),
      int('lessonPlanConcurrency', 'concurrency', 'concurrencyHint', 1, 10),
      int('aiPlanDailyLimit', 'planDailyLimit', 'planDailyLimitHint', 1, 100_000),
    ],
  },
  {
    key: 'classwork',
    fields: [
      { kind: 'bool', key: 'lessonCheckEnabled', label: 'lessonCheckOn', hint: 'lessonCheckHint' },
      int('lessonCheckDailyLimit', 'lessonDailyLimit', 'lessonDailyLimitHint', 1, 100_000),
      int('lessonCheckPerStudentHourlyLimit', 'lessonHourlyLimit', 'lessonHourlyLimitHint', 1, 1000),
      int('lessonIdleWarnMinutes', 'idleWarn', 'idleWarnHint', 1, 120),
      int('lessonIdleAlertMinutes', 'idleAlert', 'idleAlertHint', 1, 240),
    ],
  },
  {
    key: 'homeworkPlan',
    fields: [
      { kind: 'bool', key: 'homeworkPlanEnabled', label: 'homeworkPlanOn' },
      int('homeworkPlanMaxItems', 'homeworkMaxItems', 'homeworkMaxItemsHint', 3, 60),
      int('homeworkPlanShortlistSize', 'homeworkShortlist', 'homeworkShortlistHint', 20, 150),
    ],
  },
  {
    key: 'files',
    fields: [
      int('photoRetentionDays', 'retention', 'retentionHint', 0, 3650),
      int('maxPhotosPerAssignment', 'maxPhotos', 'maxPhotosHint', 1, 30),
      int('completedChecksKept', 'checksKept', 'checksKeptHint', 1, 500),
      { kind: 'text', key: 'loginHelpContact', label: 'loginHelp', hint: 'loginHelpHint', maxLength: 200 },
    ],
  },
];

const ALL_FIELDS: readonly SettingFieldSpec[] = SETTINGS_GROUPS.flatMap((group) => group.fields);
const NUMBER_FIELDS = ALL_FIELDS.filter((field): field is NumberFieldSpec => field.kind === 'int' || field.kind === 'float');

/** What the form holds: numbers as typed text (a field may be blank while it is edited). */
export type SettingsDraft = { [K in keyof SiteSettings]: SiteSettings[K] extends number ? string : SiteSettings[K] };

export function toDraft(settings: SiteSettings): SettingsDraft {
  const draft: Record<string, unknown> = { ...settings };
  for (const field of NUMBER_FIELDS) draft[field.key] = String(settings[field.key]);
  return draft as SettingsDraft;
}

/**
 * The number a field holds, or null when it must not be saved: blank, not a number, or outside the range.
 * A decimal comma is accepted (Russian keyboards); an integer field floors like the server does.
 */
export function parseNumberInput(text: string, spec: Pick<NumberFieldSpec, 'kind' | 'min' | 'max'>): number | null {
  const raw = text.trim().replace(',', '.');
  if (!/^-?\d+(\.\d*)?$|^-?\.\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const value = spec.kind === 'int' ? Math.floor(parsed) : parsed;
  return value >= spec.min && value <= spec.max ? value : null;
}

/** Keys of the numeric fields that cannot be saved as typed. */
export function invalidFields(draft: SettingsDraft): NumberSettingKey[] {
  return NUMBER_FIELDS.filter((field) => parseNumberInput(draft[field.key], field) === null).map((field) => field.key);
}

function normalizeEffort(value: string): ReasoningEffort | null {
  return (REASONING_EFFORTS as readonly string[]).includes(value) ? (value as ReasoningEffort) : null;
}

/** The full set of 25 values to send (the site's form always posts all of them), or null while a field is invalid. */
export function draftToSettings(draft: SettingsDraft): SiteSettings | null {
  const settings: Record<string, unknown> = { ...draft };
  for (const field of NUMBER_FIELDS) {
    const value = parseNumberInput(draft[field.key], field);
    if (value === null) return null;
    settings[field.key] = value;
  }
  if (normalizeEffort(draft.aiReasoningEffort) === null) return null;
  return settings as unknown as SiteSettings;
}

/** Whether the form differs from what the server has. A number is compared by value ("0.60" equals 0.6). */
export function isDraftDirty(draft: SettingsDraft, settings: SiteSettings): boolean {
  return ALL_FIELDS.some((field) => {
    if (field.kind === 'int' || field.kind === 'float') {
      const value = parseNumberInput(draft[field.key], field);
      return value === null || value !== settings[field.key];
    }
    return draft[field.key] !== settings[field.key];
  });
}

/**
 * Text of a number field after one press of its stepper. A field that holds nothing usable starts from the
 * nearest bound; the result never leaves the range and carries no float noise (0.6 + 0.05 → "0.65").
 */
export function stepNumberInput(text: string, spec: NumberFieldSpec, direction: 1 | -1): string {
  const raw = Number(text.trim().replace(',', '.'));
  const current = text.trim() !== '' && Number.isFinite(raw) ? raw : direction === 1 ? spec.min - spec.step : spec.max + spec.step;
  const next = Math.min(spec.max, Math.max(spec.min, current + direction * spec.step));
  return String(spec.kind === 'int' ? Math.floor(next) : Math.round(next * 100) / 100);
}

/** Whether a stepper button has somewhere to go. */
export function canStep(text: string, spec: NumberFieldSpec, direction: 1 | -1): boolean {
  const value = parseNumberInput(text, spec);
  if (value === null) return true;
  return direction === 1 ? value < spec.max : value > spec.min;
}
