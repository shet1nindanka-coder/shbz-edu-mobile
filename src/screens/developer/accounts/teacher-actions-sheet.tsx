import { View } from 'react-native';

import type { ManagedTeacher } from '@/api/types';
import { format, plural, useI18n } from '@/i18n';
import { useLatched } from '@/screens/teacher/students';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, CopyRow, Text } from '@/ui';

export type TeacherAction = 'resetPassword' | 'delete';

export type TeacherActionsSheetProps = {
  /** The teacher whose actions are shown; `null` closes the sheet. */
  teacher: ManagedTeacher | null;
  onClose: () => void;
  onSelect: (action: TeacherAction, teacher: ManagedTeacher) => void;
  /** After the exit animation: the screen opens the next sheet only now (two modals never overlap). */
  onClosed?: () => void;
};

/**
 * Actions of one teacher row (docs/spec/04-teacher-students.md S9b; layout: docs/design/
 * glass-over-paper.md §7 "a row that needs actions"): the login as a copy-on-tap value and the site's two
 * row buttons — reset password, delete.
 */
export function TeacherActionsSheet({ teacher, onClose, onSelect, onClosed }: TeacherActionsSheetProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.students.teachersManager;
  const copy = dict.topics.widgets.copy;
  const shown = useLatched(teacher);

  return (
    <BottomSheet
      visible={teacher !== null}
      onClose={onClose}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={shown?.name}
      testID="teacher-actions-sheet"
    >
      {shown ? (
        <View style={styles.content}>
          <CopyRow
            label={t.loginLabel}
            value={shown.email}
            copiedLabel={copy.copied}
            copiedAnnouncement={format(copy.copiedAria, { label: t.loginLabel })}
            hint={m.teacher.students.copyHint}
            testID="teacher-actions-login"
          />
          <Text variant="small" color="textMuted" testID="teacher-actions-students">
            {shown.studentCount > 0 ? plural(locale, shown.studentCount, t.studentForms) : t.noStudents}
          </Text>
          <View style={styles.buttons}>
            <Button
              label={dict.students.passwordReset.button}
              variant="outline"
              leftIcon="key"
              accessibilityLabel={m.accounts.a11y.resetTeacherPassword}
              onPress={() => onSelect('resetPassword', shown)}
              testID="teacher-actions-reset"
            />
            <Button
              label={t.delete}
              variant="danger"
              leftIcon="trash"
              accessibilityLabel={t.dialogAria}
              onPress={() => onSelect('delete', shown)}
              testID="teacher-actions-delete"
            />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  // Room above the copy row for its «Скопировано» pill.
  content: { gap: t.space.md, paddingTop: t.space.sm, paddingBottom: t.space.md },
  buttons: { gap: t.space.sm },
}));
