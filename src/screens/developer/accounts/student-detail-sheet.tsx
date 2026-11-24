import { View } from 'react-native';

import type { ManagedStudent, ManagedTeacher } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { useLatched } from '@/screens/teacher/students';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, CopyRow, Select, Text, useStatusAnnouncement } from '@/ui';

import { teacherOptions } from './accounts-logic';

export type StudentAction = 'resetPassword' | 'delete';

export type StudentDetailSheetProps = {
  /** The student shown; `null` closes the sheet. */
  student: ManagedStudent | null;
  teachers: readonly ManagedTeacher[];
  /** What the owner picker shows: the unsaved pick, else the stored owner. */
  ownerId: string | null;
  /** The pick is not saved yet. */
  dirty: boolean;
  /** Owner changes are being saved: the picker is locked. */
  saving: boolean;
  /** A teacher was picked: only a draft — nothing is sent until the save bar's «Сохранить · N». */
  onOwnerChange: (student: ManagedStudent, teacherId: string) => void;
  onSelect: (action: StudentAction, student: ManagedStudent) => void;
  onClose: () => void;
  /** After the exit animation: the screen opens the next sheet only now. */
  onClosed?: () => void;
};

/**
 * Detail sheet of one student row (docs/spec/04-teacher-students.md S9b; layout: docs/design/
 * glass-over-paper.md §7 "a row that needs actions"): the login to copy, the owner picker ("move") and the
 * site's two row buttons — reset password, delete. The warning of a student nobody owns is written here in
 * full (the row shows two words of it). An unsaved pick needs no sentence: «Готово» appears, and the save
 * bar is under the sheet.
 */
export function StudentDetailSheet({
  student,
  teachers,
  ownerId,
  dirty,
  saving,
  onOwnerChange,
  onSelect,
  onClose,
  onClosed,
}: StudentDetailSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.students.studentsManager;
  const copy = dict.topics.widgets.copy;
  const shown = useLatched(student);
  const hasTeachers = teachers.length > 0;
  // «Изменено — не забудьте сохранить.» is not drawn (the save bar says it): a screen reader still hears it.
  useStatusAnnouncement(student !== null && dirty ? t.dirty : null);

  return (
    <BottomSheet
      visible={student !== null}
      onClose={onClose}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={shown?.name}
      testID="student-detail-sheet"
    >
      {shown ? (
        <View style={styles.content}>
          <CopyRow
            label={t.loginLabel}
            value={shown.email}
            copiedLabel={copy.copied}
            copiedAnnouncement={format(copy.copiedAria, { label: t.loginLabel })}
            hint={m.teacher.students.copyHint}
            testID="student-detail-login"
          />

          <View style={styles.owner}>
            {shown.teacherId === null ? (
              <Text variant="small" color="redText" accessibilityRole="alert" testID="student-detail-orphan">
                {t.noOwner}
              </Text>
            ) : null}
            <Select
              label={dict.students.accountForm.ownerTeacher}
              accessibilityLabel={format(m.accounts.a11y.ownerOf, { name: shown.name })}
              options={teacherOptions(teachers)}
              value={ownerId}
              onChange={(teacherId) => onOwnerChange(shown, teacherId)}
              placeholder={hasTeachers ? t.selectTeacher : t.createTeacherFirst}
              closeLabel={m.common.actions.close}
              disabled={!hasTeachers || saving}
              testID="student-detail-owner"
            />
            <Hint>
              <Text variant="small" color="textMuted">
                {m.accounts.owner.saveHint}
              </Text>
            </Hint>
          </View>

          <View style={styles.buttons}>
            {dirty ? <Button label={m.common.actions.done} onPress={onClose} testID="student-detail-done" /> : null}
            <Button
              label={dict.students.passwordReset.button}
              variant="outline"
              leftIcon="key"
              accessibilityLabel={m.accounts.a11y.resetStudentPassword}
              onPress={() => onSelect('resetPassword', shown)}
              testID="student-detail-reset"
            />
            <Button
              label={t.delete}
              variant="danger"
              leftIcon="trash"
              onPress={() => onSelect('delete', shown)}
              testID="student-detail-delete"
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
  owner: { gap: t.space.sm },
  buttons: { gap: t.space.sm },
}));
