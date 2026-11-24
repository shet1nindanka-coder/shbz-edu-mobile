import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { GroupCandidate, GroupDetail, GroupDetailResponse, GroupMember } from '@/api/types';
import { statusBreakdown } from '@/components/numbers';
import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Avatar, Dialog, EmptyState, Icon, ListCard, ListRow, Notice, StatusBar, accessibilityLabelOf, useRowInset } from '@/ui';

import { invalidateGroupMembership } from '../shared/invalidate';
import { useFlash } from '../shared/use-flash';
import { AddMemberSheet } from './add-member-sheet';
import { FlashText } from './flash-text';
import { MemberSheet } from './member-sheet';

/** The site flashes «Сохранено» / «Ошибка» in the members header for 2000 ms. */
const MEMBERS_FLASH_MS = 2000;

export type MembersTabProps = {
  group: GroupDetail;
  /** A note sent while an AI-profile editor was closing was refused; the tab itself may be gone by then. */
  onProfileError?: (text: string) => void;
};

/**
 * «Участники» (06 §1.2 item 4, §3.4, §3.5; docs/design/glass-over-paper.md §1a): the first row of the
 * card opens the add-student search, the others are the members — the name and, as a bar by status, how
 * the student stands in the bank (the counts are said, not written). A row opens the member sheet: the AI
 * profile and «Убрать», which asks for a confirmation. Adding needs none, even when it moves the student
 * out of another group.
 */
export function MembersTab({ group, onProfileError }: MembersTabProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.planner.groups;
  const confirm = dict.topics.widgets.confirm;
  const inset = useRowInset();
  const flash = useFlash(MEMBERS_FLASH_MS);
  const [addOpen, setAddOpen] = useState(false);
  // The member sheet: the id stays set while the sheet slides away, so its content does not collapse.
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The sheet must be gone before the confirmation appears: two modals at once fight for the backdrop.
  const confirmAfterClose = useRef<GroupMember | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );
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

  const opened = group.members.find((member) => member.id === openedId) ?? null;

  return (
    <View style={styles.tab} testID="group-members-tab">
      {error ? (
        <Notice
          tone="error"
          text={error}
          onDismiss={() => setError(null)}
          dismissLabel={m.common.actions.close}
          testID="group-members-error"
        />
      ) : null}

      <ListCard testID="group-members-list">
        {/* The list starts with the way to add to it; the outcome of an add or a removal flashes here. */}
        <ListRow
          title={dict.students.list.addStudent}
          left={
            <View style={styles.addMark}>
              <Icon name="userPlus" size={theme.sizes.icon.md} color="textStrong" />
            </View>
          }
          right={<FlashText state={flash.state} testID="group-members-flash" />}
          inset={inset}
          disabled={busy}
          onPress={() => setAddOpen(true)}
          accessibilityLabel={t.membersManager.addAria}
          testID="group-member-add"
        />
        {group.members.map((member, index) => {
          const counts = { green: member.progress.greenCount, yellow: member.progress.yellowCount, red: member.progress.redCount, none: 0 };
          const marked = counts.green + counts.yellow + counts.red > 0;
          return (
            <ListRow
              key={member.id}
              title={member.name}
              left={<Avatar name={member.name} tone="neutral" />}
              // Status is colour and shape: the bar by status; nothing until the student has marked a number.
              right={marked ? <StatusBar counts={counts} style={styles.bar} /> : undefined}
              inset={inset}
              divider={index < group.members.length - 1}
              onPress={() => {
                setOpenedId(member.id);
                setSheetOpen(true);
              }}
              accessibilityLabel={accessibilityLabelOf([member.name, statusBreakdown(counts, m.common.statuses)])}
              // The id the folded AI-profile row had: the row is what opens the profile now.
              testID={`member-ai-toggle-${member.id}`}
            />
          );
        })}
      </ListCard>

      {group.members.length === 0 ? <EmptyState variant="plain" title={t.list.noStudents} testID="group-members-empty" /> : null}

      <MemberSheet
        groupId={group.id}
        member={opened}
        visible={sheetOpen && opened !== null}
        busy={busy}
        onClose={() => setSheetOpen(false)}
        onClosed={() => {
          const target = confirmAfterClose.current;
          confirmAfterClose.current = null;
          if (target === null) return;
          // One tick later: the commit that removes the sheet's modal is finished before the dialog asks
          // to appear (iOS refuses a modal while another one is still presented).
          confirmTimer.current = setTimeout(() => {
            confirmTimer.current = null;
            setRemoving(target);
            setRemoveOpen(true);
          }, 0);
        }}
        onRemove={(target) => {
          confirmAfterClose.current = target;
          setSheetOpen(false);
        }}
        onProfileError={onProfileError}
      />

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
  // The mark of the «add» row stands where the avatars of the members do, and is as big.
  addMark: {
    width: t.sizes.avatarSm,
    height: t.sizes.avatarSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.full,
    backgroundColor: t.colors.soft2,
  },
  // A short bar at the end of the row: the proportions are read at a glance, the counts are in the sheet.
  // (The bar stretches by default: in a row it has to be centred explicitly.)
  bar: { width: t.space.xxl * 3, alignSelf: 'center' },
}));
