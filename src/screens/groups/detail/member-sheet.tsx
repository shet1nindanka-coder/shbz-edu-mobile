import { View } from 'react-native';

import type { GroupMember } from '@/api/types';
import { statusBreakdown } from '@/components/numbers';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, StatusBar, Text } from '@/ui';

import { MemberAiEditor } from './member-ai-editor';

export type MemberSheetProps = {
  groupId: string;
  /** The member the row opened (the live row of the group); kept by the caller while the sheet slides away. */
  member: GroupMember | null;
  visible: boolean;
  /** A membership change is running: the remove button is disabled. */
  busy: boolean;
  onClose: () => void;
  /** Called when the sheet has left the screen: the place to open the confirmation of a removal. */
  onClosed: () => void;
  /** «Убрать»: the caller closes the sheet and asks for a confirmation. */
  onRemove: (member: GroupMember) => void;
  /** A note sent while the AI-profile editor was closing was refused (see `MemberAiEditor`). */
  onProfileError?: (text: string) => void;
};

/**
 * What a member row opens (06 §1.2 item 4): the login, the bar by status over the whole bank with its
 * three counts as coloured figures (the words are spoken), the AI profile — speed and note, saved as they
 * are edited — and the way out of the group. Closing the sheet is "leaving the field" for a note that is
 * still being typed (see `MemberAiEditor`).
 */
export function MemberSheet({ groupId, member, visible, busy, onClose, onClosed, onRemove, onProfileError }: MemberSheetProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.groups;
  const counts = member
    ? { green: member.progress.greenCount, yellow: member.progress.yellowCount, red: member.progress.redCount, none: 0 }
    : null;
  const marked = counts ? counts.green + counts.yellow + counts.red : 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={member?.name}
      testID="member-sheet"
    >
      {member && counts ? (
        <View style={styles.content} testID={`member-card-${member.id}`}>
          <Text variant="small" color="textMuted" numberOfLines={1} selectable>
            {member.email}
          </Text>

          {marked > 0 ? (
            <View accessible accessibilityLabel={statusBreakdown(counts, m.common.statuses)} style={styles.progress}>
              <StatusBar counts={counts} style={styles.bar} />
              {counts.green > 0 ? (
                <Text variant="smallStrong" color="greenText" tabular>
                  {counts.green}
                </Text>
              ) : null}
              {counts.yellow > 0 ? (
                <Text variant="smallStrong" color="yellowText" tabular>
                  {counts.yellow}
                </Text>
              ) : null}
              {counts.red > 0 ? (
                <Text variant="smallStrong" color="redText" tabular>
                  {counts.red}
                </Text>
              ) : null}
            </View>
          ) : null}

          <MemberAiEditor groupId={groupId} member={member} onDetachedError={onProfileError} />

          <Button
            label={m.groups.members.remove}
            accessibilityLabel={format(t.membersManager.removeAria, { name: member.name })}
            variant="danger"
            disabled={busy}
            onPress={() => onRemove(member)}
            testID={`member-remove-${member.id}`}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.lg },
  // The bar takes the line; the counts of its segments stand after it, in their colours.
  progress: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  bar: { flex: 1, alignSelf: 'center' },
}));
