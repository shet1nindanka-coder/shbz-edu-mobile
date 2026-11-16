import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { useApi } from '@/api';
import type { GroupListItem } from '@/api/types';
import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Notice, Text, TextField } from '@/ui';

import { GROUP_NAME_MAX_LENGTH, normalizeGroupName, parseGradeInput } from '../logic';
import { errorText } from '../shared/error-text';
import { invalidateGroupLists } from '../shared/invalidate';

export type CreateGroupSheetProps = {
  visible: boolean;
  onClose: () => void;
  onCreated: (group: GroupListItem) => void;
};

/**
 * "Создать группу" (06 §1.1 item 3, §3.1) as a bottom sheet: name (required, ≤ 120) and an optional
 * grade 1..11. The subject is not asked — the server defaults it to maths. The form is mounted per
 * opening, so a cancelled draft never comes back.
 */
export function CreateGroupSheet({ visible, onClose, onCreated }: CreateGroupSheetProps) {
  const { dict, m } = useI18n();
  const [pending, setPending] = useState(false);
  const [instance, setInstance] = useState(0);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={() => setInstance((value) => value + 1)}
      closeLabel={m.common.actions.close}
      title={dict.planner.groups.list.create}
      dismissible={!pending}
      testID="group-create-sheet"
    >
      <CreateGroupForm key={instance} onPendingChange={setPending} onCreated={onCreated} />
    </BottomSheet>
  );
}

function CreateGroupForm({
  onPendingChange,
  onCreated,
}: {
  onPendingChange: (pending: boolean) => void;
  onCreated: (group: GroupListItem) => void;
}) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.planner.groups;
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: { name: string; grade: number | null }) => api.groups.createGroup(input),
    onMutate: () => onPendingChange(true),
    onSuccess: ({ group }) => {
      invalidateGroupLists(queryClient);
      onCreated(group);
    },
    // 400 invalidData, 403 unauthorized (a developer), 500 saveFailed and a network failure all carry
    // their own localised line.
    onError: (failure) => setError(errorText(failure, t.list.notices.save)),
    onSettled: () => onPendingChange(false),
  });

  const normalizedName = normalizeGroupName(name);
  const submit = () => {
    if (create.isPending || normalizedName === '') return;
    const parsed = parseGradeInput(grade);
    if (!parsed.ok) {
      setError(t.list.notices.invalid);
      return;
    }
    setError(null);
    create.mutate({ name: normalizedName, grade: parsed.grade });
  };

  return (
    <View style={styles.form}>
      {error ? <Notice tone="error" text={error} testID="group-create-error" /> : null}
      <TextField
        label={t.createForm.nameLabel}
        value={name}
        onChangeText={setName}
        placeholder={t.createForm.namePlaceholder}
        maxLength={GROUP_NAME_MAX_LENGTH}
        autoCapitalize="sentences"
        returnKeyType="next"
        disabled={create.isPending}
        testID="group-create-name"
      />
      <TextField
        label={t.createForm.gradeLabel}
        value={grade}
        onChangeText={(text) => setGrade(text.replace(/\D+/g, '').slice(0, 2))}
        placeholder="—"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={2}
        returnKeyType="done"
        onSubmitEditing={submit}
        disabled={create.isPending}
        testID="group-create-grade"
      />
      <Hint>
        <Text variant="hint" color="textMuted">
          {m.groups.list.gradeHint}
        </Text>
      </Hint>
      <Button
        label={create.isPending ? m.common.states.saving : t.createForm.submit}
        onPress={submit}
        loading={create.isPending}
        disabled={normalizedName === ''}
        fullWidth
        testID="group-create-submit"
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.space.field, paddingTop: t.space.xs },
}));
