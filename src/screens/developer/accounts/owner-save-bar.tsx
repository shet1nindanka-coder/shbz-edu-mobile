import { View } from 'react-native';

import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Text, TextButton, useStatusAnnouncement } from '@/ui';

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
 * The save bar of the students tab (docs/spec/04-teacher-students.md S9b; text diet §1a): owner changes
 * are edited in several rows and sent with one button, so it is clear what changes and nothing is saved by
 * halves. It is pinned above the dock and exists only while there is something to save: «Отменить» and
 * «Сохранить · 2» — the number is the students changed; the site's sentence about them is the button's
 * accessible name. The button is the ink one: the save moves students between teachers, and the gradient
 * stays with «Новый аккаунт».
 */
export function OwnerSaveBar({ count, saving, error, onDiscard, onSave }: OwnerSaveBarProps) {
  const styles = useStyles();
  const { dict, locale } = useI18n();
  const t = dict.students.studentsManager;
  const changed = format(t.changedFor, { students: plural(locale, count, t.changedStudentForms) });
  // The refusal appears without moving the focus: spoken on both platforms (on Android a live region on a
  // freshly mounted text may stay silent, and role="alert" alone says nothing).
  useStatusAnnouncement(error);

  return (
    <View style={styles.bar} testID="owner-save-bar">
      {error ? (
        <Text variant="small" color="redText" accessibilityRole="alert" testID="owner-save-error">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {/* Discarding is the quiet action; the save takes the rest of the row. */}
        <TextButton label={t.reset} tone="muted" disabled={saving} onPress={onDiscard} testID="owner-save-discard" />
        <Button
          label={saving ? t.saving : format(dict.students.directory.tabWithCount, { label: dict.common.save, n: count })}
          accessibilityLabel={saving ? undefined : `${t.save}. ${changed}`}
          variant="dark"
          loading={saving}
          onPress={onSave}
          style={styles.save}
          testID="owner-save-submit"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // The screen's footer slot already has the page gutters.
  bar: { gap: t.space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: t.space.lg },
  save: { flex: 1 },
}));
