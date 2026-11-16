import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

export type ComposeCardProps = {
  /** `lessonsList.hintEmpty` (the empty state of the list) or `lessonsList.hint`. */
  hint?: string;
  onPress: () => void;
  testID?: string;
};

/**
 * The dashed "empty lesson" card (`LessonComposeCard`, docs/spec/08-design-system.md §5.4): the only
 * entry to creating a lesson on the lessons list.
 */
export function ComposeCard({ hint, onPress, testID }: ComposeCardProps) {
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
        {hint ? (
          <Text variant="caption" color="textMuted">
            {hint}
          </Text>
        ) : null}
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
  badge: {
    width: 36,
    height: 36,
    borderRadius: t.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.greenSoft,
  },
  plus: { color: t.colors.greenText, lineHeight: 24 },
  texts: { flex: 1, minWidth: 0, gap: 2 },
}));
