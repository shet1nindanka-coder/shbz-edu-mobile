import { useMemo } from 'react';
import { View } from 'react-native';

import type { ParentCallStudentOverview, RecordCallResponse } from '@/api/types';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Panel, SectionCaption, Text } from '@/ui';

import { CallHistory } from '../sheets/call-history';
import { RecordCallFields, RecordCallSaveButton } from '../sheets/record-call-form';
import { useRecordCall, type RecordCallTarget } from '../sheets/use-record-call';

export type RecordCallPanelProps = {
  /** The row selected in the list (the live overview row). */
  student: ParentCallStudentOverview;
  weight?: number;
  /** The list is reloading after a saved call: the next record waits for the new state. */
  settling: boolean;
  onSaved: (response: RecordCallResponse, target: RecordCallTarget) => void;
  onMissing: (message: string) => void;
};

/**
 * The right panel of the teacher's tablet screen: what the phone opens as a sheet — the record form of
 * the selected student and the earlier calls under it. Selecting another student starts an empty form.
 */
export function RecordCallPanel({ student, weight, settling, onSaved, onMissing }: RecordCallPanelProps) {
  const styles = useStyles();
  const { m } = useI18n();
  const { studentId, studentName } = student;
  // One object per student: the form starts over when the target changes, not on every reload of the list.
  const target = useMemo<RecordCallTarget>(() => ({ studentId, studentName }), [studentId, studentName]);
  const form = useRecordCall({ target, onSaved, onMissing, clearOnSaved: true });

  return (
    <Panel
      weight={weight}
      header={
        <Text variant="sectionTitle" accessibilityRole="header" numberOfLines={2}>
          {studentName}
        </Text>
      }
      testID="call-record-panel"
    >
      <RecordCallFields form={form} />
      <RecordCallSaveButton form={form} settling={settling} />
      {student.history.length > 0 ? (
        <View style={styles.history}>
          <SectionCaption>{m.calls.history.title}</SectionCaption>
          <CallHistory key={studentId} student={student} showTeacher={false} />
        </View>
      ) : null}
    </Panel>
  );
}

const useStyles = makeStyles((t) => ({
  history: { paddingTop: t.space.xs },
}));
