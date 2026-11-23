import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { HomeworkNumberStatus } from '@/api/types';
import { HOMEWORK_STATUS_ORDER } from '@/domain/statuses';
import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Icon, PressableScale, STATUS_ICONS } from '@/ui';

export type StatusMarksProps = {
  value: HomeworkNumberStatus | null;
  /** Tapping the active mark clears it (`null`). */
  onChange: (value: HomeworkNumberStatus | null) => void;
  /** Accessible name of the group: «Статус номера 051004». */
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The teacher's three status marks of a number (`.st` of the mockups; docs/design/glass-over-paper.md §6):
 * check — «решил сам», turn-back arrow — «исправил», cross — «нужна помощь». Each is a 44 square; the
 * active one is filled with its status colour, the others are white with an outline. A radio group for
 * screen readers, named after the number.
 */
export function StatusMarks({ value, onChange, accessibilityLabel, disabled = false, testID, style }: StatusMarksProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} testID={testID} style={[styles.group, disabled ? styles.disabled : null, style]}>
      {HOMEWORK_STATUS_ORDER.map((status) => {
        const active = status === value;
        const palette = theme.status[active ? status : 'idle'];
        return (
          <PressableScale
            key={status}
            accessibilityRole="radio"
            accessibilityLabel={m.common.statuses[status].group}
            accessibilityState={{ checked: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(active ? null : status)}
            testID={testID ? `${testID}-${status}` : undefined}
            style={[styles.mark, { backgroundColor: palette.bg, borderColor: active ? 'transparent' : palette.border }]}
          >
            <Icon name={STATUS_ICONS[status]} size={theme.sizes.icon.md} tint={palette.text} />
          </PressableScale>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  group: { flexDirection: 'row', gap: t.space.sm },
  disabled: { opacity: 0.6 },
  mark: {
    width: t.sizes.tile,
    height: t.sizes.tile,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
  },
}));
