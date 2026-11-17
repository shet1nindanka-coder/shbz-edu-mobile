import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

export type LessonComposeCardProps = {
  /** `lessons.composeHintEmpty` while the student has no lessons, else `lessons.composeHint`. */
  hint: string;
  onPress: () => void;
  testID?: string;
};

/**
 * The dashed "compose a lesson" card (`LessonComposeCard`, docs/spec/08-design-system.md §5.4) — always
 * the first row of the student's lessons; it opens the new-lesson screen for this student.
 */
export function LessonComposeCard({ hint, onPress, testID }: LessonComposeCardProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const title = dict.planner.lessonComposeCard.title;
  return (
    <Card variant="outline" dashed padded={false} onPress={onPress} accessibilityLabel={title} accessibilityHint={hint} testID={testID} style={styles.card}>
      <View style={styles.badge}>
        <Text variant="sectionTitle" style={styles.plus}>
          +
        </Text>
      </View>
      <View style={styles.texts}>
        <Text variant="bodyBold">{title}</Text>
        {/* A `.ui-hint` on the site: hidden when hints are off; screen readers still get it as the hint. */}
        <Hint>
          <Text variant="caption" color="textMuted">
            {hint}
          </Text>
        </Hint>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: t.borders.interactive,
    borderColor: t.colors.inputBorder,
    minHeight: t.sizes.minTouch,
  },
  badge: { width: 36, height: 36, borderRadius: t.radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.greenSoft },
  plus: { color: t.colors.greenText, lineHeight: 24 },
  texts: { flex: 1, minWidth: 0, gap: 2, alignItems: 'flex-start' },
}));
