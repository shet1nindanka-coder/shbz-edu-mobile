import { View } from 'react-native';

import type { HomeworkNumberStatus } from '@/api/types';
import { MathContent } from '@/components/math';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, CheckMark, StatusBadge, Text } from '@/ui';

export type NumberSelectCardProps = {
  number: string;
  status: HomeworkNumberStatus | null;
  selected: boolean;
  /** Statement of the problem; `null` — none, or not loaded yet. */
  conditionLatex: string | null;
  /** Footnote under the statement, e.g. «Уже был на занятии», «Уже выдан с дедлайном». */
  footnote?: string | null;
  /** The card cannot be toggled right now (a request is in flight). */
  disabled?: boolean;
  onToggle: () => void;
  testID?: string;
};

/**
 * Selectable number card (`NumberSelectCard` of the site, docs/spec/08-design-system.md §5.4): check mark
 * on the left and the student's traffic-light badge on the right, «№ N», the statement and a footnote.
 * The whole card toggles. One component for every place where a teacher picks numbers for a student —
 * assigning homework on the student card and composing a lesson by hand.
 */
export function NumberSelectCard({ number, status, selected, conditionLatex, footnote, disabled, onToggle, testID }: NumberSelectCardProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const name = format(dict.topics.widgets.numberSelectAria, { number });
  // The card is one element for a screen reader (iOS reads none of its children): the student's status
  // — what the card exists to show — and the footnote are in the name, the statement in the hint.
  const statusText = status ? dict.status[status].label : dict.student.statusBadge.unmarked;
  const statement = conditionLatex?.trim() ?? '';
  return (
    <Card
      variant="outline"
      padded={16}
      selected={selected}
      disabled={disabled}
      onPress={onToggle}
      accessibilityLabel={name}
      // The footnote changes what a tap means («already assigned»): it is part of the spoken name too.
      accessibilityParts={[statusText, footnote]}
      // The source text, as `MathContent` gives it to screen readers everywhere else.
      accessibilityHint={statement === '' ? undefined : statement}
      testID={testID}
      style={styles.card}
    >
      <View style={styles.top}>
        <CheckMark checked={selected} />
        <StatusBadge status={status} label={status ? dict.status[status].shortLabel : dict.student.statusBadge.unmarked} />
      </View>
      <Text variant="numberTitle">{format(dict.topics.widgets.numberLabel, { number })}</Text>
      {conditionLatex ? (
        // A formula is a web view on a phone: without `pointerEvents` it would swallow the tap that toggles
        // the card. On web a pressable card is a <button>, whose centred text the formula markup would inherit.
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
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  statement: { pointerEvents: 'none', textAlign: 'left' },
}));
