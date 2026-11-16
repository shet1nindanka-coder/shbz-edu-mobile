import { useState } from 'react';
import { View } from 'react-native';

import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, CheckRow, EmptyState, Text, TextField } from '@/ui';

import { filterRecipients, type BroadcastStudent } from './logic';

export type RecipientsSheetProps = {
  visible: boolean;
  /** Every student, by name. */
  students: readonly BroadcastStudent[];
  pickedIds: readonly string[];
  onToggle: (studentId: string) => void;
  onClose: () => void;
};

/**
 * Recipient picker of the broadcast (07 §1.9 phone mapping: "student multi-select picker, searchable
 * modal list"). The site offers a search box with a dropdown of 8 matches and removable chips; on a phone
 * the same search filters a checklist, so picked students stay visible and can be unticked in place.
 */
export function RecipientsSheet({ visible, students, pickedIds, onToggle, onClose }: RecipientsSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel.broadcast;
  const [query, setQuery] = useState('');
  const matches = filterRecipients(students, query);
  const picked = new Set(pickedIds);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={() => setQuery('')}
      closeLabel={m.common.actions.close}
      title={m.developer.broadcast.pickStudents}
      footer={
        <View style={styles.footer}>
          <Text variant="smallMedium" color="textMuted" style={styles.counter} testID="recipients-sheet-count">
            {pickedIds.length > 0 ? format(t.picked, { n: pickedIds.length }) : t.nonePicked}
          </Text>
          <Button label={m.common.actions.done} onPress={onClose} testID="recipients-sheet-done" />
        </View>
      }
      testID="recipients-sheet"
    >
      <View style={styles.content}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t.searchPlaceholder}
          accessibilityLabel={t.searchAria}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          testID="recipients-search"
        />
        {matches.length === 0 ? (
          <EmptyState variant="plain" title={dict.planner.common.nobodyFound} testID="recipients-empty" />
        ) : (
          <View accessibilityRole="list" style={styles.list}>
            {matches.map((student) => (
              <CheckRow
                key={student.id}
                label={student.name}
                checked={picked.has(student.id)}
                onChange={() => onToggle(student.id)}
                testID={`recipient-${student.id}`}
              />
            ))}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.md, paddingTop: t.space.xs },
  list: { gap: t.space.xs },
  footer: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  counter: { flex: 1 },
}));
