import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { hasErrorCode, useApi } from '@/api';
import type { ManagedTeacher } from '@/api/types';
import { format, plural, useI18n } from '@/i18n';
import { errorText, useLatched } from '@/screens/teacher/students';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Notice, Select, Text } from '@/ui';

import { canDeleteTeacher, deleteTeacherPlan, teacherOptions } from './accounts-logic';

export type DeleteTeacherDialogProps = {
  /** The teacher to delete; `null` keeps the dialog closed. */
  teacher: ManagedTeacher | null;
  /** Every teacher of the directory: the others may take the students over. */
  teachers: readonly ManagedTeacher[];
  onClose: () => void;
  /** The account is gone; its students (if any) now belong to the picked teacher. */
  onDeleted: (teacher: ManagedTeacher) => void;
  /** `404 teacherNotFound`: somebody else already deleted the teacher; `message` is localised. */
  onMissing: (message: string) => void;
  /** `409 teacherTransfer`: the directory on screen is stale (students were added, the target is gone). */
  onStale: () => void;
};

/**
 * "Delete teacher?" (docs/spec/04-teacher-students.md D6, §3.10a, §4.13). A teacher with students cannot
 * go without a different teacher taking them over — lessons, homework drafts and groups move with them.
 * Without students the teacher's lessons are deleted with the account, and the dialog says so in red.
 */
export function DeleteTeacherDialog({ teacher, teachers, onClose, onDeleted, onMissing, onStale }: DeleteTeacherDialogProps) {
  const styles = useStyles();
  const api = useApi();
  const { dict, m, locale } = useI18n();
  const t = dict.students.teachersManager;
  const notices = dict.students.accounts.notices;
  const shown = useLatched(teacher);
  // The pick belongs to one teacher: opening the dialog for another one starts empty.
  const [pick, setPick] = useState<{ forTeacherId: string; transferTo: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plan = shown ? deleteTeacherPlan(shown, teachers) : null;
  const transferTo = shown && pick?.forTeacherId === shown.id ? pick.transferTo : null;

  const remove = useMutation({
    mutationFn: (input: { target: ManagedTeacher; transferTo: string | null }) =>
      api.accounts.deleteTeacher(input.target.id, input.transferTo ?? undefined),
    onSuccess: (_result, input) => {
      setPick(null);
      setError(null);
      onDeleted(input.target);
    },
    onError: (failure) => {
      const text = errorText(failure, notices.teacherDelete);
      if (hasErrorCode(failure, 'teacherNotFound')) {
        setPick(null);
        setError(null);
        onMissing(text);
        return;
      }
      // teacherTransfer: the picked teacher is gone or the count changed — the dialog stays, with fresh data.
      if (hasErrorCode(failure, 'teacherTransfer')) onStale();
      // deleteFailed, serviceUnavailable, no connection: the dialog stays for a manual retry.
      setError(text);
    },
  });

  const cancel = () => {
    if (remove.isPending) return;
    setPick(null);
    setError(null);
    onClose();
  };

  const confirm = () => {
    if (!teacher || !plan || !canDeleteTeacher(plan, transferTo) || remove.isPending) return;
    setError(null);
    remove.mutate({ target: teacher, transferTo: plan.needsTransfer ? transferTo : null });
  };

  const canConfirm = plan !== null && canDeleteTeacher(plan, transferTo);

  return (
    // Not the shared `Dialog`: its two equal buttons cut «Удалить учителя» off at phone width, so the
    // confirm action gets the room here and «Отмена» keeps its own width.
    <BottomSheet
      visible={teacher !== null}
      onClose={cancel}
      closeLabel={t.cancel}
      showClose={false}
      dismissible={!remove.isPending}
      testID="delete-teacher-dialog"
      footer={
        <View style={styles.actions}>
          <Button label={t.cancel} variant="outline" size="lg" disabled={remove.isPending} onPress={cancel} testID="delete-teacher-cancel" />
          <Button
            label={remove.isPending ? t.deleting : t.confirm}
            variant="dangerSolid"
            size="lg"
            loading={remove.isPending}
            disabled={!canConfirm}
            onPress={confirm}
            style={styles.confirm}
            testID="delete-teacher-confirm"
          />
        </View>
      }
    >
      {shown && plan ? (
        <View style={styles.content} accessibilityRole="alert">
          <View style={styles.intro}>
            <Text variant="kicker">{t.kicker}</Text>
            <Text variant="dialogTitle" accessibilityRole="header">
              {format(t.heading, { name: shown.name })}
            </Text>
            <Text variant="small" color="label" style={styles.description}>
              {t.description}
            </Text>
          </View>

          {plan.transferredLessons > 0 ? (
            <Text variant="small" color="textMuted" style={styles.paragraph} testID="delete-teacher-lessons-transfer">
              {format(t.lessonsTransfer, { lessons: plural(locale, plan.transferredLessons, t.lessonForms) })}
            </Text>
          ) : null}

          {plan.showCascade ? (
            <View style={styles.cascade} testID="delete-teacher-cascade">
              <Text variant="small" color="dangerSolid" style={styles.paragraph}>
                {t.cascadeBefore}
                {plan.deletedLessons > 0 ? plural(locale, plan.deletedLessons, t.lessonForms) : null}
                {plan.deletedLessons > 0 && plan.deletedTests > 0 ? t.cascadeAnd : null}
                {plan.deletedTests > 0 ? plural(locale, plan.deletedTests, t.testForms) : null}
                {t.cascadeAfter}
              </Text>
            </View>
          ) : null}

          {plan.needsTransfer ? (
            plan.blocked ? (
              <View style={styles.transfer}>
                <Text variant="label" color="label">
                  {format(t.transferLabel, { n: shown.studentCount })}
                </Text>
                <Text variant="smallMedium" color="dangerSolid" style={styles.paragraph} testID="delete-teacher-only">
                  {t.onlyTeacher}
                </Text>
              </View>
            ) : (
              <Select
                label={format(t.transferLabel, { n: shown.studentCount })}
                accessibilityLabel={t.transferAria}
                options={teacherOptions(plan.candidates)}
                value={transferTo}
                onChange={(next) => {
                  setPick({ forTeacherId: shown.id, transferTo: next });
                  setError(null);
                }}
                placeholder={t.selectTeacher}
                closeLabel={m.common.actions.close}
                disabled={remove.isPending}
                testID="delete-teacher-transfer"
              />
            )
          ) : null}

          {error ? <Notice tone="error" text={error} testID="delete-teacher-error" /> : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg, paddingTop: t.space.xxs, paddingBottom: t.space.md },
  intro: { gap: 10 },
  description: { lineHeight: 24 },
  paragraph: { lineHeight: 22 },
  cascade: {
    borderRadius: t.radii.md,
    backgroundColor: t.colors.redSoft,
    paddingVertical: t.space.md,
    paddingHorizontal: t.space.lg,
  },
  transfer: { gap: t.space.sm },
  actions: { flexDirection: 'row', gap: t.space.md },
  confirm: { flex: 1 },
}));
