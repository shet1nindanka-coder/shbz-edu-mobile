import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { Card, Icon, Text } from '@/ui';

export type LessonComposeCardProps = {
  /** `lessons.composeHintEmpty` while the student has no lessons, else `lessons.composeHint`. */
  hint: string;
  onPress: () => void;
  testID?: string;
};

/**
 * The dashed "compose a lesson" card — an invitation (docs/design/glass-over-paper.md §4 `Card dashed`),
 * always the first row of the student's lessons; it opens the new-lesson screen for this student.
 */
export function LessonComposeCard({ hint, onPress, testID }: LessonComposeCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict } = useI18n();
  const title = dict.planner.lessonComposeCard.title;
  return (
    <Card dashed onPress={onPress} accessibilityLabel={title} accessibilityHint={hint} testID={testID} style={styles.card}>
      <View style={styles.badge}>
        <Icon name="plus" size={theme.sizes.icon.md} color="label" />
      </View>
      <View style={styles.texts}>
        <Text variant="bodyStrong">{title}</Text>
        {/* A `.ui-hint` on the site: hidden when hints are off; screen readers still get it as the hint. */}
        <Hint>
          <Text variant="small" color="textMuted">
            {hint}
          </Text>
        </Hint>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, minHeight: t.sizes.row },
  badge: {
    width: t.sizes.avatarSm,
    height: t.sizes.avatarSm,
    borderRadius: t.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.soft2,
  },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs, alignItems: 'flex-start' },
}));
