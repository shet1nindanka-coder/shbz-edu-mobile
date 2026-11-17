import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { GroupCandidate, GroupDetail, GroupDetailResponse, GroupMember } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Dialog, EmptyState, Notice, Text } from '@/ui';

import { invalidateGroupMembership } from '../shared/invalidate';
import { useFlash } from '../shared/use-flash';
import { AddMemberSheet } from './add-member-sheet';
import { FlashText } from './flash-text';
import { MemberCard } from './member-card';

/** The site flashes «Сохранено» / «Ошибка» in the members header for 2000 ms. */
const MEMBERS_FLASH_MS = 2000;

export type MembersTabProps = {
  group: GroupDetail;
  /** A note sent while an AI-profile editor was closing was refused; the tab itself may be gone by then. */
  onProfileError?: (text: string) => void;
};

/**
 * «Участники» (06 §1.2 item 4, §3.4, §3.5): the member cards, the add-student search and removal with a
 * confirmation. Adding needs no confirmation, even when it moves the student out of another group.
 */
export function MembersTab({ group, onProfileError }: MembersTabProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.planner.groups;
  const confirm = dict.topics.widgets.confirm;
  const flash = useFlash(MEMBERS_FLASH_MS);
  const [addOpen, setAddOpen] = useState(false);
  // The member stays set while the dialog slides away, so its text does not collapse mid-animation.
  const [removing, setRemoving] = useState<GroupMember | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupKey = qk('groups', 'getGroup', group.id);
  const patchGroup = (change: (current: GroupDetail) => GroupDetail) =>
    queryClient.setQueryData<GroupDetailResponse>(groupKey, (current) =>
      current ? { ...current, group: change(current.group) } : current,
    );

  const begin = () => {
    setError(null);
    flash.start();
  };
  const fail = (failure: unknown) => {
    flash.finish(false);
    // 404 groupNotFound / studentNotFound, 500 saveFailed, a network failure — each with its own text.
    setError(errorText(failure, t.detail.notices.save));
    // After a 404 the cached group is no longer true: let the screen find out.
    invalidateGroupMembership(queryClient);
  };

  // A row of the pick sheet is not a guarded button and `busy` lags a render: a synchronous flag keeps a
  // double tap from sending the same student twice.
  const addInFlight = useRef(false);
  const add = useMutation({
    mutationFn: (student: GroupCandidate) => api.groups.addGroupMember(group.id, { studentId: student.id }),
    onMutate: begin,
    onSettled: () => {
      addInFlight.current = false;
    },
    onSuccess: ({ member }) => {
      flash.finish(true);
      patchGroup((current) => ({
        ...current,
        members: [...current.members.filter((row) => row.id !== member.id), member].sort((left, right) =>
          left.name.localeCompare(right.name, 'ru'),
        ),
        allStudents: current.allStudents.map((row) => (row.id === member.id ? { ...row, groupId: current.id } : row)),
      }));
      invalidateGroupMembership(queryClient);
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (member: GroupMember) => api.groups.removeGroupMember(group.id, member.id),
    onMutate: begin,
    onSuccess: (_result, member) => {
      flash.finish(true);
      patchGroup((current) => ({
        ...current,
        members: current.members.filter((row) => row.id !== member.id),
        allStudents: current.allStudents.map((row) => (row.id === member.id ? { ...row, groupId: null } : row)),
      }));
      invalidateGroupMembership(queryClient);
    },
    onError: fail,
    onSettled: () => setRemoveOpen(false),
  });

  const busy = add.isPending || remove.isPending;

  return (
    <View style={styles.tab} testID="group-members-tab">
      <View style={styles.headRow}>
        <Text variant="sectionTitle" accessibilityRole="header" style={styles.title}>
          {format(t.membersManager.participants, { n: group.members.length })}
        </Text>
        <FlashText state={flash.state} testID="group-members-flash" />
      </View>

      {error ? (
        <Notice
          tone="error"
          text={error}
          onDismiss={() => setError(null)}
          dismissLabel={m.common.actions.close}
          testID="group-members-error"
        />
      ) : null}

      <Button
        label={dict.students.list.addStudent}
        accessibilityLabel={t.membersManager.addAria}
        variant="outline"
        leftIcon="userPlus"
        disabled={busy}
        onPress={() => setAddOpen(true)}
        testID="group-member-add"
      />

      {group.members.length === 0 ? (
        <EmptyState variant="plain" title={m.groups.members.empty} testID="group-members-empty" />
      ) : (
        group.members.map((member) => (
          <MemberCard
            key={member.id}
            groupId={group.id}
            member={member}
            busy={busy}
            onProfileError={onProfileError}
            onRemove={(target) => {
              setRemoving(target);
              setRemoveOpen(true);
            }}
          />
        ))
      )}

      <AddMemberSheet
        visible={addOpen}
        groupId={group.id}
        allStudents={group.allStudents}
        onClose={() => setAddOpen(false)}
        onPick={(student) => {
          setAddOpen(false);
          if (busy || addInFlight.current) return;
          addInFlight.current = true;
          add.mutate(student);
        }}
      />

      <Dialog
        visible={removeOpen}
        kicker={confirm.kicker}
        title={t.membersManager.removeTitle}
        description={removing ? `«${removing.name}»${t.membersManager.removeAfter}` : undefined}
        confirmLabel={t.membersManager.removeConfirm}
        pendingLabel={confirm.pending}
        cancelLabel={confirm.cancel}
        pending={remove.isPending}
        onConfirm={() => {
          if (removing && !remove.isPending) remove.mutate(removing);
        }}
        onCancel={() => setRemoveOpen(false)}
        testID="group-member-remove-dialog"
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  tab: { gap: t.space.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  title: { flexShrink: 1 },
}));
