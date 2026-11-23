import { View } from 'react-native';

import type { AttendanceStatus } from '@/api/types';
import { ATTENDANCE_STATUSES } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Icon, PressableScale, Text } from '@/ui';

import { AttendanceTile, useAttendanceTileLabel } from './attendance-tile';

export type AttendanceMarkTarget = {
  lessonId: string;
  participantId: string;
  studentName: string;
  lessonTitle: string;
  /** Formatted start of the lesson. */
  lessonDate: string;
  attendance: AttendanceStatus;
};

export type AttendanceMarkSheetProps = {
  visible: boolean;
  /** Kept while the sheet slides away, so its content does not collapse mid-animation. */
  target: AttendanceMarkTarget | null;
  onClose: () => void;
  onPick: (target: AttendanceMarkTarget, value: AttendanceStatus) => void;
};

/** `UNKNOWN` last: clearing a mark is the rare case. */
const ORDER: readonly AttendanceStatus[] = [
  ...ATTENDANCE_STATUSES.filter((value) => value !== 'UNKNOWN'),
  ...ATTENDANCE_STATUSES.filter((value) => value === 'UNKNOWN'),
];

/**
 * Explicit choice of a mark, opened by a long press on a cell of the table (06 Q4): all five values,
 * including "not marked", which the tap cycle can never reach again. Every tile stands next to its full
 * name, so the sheet is also the legend of the table.
 */
export function AttendanceMarkSheet({ visible, target, onClose, onPick }: AttendanceMarkSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  const labels = dict.planner.attendance.labels;
  const tileLabel = useAttendanceTileLabel();

  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel={m.common.actions.close} title={target?.studentName} testID="attendance-mark-sheet">
      {target ? (
        <View>
          <Text variant="small" color="textMuted" style={styles.hint}>
            {format(m.groups.attendance.markSheetHint, { date: target.lessonDate, title: target.lessonTitle })}
          </Text>
          <View accessibilityRole="menu">
            {ORDER.map((value, index) => {
              const active = value === target.attendance;
              return (
                <PressableScale
                  key={value}
                  accessibilityRole="menuitem"
                  accessibilityLabel={labels[value].label}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    onClose();
                    if (!active) onPick(target, value);
                  }}
                  scaleTo={1}
                  style={[styles.option, index > 0 ? styles.optionBorder : null]}
                  pressedStyle={styles.pressed}
                  testID={`attendance-mark-option-${value}`}
                >
                  <AttendanceTile value={value} label={tileLabel(value)} />
                  <Text variant="bodyStrong" style={styles.label}>
                    {labels[value].label}
                  </Text>
                  {active ? <Icon name="check" size={theme.sizes.icon.md} color="textStrong" /> : null}
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  hint: { paddingBottom: t.space.xs },
  option: { minHeight: t.sizes.row, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  optionBorder: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  pressed: { opacity: 0.6 },
  label: { flex: 1, minWidth: 0 },
}));
