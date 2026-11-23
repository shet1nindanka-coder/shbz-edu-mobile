import { View } from 'react-native';

import type { Locale, ThemeMode } from '@/api/types';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/providers';
import { makeStyles } from '@/theme';
import { ListCard, Segmented, Switch, Text } from '@/ui';

/**
 * The interface settings (docs/spec/01-shell-auth.md §1.5.1; layout: docs/design/glass-over-paper.md §8):
 * three rows of one card — theme, language, hints — each with its control on the right, applied at once.
 */
export function InterfaceSection() {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.interface;
  const { preferences, localePending, setLocale, setThemeMode, setHints } = usePreferences();

  return (
    <ListCard testID="settings-interface">
      <View style={[styles.row, styles.divider]}>
        <Text variant="bodyStrong" style={styles.label}>
          {t.theme.label}
        </Text>
        <Segmented<ThemeMode>
          // «Авто» is the short name of «Системная»: the row keeps the label and the switch on one line.
          compact
          options={[
            { value: 'system', label: t.theme.system, shortLabel: t.theme.systemShort },
            { value: 'light', label: t.theme.light },
            { value: 'dark', label: t.theme.dark },
          ]}
          value={preferences.themeMode}
          onChange={setThemeMode}
          accessibilityLabel={t.theme.label}
          testID="settings-theme"
        />
      </View>
      <View style={[styles.row, styles.divider]}>
        <Text variant="bodyStrong" style={styles.label}>
          {t.language.label}
        </Text>
        <Segmented<Locale>
          options={[
            { value: 'ru', label: t.language.ru },
            { value: 'en', label: t.language.en },
          ]}
          // The pending choice is highlighted at once; a refused value drops back.
          value={localePending ?? preferences.locale}
          onChange={setLocale}
          disabled={localePending !== null}
          accessibilityLabel={t.language.label}
          testID="settings-language"
        />
      </View>
      <View style={styles.row}>
        <Switch
          trailing
          label={t.hints.label}
          value={preferences.hints === 'on'}
          onValueChange={(value) => setHints(value ? 'on' : 'off')}
          accessibilityLabel={t.hints.label}
          testID="settings-hints"
          style={styles.switch}
        />
      </View>
    </ListCard>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    minHeight: t.sizes.row,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: t.space.md,
    rowGap: t.space.sm,
    paddingVertical: t.space.sm,
    marginHorizontal: t.space.card,
  },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.line },
  label: { flexShrink: 1 },
  switch: { flex: 1 },
}));
