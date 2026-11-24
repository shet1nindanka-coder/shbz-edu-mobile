import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Icon, IconButton, PressableScale, Text } from '@/ui';

export type PasswordSuggestionProps = {
  suggestion: string;
  /** Tap on the suggestion: put it into the password field. */
  onPick: (password: string) => void;
  /** «Другой вариант»: generate a new one. */
  onAnother: () => void;
  /** «Ввести свой»: hide the suggestion. */
  onCustom: () => void;
};

/**
 * Suggested password (docs/spec/04-teacher-students.md S2a, `PasswordSuggestMenu`). The site floats it as
 * a menu above the field; on a phone it is one row under the field, so the keyboard never covers it and
 * nothing has to be positioned: the key mark and the password — a tap puts it into the field — then
 * "another one" and "my own" as icon buttons. The site's captions are the accessible names (docs/design/
 * glass-over-paper.md §1a).
 */
export function PasswordSuggestion({ suggestion, onPick, onAnother, onCustom }: PasswordSuggestionProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict } = useI18n();
  const t = dict.students.passwordSuggest;

  return (
    <View style={styles.panel} accessibilityLabel={t.aria} testID="password-suggestion">
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${t.title}: ${suggestion}`}
        accessibilityHint={t.pickHint}
        onPress={() => onPick(suggestion)}
        scaleTo={1}
        pressedStyle={styles.pressed}
        style={styles.pick}
        testID="password-suggestion-pick"
      >
        <Icon name="key" size={theme.sizes.icon.sm} color="textMuted" />
        <Text variant="bodyStrong" color="textStrong" selectable={false} numberOfLines={1} style={styles.value}>
          {suggestion}
        </Text>
      </PressableScale>
      <IconButton icon="refresh" variant="ghost" accessibilityLabel={t.another} onPress={onAnother} testID="password-suggestion-another" />
      <IconButton icon="close" variant="ghost" accessibilityLabel={t.custom} onPress={onCustom} testID="password-suggestion-custom" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  panel: {
    // A soft panel inside the sheet.
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: t.radii.md,
    backgroundColor: t.colors.softBg,
    paddingLeft: t.space.xs,
  },
  pick: {
    flex: 1,
    minWidth: 0,
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    paddingHorizontal: t.space.xs,
    borderRadius: t.radii.md,
  },
  value: { flexShrink: 1 },
  pressed: { opacity: 0.6 },
}));
