import { makeStyles } from '@/theme';
import { CheckMark, PressableScale, Text } from '@/ui';

export type TopicOptionRowProps = {
  title: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testID?: string;
};

/**
 * One topic of the lesson-topics sheet. It looks like the kit's `CheckRow`, but the title wraps instead of
 * being cut to one line: «Производная и исследование функций» and «…функции» must not look the same.
 */
export function TopicOptionRow({ title, checked, onChange, testID }: TopicOptionRowProps) {
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityLabel={title}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      testID={testID}
      style={[styles.row, checked ? styles.selected : null]}
    >
      <Text variant="bodyStrong" style={styles.title}>
        {title}
      </Text>
      <CheckMark checked={checked} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    minHeight: t.sizes.control.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: t.space.xs,
    paddingHorizontal: t.space.md,
    borderRadius: t.radii.md,
    backgroundColor: t.colors.softBg,
  },
  // The check mark says "picked"; the fill only lifts the row a little. Green is for number statuses.
  selected: { backgroundColor: t.colors.soft2 },
  title: { flex: 1, minWidth: 0 },
}));
