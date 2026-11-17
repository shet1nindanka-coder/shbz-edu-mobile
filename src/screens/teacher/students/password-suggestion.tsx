import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { PressableScale, Text, TextButton } from '@/ui';

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
 * a menu above the field; on a phone it is an inline panel under the field, so the keyboard never covers
 * it and nothing has to be positioned.
 */
export function PasswordSuggestion({ suggestion, onPick, onAnother, onCustom }: PasswordSuggestionProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.students.passwordSuggest;

  return (
    <View style={styles.panel} accessibilityLabel={t.aria} testID="password-suggestion">
      <Text variant="kickerSm" style={styles.title}>
        {t.title}
      </Text>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${t.title}: ${suggestion}`}
        accessibilityHint={m.teacher.students.suggestPickHint}
        onPress={() => onPick(suggestion)}
        scaleTo={1}
        pressedStyle={styles.pressed}
        style={styles.pick}
        testID="password-suggestion-pick"
      >
        <Text variant="bodyStrong" color="textStrong" selectable={false}>
          {suggestion}
        </Text>
        {/* Part of the suggestion on the site, not a `.ui-hint`: shown whatever the hints preference is. */}
        <Text variant="caption" color="kicker">
          {m.teacher.students.suggestPickHint}
        </Text>
      </PressableScale>
      <View style={styles.links}>
        <TextButton label={t.another} onPress={onAnother} testID="password-suggestion-another" />
        <TextButton label={t.custom} tone="muted" onPress={onCustom} testID="password-suggestion-custom" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  panel: {
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
    paddingHorizontal: t.space.xs,
    paddingTop: t.space.md,
    paddingBottom: t.space.md,
  },
  title: { paddingHorizontal: 10 },
  pick: {
    minHeight: t.sizes.minTouch,
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: t.radii.md,
  },
  pressed: { backgroundColor: t.colors.cardBg },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.space.md,
    paddingHorizontal: 10,
  },
}));
