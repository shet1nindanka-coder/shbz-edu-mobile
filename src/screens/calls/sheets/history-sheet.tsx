import { useState } from 'react';

import type { ParentCallStudentOverview } from '@/api/types';
import { useI18n } from '@/i18n';
import { BottomSheet } from '@/ui';

import { CallHistory } from './call-history';

export type HistorySheetProps = {
  /** The student whose calls are shown (the live overview row); null = the sheet is closed. */
  student: ParentCallStudentOverview | null;
  /** DEVELOPER: who made each call is named. */
  showTeacher: boolean;
  onClose: () => void;
};

/**
 * The calls of one student for a viewer who only reads (the developer): the row of the list opens it. A
 * teacher reads the same history under the record form.
 */
export function HistorySheet({ student, showTeacher, onClose }: HistorySheetProps) {
  const { m } = useI18n();
  // The sheet keeps showing the student while it slides away.
  const [shown, setShown] = useState<ParentCallStudentOverview | null>(student);
  if (student !== null && student !== shown) setShown(student);

  return (
    <BottomSheet
      visible={student !== null}
      onClose={onClose}
      onClosed={() => setShown(null)}
      closeLabel={m.common.actions.close}
      title={shown?.studentName}
      testID="call-history-sheet"
    >
      {shown ? <CallHistory key={shown.studentId} student={shown} showTeacher={showTeacher} /> : null}
    </BottomSheet>
  );
}
