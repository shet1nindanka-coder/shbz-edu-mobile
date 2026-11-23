import { useRef } from 'react';
import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, ListRow } from '@/ui';

export type TopicActionsSheetProps = {
  visible: boolean;
  /** Title of the sheet: the topic the actions belong to. */
  title: string;
  onClose: () => void;
  /** «Редактирование»: called after the sheet has closed. */
  onEdit: () => void;
  /** «Удалить тему»: called after the sheet has closed — the owner opens the confirmation then. */
  onDelete: () => void;
};

/**
 * The «⋯» of a topic (DEVELOPER only; docs/design/glass-over-paper.md §1 rule 6): the way to its editor
 * and «Удалить тему». Both run once the sheet has left the screen: a confirmation dialog asked for while
 * this sheet's window is still presented would be refused on iOS.
 */
export function TopicActionsSheet({ visible, title, onClose, onEdit, onDelete }: TopicActionsSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const next = useRef<'edit' | 'delete' | null>(null);
  const run = (action: 'edit' | 'delete') => {
    next.current = action;
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      closeLabel={m.common.actions.close}
      title={title}
      onClosed={() => {
        const action = next.current;
        next.current = null;
        if (action === 'edit') onEdit();
        else if (action === 'delete') onDelete();
      }}
      testID="topic-actions-sheet"
    >
      <View style={styles.root}>
        <ListRow
          inset={0}
          title={dict.topics.tabs.edit}
          chevron
          divider={false}
          onPress={() => run('edit')}
          accessibilityLabel={m.content.topic.openEdit}
          testID="topic-mode"
        />
        <Button label={dict.topics.deleteTopic.label} variant="danger" leftIcon="trash" onPress={() => run('delete')} testID="topic-delete" />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
}));
