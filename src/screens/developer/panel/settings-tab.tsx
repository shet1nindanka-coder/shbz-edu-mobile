import { AccessibilityInfo, Platform, View } from 'react-native';

import type { ReasoningEffort } from '@/api/types';
import { REASONING_EFFORTS } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, IconButton, Panel, Panels, Select, Switch, Text, TextField, useAnnounce } from '@/ui';

import {
  SETTINGS_GROUPS,
  canStep,
  stepNumberInput,
  type NumberFieldSpec,
  type SettingFieldSpec,
  type SettingsGroup,
  type SwitchFieldSpec,
  type TextFieldSpec,
} from './settings-form';
import type { SettingsFormState } from './use-settings-form';

/** How the five groups of the form share the two tablet panels: the long AI group stands alone. */
const TABLET_COLUMNS: readonly (readonly SettingsGroup['key'][])[] = [['aiCheck', 'files'], ['lessonPlan', 'classwork', 'homeworkPlan']];

/**
 * Settings tab (07 §1.9, §4.5; layout: docs/design/glass-over-paper.md §7, mockup D-panel): the site's one
 * form as cards titled inside. A setting is a row with its control on the right — a number field with its
 * steppers, a switch — or, for a text and the effort picker, a field under its label. Field sub-labels are
 * part of the form on the site (not hideable hints) and stay visible as the row's caption, together with
 * the allowed range. The save controls are in `settings-save.tsx`.
 */
export function SettingsTab({ form }: { form: SettingsFormState }) {
  const styles = useStyles();
  const theme = useTheme();

  if (theme.tablet) {
    return (
      <Panels testID="panel-settings">
        {TABLET_COLUMNS.map((keys) => (
          <Panel key={keys.join('|')} contentStyle={styles.column}>
            {SETTINGS_GROUPS.filter((group) => keys.includes(group.key)).map((group) => (
              <SettingsGroupBlock key={group.key} group={group} form={form} />
            ))}
          </Panel>
        ))}
      </Panels>
    );
  }

  return (
    <View style={styles.root} testID="panel-settings">
      {SETTINGS_GROUPS.map((group) => (
        <Card key={group.key}>
          <SettingsGroupBlock group={group} form={form} />
        </Card>
      ))}
    </View>
  );
}

function SettingsGroupBlock({ group, form }: { group: SettingsGroup; form: SettingsFormState }) {
  const styles = useStyles();
  const { dict } = useI18n();
  return (
    <View testID={`settings-group-${group.key}`}>
      <Text variant="sectionTitle" accessibilityRole="header" style={styles.groupTitle}>
        {dict.planner.devPanel.settings[group.key]}
      </Text>
      {group.fields.map((field, index) => (
        <View key={field.key} style={[styles.field, index > 0 ? styles.divider : null]}>
          <SettingField field={field} form={form} />
        </View>
      ))}
    </View>
  );
}

function SettingField({ field, form }: { field: SettingFieldSpec; form: SettingsFormState }) {
  switch (field.kind) {
    case 'bool':
      return <SwitchSetting field={field} form={form} />;
    case 'text':
      return <TextSetting field={field} form={form} />;
    case 'effort':
      return <EffortSetting form={form} />;
    default:
      return <NumberSetting field={field} form={form} />;
  }
}

function SwitchSetting({ field, form }: { field: SwitchFieldSpec; form: SettingsFormState }) {
  const { dict } = useI18n();
  const t = dict.planner.devPanel.settings;
  const value = form.draft[field.key];
  const description = field.onText && field.offText ? t[value ? field.onText : field.offText] : field.hint ? t[field.hint] : undefined;
  return (
    <Switch
      value={value}
      onValueChange={(next) => form.set(field.key, next)}
      label={t[field.label]}
      description={description}
      disabled={form.pending}
      trailing
      testID={`setting-${field.key}`}
    />
  );
}

function TextSetting({ field, form }: { field: TextFieldSpec; form: SettingsFormState }) {
  const { dict } = useI18n();
  const t = dict.planner.devPanel.settings;
  const model = field.key !== 'loginHelpContact';
  return (
    <TextField
      label={t[field.label]}
      helper={t[field.hint]}
      value={form.draft[field.key]}
      onChangeText={(text) => form.set(field.key, text)}
      maxLength={field.maxLength}
      disabled={form.pending}
      autoCapitalize={model ? 'none' : 'sentences'}
      autoCorrect={false}
      spellCheck={!model}
      testID={`setting-${field.key}`}
    />
  );
}

