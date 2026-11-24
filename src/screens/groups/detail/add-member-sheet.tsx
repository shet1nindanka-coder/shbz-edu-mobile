import { useState } from 'react';
import { View } from 'react-native';

import type { GroupCandidate } from '@/api/types';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Avatar, BottomSheet, EmptyState, ListRow, TextField } from '@/ui';

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
 * Add-member search (06 §1.2 item 4): by name only, first 8 matches; a student of another group says so
 * in the row's one caption (the site's «в другой группе — будет переведён сюда» is its spoken form).
 * Tapping a row closes the sheet and adds the student.
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
      title={dict.students.list.addStudent}
      testID="member-add-sheet"
    >
      <View style={styles.content}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={dict.students.createForm.name}
          accessibilityLabel={t.addAria}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          autoFocus
          testID="member-add-search"
        />
        {!searching ? null : suggestions.length === 0 ? (
          <EmptyState variant="plain" title={dict.planner.common.nobodyFound} testID="member-add-empty" />
        ) : (
          <View accessibilityRole="list">
            {suggestions.map((student, index) => {
              const moved = isInOtherGroup(student, groupId);
              return (
                <ListRow
                  key={student.id}
                  title={student.name}
                  // The one consequence worth a line: the student leaves the other group at once.
                  subtitle={moved ? m.groups.members.fromOtherGroup : undefined}
                  left={<Avatar name={student.name} tone="neutral" />}
                  inset={0}
                  divider={index < suggestions.length - 1}
                  onPress={() => onPick(student)}
                  accessibilityLabel={moved ? `${student.name}, ${t.inOtherGroup}` : student.name}
                  testID={`member-add-${student.id}`}
                />
              );
            })}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.sm, paddingTop: t.space.xs },
}));
