import { View } from 'react-native';

import { RetryWaitLine } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { Hint, useHintsEnabled } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Text, TextButton } from '@/ui';

import { ResultLine } from './result-line';
import type { SettingsFormState } from './use-settings-form';

/**
 * The status line of the site's settings form — only when there is something to report: «Сохраняем
 * настройки…», the save message, or that a marked field blocks the save (the site would silently clamp
 * the value or reset a blank field to the env default — 07 §7 item 11). Unsaved changes need no words:
 * «Сбросить» appears next to the save button. The site's standing note («Значения перекрывают .env…») is
 * an explanation — a `<Hint>`.
 */
export function SettingsStatusLine({ form }: { form: SettingsFormState }) {
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel.settings;
  if (form.pending) return <ResultLine pendingText={t.savingSettings} result={null} testID="settings-status" />;
  if (form.invalid.size > 0) return <ResultLine result={{ ok: false, message: m.developer.settings.fixErrors }} testID="settings-status" />;
  if (form.result) return <ResultLine result={form.result} testID="settings-status" />;
  if (form.dirty) return null;
  return (
    <Hint>
      <Text variant="small" color="textMuted" testID="settings-status">
        {t.applyHint}
      </Text>
    </Hint>
  );
}

/** Whether `SettingsStatusLine` draws anything: a caller that gives it a row of its own skips an empty one. */
export function useSettingsStatusShown(form: SettingsFormState | null): boolean {
  const hints = useHintsEnabled();
  if (!form) return false;
  return form.pending || form.invalid.size > 0 || form.result !== null || (!form.dirty && hints);
}

/**
 * «Сохранить» — the one main action of the Settings tab (the site's «Сохранить настройки» is its
 * accessible name) — with «Сбросить» beside it while the form is dirty. A tablet puts the pair into the screen header (it stays on screen there); a
 * phone gets `SettingsSaveBar`, because its header scrolls away with the long form.
 */
export function SettingsSaveActions({ form, fullWidth = false }: { form: SettingsFormState; fullWidth?: boolean }) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel.settings;
  return (
    <View style={[styles.actions, fullWidth ? styles.stretch : null]}>
      {form.dirty && !form.pending ? (
        <TextButton
          label={m.developer.short.reset}
          accessibilityLabel={m.developer.settings.resetA11y}
          tone="muted"
          onPress={form.reset}
          testID="settings-reset"
        />
      ) : null}
      <Button
        label={form.pending ? t.saving : dict.common.save}
        accessibilityLabel={form.pending ? undefined : t.save}
        loading={form.pending}
        disabled={form.invalid.size > 0 || form.waitSeconds > 0}
        onPress={form.save}
        style={fullWidth ? styles.grow : null}
        testID="settings-save"
      />
    </View>
  );
}

/** Sticky bar of the Settings tab on a phone: the status line, the save pair and the rate-limit wait. */
export function SettingsSaveBar({ form }: { form: SettingsFormState }) {
  const styles = useStyles();
  return (
    <View style={styles.bar} testID="settings-save-bar">
      <SettingsStatusLine form={form} />
      <SettingsSaveActions form={form} fullWidth />
      {/* Under the button, not in the status: editing a field clears the status, the lock stays. */}
      <RetryWaitLine seconds={form.waitSeconds} testID="settings-wait" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: { gap: t.space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  stretch: { alignSelf: 'stretch' },
  grow: { flex: 1 },
}));
