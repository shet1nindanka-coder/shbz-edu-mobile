import { View } from 'react-native';

import type { HomeworkNumberStatus } from '@/api/types';
import { MathContent } from '@/components/math';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, CheckMark, StatusBadge, Text } from '@/ui';

export type AssignNumberCardProps = {
  number: string;
  status: HomeworkNumberStatus | null;
  selected: boolean;
  /** Statement of the problem; `null` — none, or not loaded yet. */
  conditionLatex: string | null;
  /** The number already sits in a homework with a deadline. */
  alreadyAssigned: boolean;
  disabled?: boolean;
  onToggle: () => void;
  testID?: string;
};

/**
 * Selectable number card of the assign board (`NumberSelectCard`, docs/spec/04-teacher-students.md S5,
 * 08 §5.4): check mark on the left, «№ N» and the student's traffic-light badge, the full statement and
 * the "already assigned with a deadline" footnote. The whole card toggles.
 */
export function AssignNumberCard({ number, status, selected, conditionLatex, alreadyAssigned, disabled, onToggle, testID }: AssignNumberCardProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const footnote = alreadyAssigned ? dict.students.assign.alreadyAssigned : null;
  const name = format(dict.topics.widgets.numberSelectAria, { number });
  return (
    <Card
      variant="outline"
      padded={16}
      selected={selected}
      disabled={disabled}
      onPress={onToggle}
      accessibilityLabel={footnote ? `${name} — ${footnote}` : name}
      testID={testID}
      style={styles.card}
    >
      <View style={styles.top}>
        <CheckMark checked={selected} />
        <Text variant="numberTitle" tabular style={styles.title}>
          {format(dict.topics.widgets.numberLabel, { number })}
        </Text>
        <StatusBadge status={status} label={status ? dict.status[status].shortLabel : dict.student.statusBadge.unmarked} />
      </View>
      {conditionLatex ? (
        // A formula is a web view on a phone: without `pointerEvents` it would swallow the tap that toggles
        // the card. On web a pressable card is a <button>, whose centred text the formula would inherit.
        <View style={styles.statement}>
          <MathContent value={conditionLatex} />
        </View>
      ) : null}
      {footnote ? (
        <Text variant="caption" color="textMuted">
          {footnote}
        </Text>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  title: { flex: 1, minWidth: 0 },
  statement: { pointerEvents: 'none', textAlign: 'left' },
}));
