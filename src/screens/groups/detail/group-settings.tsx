import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { GroupDetailResponse } from '@/api/types';
import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Dialog, Icon, ListRow, Notice, Text, TextField } from '@/ui';

import { GROUP_NAME_MAX_LENGTH, normalizeGroupName } from '../logic';
import { invalidateGroupLists } from '../shared/invalidate';

export type GroupSettingsProps = {
  group: { id: string; name: string };
  /** The "⋯" menu of the app bar. */
  menuOpen: boolean;
  onCloseMenu: () => void;
  onRenamed: () => void;
  /** The group no longer exists: the screen leaves for the list. */
  onDeleted: () => void;
  /** A delete that failed: the dialog is closed, the reason is shown on the screen. */
  onDeleteFailed: (text: string) => void;
};

type Step = 'rename' | 'delete';

/**
 * «Настройки группы» (06 §1.2 item 8, §3.2, §3.3) behind the app bar's "⋯": rename in a one-field sheet,
 * delete behind a confirmation that spells out the consequences. Grade and subject cannot be edited.
 */
export function GroupSettings({ group, menuOpen, onCloseMenu, onRenamed, onDeleted, onDeleteFailed }: GroupSettingsProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.planner.groups;
  const confirm = dict.topics.widgets.confirm;
  // The menu must be gone before the next sheet appears: two modals at once fight for the backdrop.
  const nextStep = useRef<Step | null>(null);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
    },
    [],
  );
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [renameError, setRenameError] = useState<string | null>(null);

  const rename = useMutation({
    mutationFn: (value: string) => api.groups.renameGroup(group.id, { name: value }),
    onMutate: () => setRenameError(null),
    onSuccess: ({ group: renamed }) => {
      queryClient.setQueryData<GroupDetailResponse>(qk('groups', 'getGroup', group.id), (current) =>
        current ? { ...current, group: { ...current.group, name: renamed.name } } : current,
      );
      invalidateGroupLists(queryClient);
      setRenameOpen(false);
      onRenamed();
    },
    onError: (failure) => {
      // 400 invalidData, 404 groupNotFound, 500 saveFailed, network — each with its own text.
      setRenameError(errorText(failure, t.detail.notices.save));
      if (isNotFoundError(failure)) invalidateGroupLists(queryClient);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.groups.deleteGroup(group.id),
    onSuccess: () => {
      invalidateGroupLists(queryClient);
      setDeleteOpen(false);
      onDeleted();
    },
    onError: (failure) => {
      setDeleteOpen(false);
      onDeleteFailed(errorText(failure, t.list.notices.save));
      if (isNotFoundError(failure)) {
        invalidateGroupLists(queryClient);
        void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroup', group.id) });
      }
    },
  });

  const normalized = normalizeGroupName(name);
  const submitRename = () => {
    if (rename.isPending || normalized === '') return;
    rename.mutate(normalized);
  };

  const choose = (step: Step) => {
    nextStep.current = step;
    onCloseMenu();
  };

  return (
    <>
      <BottomSheet
        visible={menuOpen}
        onClose={onCloseMenu}
        onClosed={() => {
          const step = nextStep.current;
          nextStep.current = null;
          if (step === null) return;
          // One tick later: the commit that removes the menu's modal is finished before the next sheet
          // or dialog asks to appear (iOS refuses a modal while another one is still presented).
          stepTimer.current = setTimeout(() => {
            stepTimer.current = null;
            if (step === 'rename') {
              setName(group.name);
              setRenameError(null);
              setRenameOpen(true);
            } else {
              setDeleteOpen(true);
            }
          }, 0);
        }}
        closeLabel={m.common.actions.close}
        title={t.detail.settings}
        padded={false}
        testID="group-menu-sheet"
      >
        <View style={styles.menu}>
          <ListRow
            title={t.detail.rename}
            left={<Icon name="edit" size={18} color="textStrong" />}
            chevron={false}
            onPress={() => choose('rename')}
            testID="group-menu-rename"
          />
          <ListRow
            title={t.detail.delete}
            left={<Icon name="trash" size={18} color="dangerSolid" />}
            chevron={false}
            divider={false}
            onPress={() => choose('delete')}
            testID="group-menu-delete"
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={renameOpen}
        onClose={() => setRenameOpen(false)}
        closeLabel={m.common.actions.close}
        title={t.detail.rename}
        dismissible={!rename.isPending}
        footer={
          <Button
            label={rename.isPending ? m.common.states.saving : t.detail.rename}
            size="lg"
            fullWidth
            onPress={submitRename}
            loading={rename.isPending}
            disabled={normalized === ''}
            testID="group-rename-submit"
          />
        }
        testID="group-rename-sheet"
      >
        <View style={styles.form}>
          {renameError ? <Notice tone="error" text={renameError} testID="group-rename-error" /> : null}
          <TextField
            label={t.detail.nameLabel}
            value={name}
            onChangeText={setName}
            maxLength={GROUP_NAME_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={submitRename}
            disabled={rename.isPending}
            testID="group-rename-name"
          />
          <Hint>
            <Text variant="hint" color="textMuted">
              {m.groups.detail.renameHint}
            </Text>
          </Hint>
        </View>
      </BottomSheet>

      <Dialog
        visible={deleteOpen}
        kicker={confirm.kicker}
        title={t.detail.deleteTitle}
        description={`${t.detail.deleteBefore}«${group.name}»${t.detail.deleteAfter}`}
        confirmLabel={confirm.confirm}
        pendingLabel={confirm.pending}
        cancelLabel={confirm.cancel}
        pending={remove.isPending}
        onConfirm={() => {
          if (!remove.isPending) remove.mutate();
        }}
        onCancel={() => setDeleteOpen(false)}
        testID="group-delete-dialog"
      />
    </>
  );
}

const useStyles = makeStyles((t) => ({
  menu: { paddingBottom: t.space.sm },
  form: { gap: t.space.field, paddingTop: t.space.xs },
}));
