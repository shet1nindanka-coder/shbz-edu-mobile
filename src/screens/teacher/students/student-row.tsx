import type { TeacherStudentListItem } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { Avatar, ListRow, Text } from '@/ui';

import { usePanelRow } from './use-panel-row';

export type StudentRowProps = {
  student: TeacherStudentListItem;
  /** Tap on the row: open the student's card (a phone), or show the summary in the next panel (a tablet). */
  onPress: (student: TeacherStudentListItem) => void;
  /** The row whose summary the panel next to the list shows (tablet). */
  selected?: boolean;
  /** The row sits in a tablet list panel (see `usePanelRow`). */
  panel?: boolean;
  /** Hairline under the row; a `ListCard` switches it off on its last row. */
  divider?: boolean;
};

/**
 * One student of the list (docs/spec/04-teacher-students.md S2; layout: docs/design/glass-over-paper.md
 * §1 rule 2, texts: §1a): the avatar and the name; on the right a red number — how many numbers need help
 * — or nothing. The whole row is pressed; the login, the password reset and deletion live in the student's
 * "⋯" menu. A screen reader still hears the login and the counters.
 */
export function StudentRow({ student, onPress, selected = false, panel = false, divider }: StudentRowProps) {
  const { dict, m } = useI18n();
  const panelRow = usePanelRow();
  const t = dict.students.list;
  const needsHelp = student.redCount > 0;
  const spokenFact = needsHelp
    ? format(m.common.statuses.groupCount, { label: m.common.statuses.RED.label, n: student.redCount })
    : student.solvedCount > 0
      ? format(m.teacher.students.solved, { n: student.solvedCount })
      : null;

  return (
    <ListRow
      left={<Avatar name={student.name} tone="neutral" />}
      title={student.name}
      right={
        needsHelp ? (
          <Text variant="bodyStrong" color="redText" tabular numberOfLines={1}>
            {student.redCount}
          </Text>
        ) : undefined
      }
      selected={selected}
      divider={divider}
      {...(panel ? panelRow(selected, divider ?? true) : null)}
      onPress={() => onPress(student)}
      accessibilityLabel={[student.name, `${t.loginLabel}: ${student.email}`, spokenFact].filter(Boolean).join('. ')}
      accessibilityHint={t.viewProgress}
      testID={`student-open-${student.id}`}
    />
  );
}
