import { useState } from 'react';
import { View } from 'react-native';

import type { GroupMember, HomeworkNumberStatus } from '@/api/types';
import { homeworkStatusShortLabel } from '@/domain/statuses';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Chip, Icon, IconButton, PressableScale, Text, type ChipTone } from '@/ui';

import { speedLabel } from '../logic';
import { MemberAiEditor } from './member-ai-editor';

const PROGRESS: readonly { status: HomeworkNumberStatus; tone: ChipTone; field: keyof GroupMember['progress'] }[] = [
  { status: 'GREEN', tone: 'green', field: 'greenCount' },
  { status: 'YELLOW', tone: 'yellow', field: 'yellowCount' },
  { status: 'RED', tone: 'red', field: 'redCount' },
];

export type MemberCardProps = {
  groupId: string;
  member: GroupMember;
  /** A membership change is running: the remove button is disabled. */
  busy: boolean;
  onRemove: (member: GroupMember) => void;
  /** A note sent while the AI-profile editor was closing was refused (see `MemberAiEditor`). */
  onProfileError?: (text: string) => void;
};

/**
 * A member of the group (06 §1.2 item 4): name, login, the three status counters over the whole bank,
 * the remove button, and the AI profile — folded into one row that shows the saved values and opens the
 * editor on tap.
 */
export function MemberCard({ groupId, member, busy, onRemove, onProfileError }: MemberCardProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.groups;
  const [editing, setEditing] = useState(false);

  const summary = [format(m.groups.members.aiProfileSummary, { speed: speedLabel(member.speed, t.memberEditor) }), member.aiNote]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card testID={`member-card-${member.id}`}>
      <View style={styles.head}>
        <View style={styles.identity}>
          <Text variant="bodyBold" numberOfLines={2}>
            {member.name}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {member.email}
          </Text>
        </View>
        <IconButton
          icon="close"
          variant="danger"
          accessibilityLabel={format(t.membersManager.removeAria, { name: member.name })}
          disabled={busy}
          onPress={() => onRemove(member)}
          testID={`member-remove-${member.id}`}
        />
      </View>

      <View style={styles.chips}>
        {PROGRESS.map(({ status, tone, field }) => (
          <Chip
            key={status}
            tone={tone}
            label={String(member.progress[field])}
            accessibilityLabel={format(m.groups.members.progressAria, {
              status: homeworkStatusShortLabel(status, dict),
              n: member.progress[field],
            })}
          />
        ))}
      </View>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={format(editing ? m.groups.members.aiProfileCollapseAria : m.groups.members.aiProfileExpandAria, {
          name: member.name,
        })}
        accessibilityState={{ expanded: editing }}
        onPress={() => setEditing((value) => !value)}
        scaleTo={1}
        style={styles.profileRow}
        pressedStyle={styles.profileRowPressed}
        testID={`member-ai-toggle-${member.id}`}
      >
        <View style={styles.profileText}>
          <Text variant="kickerSm">{m.groups.members.aiProfile}</Text>
          {editing ? null : (
            <Text variant="small" color="textMuted" numberOfLines={2}>
              {summary}
            </Text>
          )}
        </View>
        <Icon name={editing ? 'chevronUp' : 'chevronDown'} size={18} color="kicker" />
      </PressableScale>

      {editing ? <MemberAiEditor groupId={groupId} member={member} onDetachedError={onProfileError} /> : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.md },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs, marginTop: t.space.md },
  profileRow: {
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    marginTop: t.space.md,
    paddingTop: t.space.md,
    paddingBottom: t.space.xs,
    borderTopWidth: t.borders.hairline,
    borderTopColor: t.colors.rowBorder,
  },
  profileRowPressed: { opacity: 0.7 },
  profileText: { flex: 1, minWidth: 0, gap: 2 },
}));
