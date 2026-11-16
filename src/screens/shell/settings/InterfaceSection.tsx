import { View, useWindowDimensions } from 'react-native';

import type { HintsMode, Locale, ThemeMode } from '@/api/types';
import { useI18n } from '@/i18n';
import { Hint, usePreferences } from '@/providers';
import { makeStyles } from '@/theme';
import { Card, SectionCard, Segmented, Text } from '@/ui';

/** Below this width «Системная» does not fit a segment: the site's short label is used. */
const NARROW_WIDTH = 360;

/**
 * The "Interface" block (docs/spec/01-shell-auth.md §1.5.1, 08 §9.2): language, theme and hints, each a
 * soft panel with a segmented control that applies immediately. Order as on the site.
 */
export function InterfaceSection() {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.interface;
  const { width } = useWindowDimensions();
  const { preferences, localePending, setLocale, setThemeMode, setHints } = usePreferences();

  return (
    <SectionCard title={t.title}>
      <View style={styles.panels}>
        <Card variant="soft">
          <Text variant="kickerSm">{t.language.label}</Text>
          <Segmented<Locale>
            fill
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
            style={styles.control}
          />
          <Hint>
            <Text variant="hint" style={styles.hint}>
              {t.language.hint}
            </Text>
          </Hint>
        </Card>

        <Card variant="soft">
          <Text variant="kickerSm">{t.theme.label}</Text>
          <Segmented<ThemeMode>
            fill
            compact={width < NARROW_WIDTH}
            options={[
              { value: 'system', label: t.theme.system, shortLabel: t.theme.systemShort },
              { value: 'light', label: t.theme.light },
              { value: 'dark', label: t.theme.dark },
            ]}
            value={preferences.themeMode}
            onChange={setThemeMode}
            accessibilityLabel={t.theme.label}
            testID="settings-theme"
            style={styles.control}
          />
          <Hint>
            <Text variant="hint" style={styles.hint}>
              {t.theme.hint}
            </Text>
          </Hint>
        </Card>

        <Card variant="soft">
          <Text variant="kickerSm">{t.hints.label}</Text>
          <Segmented<HintsMode>
            fill
            options={[
              { value: 'on', label: t.hints.on },
              { value: 'off', label: t.hints.off },
            ]}
            value={preferences.hints}
            onChange={setHints}
            accessibilityLabel={t.hints.label}
            testID="settings-hints"
            style={styles.control}
          />
          <Hint>
            <Text variant="hint" style={styles.hint}>
              {t.hints.hint}
            </Text>
          </Hint>
        </Card>
      </View>
    </SectionCard>
  );
}

const useStyles = makeStyles((t) => ({
  panels: { gap: t.space.gutter },
  control: { marginTop: t.space.md },
  hint: { marginTop: t.space.md },
}));
