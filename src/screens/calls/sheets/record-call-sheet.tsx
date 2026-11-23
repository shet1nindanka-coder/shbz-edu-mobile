import { View } from 'react-native';

import type { ParentCallStudentOverview, RecordCallResponse } from '@/api/types';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, SectionCaption } from '@/ui';

import { CallHistory } from './call-history';
import { RecordCallFields, RecordCallSaveButton } from './record-call-form';
import { useRecordCall, type RecordCallTarget } from './use-record-call';

export type { RecordCallTarget } from './use-record-call';

export type RecordCallSheetProps = {
  /** The student the call is about; null = the sheet is closed. */
  target: RecordCallTarget | null;
  /** The live overview row of that student: its history is shown under the form. */
  student: ParentCallStudentOverview | null;
  /** The list is reloading after a saved call: the next record waits for the new state. */
  settling: boolean;
  onClose: () => void;
  onSaved: (response: RecordCallResponse, target: RecordCallTarget) => void;
  /** The student is gone (deleted, or moved to another teacher): the list must drop the row. */
  onMissing: (message: string) => void;
};

/**
 * What a row of the list opens for a teacher (06 §1.4 "Call form", §3.10): the record form — outcome,
 * the comment only the teacher reads, Save in the sheet's footer — and the student's earlier calls under
 * it. The form is emptied when the sheet has closed: a cancelled comment never comes back.
 */
export function RecordCallSheet({ target, student, settling, onClose, onSaved, onMissing }: RecordCallSheetProps) {
  const styles = useStyles();
  const { m } = useI18n();
  const form = useRecordCall({ target, onSaved, onMissing });
  // The history belongs to the student the form shows, also while the sheet slides away.
  const history = student && form.shown && student.studentId === form.shown.studentId && student.history.length > 0 ? student : null;

  return (
    <BottomSheet
      visible={target !== null}
      // While the call is being saved the sheet stays open, also when the screen loses focus (it is only
      // hidden until the user returns): a refusal and the typed comment must not go away with it.
      onClose={() => {
        if (!form.isBusy()) onClose();
      }}
      onClosed={form.reset}
      closeLabel={m.common.actions.close}
      title={form.shown?.studentName}
      dismissible={!form.pending}
      footer={<RecordCallSaveButton form={form} settling={settling} />}
      testID="call-record-sheet"
    >
      {form.shown ? (
        <View style={styles.content}>
          <RecordCallFields form={form} />
          {history ? (
            <View>
              <SectionCaption>{m.calls.history.title}</SectionCaption>
              <CallHistory key={history.studentId} student={history} showTeacher={false} />
            </View>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg, paddingTop: t.space.xs },
}));
