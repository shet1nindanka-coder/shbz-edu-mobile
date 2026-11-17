import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import type { ParentCallStudentOverview } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Button, Card, Chip, Text, useTextScale } from '@/ui';

import { callMetaLine, historyButtonLabel, reminderChip, teacherLine } from '../logic';

export type CallRowProps = {
  student: ParentCallStudentOverview;
  /** TEACHER: «Записать звонок» is offered. A developer only reads. */
  canRecord: boolean;
  /** DEVELOPER: the owning teacher is named under the meta line. */
  showTeacher: boolean;
  /** The row a notification pointed at: soft accent background that fades out when this turns false. */
  highlighted: boolean;
  /** The list is refreshing after a saved call: recording again waits for the new state. */
  recordDisabled: boolean;
  onRecord: (student: ParentCallStudentOverview) => void;
  onHistory: (student: ParentCallStudentOverview) => void;
};

/**
 * One student of the parent-calls list (06 §1.4 item 4): name, reminder chip, when the parents were last
 * reached, and the two actions. The site's desktop row with three columns becomes a card.
 */
export function CallRow({ student, canRecord, showTeacher, highlighted, recordDisabled, onRecord, onHistory }: CallRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  // Large text: the reminder chip («Созвонились недавно») would leave the name a third of the row and cut
  // the surname; the chip moves under a name that does not fit next to it instead.
  const { large } = useTextScale();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.calls;
  const chip = reminderChip(student.reminder.state, t);
  const hasHistory = student.totalCalls > 0;

  // The highlight appears at once and fades out, like the site's row transition.
  const glow = useSharedValue(highlighted ? 1 : 0);
  useEffect(() => {
    glow.set(withTiming(highlighted ? 1 : 0, { duration: reducedMotion || highlighted ? 0 : theme.motion.duration.enter }));
  }, [glow, highlighted, reducedMotion, theme]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));

  return (
    <Card padded={false} testID={`call-row-${student.studentId}`}>
      <Animated.View
        style={[styles.glow, glowStyle]}
        testID={highlighted ? `call-row-highlight-${student.studentId}` : undefined}
      />
      <View style={styles.body}>
        <View style={[styles.head, large ? styles.headWrap : null]} testID={`call-row-head-${student.studentId}`}>
          <Text variant="bodyBold" numberOfLines={2} style={large ? styles.nameWrap : styles.name}>
            {student.studentName}
          </Text>
          <Chip tone={chip.tone} label={chip.label} />
        </View>

        <View style={styles.meta}>
          <Text variant="small" color="textMuted">
            {callMetaLine(student, t, locale)}
          </Text>
          {showTeacher ? (
            <Text variant="caption" color="textSoft" testID={`call-row-teacher-${student.studentId}`}>
              {teacherLine(student, t)}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {canRecord ? (
            <Button
              label={t.record}
              accessibilityLabel={format(m.calls.row.recordAria, { name: student.studentName })}
              onPress={() => onRecord(student)}
              disabled={recordDisabled}
              style={styles.record}
              testID={`call-record-${student.studentId}`}
            />
          ) : null}
          <Button
            label={historyButtonLabel(student.totalCalls, t)}
            accessibilityLabel={format(hasHistory ? m.calls.row.historyAria : m.calls.row.historyEmptyAria, {
              name: student.studentName,
            })}
            variant="outline"
            onPress={() => onHistory(student)}
            disabled={!hasHistory}
            style={canRecord ? styles.history : styles.historyOnly}
            testID={`call-history-${student.studentId}`}
          />
        </View>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  // Paddings sit on an inner view: on web a card's own `padding: 0` wins over longhand paddings.
  body: { padding: t.space.card, gap: t.space.md },
  glow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: t.radii.lg,
    backgroundColor: t.colors.accentSoftStrong,
    pointerEvents: 'none',
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
  name: { flex: 1, minWidth: 0 },
  headWrap: { flexWrap: 'wrap' },
  // Its own width while it fits beside the chip, the whole row (and the chip on the next line) when not.
  nameWrap: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 },
  meta: { gap: t.space.xxs },
  // One line while both labels fit, the spare room shared between the two; on a narrow phone (360 pt,
  // or 375 pt next to «История (23)») the history button moves to a line of its own instead of cutting
  // «Записать звонок». Neither button shrinks below its label.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  record: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  history: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  // A developer has the history button alone: it is as wide as its label.
  historyOnly: { alignSelf: 'flex-start' },
}));
