import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
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
 * The list is every student of the school, so it is virtualised; the sheet gives it a bounded height.
 */

/** Share of the window the checklist may take; the search field, title and footer need the rest. */
const LIST_MAX_SHARE = 0.45;
export function RecipientsSheet({ visible, students, pickedIds, onToggle, onClose }: RecipientsSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const window = useWindowDimensions();
  const { dict, m } = useI18n();
  const t = dict.planner.devPanel.broadcast;
  const [query, setQuery] = useState('');
  const matches = filterRecipients(students, query);
  const picked = new Set(pickedIds);
  // A short result is as tall as its rows; a long one scrolls inside the cap.
  const rowStride = theme.sizes.minTouch + theme.space.xs;
  const listHeight = Math.min(matches.length * rowStride, Math.round(window.height * LIST_MAX_SHARE));

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={() => setQuery('')}
      closeLabel={m.common.actions.close}
      title={m.developer.broadcast.pickStudents}
      // The checklist scrolls by itself (FlashList), not the sheet.
      scroll={false}
      // Without a ScrollView the body must shrink itself, or it overflows under the footer in a short window.
      contentStyle={styles.shrink}
      footer={
        <View style={styles.footer}>
          {/* «Выбрано: 2»; with nobody picked there is nothing to say. */}
          <Text variant="small" color="textMuted" style={styles.counter} testID="recipients-sheet-count">
            {pickedIds.length > 0 ? format(t.picked, { n: pickedIds.length }) : ''}
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
          placeholder={t.searchAria}
          accessibilityLabel={t.searchAria}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          testID="recipients-search"
        />
        {matches.length === 0 ? (
          <EmptyState variant="plain" title={dict.planner.common.nobodyFound} testID="recipients-empty" />
        ) : (
          <View
            accessibilityRole="list"
            // The height is only preferred: in a short window the list gives way (down to one row) to the footer.
            style={[styles.shrink, { height: listHeight, minHeight: Math.min(listHeight, rowStride) }]}
          >
            <FlashList
              data={matches}
              keyExtractor={(student) => student.id}
              renderItem={({ item }) => (
                <View style={styles.item}>
                  <CheckRow
                    label={item.name}
                    checked={picked.has(item.id)}
                    onChange={() => onToggle(item.id)}
                    testID={`recipient-${item.id}`}
                  />
                </View>
              )}
              // The ticks live outside the rows.
              extraData={pickedIds}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              testID="recipients-list"
            />
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { flexShrink: 1, minHeight: 0, gap: t.space.md, paddingTop: t.space.xs },
  shrink: { flexShrink: 1, minHeight: 0 },
  item: { paddingBottom: t.space.xs },
  footer: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  counter: { flex: 1 },
}));