function EffortSetting({ form }: { form: SettingsFormState }) {
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel;
  return (
    <Select<ReasoningEffort>
      label={t.settings.effort}
      helper={t.settings.effortHint}
      options={REASONING_EFFORTS.map((value) => ({ value, label: t.effort[value] }))}
      value={form.draft.aiReasoningEffort}
      onChange={(value) => form.set('aiReasoningEffort', value)}
      placeholder={dict.topics.widgets.selectPlaceholder}
      closeLabel={m.common.actions.close}
      disabled={form.pending}
      testID="setting-aiReasoningEffort"
    />
  );
}

/**
 * A ± step changes the field's value while the focus stays on the button, so nothing reads the new value:
 * it is said on both platforms (the field has no live region, so TalkBack does not read it twice). The web
 * has no screen-reader announcement API here.
 */
function announceStep(message: string): void {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  else if (Platform.OS === 'android') AccessibilityInfo.announceForAccessibility(message);
}

function NumberSetting({ field, form }: { field: NumberFieldSpec; form: SettingsFormState }) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel.settings;
  const text = form.draft[field.key];
  const label = t[field.label];
  const range = { min: field.min, max: field.max };
  const caption = `${t[field.hint]} · ${format(m.developer.settings.range, range)}`;
  const error = form.invalid.has(field.key) ? format(m.developer.settings.rangeError, range) : null;
  // The error replaces the caption without moving the focus: iOS has no live regions, so it is spoken.
  useAnnounce(error);
  const step = (direction: 1 | -1) => {
    const next = stepNumberInput(text, field, direction);
    form.set(field.key, next);
    if (next !== text) announceStep(format(m.developer.settings.stepped, { label, value: next }));
  };

  return (
    <View style={styles.row}>
      <View style={styles.rowTexts}>
        <Text variant="bodyStrong">{label}</Text>
        {error ? (
          <Text variant="small" color="redText" accessibilityRole="alert" accessibilityLiveRegion="polite" testID={`setting-${field.key}-error`}>
            {error}
          </Text>
        ) : (
          <Text variant="small" color="textMuted">
            {caption}
          </Text>
        )}
      </View>
      <TextField
        accessibilityLabel={label}
        // The row's caption belongs to the field: focusing it reads the hint and the range, or the error.
        accessibilityHint={error ?? caption}
        value={text}
        onChangeText={(next) => form.set(field.key, next)}
        keyboardType={field.kind === 'int' ? 'number-pad' : 'decimal-pad'}
        inputMode={field.kind === 'int' ? 'numeric' : 'decimal'}
        maxLength={8}
        disabled={form.pending}
        selectTextOnFocus
        containerStyle={styles.number}
        inputStyle={styles.numberInput}
        right={
          <View style={styles.stepper}>
            <IconButton
              icon="minus"
              variant="ghost"
              accessibilityLabel={format(m.developer.settings.decrease, { label })}
              onPress={() => step(-1)}
              disabled={form.pending || !canStep(text, field, -1)}
              style={styles.step}
              testID={`setting-${field.key}-minus`}
            />
            <IconButton
              icon="plus"
              variant="ghost"
              accessibilityLabel={format(m.developer.settings.increase, { label })}
              onPress={() => step(1)}
              disabled={form.pending || !canStep(text, field, 1)}
              style={styles.step}
              testID={`setting-${field.key}-plus`}
            />
          </View>
        }
        testID={`setting-${field.key}`}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.block },
  // A tablet panel holds several groups: more air between them than between the rows of one.
  column: { gap: t.space.xl },
  groupTitle: { paddingBottom: t.space.xxs },
  field: { paddingVertical: t.space.md },
  divider: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  rowTexts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  // The value and its two 36 steppers; a value is at most six digits («100000», «0.65»).
  number: { width: t.sizes.control.sm * 2 + t.sizes.control.lg + t.space.xl },
  numberInput: { textAlign: 'center', fontVariant: ['tabular-nums'], paddingHorizontal: t.space.xxs },
  // Inside the field's frame: anything wider than the frame would be scrolled into view on focus (web).
  stepper: { flexDirection: 'row', alignItems: 'center', marginRight: t.space.xxxs },
  step: { width: t.sizes.control.sm, height: t.sizes.control.sm },
}));
