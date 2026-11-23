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
 * §1 rule 2): the avatar, the name, ONE caption — the login — and one fact on the right: how many numbers
 * are solved, or, in red, how many need help. The whole row is pressed; the login to copy, the password
 * reset and deletion live in the student's "⋯" menu.
 */
export function StudentRow({ student, onPress, selected = false, panel = false, divider }: StudentRowProps) {
  const { dict, m } = useI18n();
  const panelRow = usePanelRow();
  const t = dict.students.list;
  const needsHelp = student.redCount > 0;
  const fact = needsHelp
    ? format(m.common.statuses.groupCount, { label: m.common.statuses.RED.label, n: student.redCount })
    : student.solvedCount > 0
      ? format(m.teacher.students.solved, { n: student.solvedCount })
      : null;

  return (
    <ListRow
      left={<Avatar name={student.name} tone="neutral" />}
      title={student.name}
      subtitle={student.email}
      right={
        fact ? (
          <Text variant="small" color={needsHelp ? 'redText' : 'textMuted'} tabular numberOfLines={1}>
            {fact}
          </Text>
        ) : undefined
      }
      selected={selected}
      divider={divider}
      {...(panel ? panelRow(selected, divider ?? true) : null)}
      onPress={() => onPress(student)}
      accessibilityLabel={[student.name, `${t.loginLabel}: ${student.email}`, fact].filter(Boolean).join('. ')}
      accessibilityHint={t.viewProgress}
      testID={`student-open-${student.id}`}
    />
  );
}
