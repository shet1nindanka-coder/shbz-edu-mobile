import { View } from 'react-native';

import type { TeacherStudentListItem } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, CopyRow } from '@/ui';

import { useLatched } from './use-latched';

export type StudentAction = 'open' | 'resetPassword' | 'delete';

export type StudentActionsSheetProps = {
  /** The student whose actions are shown; `null` closes the sheet. */
  student: TeacherStudentListItem | null;
  onClose: () => void;
  onSelect: (action: StudentAction, student: TeacherStudentListItem) => void;
  /** After the exit animation: the screen opens the next sheet only now (two modals never overlap). */
  onClosed?: () => void;
};

/**
 * Actions of one student row (docs/spec/04-teacher-students.md S2, mobile note): the login as a
 * copy-on-tap value and the site's three row buttons — view progress, reset password, delete.
 */
export function StudentActionsSheet({ student, onClose, onSelect, onClosed }: StudentActionsSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.students.list;
  const copy = dict.topics.widgets.copy;
  const shown = useLatched(student);

  return (
    <BottomSheet
      visible={student !== null}
      onClose={onClose}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={shown?.name}
      testID="student-actions-sheet"
    >
      {shown ? (
        <View style={styles.content}>
          <CopyRow
            label={t.loginLabel}
            value={shown.email}
            copiedLabel={copy.copied}
            copiedAnnouncement={format(copy.copiedAria, { label: t.loginLabel })}
            hint={m.teacher.students.copyHint}
            testID="student-actions-login"
          />
          <View style={styles.buttons}>
            <Button label={t.viewProgress} size="lg" onPress={() => onSelect('open', shown)} testID="student-actions-open" />
            <Button
              label={dict.students.passwordReset.button}
              variant="outline"
              size="lg"
              leftIcon="key"
              onPress={() => onSelect('resetPassword', shown)}
              testID="student-actions-reset"
            />
            <Button
              label={t.delete}
              variant="danger"
              size="lg"
              leftIcon="trash"
              onPress={() => onSelect('delete', shown)}
              testID="student-actions-delete"
            />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  // Room above the copy row for its «Скопировано» pill.
  content: { gap: t.space.lg, paddingTop: t.space.sm },
  buttons: { gap: t.space.md },
}));
