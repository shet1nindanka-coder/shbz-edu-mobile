import { useState } from 'react';
import { View } from 'react-native';

import type { NumbersChangePreview } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Checkbox, Notice, Text } from '@/ui';

import { assignedNumbers, canConfirmRemoval, dangerousNumbers } from './topic-edit';

export type NumbersConfirmDialogProps = {
  /** The destructive change to confirm; `null` keeps the dialog closed. */
  plan: NumbersChangePreview | null;
  /** The server refused the previous confirmation and sent this (fresh) plan. */
  error: string | null;
  allowAssigned: boolean;
  onAllowAssignedChange: (value: boolean) => void;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * "Problems with student work will be removed" (site: the confirm dialog of `TopicEditSubmitButton`,
 * docs/spec/07-developer-content.md §1.3.1 step 5, §4.3): every removed number that carries work with the
 * server's consequence line, what is added and kept, and — when a removed number sits in an issued
 * homework — the acknowledgement that gates the destructive button.
 */
export function NumbersConfirmDialog({ plan, error, allowAssigned, onAllowAssignedChange, saving, onConfirm, onCancel }: NumbersConfirmDialogProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.topics.submit;
  // The sheet slides away after `plan` is cleared: keep the last one on it meanwhile.
  const [lastPlan, setLastPlan] = useState(plan);
  if (plan && plan !== lastPlan) setLastPlan(plan);
  const shown = plan ?? lastPlan;
  const numberLabel = (number: string) => format(dict.topics.widgets.numberLabel, { number });

  return (
    // The kit's `Dialog` puts its two buttons side by side, which cuts «Да, удалить эти номера» on a
    // phone; this confirmation has the same anatomy on a sheet of its own, with the buttons stacked and
    // pinned under the (possibly long) list.
    <BottomSheet
      visible={plan !== null}
      onClose={onCancel}
      closeLabel={dict.topics.widgets.confirm.cancel}
      dismissible={!saving}
      showClose={false}
      footer={
        <View style={styles.actions}>
          <Button
            label={saving ? t.pending : t.confirm}
            variant="dangerSolid"
            loading={saving}
            disabled={!shown || !canConfirmRemoval(shown, allowAssigned)}
            onPress={onConfirm}
            testID="numbers-confirm-submit"
          />
          <Button
            label={dict.topics.widgets.confirm.cancel}
            variant="outline"
            disabled={saving}
            onPress={onCancel}
            testID="numbers-confirm-cancel"
          />
        </View>
      }
      testID="numbers-confirm-dialog"
    >
      <View style={styles.content} accessibilityRole="alert">
        <Text variant="kicker" color="dangerText">
          {dict.topics.widgets.confirm.kicker}
        </Text>
        <Text variant="dialogTitle" accessibilityRole="header">
          {t.dialogTitle}
        </Text>
        <Text variant="small" color="label">
          {t.dialogIntro}
        </Text>

        {shown ? (
          <View style={styles.body}>
            <View style={styles.list} testID="numbers-confirm-removed">
              {dangerousNumbers(shown).map((entry) => (
                <Text key={entry.number} variant="small" color="label">
                  <Text variant="smallBold" color="textStrong">
                    {numberLabel(entry.number)}
                  </Text>
                  {` — ${entry.summary}`}
                </Text>
              ))}
            </View>

            {shown.added.length > 0 ? (
              <Text variant="small" color="label" testID="numbers-confirm-added">
                {format(t.added, { numbers: shown.added.join(', ') })}
              </Text>
            ) : null}
            <Text variant="small" color="label" testID="numbers-confirm-kept">
              {format(t.kept, { count: shown.keptCount })}
            </Text>

            {shown.requiresAssignedConfirmation ? (
              <Checkbox
                checked={allowAssigned}
                onChange={onAllowAssignedChange}
                disabled={saving}
                label={format(t.assignedAck, {
                  numbers: assignedNumbers(shown)
                    .map((entry) => numberLabel(entry.number))
                    .join(', '),
                })}
                testID="numbers-confirm-ack"
              />
            ) : null}

            {error ? <Notice tone="error" text={error} testID="numbers-confirm-error" /> : null}
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.sm, paddingTop: t.space.xxs, paddingBottom: t.space.md },
  actions: { gap: t.space.md },
  body: { gap: t.space.md },
  list: { gap: t.space.xs },
}));
