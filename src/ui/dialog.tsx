import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles } from '@/theme';

import { BottomSheet } from './bottom-sheet';
import { Button } from './button';
import { Text } from './text';

export type DialogProps = {
  visible: boolean;
  title: string;
  /** Uppercase over-title, e.g. `dict.topics.widgets.confirm.kicker` («Подтверждение»). */
  kicker?: string;
  /** Always explain the consequences. */
  description?: string;
  /** Extra content under the description: a list, a consent checkbox. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Label of the confirm button while `pending` ("Удаляем…"). */
  pendingLabel?: string;
  /** The action is running: confirm shows the spinner and every way of closing is blocked. */
  pending?: boolean;
  /** Blocks confirm until e.g. a consent checkbox is ticked. */
  confirmDisabled?: boolean;
  /** `danger` — red kicker and a solid red confirm (default); `default` — primary confirm. */
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
  /** Accessible name of the backdrop; defaults to `cancelLabel`. */
  closeLabel?: string;
  testID?: string;
};

/**
 * Confirmation dialog (`ConfirmDialog`). On a phone it is a bottom sheet: kicker, title, explanation,
 * then Cancel (outline) and the confirm action. Backdrop, back button and drag cancel it — unless pending.
 */
export function Dialog({
  visible,
  title,
  kicker,
  description,
  children,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  pending = false,
  confirmDisabled = false,
  tone = 'danger',
  onConfirm,
  onCancel,
  closeLabel,
  testID,
}: DialogProps) {
  const styles = useStyles();
  return (
    <BottomSheet
      visible={visible}
      onClose={onCancel}
      closeLabel={closeLabel ?? cancelLabel}
      dismissible={!pending}
      showClose={false}
      testID={testID}
    >
      <View style={styles.content} accessibilityRole="alert">
        {kicker ? (
          <Text variant="kicker" color={tone === 'danger' ? 'dangerText' : 'textMuted'}>
            {kicker}
          </Text>
        ) : null}
        <Text variant="dialogTitle" accessibilityRole="header">
          {title}
        </Text>
        {description ? (
          <Text variant="small" color="label" style={styles.description}>
            {description}
          </Text>
        ) : null}
        {children}
      </View>
      <View style={styles.actions}>
        <Button label={cancelLabel} variant="outline" disabled={pending} onPress={onCancel} style={styles.action} />
        <Button
          label={pending && pendingLabel ? pendingLabel : confirmLabel}
          variant={tone === 'danger' ? 'dangerSolid' : 'primary'}
          loading={pending}
          disabled={confirmDisabled}
          onPress={onConfirm}
          style={styles.action}
        />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.sm, paddingTop: t.space.xxs },
  description: {},
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md, marginTop: t.space.lg },
  action: { flexGrow: 1, flexBasis: 120 },
}));
