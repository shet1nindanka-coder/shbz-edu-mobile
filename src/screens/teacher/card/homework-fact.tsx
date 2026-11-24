import { View } from 'react-native';

import { makeStyles } from '@/theme';
import { CountBadge, Text } from '@/ui';

export type HomeworkFactProps = {
  /** How many numbers wait for the teacher; 0 hides the counter. */
  waiting: number;
  /** «37/50». */
  done: string;
};

/**
 * The one element on the right of a homework in the review (docs/design/glass-over-paper.md §1a "the fact
 * on the right is a number or a glyph"): the red counter of numbers that wait for the teacher — it replaces
 * the caption «5 номеров ждут проверки» — and the neutral «37/50». The words are in the owner's
 * accessibility label.
 */
export function HomeworkFact({ waiting, done }: HomeworkFactProps) {
  const styles = useStyles();
  return (
    <View style={styles.fact}>
      <CountBadge count={waiting} max={99} />
      <Text variant="small" color="textMuted" tabular numberOfLines={1}>
        {done}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  fact: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
}));
