import { View } from 'react-native';

import { useCountUp } from '@/components/count-up';
import { makeStyles } from '@/theme';
import { Icon, NavCard, Text } from '@/ui';

import { homeCardA11yLabel, type HomeCard } from './home-cards';

export type HomeNavCardProps = {
  card: HomeCard;
  /** `dict.common.go` — «Перейти». */
  goLabel: string;
  onOpen: (card: HomeCard) => void;
};

/**
 * One navigation card of the overview (docs/spec/04-teacher-students.md S1): kicker, title, two counters
 * that count up, and the «Перейти» line. On the site only the button is a link; on a phone the whole card
 * is the touch target, so the footer is a label, not a second button.
 */
export function HomeNavCard({ card, goLabel, onOpen }: HomeNavCardProps) {
  const styles = useStyles();
  const [first, second] = card.stats;
  const firstValue = useCountUp(first.value);
  const secondValue = useCountUp(second.value);

  return (
    <NavCard
      kicker={card.kicker}
      title={card.title}
      stats={[
        { label: first.label, value: firstValue },
        { label: second.label, value: secondValue },
      ]}
      onPress={() => onOpen(card)}
      // The counters animate; the label always carries the final numbers.
      accessibilityLabel={homeCardA11yLabel(card)}
      testID={`teacher-home-card-${card.id}`}
      footer={
        <View style={styles.go} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text variant="link" color="accentSolid">
            {goLabel}
          </Text>
          <Icon name="forward" size={15} color="accentSolid" />
        </View>
      }
    />
  );
}

const useStyles = makeStyles((t) => ({
  go: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
}));
