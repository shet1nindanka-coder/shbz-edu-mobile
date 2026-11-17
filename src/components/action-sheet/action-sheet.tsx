import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Icon, PressableScale, Text, type IconName } from '@/ui';

export type SheetAction = {
  key: string;
  label: string;
  icon: IconName;
  /** `danger` — a destructive action (it still asks for confirmation in a dialog). */
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onPress: () => void;
};

export type ActionSheetProps = {
  visible: boolean;
  title: string;
  actions: readonly SheetAction[];
  onClose: () => void;
  testID?: string;
};

/**
 * The "⋯" menu of a lesson / draft: the site's row of secondary buttons (handout, answers, assign
 * homework, delete) as a bottom sheet of 48 pt rows (docs/spec/05-teacher-lessons-plans.md §1.1, §1.3
 * "Phone translation"). Choosing a row closes the sheet; the action runs only after the sheet has left
 * the tree. An action usually opens the next modal (a confirmation dialog), and two modals must never
 * overlap: on iOS a `Modal` that is asked to appear while another one is still presented (this sheet
 * during its exit animation) is refused by UIKit and never shown, so "Delete" would do nothing.
 */
export function ActionSheet({ visible, title, actions, onClose, testID }: ActionSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();
  /** The row that was chosen; it runs when the exit animation has ended. */
  const chosen = useRef<SheetAction | null>(null);
  const runTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (runTimer.current) clearTimeout(runTimer.current);
    },
    [],
  );

  const runChosen = () => {
    const action = chosen.current;
    chosen.current = null;
    if (!action) return;
    // One tick later: the commit that removes this sheet's modal is finished before the action can ask
    // for the next one.
    runTimer.current = setTimeout(() => {
      runTimer.current = null;
      action.onPress();
    }, 0);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={runChosen} closeLabel={m.common.actions.close} title={title} testID={testID}>
      <View accessibilityRole="menu" style={styles.list}>
        {actions.map((action) => {
          const danger = action.tone === 'danger';
          const tint = danger ? theme.colors.dangerText : theme.colors.textStrong;
          return (
            <PressableScale
              key={action.key}
              accessibilityRole="menuitem"
              accessibilityLabel={action.label}
              accessibilityState={{ disabled: Boolean(action.disabled) }}
              disabled={action.disabled}
              scaleTo={1}
              onPress={() => {
                chosen.current = action;
                onClose();
              }}
              testID={testID ? `${testID}-${action.key}` : undefined}
              style={[styles.row, action.disabled ? styles.disabled : null]}
              pressedStyle={styles.pressed}
            >
              <Icon name={action.icon} size={18} tint={tint} />
              <Text variant="bodyStrong" numberOfLines={2} style={[styles.label, { color: tint }]}>
                {action.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  list: { gap: t.space.xxs, paddingBottom: t.space.sm },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingHorizontal: t.space.md,
    borderRadius: t.radii.md,
  },
  pressed: { backgroundColor: t.colors.softBg },
  disabled: { opacity: 0.5 },
  label: { flex: 1, minWidth: 0 },
}));
