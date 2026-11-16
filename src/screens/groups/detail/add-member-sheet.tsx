import { useState } from 'react';
import { View } from 'react-native';

import type { GroupCandidate } from '@/api/types';
import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { BottomSheet, EmptyState, PressableScale, Text, TextField } from '@/ui';

import { isInOtherGroup, suggestCandidates } from '../logic';

export type AddMemberSheetProps = {
  visible: boolean;
  groupId: string;
  /** Every student of the viewer, members of this group included (they are filtered out here). */
  allStudents: readonly GroupCandidate[];
  onClose: () => void;
  /** The student is added at once, without a confirmation — also when it moves them from another group. */
  onPick: (student: GroupCandidate) => void;
};

/**
 * Add-member search (06 §1.2 item 4): by name only, first 8 matches, with the «в другой группе — будет
 * переведён сюда» warning. Tapping a row closes the sheet and adds the student.
 */
export function AddMemberSheet({ visible, groupId, allStudents, onClose, onPick }: AddMemberSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.groups.membersManager;
  const [query, setQuery] = useState('');

  // As on the site, nothing is listed (and nobody is "not found") before the first letter.
  const searching = query.trim() !== '';
  const suggestions = suggestCandidates(allStudents, groupId, query);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={() => setQuery('')}
      closeLabel={m.common.actions.close}
      title={t.addAria}
      testID="member-add-sheet"
    >
      <View style={styles.content}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={m.groups.members.searchPlaceholder}
          accessibilityLabel={t.addAria}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          autoFocus
          testID="member-add-search"
        />
        {!searching ? (
          <Hint>
            <Text variant="hint" color="textMuted" testID="member-add-prompt">
              {m.groups.members.searchPrompt}
            </Text>
          </Hint>
        ) : suggestions.length === 0 ? (
          <EmptyState variant="plain" title={dict.planner.common.nobodyFound} testID="member-add-empty" />
        ) : (
          <View accessibilityRole="list">
            {suggestions.map((student, index) => (
              <PressableScale
                key={student.id}
                accessibilityRole="button"
                accessibilityLabel={
                  isInOtherGroup(student, groupId) ? `${student.name}, ${t.inOtherGroup}` : student.name
                }
                onPress={() => onPick(student)}
                scaleTo={1}
                style={[styles.row, index < suggestions.length - 1 ? styles.rowDivider : null]}
                pressedStyle={styles.rowPressed}
                testID={`member-add-${student.id}`}
              >
                <Text variant="bodyStrong" numberOfLines={1}>
                  {student.name}
                </Text>
                {isInOtherGroup(student, groupId) ? (
                  <Text variant="captionMedium" color="yellowText">
                    {t.inOtherGroup}
                  </Text>
                ) : null}
              </PressableScale>
            ))}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.sm, paddingTop: t.space.xs },
  row: {
    minHeight: t.sizes.minTouch + 4,
    justifyContent: 'center',
    gap: 2,
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.xxs,
  },
  rowDivider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  rowPressed: { backgroundColor: t.colors.tabHover },
}));
