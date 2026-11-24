import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, Icon, Text } from '@/ui';

export type LessonComposeCardProps = {
  /** Spoken only: `lessons.composeHintEmpty` while the student has no lessons, else `lessons.composeHint`. */
  hint: string;
  onPress: () => void;
  testID?: string;
};

/**
 * The dashed "compose a lesson" card — an invitation (docs/design/glass-over-paper.md §4 `Card dashed`),
 * always the first row of the student's lessons; it opens the new-lesson screen for this student. The
 * plus and the two words are the whole invitation; the site's explanation is the accessibility hint.
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
      <Text variant="bodyStrong" style={styles.texts}>
        {title}
      </Text>
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
  texts: { flex: 1, minWidth: 0 },
}));
