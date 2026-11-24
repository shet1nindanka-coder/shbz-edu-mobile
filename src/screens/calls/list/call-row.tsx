import { useEffect } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import type { ParentCallStudentOverview } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Avatar, Chip, ListRow, accessibilityLabelOf, useTextScale } from '@/ui';

import { attentionChip, callMetaLine, callRowCaption, teacherLine } from '../logic';

export type CallRowProps = {
  student: ParentCallStudentOverview;
  /** TEACHER: the row opens the record form. A developer only reads: the row opens the history. */
  canRecord: boolean;
  /** DEVELOPER: the caption is the owning teacher's name. */
  showTeacher: boolean;
  /** The row a notification pointed at: soft accent background that fades out when this turns false. */
  highlighted: boolean;
  /** Tablet: the student whose form the panel next to the list shows. */
  selected: boolean;
  divider: boolean;
  /** Absent when there is nothing to open (a read-only viewer and a student without calls). */
  onPress?: (student: ParentCallStudentOverview) => void;
  /** Where the row sits in the list, for scrolling to it. */
  onLayout?: (studentId: string, y: number) => void;
};

/**
 * One student of the parent-calls list (06 §1.4 item 4; docs/design/glass-over-paper.md §1a): the avatar
 * and the name; only when a call is due — how long ago the parents were reached and a one-word chip. The
 * whole row is pressed; the form and the history are behind it, the dates are in the row's spoken name.
 */
export function CallRow({ student, canRecord, showTeacher, highlighted, selected, divider, onPress, onLayout }: CallRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  // Large text: next to the chip a long name would lose its surname; it takes a second line instead.
  const { large } = useTextScale();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.calls;
  const chip = attentionChip(student.reminder.state, t, m.calls.row);
  const caption = callRowCaption(student, t, m.calls.row.never, showTeacher);
  const id = student.studentId;

  // The highlight appears at once and fades out, like the site's row transition.
  const glow = useSharedValue(highlighted ? 1 : 0);
  useEffect(() => {
    glow.set(withTiming(highlighted ? 1 : 0, { duration: reducedMotion || highlighted ? 0 : theme.motion.duration.enter }));
  }, [glow, highlighted, reducedMotion, theme]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));

  // What the row opens is said first; a row that opens nothing is named by the student alone.
  const action = canRecord
    ? format(m.calls.row.recordAria, { name: student.studentName })
    : format(student.totalCalls > 0 ? m.calls.row.historyAria : m.calls.row.historyEmptyAria, {
        n: student.totalCalls,
        name: student.studentName,
      });

  return (
    <View
      onLayout={onLayout ? (event: LayoutChangeEvent) => onLayout(id, event.nativeEvent.layout.y) : undefined}
      testID={`call-row-${id}`}
    >
      <Animated.View style={[styles.glow, glowStyle]} testID={highlighted ? `call-row-highlight-${id}` : undefined} />
      <ListRow
        title={student.studentName}
        titleLines={large ? 2 : 1}
        subtitle={caption}
        left={<Avatar name={student.studentName} tone="neutral" />}
        right={chip ? <Chip tone={chip.tone} label={chip.label} /> : undefined}
        selected={selected}
        divider={divider}
        onPress={onPress ? () => onPress(student) : undefined}
        // The ear gets the site's label of the state and its whole meta line; the eye has the chip, the
        // days and the history behind the row.
        accessibilityLabel={accessibilityLabelOf([action, chip?.full, callMetaLine(student, t, locale), showTeacher ? teacherLine(student, t) : null])}
        testID={canRecord ? `call-record-${id}` : `call-history-${id}`}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  glow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: t.colors.accentSoftStrong,
    pointerEvents: 'none',
  },
}));
