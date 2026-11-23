import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { AttendanceStatus } from '@/api/types';
import { useI18n } from '@/i18n';
import { makeStyles, useTheme, type Theme } from '@/theme';
import { Text } from '@/ui';

/**
 * Colours of an attendance mark (06 §1.2 item 6; docs/design/glass-over-paper.md §1): "present" / "late" /
 * "absent" are direct signals, so the soft status fills fit; "excused" and "not marked" are neutral, so
 * neither reads as a grade.
 */
export function attendanceColors(value: AttendanceStatus, theme: Theme): { bg: string; text: string } {
  switch (value) {
    case 'PRESENT':
      return theme.status.GREEN;
    case 'LATE':
      return theme.status.YELLOW;
    case 'ABSENT':
      return theme.status.RED;
    default:
      return { bg: theme.status.none.bg, text: theme.colors.textMuted };
  }
}

/**
 * What a tile says. The site's short labels fit a table cell of a page, not a 44 pt square: «опозд.» and
 * «уваж.» get the two-letter forms of the mockup; the others are the site's.
 */
export function useAttendanceTileLabel(): (value: AttendanceStatus) => string {
  const { dict, m } = useI18n();
  const labels = dict.planner.attendance.labels;
  return (value) => (value === 'LATE' ? m.groups.attendance.tileLate : value === 'EXCUSED' ? m.groups.attendance.tileExcused : labels[value].short);
}

export type AttendanceTileProps = {
  value: AttendanceStatus;
  /** The tile's text (`useAttendanceTileLabel`). */
  label: string;
  /** A request for this mark is running, or marking is switched off. */
  dimmed?: boolean;
  /** An option that is not the chosen one (the per-lesson control): white with an outline. */
  idle?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The mark of one lesson (`.at`): a 44 square, radius 12, 13 / 700. Purely visual — the cell around it is the control. */
export function AttendanceTile({ value, label, dimmed = false, idle = false, style }: AttendanceTileProps) {
  const theme = useTheme();
  const styles = useStyles();
  const colors = idle ? theme.status.idle : attendanceColors(value, theme);
  return (
    <View style={[styles.tile, { backgroundColor: colors.bg }, idle ? styles.idle : null, dimmed ? styles.dimmed : null, style]}>
      <Text variant="tile" numberOfLines={1} style={{ color: colors.text }}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  tile: {
    width: t.sizes.tile,
    height: t.sizes.tile,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.md,
  },
  idle: { borderWidth: t.borders.hairline, borderColor: t.status.idle.border },
  dimmed: { opacity: 0.6 },
}));
