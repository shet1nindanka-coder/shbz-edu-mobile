import { View } from 'react-native';

import type { JournalEntry } from '@/api/types';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet } from '@/ui';

import { JournalDetailBody } from './journal-detail-body';

export type JournalDetailSheetProps = {
  /** The entry to show; kept by the caller while the sheet slides away. */
  entry: JournalEntry | null;
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void;
  /** «История статуса» of a `progress.status` row. */
  onOpenHistory: (ref: NonNullable<JournalEntry['progressRef']>) => void;
};

/** Detail of a journal row on a phone (07 §1.10 phone mapping): `JournalDetailBody` in a bottom sheet. */
export function JournalDetailSheet({ entry, visible, onClose, onClosed, onOpenHistory }: JournalDetailSheetProps) {
  const styles = useStyles();
  const { m } = useI18n();

  return (
    <BottomSheet
      visible={visible && entry !== null}
      onClose={onClose}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={entry ? (entry.actionLabel ?? entry.action) : undefined}
      testID="journal-detail-sheet"
    >
      {entry ? (
        <View style={styles.content}>
          <JournalDetailBody entry={entry} onOpenHistory={onOpenHistory} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { paddingTop: t.space.xs, paddingBottom: t.space.md },
}));
