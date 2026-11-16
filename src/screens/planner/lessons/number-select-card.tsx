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
  /** Footnote under the statement, e.g. «Уже был на занятии». */
  footnote?: string;
  onToggle: () => void;
  testID?: string;
};

/**
 * Selectable number card (`NumberSelectCard`, docs/spec/08-design-system.md §5.4): check mark, the
 * student's traffic-light badge, «№ N», the statement and a footnote. The whole card toggles.
 */
export function NumberSelectCard({ number, status, selected, conditionLatex, footnote, onToggle, testID }: NumberSelectCardProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  return (
    <Card
      variant="outline"
      padded={16}
      selected={selected}
      onPress={onToggle}
      accessibilityLabel={format(dict.topics.widgets.numberSelectAria, { number })}
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
