import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, useTheme } from '@/theme';
import { Enter, Text, TextButton } from '@/ui';

export type UndoToastProps = {
  /** «Вердикты ИИ приняты: 3». */
  text: string;
  /** «Отменить». */
  undoLabel: string;
  onUndo: () => void;
  testID?: string;
};

/**
 * The floating "accepted — Undo" card of the homework review (docs/spec/04-teacher-students.md S4 item 5):
 * bottom centre, above the list, never blocking it. The owner removes it after 10 seconds.
 */
export function UndoToast({ text, undoLabel, onUndo, testID }: UndoToastProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.layer, { bottom: theme.space.lg + insets.bottom }]}>
      <Enter>
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.toast, theme.shadows.card]} testID={testID}>
          <Text variant="smallStrong" style={styles.text}>
            {text}
          </Text>
          <TextButton label={undoLabel} onPress={onUndo} testID={testID ? `${testID}-undo` : undefined} style={styles.undo} />
        </View>
      </Enter>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  layer: { position: 'absolute', left: t.space.gutter, right: t.space.gutter, alignItems: 'center', pointerEvents: 'box-none' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    maxWidth: '100%',
    minHeight: t.sizes.minTouch,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.cardBorder,
    backgroundColor: t.colors.cardBg,
  },
  text: { flexShrink: 1 },
  undo: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
