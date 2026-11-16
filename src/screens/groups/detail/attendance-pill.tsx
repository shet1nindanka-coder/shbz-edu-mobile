import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { AttendanceStatus } from '@/api/types';
import { makeStyles, useTheme, type Theme } from '@/theme';
import { Text } from '@/ui';

export type AttendanceColors = { bg: string; text: string; border: string; dashed: boolean };

/**
 * Colours of an attendance mark (06 §1.2 item 6). "Present" / "absent" are direct signals, so the status
 * palette fits; "late" is yellow; "excused" is neutral so it does not read as a grade; "not marked" is an
 * empty dashed outline.
 */
export function attendanceColors(value: AttendanceStatus, theme: Theme): AttendanceColors {
  switch (value) {
    case 'PRESENT':
      return { bg: theme.status.GREEN.bg, text: theme.status.GREEN.text, border: 'transparent', dashed: false };
    case 'LATE':
      return { bg: theme.status.YELLOW.bg, text: theme.status.YELLOW.text, border: 'transparent', dashed: false };
    case 'ABSENT':
      return { bg: theme.colors.dangerBg, text: theme.colors.dangerText, border: 'transparent', dashed: false };
    case 'EXCUSED':
      return { bg: theme.status.none.bg, text: theme.status.none.text, border: 'transparent', dashed: false };
    default:
      return { bg: 'transparent', text: theme.colors.textSoft, border: theme.colors.inputBorder, dashed: true };
  }
}

/**
 * Colours of the chosen option in the per-lesson control. Unlike a pill in the table, a chosen option
 * sits between unchosen outlined ones, so it keeps a border of its own; "excused" takes the ink outline,
 * otherwise its neutral fill would read as a disabled button.
 */
export function selectedMarkColors(value: AttendanceStatus, theme: Theme): { bg: string; text: string; border: string } {
  switch (value) {
    case 'PRESENT':
      return theme.status.GREEN;
    case 'LATE':
      return theme.status.YELLOW;
    case 'ABSENT':
      return theme.status.RED;
    default:
      return theme.status.neutral;
  }
}

export type AttendancePillProps = {
  value: AttendanceStatus;
  /** `dict.planner.attendance.labels[value].short`. */
  label: string;
  /** A request for this mark is running. */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The pill of one mark: 56 × 30, radius 8, 12/700. Purely visual — the cell around it is the control. */
export function AttendancePill({ value, label, busy = false, style }: AttendancePillProps) {
  const theme = useTheme();
  const styles = useStyles();
  const colors = attendanceColors(value, theme);
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: colors.bg, borderColor: colors.border, borderStyle: colors.dashed ? 'dashed' : 'solid' },
        busy ? styles.busy : null,
        style,
      ]}
    >
      <Text variant="captionBold" numberOfLines={1} style={{ color: colors.text }}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  pill: {
    minWidth: 56,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.space.xs,
    borderRadius: t.radii.sm,
    borderWidth: t.borders.hairline,
  },
  busy: { opacity: 0.6 },
}));
