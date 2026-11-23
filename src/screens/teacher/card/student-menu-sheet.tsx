import { View } from 'react-native';

import type { ReportPeriod } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, CopyRow, ListRow, Text } from '@/ui';

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
 * the three PDF reports and "reset password" as menu rows, "delete student" as the one red button — the
 * site's row of header buttons.
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

          <View>
            <Text variant="kicker" color="textMuted" accessibilityRole="header">
              {m.teacher.card.reports}
            </Text>
            {reports.map((report) => (
              <ListRow
                key={report.period}
                title={report.label}
                chevron
                inset={0}
                disabled={reportsBlocked}
                onPress={() => onSelect({ kind: 'report', period: report.period })}
                testID={`student-menu-report-${report.period}`}
              />
            ))}
            <ListRow
              title={dict.students.passwordReset.button}
              chevron
              inset={0}
              divider={false}
              onPress={() => onSelect({ kind: 'resetPassword' })}
              testID="student-menu-reset"
            />
          </View>
          <Hint>
            <Text variant="hint" color="textMuted">
              {m.teacher.card.reportsHint}
            </Text>
          </Hint>

          <Button label={t.deleteStudent} variant="danger" leftIcon="trash" onPress={() => onSelect({ kind: 'delete' })} testID="student-menu-delete" />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  // Room above the copy row for its «Скопировано» pill.
  content: { gap: t.space.md, paddingTop: t.space.sm, paddingBottom: t.space.sm },
}));
