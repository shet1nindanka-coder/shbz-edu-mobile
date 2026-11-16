import { View } from 'react-native';

import type { ReasoningEffort } from '@/api/types';
import { REASONING_EFFORTS } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Card, IconButton, Select, Switch, Text, TextButton, TextField } from '@/ui';

import { ResultLine } from './result-line';
import {
  SETTINGS_GROUPS,
  canStep,
  stepNumberInput,
  type NumberFieldSpec,
  type SettingFieldSpec,
  type SwitchFieldSpec,
  type TextFieldSpec,
} from './settings-form';
import type { SettingsFormState } from './use-settings-form';

/**
 * Settings tab (07 §1.9, §4.5): the site's one form as five grouped cards — switches, numeric fields with
 * steppers and their range, texts and the reasoning-effort picker. Field sub-labels are part of the form
 * on the site (not hideable hints) and stay visible here too. The save bar is `SettingsSaveBar`.
 */
export function SettingsTab({ form }: { form: SettingsFormState }) {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.planner.devPanel.settings;

  return (
    <View style={styles.root} testID="panel-settings">
      {SETTINGS_GROUPS.map((group) => (
        <Card key={group.key} testID={`settings-group-${group.key}`}>
          <View style={styles.group}>
            <Text variant="kicker" accessibilityRole="header">
              {t[group.key]}
            </Text>
            {group.fields.map((field) => (
              <SettingField key={field.key} field={field} form={form} />
            ))}
          </View>
        </Card>
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

function NumberSetting({ field, form }: { field: NumberFieldSpec; form: SettingsFormState }) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel.settings;
  const text = form.draft[field.key];
  const label = t[field.label];
  const range = { min: field.min, max: field.max };
  const step = (direction: 1 | -1) => form.set(field.key, stepNumberInput(text, field, direction));

  return (
    <TextField
      label={label}
      labelAside={
        // One line, never squeezed: a long label wraps instead of the range.
        <Text variant="caption" tabular numberOfLines={1} style={styles.range}>
          {format(m.developer.settings.range, range)}
        </Text>
      }
      helper={t[field.hint]}
      error={form.invalid.has(field.key) ? format(m.developer.settings.rangeError, range) : null}
      value={text}
      onChangeText={(next) => form.set(field.key, next)}
      keyboardType={field.kind === 'int' ? 'number-pad' : 'decimal-pad'}
      inputMode={field.kind === 'int' ? 'numeric' : 'decimal'}
      maxLength={8}
      disabled={form.pending}
      selectTextOnFocus
      right={
        <View style={styles.stepper}>
          <IconButton
            icon="minus"
            variant="ghost"
            accessibilityLabel={format(m.developer.settings.decrease, { label })}
            onPress={() => step(-1)}
            disabled={form.pending || !canStep(text, field, -1)}
            testID={`setting-${field.key}-minus`}
          />
          <IconButton
            icon="plus"
            variant="ghost"
            accessibilityLabel={format(m.developer.settings.increase, { label })}
            onPress={() => step(1)}
            disabled={form.pending || !canStep(text, field, 1)}
            testID={`setting-${field.key}-plus`}
          />
        </View>
      }
      testID={`setting-${field.key}`}
    />
  );
}

/**
 * Sticky bar of the Settings tab: the status line of the site's form («Значения перекрывают .env…» →
 * «Сохраняем настройки…» → the save message) and the save button. A range error blocks the save: the site
 * would silently clamp the value or reset a blank field to the env default (07 §7 item 11).
 */
export function SettingsSaveBar({ form }: { form: SettingsFormState }) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel.settings;
  const blocked = form.invalid.size > 0;

  return (
    <View style={styles.bar} testID="settings-save-bar">
      <View style={styles.status}>
        <View style={styles.statusText}>
          {form.pending ? (
            <ResultLine pendingText={t.savingSettings} result={null} testID="settings-status" />
          ) : blocked ? (
            <ResultLine result={{ ok: false, message: m.developer.settings.fixErrors }} testID="settings-status" />
          ) : form.result ? (
            <ResultLine result={form.result} waitSeconds={form.waitSeconds} testID="settings-status" />
          ) : form.dirty ? (
            <Text variant="captionMedium" color="yellowText" testID="settings-status">
              {m.developer.settings.unsaved}
            </Text>
          ) : (
            // Always shown on the site (not a hideable hint): it says when a saved value takes effect.
            <Text variant="caption" testID="settings-status">
              {t.applyHint}
            </Text>
          )}
        </View>
        {form.dirty && !form.pending ? (
          <TextButton label={m.developer.settings.reset} tone="muted" onPress={form.reset} testID="settings-reset" />
        ) : null}
      </View>
      <Button
        label={form.pending ? t.saving : t.save}
        size="lg"
        loading={form.pending}
        disabled={blocked || form.waitSeconds > 0}
        onPress={form.save}
        fullWidth
        testID="settings-save"
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.lg },
  group: { gap: t.space.field },
  range: { flexShrink: 0 },
  // Inside the field's frame: anything wider than the frame would be scrolled into view on focus (web).
  stepper: { flexDirection: 'row', alignItems: 'center', marginRight: t.space.xxs },
  bar: { gap: t.space.sm },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  statusText: { flex: 1 },
}));
