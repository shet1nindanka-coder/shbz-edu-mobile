import { View } from 'react-native';

import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Text, TextButton } from '@/ui';

export type OwnerSaveBarProps = {
  /** How many students have an unsaved owner change — rows hidden by the search or the other tab included. */
  count: number;
  saving: boolean;
  /** A failed save that can be retried; the drafts are kept. */
  error: string | null;
  onDiscard: () => void;
  onSave: () => void;
};

/**
 * The save bar of the students tab (docs/spec/04-teacher-students.md S9b): owner changes are edited in
 * several rows and sent with one button, so it is clear what changes and nothing is saved by halves. On a
 * phone it is pinned above the tab bar and exists only while there is something to save.
 */
export function OwnerSaveBar({ count, saving, error, onDiscard, onSave }: OwnerSaveBarProps) {
  const styles = useStyles();
  const { dict, locale } = useI18n();
  const t = dict.students.studentsManager;

  return (
    <View style={styles.bar} testID="owner-save-bar">
      <View style={styles.top}>
        <Text variant="smallStrong" accessibilityLiveRegion="polite" style={styles.text} testID="owner-save-text">
          {format(t.changedFor, { students: plural(locale, count, t.changedStudentForms) })}
        </Text>
        {/* «Сохранить изменения» needs the full width on a phone; discarding is the quiet action beside the text. */}
        <TextButton label={t.reset} tone="muted" disabled={saving} onPress={onDiscard} testID="owner-save-discard" />
      </View>
      {error ? (
        <Text variant="captionMedium" color="dangerSolid" accessibilityRole="alert" testID="owner-save-error">
          {error}
        </Text>
      ) : null}
      <Button label={saving ? t.saving : t.save} size="lg" fullWidth loading={saving} onPress={onSave} testID="owner-save-submit" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // The screen's footer slot already has the page gutters.
  bar: { gap: t.space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  text: { flex: 1, minWidth: 0 },
}));
