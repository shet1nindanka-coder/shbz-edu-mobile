import { View } from 'react-native';

import type { ReportPeriod } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, CopyRow, Text } from '@/ui';

export type StudentMenuAction = { kind: 'report'; period: ReportPeriod } | { kind: 'resetPassword' } | { kind: 'delete' };

export type StudentMenuSheetProps = {
  visible: boolean;
  student: { name: string; email: string } | null;
  /** The report actions are disabled: one is being built, or the report limit is cooling down. */
  reportsBlocked: boolean;
  onClose: () => void;
  onSelect: (action: StudentMenuAction) => void;
  /** After the exit animation: the screen opens the next sheet only now (two modals never overlap). */
  onClosed?: () => void;
};

/**
 * The "⋯" menu of the student card (docs/spec/04-teacher-students.md S3, mobile note): the login to copy,
 * the three PDF reports, "reset password" and "delete student" — the site's row of header buttons.
 */
export function StudentMenuSheet({ visible, student, reportsBlocked, onClose, onSelect, onClosed }: StudentMenuSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.students.detail;
  const copy = dict.topics.widgets.copy;
  const loginLabel = dict.students.list.loginLabel;

  const reports: { period: ReportPeriod; label: string }[] = [
    { period: '7d', label: t.report7d },
    { period: '30d', label: t.report30d },
    { period: 'year', label: t.reportYear },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} closeLabel={m.common.actions.close} title={student?.name} testID="student-menu-sheet">
      {student ? (
        <View style={styles.content}>
          <CopyRow
            label={loginLabel}
            value={student.email}
            copiedLabel={copy.copied}
            copiedAnnouncement={format(copy.copiedAria, { label: loginLabel })}
            hint={m.teacher.students.copyHint}
            testID="student-menu-login"
          />

          <View style={styles.group}>
            <Text variant="kickerSm">{m.teacher.card.reports}</Text>
            {reports.map((report) => (
              <Button
                key={report.period}
                label={report.label}
                variant="outline"
                size="lg"
                leftIcon="file"
                disabled={reportsBlocked}
                onPress={() => onSelect({ kind: 'report', period: report.period })}
                testID={`student-menu-report-${report.period}`}
              />
            ))}
            <Hint>
              <Text variant="caption" color="textMuted">
                {m.teacher.card.reportsHint}
              </Text>
            </Hint>
          </View>

          <View style={styles.group}>
            <Button
              label={dict.students.passwordReset.button}
              variant="outline"
              size="lg"
              leftIcon="key"
              onPress={() => onSelect({ kind: 'resetPassword' })}
              testID="student-menu-reset"
            />
            <Button label={t.deleteStudent} variant="danger" size="lg" leftIcon="trash" onPress={() => onSelect({ kind: 'delete' })} testID="student-menu-delete" />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  // Room above the copy row for its «Скопировано» pill.
  content: { gap: t.space.lg, paddingTop: t.space.sm },
  group: { gap: t.space.md },
}));
