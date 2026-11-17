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
      style={[styles.row, checked ? styles.selected : styles.unselected]}
    >
      <Text variant="smallStrong" style={styles.title}>
        {title}
      </Text>
      <CheckMark checked={checked} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: 10,
    paddingRight: 12,
    paddingLeft: 14,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
    borderColor: 'transparent',
    backgroundColor: t.colors.softBg,
  },
  selected: { borderColor: t.colors.accentSolid, backgroundColor: t.colors.greenSoft },
  unselected: { opacity: 0.72 },
  title: { flex: 1, minWidth: 0 },
}));
